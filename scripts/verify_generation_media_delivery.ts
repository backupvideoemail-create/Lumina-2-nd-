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
  const { mediaStorage, createSignedMediaToken, extractMediaFileIdFromRef } = await import('../src/services/storage/mediaStorage.ts');
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

    // Customer Generation Gate defaults to active (false); Admin can pause & resume cleanly
    const initialGateRes = await fetch(`${baseUrl}/api/generation-gate`);
    const initialGateJson = await initialGateRes.json();
    const walletBeforePaused = (await testDb.getWalletAuthoritative(sessA.user.id)).balance;
    const adminPauseOnRes = await fetch(`${baseUrl}/api/admin/generation-gate`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessAdmin.token}` },
      body: JSON.stringify({ customerGenerationPaused: true, reason: 'Temporary verification pause test' })
    });
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
      initialGateJson?.gate?.customerGenerationPaused === false &&
        adminPauseOnRes.status === 200 &&
        pausedCustomerGenRes.status === 503 &&
        pausedCustomerGenJson.code === 'CUSTOMER_GENERATION_PAUSED' &&
        walletAfterPaused === walletBeforePaused &&
        nonAdminToggleRes.status === 403,
      `B.2 Customer gate defaults active (false), Admin pause blocks customer (${pausedCustomerGenRes.status} ${pausedCustomerGenJson.code}) with 0 credits deducted, and restricts toggle to Admin (${nonAdminToggleRes.status})`
    );

    // B.3 HTML-as-JSON protection & unmatched /api JSON 404 guarantee
    const { safeParseJsonResponse } = await import('../src/context/AppContext.tsx');
    const mockHtmlProxyRes = new Response('<!doctype html><html><head><title>Sign in - Google Accounts</title></head><body>SSO</body></html>', {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' }
    });
    const parsedHtml = await safeParseJsonResponse(mockHtmlProxyRes);
    const apiNotFoundRes = await fetch(`${baseUrl}/api/nonexistent_route_probe`);
    const apiNotFoundJson = await apiNotFoundRes.json().catch(() => null);
    assert(
      parsedHtml.ok === false &&
        parsedHtml.isHtml === true &&
        parsedHtml.htmlTitle === 'Sign in - Google Accounts' &&
        (apiNotFoundRes.headers.get('content-type') || '').includes('application/json') &&
        apiNotFoundRes.status === 404 &&
        apiNotFoundJson?.code === 'API_NOT_FOUND',
      'B.3 safeParseJsonResponse detects preview/SSO HTML cleanly & unmatched /api/* route always returns JSON 404'
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
        verifiedCustGenJson.generation?.chargeStatus === 'finalized' &&
        custSignedOutRes.status === 200 &&
        custDownloadOutRes.status === 200 &&
        custDownloadOutBuf.length > 0 &&
        (custDownloadOutRes.headers.get('content-disposition') || '').includes('attachment'),
      `C.6 Customer generation on READY template succeeded (${custDownloadOutBuf.length}B verified deliverable, chargeStatus=finalized, attachment download)`
    );

    // Legacy operational template (active, valid, never marked requiresVerificationBeforeCustomerUse) stays TEST_REQUIRED in Admin Gallery AND succeeds for customer generation
    const { normalizeTemplateReadinessStatus } = await import('../src/services/validation/templateReadiness.ts');
    const legacyTplId = `tpl_legacy_smart_${Date.now()}`;
    await testDb.addTemplate({
      id: legacyTplId,
      title: 'Legacy Operational Polaroid',
      description: 'Pre-existing active template before readiness verification',
      category: 'Retro 80s',
      aspectRatio: '9:16',
      type: 'photo',
      engine: 'SMART_TEMPLATE',
      provider: 'smart_template',
      model: 'smart_canvas_ffmpeg',
      workflow: 'retro-polaroid-warm',
      cover: TINY_PNG_BASE64,
      preview: TINY_PNG_BASE64,
      sampleResult: TINY_PNG_BASE64,
      isActive: true,
      isFeatured: false,
      sortOrder: 0,
      creditCost: 10,
      tags: ['Retro'],
      likesCount: 0,
      requiredInputs: [{ id: 'slot_1', label: 'Photo', type: 'image', description: 'Face photo' }],
      recipe: {
        version: '1.0',
        inputType: 'IMAGE_ONLY',
        provider: 'smart_template',
        model: 'smart_canvas_ffmpeg',
        engine: 'SMART_TEMPLATE',
        workflow: 'retro-polaroid-warm',
        prompt: 'Retro legacy polaroid.',
        aspectRatio: '9:16'
      }
    });
    const legacyNorm = normalizeTemplateReadinessStatus(testDb.getTemplates().find((t) => t.id === legacyTplId)!);
    const legacyCustRes = await fetch(`${baseUrl}/api/generations/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessA.token}` },
      body: JSON.stringify({
        templateId: legacyTplId,
        inputMediaUrl: TINY_PNG_BASE64
      })
    });
    const legacyCustJson = await legacyCustRes.json();
    assert(
      legacyNorm.status === 'TEST_REQUIRED' &&
        legacyNorm.legacyOperational === true &&
        legacyNorm.isCustomerGeneratable === true &&
        legacyCustRes.status === 200 &&
        legacyCustJson.generation?.status === 'completed' &&
        legacyCustJson.generation?.chargeStatus === 'finalized',
      `C.6b Legacy active template remains TEST_REQUIRED (legacyOperational=true) in Admin Gallery while still allowing customer generation (${legacyCustRes.status})`
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

    // 4. Zero-deduction failed run (like req_1795522323065) -> must propose NO_OP_ZERO_CREDITS and issue 0 refund
    const zeroDeductId = 'req_1795522323065';
    await testDb.addGenerationAsync({
      id: zeroDeductId,
      userId: sessA.user.id,
      templateId: 'tpl_full_swag_1',
      templateTitle: 'Full Swag',
      templateType: 'photo',
      aspectRatio: '9:16',
      status: 'failed',
      refundStatus: 'none',
      creditCost: 0,
      inputMediaUrl: TINY_PNG_BASE64,
      error: 'Network HTML interception; 0 credits deducted',
      engine: 'AI_GENERATION',
      model: 'gemini-2.5-flash-image',
      workflow: 'PHOTO_GENERATION',
      createdAt: new Date().toISOString(),
      isAiGenerated: true
    });

    // HTTP safeguard: dryRun=false without confirmApply=true must fail 400 DRY_RUN_APPROVAL_REQUIRED
    const unsafeReconcileRes = await fetch(`${baseUrl}/api/admin/reconcile-generations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessAdmin.token}` },
      body: JSON.stringify({ dryRun: false, templateId: 'tpl_full_swag_1' })
    });
    const unsafeReconcileJson = await unsafeReconcileRes.json();

    // HTTP default (omitted dryRun) must execute in DRY-RUN mode with 0 wallet mutations
    const balBeforeReconcile = (await testDb.getWalletAuthoritative(sessA.user.id)).balance;
    const httpDryRunRes = await fetch(`${baseUrl}/api/admin/reconcile-generations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessAdmin.token}` },
      body: JSON.stringify({ templateId: 'tpl_full_swag_1' })
    });
    const httpDryRunJson = await httpDryRunRes.json();
    const balAfterDryRun = (await testDb.getWalletAuthoritative(sessA.user.id)).balance;
    const zeroDeductDryItem = (httpDryRunJson.items || []).find((it: any) => it.generationId === zeroDeductId);

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
      unsafeReconcileRes.status === 400 &&
        unsafeReconcileJson.code === 'DRY_RUN_APPROVAL_REQUIRED' &&
        httpDryRunRes.status === 200 &&
        httpDryRunJson.dryRun === true &&
        balAfterDryRun === balBeforeReconcile &&
        zeroDeductDryItem?.proposedAction === 'NO_OP_ZERO_CREDITS' &&
        reconRun1.restoredValid === 1 &&
        reconRun1.refundedMissing === 1 &&
        reconRun1.skippedAlreadyRefunded === 2 &&
        balAfterRun1 === balBeforeReconcile + 25 &&
        reconRun2.refundedMissing === 0 &&
        balAfterRun2 === balAfterRun1 &&
        restoredGenRecord?.status === 'completed' &&
        missingGenRecord?.status === 'failed' &&
        missingGenRecord?.refundStatus === 'refunded' &&
        missingGenRecord?.chargeStatus === 'refunded',
      `D.1 DRY-RUN safeguard enforced (${unsafeReconcileJson.code}), 0-credit ${zeroDeductId} untouched (NO_OP_ZERO_CREDITS), valid output restored, missing refunded once (+25 -> ${balAfterRun1}), and idempotent on run #2 (${balAfterRun2})`
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

    console.log('\n=== SUITE F: GEMINI PHOTO IDENTITY BINDING & NO-BEFORE-LEAK REGRESSION ===');
    const { geminiAdapter } = await import('../src/services/ai/geminiAdapter.ts');
    const { buildUnifiedGenerationPrompt } = await import('../src/config/globalMasterPrompt.ts');

    const CUST_PNG = `data:image/png;base64,${Buffer.from('CUSTOMER_FACE_BYTES_UNIQUE_001').toString('base64')}`;
    const CUST_B_PNG = `data:image/png;base64,${Buffer.from('PARTNER_B_FACE_BYTES_UNIQUE_002').toString('base64')}`;
    const AFTER_PNG = `data:image/png;base64,${Buffer.from('TEMPLATE_AFTER_STYLE_BYTES_003').toString('base64')}`;
    const BEFORE_PNG = `data:image/png;base64,${Buffer.from('TEMPLATE_BEFORE_ADMIN_MODEL_004').toString('base64')}`;
    const beforeB64 = Buffer.from('TEMPLATE_BEFORE_ADMIN_MODEL_004').toString('base64');

    const unifiedPhotoPrompt = buildUnifiedGenerationPrompt({
      outputType: 'photo',
      templateTitle: 'Full Swag',
      templateCategory: 'Trending',
      categoryPrompt: 'Trending studio editorial look',
      templateRecipePrompt: 'Studio editorial magazine portrait.',
      hasAfterReference: true,
      hasBeforeReference: true
    });

    const singleReq = await geminiAdapter.buildMultimodalRequestParts({
      prompt: unifiedPhotoPrompt,
      userImageUrl: CUST_PNG,
      sampleResultUrl: AFTER_PNG,
      sampleBeforeUrl: BEFORE_PNG,
      aspectRatio: '9:16'
    });
    const singleInlineParts = singleReq.parts.filter((p: any) => Boolean(p.inlineData));
    const singleContainsBeforeBytes = singleReq.parts.some((p: any) => p.inlineData?.data === beforeB64);
    assert(
      singleInlineParts.length === 2 &&
        !singleContainsBeforeBytes &&
        String(singleReq.parts[0]?.text || '').includes('CUSTOMER_SOURCE_PHOTO') &&
        singleReq.parts[1]?.inlineData?.data === Buffer.from('CUSTOMER_FACE_BYTES_UNIQUE_001').toString('base64') &&
        String(singleReq.parts[2]?.text || '').includes('TEMPLATE_AFTER_REFERENCE') &&
        singleReq.parts[3]?.inlineData?.data === Buffer.from('TEMPLATE_AFTER_STYLE_BYTES_003').toString('base64') &&
        String(singleReq.parts[4]?.text || '').includes('FINAL EXECUTION DIRECTIVE') &&
        String(singleReq.parts[4]?.text || '').includes('Completely replace the template model'),
      `F.1 Single-photo payload labels CUSTOMER_SOURCE_PHOTO first, TEMPLATE_AFTER_REFERENCE second, omits competing sampleBeforeUrl image (inline=${singleInlineParts.length}), and mandates replacing template model face`
    );

    const coupleReq = await geminiAdapter.buildMultimodalRequestParts({
      prompt: unifiedPhotoPrompt,
      userImageUrl: `${CUST_PNG}|||${CUST_B_PNG}`,
      userImageUrls: [CUST_PNG, CUST_B_PNG],
      sampleResultUrl: AFTER_PNG,
      sampleBeforeUrl: BEFORE_PNG,
      aspectRatio: '9:16'
    });
    const coupleInlineParts = coupleReq.parts.filter((p: any) => Boolean(p.inlineData));
    const coupleFinalText = String(coupleReq.parts[coupleReq.parts.length - 1]?.text || '');
    assert(
      coupleInlineParts.length === 3 &&
        String(coupleReq.parts[0]?.text || '').includes('Person A') &&
        String(coupleReq.parts[2]?.text || '').includes('Person B') &&
        String(coupleReq.parts[4]?.text || '').includes('TEMPLATE_AFTER_REFERENCE') &&
        coupleFinalText.includes('NEVER blend, average, or cross-fuse') &&
        !coupleReq.parts.some((p: any) => p.inlineData?.data === beforeB64),
      `F.2 Couple-photo payload labels Person A, Person B, and TEMPLATE_AFTER_REFERENCE separately (inline=${coupleInlineParts.length}) without before-model leak`
    );

    let emptyCustomerFailed = false;
    try {
      await geminiAdapter.buildMultimodalRequestParts({
        prompt: unifiedPhotoPrompt,
        userImageUrl: '',
        sampleResultUrl: AFTER_PNG,
        aspectRatio: '9:16'
      });
    } catch (e: any) {
      emptyCustomerFailed = String(e?.message || '').includes('CUSTOMER_SOURCE_PHOTO is required');
    }
    assert(emptyCustomerFailed, 'F.3 Empty customer input fails closed before invoking Gemini');

    console.log('\n=== SUITE G: P0 MAGIC-BYTE MIME, FAIL-CLOSED ADAPTERS, ROLE SEPARATION & DIAGNOSTICS ===');
    // G.1 Raw-base64 PNG bytes saved with mismatched .jpg filename hint must persist as .png / image/png
    const real1x1PngBuf = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64'
    );
    const mismatchSaved = await mediaStorage.saveMedia(
      real1x1PngBuf.toString('base64'),
      'generation',
      `gemini_mismatch_${Date.now()}.jpg`,
      sessA.user.id,
      false
    );
    if (mismatchSaved.filePath) savedFilesToCleanup.push(mismatchSaved.filePath);
    assert(
      mismatchSaved.fileId.endsWith('.png') &&
        mismatchSaved.mimeType === 'image/png' &&
        mismatchSaved.sizeBytes === real1x1PngBuf.length,
      `G.1 Raw-base64 PNG payload auto-corrected from .jpg hint to ${mismatchSaved.fileId} (${mismatchSaved.mimeType}, ${mismatchSaved.sizeBytes}B)`
    );

    // G.2 geminiAdapter fails closed on missing /api/media/* and 0-byte data URI + tracks prohibited sampleBefore/faceThumb hashes without leaking into parts
    let missingMediaRejected = false;
    try {
      await geminiAdapter.buildMultimodalRequestParts({
        prompt: unifiedPhotoPrompt,
        userImageUrl: '/api/media/user_nonexistent_test_999.png',
        sampleResultUrl: AFTER_PNG,
        aspectRatio: '9:16'
      });
    } catch (e: any) {
      missingMediaRejected = String(e?.message || '').includes('MISSING_MEDIA_ASSET');
    }
    let zeroByteInputRejected = false;
    try {
      await geminiAdapter.buildMultimodalRequestParts({
        prompt: unifiedPhotoPrompt,
        userImageUrl: 'data:image/png;base64,',
        sampleResultUrl: AFTER_PNG,
        aspectRatio: '9:16'
      });
    } catch (e: any) {
      zeroByteInputRejected =
        String(e?.message || '').includes('INVALID_DATA_URI') ||
        String(e?.message || '').includes('EMPTY_IMAGE_BYTES');
    }
    const FACE_THUMB_PNG = `data:image/png;base64,${Buffer.from('TEMPLATE_FACE_THUMB_ADMIN_ONLY_005').toString('base64')}`;
    const faceThumbB64 = Buffer.from('TEMPLATE_FACE_THUMB_ADMIN_ONLY_005').toString('base64');
    const guardedReq = await geminiAdapter.buildMultimodalRequestParts({
      prompt: unifiedPhotoPrompt,
      userImageUrl: `data:image/png;base64,${real1x1PngBuf.toString('base64')}`,
      sampleResultUrl: AFTER_PNG,
      sampleBeforeUrl: BEFORE_PNG,
      sampleFaceThumbnailUrl: FACE_THUMB_PNG,
      aspectRatio: '9:16'
    });
    const containsFaceThumb = guardedReq.parts.some((p: any) => p.inlineData?.data === faceThumbB64);
    const hasScreenshotAndSunglassesGuards =
      String(guardedReq.parts[0]?.text || '').includes('PiP') &&
      String(guardedReq.parts[2]?.text || '').includes('dark sunglasses') &&
      String(guardedReq.parts[4]?.text || '').includes('unobstructed');
    assert(
      missingMediaRejected &&
        zeroByteInputRejected &&
        !containsFaceThumb &&
        guardedReq.prohibitedSampleSha256s.length === 2 &&
        hasScreenshotAndSunglassesGuards,
      `G.2 geminiAdapter fails closed on missing/empty inputs, excludes sampleFaceThumbnail from parts[], tracks ${guardedReq.prohibitedSampleSha256s.length} anti-leak sample hashes, and includes screenshot/sunglasses identity guards`
    );

    // G.3 videoProviderAdapter resolves signed /api/media/signed/* tokens cleanly & rejects missing media
    const { videoProviderAdapter } = await import('../src/services/ai/videoProviderAdapter.ts');
    const signedVidToken = createSignedMediaToken(savedVideo.fileId, 600, sessA.user.id);
    const resolvedSignedVid = await videoProviderAdapter.resolveMediaPayload(
      `/api/media/signed/${signedVidToken}`,
      sessA.user.id
    );
    let missingVideoRejected = false;
    try {
      await videoProviderAdapter.resolveMediaPayload('/api/media/user_missing_vid_999.mp4', sessA.user.id);
    } catch (e: any) {
      missingVideoRejected = String(e?.message || '').includes('MISSING_MEDIA_ASSET');
    }
    assert(
      resolvedSignedVid.partType === 'video' &&
        resolvedSignedVid.sizeBytes > 0 &&
        missingVideoRejected,
      `G.3 videoProviderAdapter resolves signed /api/media/signed/* (${resolvedSignedVid.sizeBytes}B) and fails closed on missing files`
    );

    // G.4 Role-collision protection: photo template with cover === sampleFaceThumbnail & no sampleResult -> NEEDS_SETUP
    const { validateTemplateReadiness: validateReadinessG4 } = await import('../src/services/validation/templateReadiness.ts');
    const collidingTplCheck = validateReadinessG4({
      id: 'tpl_role_collision_test',
      title: 'Role Collision Photo',
      type: 'photo',
      category: 'Trending',
      engine: 'AI_GENERATION',
      provider: 'gemini',
      adapter: 'geminiAdapter',
      model: 'gemini-3.1-flash-lite-image',
      workflow: 'PHOTO_GENERATION',
      aspectRatio: '9:16',
      cover: '/api/media/tpl_face_admin_only.png',
      preview: '/api/media/tpl_face_admin_only.png',
      sampleFaceThumbnail: '/api/media/tpl_face_admin_only.png',
      requiredInputs: [{ id: 'slot_1', label: 'Photo', type: 'image' }],
      recipe: {
        version: '1.0',
        inputType: 'IMAGE_ONLY',
        provider: 'gemini',
        model: 'gemini-3.1-flash-lite-image',
        engine: 'AI_GENERATION',
        workflow: 'PHOTO_GENERATION',
        prompt: 'Place customer in dark studio aesthetic.',
        aspectRatio: '9:16'
      }
    });
    assert(
      !collidingTplCheck.ready &&
        collidingTplCheck.status === 'DRAFT_INCOMPLETE' &&
        collidingTplCheck.missingFields.includes('sampleResult/referenceImageUrl'),
      `G.4 Role-collision guard blocks template where cover === sampleFaceThumbnail without explicit AFTER reference (missing=${collidingTplCheck.missingFields.join(',')})`
    );

    // G.5 Couple Smart Canvas E2E generation persists redacted GenerationPipelineDiagnostics (no base64/tokens/keys)
    const coupleSmartRes = await fetch(`${baseUrl}/api/admin/templates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessAdmin.token}`
      },
      body: JSON.stringify({
        id: 'tpl_couple_diag_test',
        title: 'Couple Diagnostics Test',
        type: 'photo',
        category: 'Couple',
        isCouple: true,
        isActive: true,
        engine: 'SMART_TEMPLATE',
        provider: 'smart_template',
        adapter: 'smartCanvas',
        model: 'smart_canvas_ffmpeg',
        workflow: 'retro-polaroid-warm',
        aspectRatio: '9:16',
        creditCost: 10,
        mediaBase64: TINY_PNG_BASE64,
        coverBase64: TINY_PNG_BASE64,
        sampleResultBase64: TINY_PNG_BASE64,
        requiredInputs: [
          { id: 'partner_1', slotId: 'partner_1', role: 'person_a', label: 'Person A', type: 'image' },
          { id: 'partner_2', slotId: 'partner_2', role: 'person_b', label: 'Person B', type: 'image' }
        ],
        recipe: {
          version: '1.0',
          inputType: 'IMAGE_ONLY',
          provider: 'smart_template',
          adapter: 'smartCanvas',
          model: 'smart_canvas_ffmpeg',
          engine: 'SMART_TEMPLATE',
          workflow: 'retro-polaroid-warm',
          prompt: 'Couple retro polaroid frame.',
          aspectRatio: '9:16'
        }
      })
    });
    const coupleSmartJson = await coupleSmartRes.json();
    const coupleTplId = coupleSmartJson.template?.id || 'tpl_couple_diag_test';
    assert(coupleSmartRes.status === 201 || coupleSmartRes.status === 200, `G.5a Couple test template created (${coupleSmartRes.status})`);
    const coupleVerifyRes = await fetch(`${baseUrl}/api/admin/templates/${coupleTplId}/verify-test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessAdmin.token}`
      },
      body: JSON.stringify({ inputMediaUrl: TINY_PNG_BASE64 })
    });
    assert(coupleVerifyRes.status === 200, `G.5b Couple Smart template verified (${coupleVerifyRes.status})`);

    const coupleGenRes = await fetch(`${baseUrl}/api/generations/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessA.token}`,
        'x-correlation-id': 'req_couple_diag_check_001'
      },
      body: JSON.stringify({
        templateId: coupleTplId,
        inputMediaUrl: `data:image/png;base64,${real1x1PngBuf.toString('base64')}|||data:image/png;base64,${real1x1PngBuf.toString('base64')}`,
        inputMedia: [
          { slotId: 'partner_1', role: 'person_a', type: 'image', media: `data:image/png;base64,${real1x1PngBuf.toString('base64')}` },
          { slotId: 'partner_2', role: 'person_b', type: 'image', media: `data:image/png;base64,${real1x1PngBuf.toString('base64')}` }
        ]
      })
    });
    const coupleGenJson = await coupleGenRes.json();
    const diag = coupleGenJson.generation?.pipelineDiagnostics;
    const diagSerialized = JSON.stringify(diag || {});
    if (coupleGenJson.generation?.resultMediaUrl) {
      const outId = extractMediaFileIdFromRef(coupleGenJson.generation.resultMediaUrl);
      const fp = mediaStorage.getFilePath(outId);
      if (fp) savedFilesToCleanup.push(fp);
    }
    assert(
      coupleGenRes.status === 200 &&
        diag?.correlationId === 'req_couple_diag_check_001' &&
        diag?.customerInputCount === 2 &&
        diag?.customerInputs?.[0]?.role === 'CUSTOMER_SOURCE_PHOTO_PERSON_A' &&
        diag?.customerInputs?.[1]?.role === 'CUSTOMER_SOURCE_PHOTO_PERSON_B' &&
        diag?.storageVerification?.verified === true &&
        !diagSerialized.includes('data:image') &&
        !diagSerialized.includes('token=') &&
        !diagSerialized.includes('AIza'),
      `G.5c Couple generation persisted redacted diagnostics (count=${diag?.customerInputCount}, roles=${diag?.customerInputs?.map((i: any) => i.role).join('+')}, verified=${diag?.storageVerification?.verified})`
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
