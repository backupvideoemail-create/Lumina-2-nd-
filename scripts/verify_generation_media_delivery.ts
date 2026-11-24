import http from 'http';
import fs from 'fs';
import path from 'path';
import type { Template } from '../src/types/index.ts';

process.env.NODE_ENV = 'test';
process.env.IS_ISOLATED_TEST = 'true';
process.env.DISABLE_AUTO_START_SERVER = 'true';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string, detail?: string) {
  if (condition) {
    console.log(`[PASS] ${message}`);
    passed++;
  } else {
    console.error(`[FAIL] ${message}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

// Minimal valid 1x1 transparent PNG buffer (68 bytes)
const TINY_PNG_BASE64 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';

// Minimal valid MP4 header + bytes buffer (>32 bytes) for byte-range & MIME validation
const TINY_MP4_BUFFER = Buffer.from(
  '00000018667479706d703432000000006d70343269736f6d000000086d646174' +
    '41495052494d455f564944454f5f5041594c4f41445f42595445535f30313233',
  'hex'
);

async function runVerification() {
  const { ProductionDatabase, InMemoryFirestoreMock } = await import('../src/services/db/database.ts');
  const { mediaStorage } = await import('../src/services/storage/mediaStorage.ts');
  const { app, __setServerTestDeps, reconcileAffectedGenerations } = await import('../server.ts');

  const fsMock = new InMemoryFirestoreMock();
  const dbPath = path.resolve(process.cwd(), '.data', `verify_delivery_db_${Date.now()}.json`);
  const testDb = new ProductionDatabase(dbPath, { firestoreOverride: fsMock, persistToDisk: false });
  await testDb.readyPromise;

  const savedFilesToCleanup: string[] = [];

  const mockFirebaseUsers: Record<string, { uid: string; email: string; name: string }> = {
    'tok_customer_a': {
      uid: 'uid_cust_a_delivery',
      email: 'customera.delivery@test.local',
      name: 'Customer A'
    },
    'tok_customer_b': {
      uid: 'uid_cust_b_delivery',
      email: 'customerb.delivery@test.local',
      name: 'Customer B'
    },
    'tok_admin_owner': {
      uid: 'uid_admin_owner_delivery',
      email: 'ai.prime.studio.pro@gmail.com',
      name: 'Studio Owner Admin'
    }
  };

  __setServerTestDeps({
    db: testDb,
    verifyFirebaseToken: async (idToken: string) => {
      const u = mockFirebaseUsers[idToken];
      if (!u) throw new Error('Invalid test Firebase token');
      return {
        uid: u.uid,
        email: u.email,
        name: u.name,
        email_verified: true
      };
    }
  });

  const server = await new Promise<http.Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    console.log('\n=== SUITE A: PRIVATE MEDIA AUTH, OWNERSHIP, RANGE PLAYBACK & DOWNLOADS ===');

    // Login Customer A, Customer B, Admin via real /api/auth/firebase-session
    const loginUser = async (idToken: string) => {
      const r = await fetch(`${baseUrl}/api/auth/firebase-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken })
      });
      const j = await r.json();
      return { status: r.status, token: j.token as string, user: j.user };
    };

    const sessA = await loginUser('tok_customer_a');
    const sessB = await loginUser('tok_customer_b');
    const sessAdmin = await loginUser('tok_admin_owner');
    assert(
      sessA.status === 200 && Boolean(sessA.token) && sessB.status === 200 && sessAdmin.status === 200,
      'A.1 Customer A, Customer B, and Admin authenticated via /api/auth/firebase-session'
    );

    // Seed credits for Customer A
    await testDb.creditWallet(sessA.user.id, 100, 'Test Seed Credits', `seed_deliv_${Date.now()}`, 'purchase');

    // Save private image & private video owned by Customer A (isPublic = false)
    const savedPhoto = await mediaStorage.saveMedia(
      TINY_PNG_BASE64,
      'gen',
      `gen_photo_${Date.now()}`,
      sessA.user.id,
      false
    );
    const savedVideo = await mediaStorage.saveMedia(
      TINY_MP4_BUFFER,
      'gen',
      `gen_video_${Date.now()}.mp4`,
      sessA.user.id,
      false
    );
    if (savedPhoto.filePath) savedFilesToCleanup.push(savedPhoto.filePath);
    if (savedVideo.filePath) savedFilesToCleanup.push(savedVideo.filePath);

    // Zero-byte save rejected
    let zeroByteRejected = false;
    try {
      await mediaStorage.saveMedia(Buffer.alloc(0), 'gen', `gen_empty_${Date.now()}.png`, sessA.user.id, false);
    } catch {
      zeroByteRejected = true;
    }
    assert(zeroByteRejected, 'A.2 mediaStorage.saveMedia rejects 0-byte deliverables cleanly');

    // Unauthenticated & Cross-user access blocked
    const unauthSignedRes = await fetch(`${baseUrl}/api/media/${savedPhoto.fileId}/signed-url`);
    const crossSignedRes = await fetch(`${baseUrl}/api/media/${savedPhoto.fileId}/signed-url`, {
      headers: { Authorization: `Bearer ${sessB.token}` }
    });
    const crossDirectRes = await fetch(`${baseUrl}/api/media/${savedPhoto.fileId}`, {
      headers: { Authorization: `Bearer ${sessB.token}` }
    });
    const crossDownloadRes = await fetch(`${baseUrl}/api/media/${savedPhoto.fileId}/download`, {
      headers: { Authorization: `Bearer ${sessB.token}` }
    });
    const tamperedSignedRes = await fetch(`${baseUrl}/api/media/signed/invalid.token.here.sig`);
    assert(
      unauthSignedRes.status === 401 &&
        crossSignedRes.status === 403 &&
        crossDirectRes.status === 403 &&
        crossDownloadRes.status === 403 &&
        tamperedSignedRes.status === 403,
      `A.3 Unauthenticated (${unauthSignedRes.status}) & cross-customer (${crossSignedRes.status}/${crossDirectRes.status}/${crossDownloadRes.status}) & tampered token (${tamperedSignedRes.status}) rejected`
    );

    // Fail closed when private ownerUserId is missing
    const orphanPrivateFile = await mediaStorage.saveMedia(
      TINY_PNG_BASE64,
      'gen',
      `gen_no_owner_${Date.now()}`,
      sessA.user.id,
      false
    );
    if (orphanPrivateFile.filePath) savedFilesToCleanup.push(orphanPrivateFile.filePath);
    await mediaStorage.setMetadataForTest(orphanPrivateFile.fileId, {
      ownerUserId: undefined,
      isPublic: false
    });
    const missingOwnerRes = await fetch(`${baseUrl}/api/media/${orphanPrivateFile.fileId}/signed-url`, {
      headers: { Authorization: `Bearer ${sessA.token}` }
    });
    assert(
      missingOwnerRes.status === 403,
      `A.4 Missing ownerUserId on private media record fails closed with HTTP 403 (got ${missingOwnerRes.status})`
    );

    // Customer A authorized signed-url bundle -> preview + validated download + headers
    const authPhotoBundleRes = await fetch(`${baseUrl}/api/media/${savedPhoto.fileId}/signed-url`, {
      headers: { Authorization: `Bearer ${sessA.token}` }
    });
    const authPhotoBundle = await authPhotoBundleRes.json();
    const photoPreviewRes = await fetch(`${baseUrl}${authPhotoBundle.url.startsWith('/') ? authPhotoBundle.url : `/api/media/${savedPhoto.fileId}`}`, {
      headers: { Authorization: `Bearer ${sessA.token}` }
    });
    const photoPreviewBuf = Buffer.from(await photoPreviewRes.arrayBuffer());
    const photoDownloadRes = await fetch(`${baseUrl}${authPhotoBundle.downloadUrl}`, {
      headers: { Authorization: `Bearer ${sessA.token}` }
    });
    const photoDownloadBuf = Buffer.from(await photoDownloadRes.arrayBuffer());
    const photoDisp = photoDownloadRes.headers.get('content-disposition') || '';
    const photoCacheCtrl = photoPreviewRes.headers.get('cache-control') || '';
    const photoAcao = photoPreviewRes.headers.get('access-control-allow-origin');
    assert(
      authPhotoBundleRes.status === 200 &&
        Boolean(authPhotoBundle.url) &&
        Boolean(authPhotoBundle.fallbackUrl) &&
        Boolean(authPhotoBundle.downloadUrl) &&
        photoPreviewRes.status === 200 &&
        photoPreviewBuf.length > 0 &&
        photoDownloadRes.status === 200 &&
        photoDownloadBuf.length > 0 &&
        photoDisp.includes('attachment') &&
        photoDisp.includes('.png') &&
        photoCacheCtrl.includes('private') &&
        !photoAcao,
      `A.5 Customer A photo preview (200, ${photoPreviewBuf.length}B), attachment download (.png), private Cache-Control & no wildcard ACAO verified`
    );

    // Video signed bundle + HTTP 206 Byte-Range streaming + .mp4 download
    const authVideoBundleRes = await fetch(`${baseUrl}/api/media/${savedVideo.fileId}/signed-url`, {
      headers: { Authorization: `Bearer ${sessA.token}` }
    });
    const authVideoBundle = await authVideoBundleRes.json();
    const videoRangeUrl = authVideoBundle.fallbackUrl || authVideoBundle.url;
    const videoRangeRes = await fetch(`${baseUrl}${videoRangeUrl}`, {
      headers: { Range: 'bytes=0-15' }
    });
    const videoRangeBuf = Buffer.from(await videoRangeRes.arrayBuffer());
    const videoDlRes = await fetch(`${baseUrl}/api/media/${savedVideo.fileId}/download`, {
      headers: { Authorization: `Bearer ${sessA.token}` }
    });
    assert(
      authVideoBundleRes.status === 200 &&
        videoRangeRes.status === 206 &&
        videoRangeBuf.length === 16 &&
        (videoRangeRes.headers.get('content-range') || '').startsWith('bytes 0-15/') &&
        videoDlRes.status === 200 &&
        (videoDlRes.headers.get('content-disposition') || '').includes('.mp4'),
      `A.6 Customer A video HTTP 206 Range (${videoRangeBuf.length}B, ${videoRangeRes.headers.get('content-range')}) and .mp4 attachment download verified`
    );

    console.log('\n=== SUITE B: OPTIONAL R2_PUBLIC_BASE_URL & CUSTOMER PAUSE GATE ===');

    // Amendment 1: R2_PUBLIC_BASE_URL unset does NOT appear in missingEnvVars or requiredVarsPresent
    const storageStatus = mediaStorage.getStatus();
    const healthRes = await fetch(`${baseUrl}/api/admin/health-check`, {
      headers: { Authorization: `Bearer ${sessAdmin.token}` }
    });
    const healthJson = await healthRes.json();
    assert(
      healthRes.status === 200 &&
        !(storageStatus.missingEnvVars || []).includes('R2_PUBLIC_BASE_URL') &&
        !Object.prototype.hasOwnProperty.call(healthJson?.storage?.requiredVarsPresent || {}, 'R2_PUBLIC_BASE_URL'),
      'B.1 R2_PUBLIC_BASE_URL is optional and excluded from mandatory R2 readiness checks'
    );

    // Customer Generation Gate starts paused by default -> Customer A blocked 503 with 0 credit deduction
    const initialGateRes = await fetch(`${baseUrl}/api/generation-gate`);
    const initialGateJson = await initialGateRes.json();
    const walletBeforePaused = (await testDb.getWalletAuthoritative(sessA.user.id)).balance;
    const pausedCustomerGenRes = await fetch(`${baseUrl}/api/generations/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessA.token}` },
      body: JSON.stringify({
        templateId: 'tpl_smart_retro_polaroid_01',
        inputMediaUrl: TINY_PNG_BASE64
      })
    });
    const pausedCustomerGenJson = await pausedCustomerGenRes.json();
    const walletAfterPaused = (await testDb.getWalletAuthoritative(sessA.user.id)).balance;
    const nonAdminToggleRes = await fetch(`${baseUrl}/api/admin/generation-gate`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessA.token}` },
      body: JSON.stringify({ customerGenerationPaused: false })
    });
    assert(
      initialGateJson?.gate?.customerGenerationPaused === true &&
        pausedCustomerGenRes.status === 503 &&
        pausedCustomerGenJson.code === 'CUSTOMER_GENERATION_PAUSED' &&
        walletAfterPaused === walletBeforePaused &&
        nonAdminToggleRes.status === 403,
      `B.2 Customer pause gate blocks paid customer generation (${pausedCustomerGenRes.status} ${pausedCustomerGenJson.code}), preserves wallet (${walletAfterPaused}), and restricts toggle to Admin (${nonAdminToggleRes.status})`
    );

    console.log('\n=== SUITE C: 5-STATE TEMPLATE READINESS & 1-CLICK ADMIN VERIFY-TEST ===');

    // Incomplete template -> NEEDS_SETUP
    const incompleteTplRes = await fetch(`${baseUrl}/api/admin/templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessAdmin.token}` },
      body: JSON.stringify({
        title: 'Incomplete Test Style',
        type: 'photo',
        category: 'Trending',
        engine: 'AI_GENERATION'
      })
    });
    const incompleteTplJson = await incompleteTplRes.json();
    assert(
      incompleteTplRes.status === 200 &&
        incompleteTplJson.template?.readinessStatus === 'NEEDS_SETUP' &&
        incompleteTplJson.template?.isActive === false,
      `C.1 Incomplete template automatically stored as NEEDS_SETUP (got ${incompleteTplJson.template?.readinessStatus})`
    );

    // Complete SmartCanvas photo template -> must default to TEST_REQUIRED (never READY before test!)
    const smartTplPayload = {
      title: 'Verified Retro Polaroid Test',
      description: 'Test template for E2E readiness gate',
      category: 'Retro 80s',
      aspectRatio: '9:16',
      type: 'photo',
      engine: 'SMART_TEMPLATE',
      provider: 'smart_template',
      model: 'smart_canvas_ffmpeg',
      workflow: 'retro-polaroid-warm',
      mediaBase64: TINY_PNG_BASE64,
      coverBase64: TINY_PNG_BASE64,
      sampleResultBase64: TINY_PNG_BASE64,
      sampleFaceThumbnailBase64: TINY_PNG_BASE64,
      isActive: true,
      recipe: {
        version: '1.0',
        inputType: 'IMAGE_ONLY',
        provider: 'smart_template',
        model: 'smart_canvas_ffmpeg',
        engine: 'SMART_TEMPLATE',
        workflow: 'retro-polaroid-warm',
        prompt: 'Retro polaroid film glow test recipe.',
        aspectRatio: '9:16'
      }
    };
    const smartCreateRes = await fetch(`${baseUrl}/api/admin/templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessAdmin.token}` },
      body: JSON.stringify(smartTplPayload)
    });
    const smartCreateJson = await smartCreateRes.json();
    const smartTplId = smartCreateJson.template?.id as string;
    assert(
      smartCreateRes.status === 200 && smartCreateJson.template?.readinessStatus === 'TEST_REQUIRED',
      `C.2 New complete template starts as TEST_REQUIRED (got ${smartCreateJson.template?.readinessStatus}), never auto-READY`
    );

    // Lift Customer Pause Gate cleanly via Admin
    const resumeGateRes = await fetch(`${baseUrl}/api/admin/generation-gate`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessAdmin.token}` },
      body: JSON.stringify({ customerGenerationPaused: false })
    });
    assert(resumeGateRes.status === 200, 'C.3 Admin lifted customer generation pause gate');

    // Attempt customer generation while template is TEST_REQUIRED -> blocked 400 TEMPLATE_NOT_READY, 0 credits spent
    const unverifiedCustRes = await fetch(`${baseUrl}/api/generations/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessA.token}` },
      body: JSON.stringify({
        templateId: smartTplId,
        inputMediaUrl: TINY_PNG_BASE64
      })
    });
    const unverifiedCustJson = await unverifiedCustRes.json();
    assert(
      unverifiedCustRes.status === 400 &&
        unverifiedCustJson.code === 'TEMPLATE_NOT_READY' &&
        (await testDb.getWalletAuthoritative(sessA.user.id)).balance === walletBeforePaused,
      `C.4 Customer blocked from TEST_REQUIRED template (${unverifiedCustRes.status} ${unverifiedCustJson.code}) with 0 credits charged`
    );

    // Run 1-Click Admin Verify-Test on SmartCanvas template -> real render + deliverable verification -> READY!
    const adminBalanceBefore = (await testDb.getWalletAuthoritative(sessAdmin.user.id)).balance;
    const verifyTestRes = await fetch(`${baseUrl}/api/admin/templates/${smartTplId}/verify-test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessAdmin.token}` },
      body: JSON.stringify({ inputMediaUrl: TINY_PNG_BASE64 })
    });
    const verifyTestJson = await verifyTestRes.json();
    const adminBalanceAfter = (await testDb.getWalletAuthoritative(sessAdmin.user.id)).balance;
    assert(
      verifyTestRes.status === 200 &&
        verifyTestJson.success === true &&
        verifyTestJson.readinessStatus === 'READY' &&
        verifyTestJson.verification?.passed === true &&
        verifyTestJson.verification?.sizeBytes > 0 &&
        adminBalanceAfter === adminBalanceBefore,
      `C.5 1-Click Admin Verify-Test executed real render (${verifyTestJson.verification?.sizeBytes}B), verified delivery, promoted template to READY, and charged 0 admin credits`
    );

    // Customer A now runs generation on READY template -> succeeds 200, deliverable resolves & downloads cleanly!
    const verifiedCustGenRes = await fetch(`${baseUrl}/api/generations/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessA.token}` },
      body: JSON.stringify({
        templateId: smartTplId,
        inputMediaUrl: TINY_PNG_BASE64
      })
    });
    const verifiedCustGenJson = await verifiedCustGenRes.json();
    const custOutputUrl = verifiedCustGenJson.generation?.resultMediaUrl as string;
    const custSignedOutRes = await fetch(`${baseUrl}${custOutputUrl}/signed-url`, {
      headers: { Authorization: `Bearer ${sessA.token}` }
    });
    const custSignedOutJson = await custSignedOutRes.json();
    const custDownloadOutRes = await fetch(`${baseUrl}${custSignedOutJson.downloadUrl}`, {
      headers: { Authorization: `Bearer ${sessA.token}` }
    });
    const custDownloadOutBuf = Buffer.from(await custDownloadOutRes.arrayBuffer());
    assert(
      verifiedCustGenRes.status === 200 &&
        verifiedCustGenJson.generation?.status === 'completed' &&
        custSignedOutRes.status === 200 &&
        custDownloadOutRes.status === 200 &&
        custDownloadOutBuf.length > 0 &&
        (custDownloadOutRes.headers.get('content-disposition') || '').includes('attachment'),
      `C.6 Customer generation on READY template succeeded (${custDownloadOutBuf.length}B verified deliverable + attachment download)`
    );

    // Edit recipe prompt -> resets readiness to TEST_REQUIRED
    const editPromptRes = await fetch(`${baseUrl}/api/admin/templates/${smartTplId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessAdmin.token}` },
      body: JSON.stringify({
        recipe: { prompt: 'Modified cinema prompt requiring re-verification.' }
      })
    });
    const editPromptJson = await editPromptRes.json();
    // Toggle pause -> PAUSED, toggle active -> TEST_REQUIRED
    const pauseTplRes = await fetch(`${baseUrl}/api/admin/templates/${smartTplId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessAdmin.token}` },
      body: JSON.stringify({ isActive: false })
    });
    const pauseTplJson = await pauseTplRes.json();
    assert(
      editPromptRes.status === 200 &&
        editPromptJson.template?.readinessStatus === 'TEST_REQUIRED' &&
        pauseTplRes.status === 200 &&
        pauseTplJson.template?.readinessStatus === 'PAUSED',
      `C.7 Editing recipe resets template to TEST_REQUIRED (${editPromptJson.template?.readinessStatus}); deactivating marks PAUSED (${pauseTplJson.template?.readinessStatus})`
    );

    // Failing verify-test (e.g., AI template without GEMINI_API_KEY in sandbox) -> marks FAILED cleanly
    const aiFailTplRes = await fetch(`${baseUrl}/api/admin/templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessAdmin.token}` },
      body: JSON.stringify({
        title: 'Full Swag AI Test',
        type: 'photo',
        category: 'Royal Swag',
        engine: 'AI_GENERATION',
        provider: 'gemini',
        model: 'gemini-2.5-flash-image',
        workflow: 'PHOTO_GENERATION',
        mediaBase64: TINY_PNG_BASE64,
        coverBase64: TINY_PNG_BASE64,
        sampleResultBase64: TINY_PNG_BASE64,
        recipe: {
          version: '1.0',
          inputType: 'IMAGE_ONLY',
          provider: 'gemini',
          model: 'gemini-2.5-flash-image',
          engine: 'AI_GENERATION',
          workflow: 'PHOTO_GENERATION',
          prompt: 'Full swag royal studio portrait.'
        }
      })
    });
    const aiFailTplJson = await aiFailTplRes.json();
    const origGemKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    const failVerifyRes = await fetch(`${baseUrl}/api/admin/templates/${aiFailTplJson.template.id}/verify-test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessAdmin.token}` },
      body: JSON.stringify({ inputMediaUrl: TINY_PNG_BASE64 })
    });
    if (origGemKey !== undefined) process.env.GEMINI_API_KEY = origGemKey;
    const failVerifyJson = await failVerifyRes.json();
    const adminAfterFail = (await fetch(`${baseUrl}/api/admin/templates`, {
      headers: { Authorization: `Bearer ${sessAdmin.token}` }
    }).then((r) => r.json())).templates.find((t: Template) => t.id === aiFailTplJson.template.id);
    assert(
      (failVerifyRes.status === 422 || failVerifyRes.status === 502) &&
        failVerifyJson.readinessStatus === 'FAILED' &&
        adminAfterFail?.readinessStatus === 'FAILED' &&
        Boolean(adminAfterFail?.lastTestError),
      `C.8 Failing Admin Verify-Test marks template FAILED with short failure reason ('${adminAfterFail?.lastTestError?.slice(0, 60)}')`
    );

    console.log('\n=== SUITE D: VERIFIED DELIVERABLE GATE & HISTORICAL RECONCILIATION ===');

    // Historical Full Swag reconciliation test
    const genValidId = `gen_valid_swag_${Date.now()}`;
    const genMissingId = `gen_missing_swag_${Date.now()}`;
    const genAlreadyRefundedId = 'gen_1795515418153_93df37';

    // 1. Valid saved private file for Customer A whose generation stayed in processing
    const validSwagFile = await mediaStorage.saveMedia(
      TINY_PNG_BASE64,
      'gen',
      `gen_swag_restore_${Date.now()}`,
      sessA.user.id,
      false
    );
    if (validSwagFile.filePath) savedFilesToCleanup.push(validSwagFile.filePath);

    await testDb.addGenerationAsync({
      id: genValidId,
      userId: sessA.user.id,
      templateId: 'tpl_full_swag_1',
      templateTitle: 'Full Swag',
      templateType: 'photo',
      aspectRatio: '9:16',
      status: 'processing',
      creditCost: 20,
      inputMediaUrl: TINY_PNG_BASE64,
      resultMediaUrl: validSwagFile.publicUrl,
      engine: 'AI_GENERATION',
      model: 'gemini-2.5-flash-image',
      workflow: 'PHOTO_GENERATION',
      createdAt: new Date().toISOString(),
      isAiGenerated: true
    });

    // 2. Missing output generation that charged 25 credits and never refunded
    await testDb.reserveCredits(sessA.user.id, 25, 'Full Swag Missing Run', genMissingId);
    await testDb.addGenerationAsync({
      id: genMissingId,
      userId: sessA.user.id,
      templateId: 'tpl_full_swag_1',
      templateTitle: 'Full Swag',
      templateType: 'photo',
      aspectRatio: '9:16',
      status: 'completed',
      creditCost: 25,
      inputMediaUrl: TINY_PNG_BASE64,
      resultMediaUrl: '/api/media/gen_nonexistent_missing_999.png',
      engine: 'AI_GENERATION',
      model: 'gemini-2.5-flash-image',
      workflow: 'PHOTO_GENERATION',
      createdAt: new Date().toISOString(),
      isAiGenerated: true
    });

    // 3. Exact incident gen_1795515418153_93df37 already refunded -> must NOT double-refund
    await testDb.addGenerationAsync({
      id: genAlreadyRefundedId,
      userId: sessA.user.id,
      templateId: 'tpl_full_swag_1',
      templateTitle: 'Full Swag',
      templateType: 'photo',
      aspectRatio: '9:16',
      status: 'failed',
      refundStatus: 'refunded',
      creditCost: 20,
      inputMediaUrl: TINY_PNG_BASE64,
      error: 'Gemini API HTTP 402 credits depleted',
      engine: 'AI_GENERATION',
      model: 'gemini-2.5-flash-image',
      workflow: 'PHOTO_GENERATION',
      createdAt: new Date().toISOString(),
      isAiGenerated: true
    });

    const balBeforeReconcile = (await testDb.getWalletAuthoritative(sessA.user.id)).balance;
    const reconRun1 = await reconcileAffectedGenerations(testDb, mediaStorage, {
      dryRun: false,
      templateId: 'tpl_full_swag_1',
      actorEmail: 'verify_script'
    });
    const balAfterRun1 = (await testDb.getWalletAuthoritative(sessA.user.id)).balance;

    // 2nd run must be 100% idempotent (0 extra refunds)
    const reconRun2 = await reconcileAffectedGenerations(testDb, mediaStorage, {
      dryRun: false,
      templateId: 'tpl_full_swag_1',
      actorEmail: 'verify_script'
    });
    const balAfterRun2 = (await testDb.getWalletAuthoritative(sessA.user.id)).balance;

    const restoredGenRecord = await testDb.getGenerationAuthoritative(genValidId);
    const missingGenRecord = await testDb.getGenerationAuthoritative(genMissingId);

    assert(
      reconRun1.restoredValid === 1 &&
        reconRun1.refundedMissing === 1 &&
        reconRun1.skippedAlreadyRefunded === 1 &&
        balAfterRun1 === balBeforeReconcile + 25 &&
        reconRun2.refundedMissing === 0 &&
        balAfterRun2 === balAfterRun1 &&
        restoredGenRecord?.status === 'completed' &&
        missingGenRecord?.status === 'failed' &&
        missingGenRecord?.refundStatus === 'refunded',
      `D.1 Historical reconciliation restored valid run, refunded missing run exactly once (+25 -> ${balAfterRun1}), skipped ${genAlreadyRefundedId}, and stayed idempotent on run #2 (${balAfterRun2})`
    );

    console.log('\n=== SUITE E: EXISTING ADMIN DASHBOARD ROUTES PRESERVATION ===');
    const [actRes, logsRes, sysRes] = await Promise.all([
      fetch(`${baseUrl}/api/admin/activity`, { headers: { Authorization: `Bearer ${sessAdmin.token}` } }),
      fetch(`${baseUrl}/api/admin/logs`, { headers: { Authorization: `Bearer ${sessAdmin.token}` } }),
      fetch(`${baseUrl}/api/admin/system-health`, { headers: { Authorization: `Bearer ${sessAdmin.token}` } })
    ]);
    assert(
      actRes.status === 200 && logsRes.status === 200 && sysRes.status === 200,
      `E.1 Preserved Admin Dashboard routes remain healthy (activity=${actRes.status}, logs=${logsRes.status}, system-health=${sysRes.status})`
    );
  } finally {
    __setServerTestDeps();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    for (const fp of savedFilesToCleanup) {
      try {
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
      } catch {}
    }
    try {
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    } catch {}
  }

  console.log(`\n=== GENERATION MEDIA DELIVERY VERIFICATION SUMMARY: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

runVerification().catch((err) => {
  console.error('[FATAL TEST ERROR]', err);
  process.exit(1);
});
