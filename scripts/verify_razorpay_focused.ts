import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { spawn } from 'child_process';

process.env.NODE_ENV = 'test';
process.env.IS_ISOLATED_TEST = 'true';

async function runFocusedRazorpayTests() {
  const { ProductionDatabase, isSubscriptionEntitled } = await import('../src/services/db/database.ts');
  const { processRazorpayWebhookEvent } = await import('../src/services/payments/razorpayWebhookService.ts');
  const { CENTRAL_SUBSCRIPTION_PLANS, SUBSCRIPTION_CONFIG, getTopUpPackById } = await import(
    '../src/config/subscriptionConfig.ts'
  );

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`[PASS] ${message}`);
      passed++;
    } else {
      console.error(`[FAIL] ${message}`);
      failed++;
    }
  }

  const webhookSecret = 'rzp_wh_focused_secret_only_for_test';
  const dbPath = path.resolve(process.cwd(), '.data', `focused_razorpay_test_${Date.now()}.json`);
  const db = new ProductionDatabase(dbPath);

  const testApp = express();
  testApp.use(
    express.json({
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      }
    })
  );

  testApp.post('/api/razorpay/webhook', async (req: any, res) => {
    const outcome = await processRazorpayWebhookEvent({
      db,
      rawBody: req.rawBody || Buffer.from(JSON.stringify(req.body || {})),
      signature: String(req.headers['x-razorpay-signature'] || ''),
      event: req.body,
      headerEventId: String(req.headers['x-razorpay-event-id'] || ''),
      webhookSecret
    });
    return res.status(outcome.httpStatus).json(outcome.body);
  });

  // Mirror server.ts route-level entitlement checks (/api/auth/me and top-up gate on /api/payments/checkout/order)
  testApp.get('/api/auth/me', async (req, res) => {
    const userId = String(req.headers['x-test-user-id'] || '');
    const user = userId ? await db.getUserAuthoritative(userId) : null;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const wallet = await db.getWalletAuthoritative(user.id);
    const activeSubscription = await db.getSubscriptionAuthoritative(user.id);
    const hasActivePlan = isSubscriptionEntitled(activeSubscription);
    const introOfferState = await db.getIntroOfferStateAuthoritative(user.id);
    return res.json({
      user,
      wallet,
      activeSubscription,
      hasActivePlan,
      canTopUp: hasActivePlan,
      isIntroEligible: introOfferState.eligible,
      introOfferState: introOfferState.status
    });
  });

  testApp.post('/api/payments/checkout/order', async (req, res) => {
    const userId = String(req.headers['x-test-user-id'] || '');
    const user = userId ? await db.getUserAuthoritative(userId) : null;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const { itemId, type } = req.body || {};
    const targetId = String(itemId || '');
    const isTopUp = type === 'topup' || targetId.startsWith('topup_');
    if (isTopUp) {
      const sub = await db.getSubscriptionAuthoritative(user.id);
      const hasActivePlan = isSubscriptionEntitled(sub);
      if (!hasActivePlan) {
        return res.status(403).json({
          error: 'Top-up is only available after activating an active subscription plan.',
          requiresPlan: true
        });
      }
      const pack = getTopUpPackById(targetId);
      if (!pack) return res.status(400).json({ error: 'Invalid top-up pack' });
      return res.json({ success: true, itemId: pack.id, credits: pack.credits });
    }
    return res.json({ success: true, planId: targetId });
  });

  const server = http.createServer(testApp);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  async function postWebhook(payload: Record<string, any>, headers: Record<string, string> = {}) {
    const raw = JSON.stringify(payload);
    const sig = crypto.createHmac('sha256', webhookSecret).update(Buffer.from(raw, 'utf-8')).digest('hex');
    const resp = await fetch(`${baseUrl}/api/razorpay/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-razorpay-signature': sig,
        ...headers
      },
      body: raw
    });
    return { status: resp.status, body: await resp.json() };
  }

  async function getAuthMe(userId: string) {
    const resp = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { 'x-test-user-id': userId }
    });
    return { status: resp.status, body: await resp.json() };
  }

  async function postTopUpCheckout(userId: string, itemId = 'topup_49') {
    const resp = await fetch(`${baseUrl}/api/payments/checkout/order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-test-user-id': userId
      },
      body: JSON.stringify({ type: 'topup', itemId })
    });
    return { status: resp.status, body: await resp.json() };
  }

  try {
    console.log('\n--- TEST 1: Initial ₹1 subscription.authenticated + Paid-Through Protection + Lifecycle Events ---');
    const created = await db.getOrCreateUserAsync({
      firebaseUid: `uid_focus_life_${Date.now()}`,
      email: `lifecycle_${Date.now()}@example.com`,
      name: 'Lifecycle Focused User'
    });
    const userId = created.user.id;
    const subId = `sub_focus_${Date.now()}`;
    const introPayId = `pay_focus_intro_${Date.now()}`;
    const t0Sec = Math.floor(Date.now() / 1000);
    const introEndSec = t0Sec + 86400;

    await db.recordPayment({
      id: `pay_rec_${Date.now()}_init`,
      orderId: subId,
      paymentId: subId,
      subscriptionId: subId,
      mandateId: subId,
      planId: 'plan_intro_daily',
      userId,
      provider: 'razorpay',
      amount: 1,
      currency: 'INR',
      type: 'intro_mandate',
      status: 'pending',
      isAutoPay: true,
      verificationStatus: 'unverified',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    const authEventRes = await postWebhook({
      event_id: `evt_auth_${Date.now()}`,
      created_at: t0Sec,
      event: 'subscription.authenticated',
      payload: {
        subscription: {
          entity: {
            id: subId,
            status: 'authenticated',
            start_at: introEndSec,
            notes: { userId, planId: 'plan_intro_daily' }
          }
        },
        payment: {
          entity: {
            id: introPayId,
            amount: 100,
            currency: 'INR',
            status: 'captured',
            subscription_id: subId,
            created_at: t0Sec,
            notes: { userId, planId: 'plan_intro_daily' }
          }
        }
      }
    });

    assert(authEventRes.status === 200 && authEventRes.body.creditsAdded === 40, '₹1 subscription.authenticated grants 40 credits');
    let wallet = await db.getWalletAuthoritative(userId);
    assert(wallet.balance === 40, `Wallet balance after ₹1 intro is 40 (got ${wallet.balance})`);
    let sub = await db.getSubscriptionAuthoritative(userId);
    assert(Boolean(sub?.paidThroughAt) && Date.parse(sub!.paidThroughAt!) > Date.now(), 'paidThroughAt persisted in future for ₹1 intro');

    // Status-only lifecycle events must NEVER grant credits and must handle duplicates idempotently
    const statusChecks: Array<{ evt: string; expectedStatus: string; extraEntity?: Record<string, any>; shouldKeepEntitled: boolean }> = [
      { evt: 'subscription.activated', expectedStatus: 'active', shouldKeepEntitled: true },
      { evt: 'subscription.pending', expectedStatus: 'past_due', shouldKeepEntitled: true },
      { evt: 'subscription.resumed', expectedStatus: 'active', shouldKeepEntitled: true },
      { evt: 'subscription.halted', expectedStatus: 'on_hold', shouldKeepEntitled: true },
      { evt: 'subscription.paused', expectedStatus: 'paused', shouldKeepEntitled: false },
      { evt: 'subscription.resumed', expectedStatus: 'active', shouldKeepEntitled: true },
      { evt: 'subscription.cancelled', expectedStatus: 'cancelled', shouldKeepEntitled: true },
      { evt: 'subscription.completed', expectedStatus: 'expired', shouldKeepEntitled: false }
    ];

    let stepOffset = 10;
    for (const check of statusChecks) {
      const evtId = `evt_${check.evt.replace('.', '_')}_${stepOffset}`;
      const payload = {
        event_id: evtId,
        created_at: t0Sec + stepOffset,
        event: check.evt,
        payload: {
          subscription: {
            entity: {
              id: subId,
              notes: { userId },
              ...(check.extraEntity || {})
            }
          }
        }
      };
      stepOffset += 5;

      const r1 = await postWebhook(payload);
      assert(
        r1.status === 200 &&
          r1.body.status === 'processed' &&
          r1.body.subscriptionStatus === check.expectedStatus &&
          r1.body.creditsAdded === 0,
        `${check.evt} -> status '${check.expectedStatus}' with 0 credits`
      );

      const dup = await postWebhook(payload);
      assert(dup.status === 200 && dup.body.status === 'ignored_duplicate', `${check.evt} duplicate event_id ignored cleanly`);

      const currentWallet = await db.getWalletAuthoritative(userId);
      assert(currentWallet.balance === 40, `Wallet unchanged (40) after ${check.evt} & duplicate replay`);

      const meRes = await getAuthMe(userId);
      const topUpRes = await postTopUpCheckout(userId);
      assert(
        meRes.body.hasActivePlan === check.shouldKeepEntitled && meRes.body.canTopUp === check.shouldKeepEntitled,
        `/api/auth/me entitlement after ${check.evt} is ${check.shouldKeepEntitled}`
      );
      assert(
        check.shouldKeepEntitled ? topUpRes.status === 200 : topUpRes.status === 403,
        `Top-up checkout after ${check.evt} returns HTTP ${check.shouldKeepEntitled ? 200 : 403}`
      );
    }

    console.log('\n--- TEST 2: Paid-Through Protection on Renewal Failure + Expiry Cutoff ---');
    const renUser = await db.getOrCreateUserAsync({
      firebaseUid: `uid_focus_ren_${Date.now()}`,
      email: `renewal_${Date.now()}@example.com`,
      name: 'Renewal PaidThrough User'
    });
    const rUid = renUser.user.id;
    const rSubId = `sub_focus_ren_${Date.now()}`;
    const rPay1 = `pay_focus_ren1_${Date.now()}`;
    const rPayFailed = `pay_focus_ren_fail_${Date.now()}`;
    const cycleEndSec = Math.floor(Date.now() / 1000) + 7 * 86400;

    await db.recordPayment({
      id: `pay_rec_${Date.now()}_r`,
      orderId: rSubId,
      paymentId: rSubId,
      subscriptionId: rSubId,
      mandateId: rSubId,
      planId: 'plan_weekly_pass',
      userId: rUid,
      provider: 'razorpay',
      amount: 199,
      currency: 'INR',
      type: 'subscription',
      status: 'pending',
      isAutoPay: true,
      verificationStatus: 'unverified',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    const renCap = await postWebhook({
      event_id: `evt_ren_auth_${Date.now()}`,
      created_at: t0Sec,
      event: 'subscription.authenticated',
      payload: {
        subscription: {
          entity: {
            id: rSubId,
            status: 'active',
            current_end: cycleEndSec,
            notes: { userId: rUid, planId: 'plan_weekly_pass' }
          }
        },
        payment: {
          entity: {
            id: rPay1,
            amount: 19900,
            currency: 'INR',
            status: 'captured',
            subscription_id: rSubId,
            created_at: t0Sec,
            notes: { userId: rUid, planId: 'plan_weekly_pass' }
          }
        }
      }
    });
    assert(renCap.status === 200 && renCap.body.creditsAdded === 230, 'Weekly plan captured initial 230 credits');

    // Subsequent renewal payment.failed must preserve remaining paidThroughAt cycle & credits
    const renFail = await postWebhook({
      event_id: `evt_ren_fail_${Date.now()}`,
      created_at: t0Sec + 3600,
      event: 'payment.failed',
      payload: {
        payment: {
          entity: {
            id: rPayFailed,
            amount: 19900,
            currency: 'INR',
            status: 'failed',
            subscription_id: rSubId,
            created_at: t0Sec + 3600,
            error_description: 'UPI bank mandate timeout'
          }
        }
      }
    });
    assert(renFail.status === 200 && renFail.body.creditsAdded === 0, 'Renewal payment.failed records failure with 0 credits');
    const subAfterFail = await db.getSubscriptionAuthoritative(rUid);
    assert(
      subAfterFail?.status === 'past_due' &&
        subAfterFail?.paidThroughAt === new Date(cycleEndSec * 1000).toISOString() &&
        isSubscriptionEntitled(subAfterFail) === true,
      'Paid-through cycle preserved during renewal payment.failed (status=past_due, still entitled until current_end)'
    );
    const meDuringCycle = await getAuthMe(rUid);
    const topUpDuringCycle = await postTopUpCheckout(rUid);
    assert(
      meDuringCycle.body.hasActivePlan === true && topUpDuringCycle.status === 200,
      'Route-level /api/auth/me and top-up remain entitled before paidThroughAt expires'
    );

    // Once cycle expires (paidThroughAt in the past), entitlement must drop cleanly
    subAfterFail!.paidThroughAt = new Date(Date.now() - 60000).toISOString();
    await db.setSubscription(subAfterFail!);
    const meAfterExpiry = await getAuthMe(rUid);
    const topUpAfterExpiry = await postTopUpCheckout(rUid);
    assert(
      meAfterExpiry.body.hasActivePlan === false && topUpAfterExpiry.status === 403,
      'After paidThroughAt expires, /api/auth/me hasActivePlan=false and top-up returns HTTP 403'
    );

    console.log('\n--- TEST 3: Late / Out-of-Order payment.failed & Unpaid Subscription Protection ---');
    const oooUser = await db.getOrCreateUserAsync({
      firebaseUid: `uid_focus_ooo_${Date.now()}`,
      email: `ooo_${Date.now()}@example.com`,
      name: 'OutOfOrder User'
    });
    const oUid = oooUser.user.id;
    const oSubId = `sub_focus_ooo_${Date.now()}`;
    const oPaySuccess = `pay_ooo_ok_${Date.now()}`;
    const oPayLateFail = `pay_ooo_fail_${Date.now()}`;
    const failTs = Math.floor(Date.now() / 1000) - 300;
    const successTs = Math.floor(Date.now() / 1000);

    await db.recordPayment({
      id: `pay_rec_${Date.now()}_ooo`,
      orderId: oSubId,
      paymentId: oSubId,
      subscriptionId: oSubId,
      mandateId: oSubId,
      planId: 'plan_intro_daily',
      userId: oUid,
      provider: 'razorpay',
      amount: 1,
      currency: 'INR',
      type: 'intro_mandate',
      status: 'pending',
      isAutoPay: true,
      verificationStatus: 'unverified',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    // Captured ₹1 payment succeeds FIRST
    const oCapture = await postWebhook({
      event_id: `evt_ooo_ok_${Date.now()}`,
      created_at: successTs,
      event: 'subscription.authenticated',
      payload: {
        subscription: { entity: { id: oSubId, status: 'authenticated', notes: { userId: oUid, planId: 'plan_intro_daily' } } },
        payment: {
          entity: {
            id: oPaySuccess,
            amount: 100,
            currency: 'INR',
            status: 'captured',
            subscription_id: oSubId,
            created_at: successTs,
            notes: { userId: oUid, planId: 'plan_intro_daily' }
          }
        }
      }
    });
    assert(oCapture.status === 200 && oCapture.body.creditsAdded === 40, 'Captured ₹1 intro payment activates trial');

    // Delayed earlier payment.failed arrives AFTER captured payment
    const lateFail = await postWebhook({
      event_id: `evt_ooo_late_fail_${Date.now()}`,
      created_at: failTs,
      event: 'payment.failed',
      payload: {
        payment: {
          entity: {
            id: oPayLateFail,
            amount: 100,
            currency: 'INR',
            status: 'failed',
            subscription_id: oSubId,
            created_at: failTs,
            error_description: 'Delayed failure from earlier retry'
          }
        }
      }
    });
    assert(
      lateFail.status === 200 &&
        lateFail.body.status === 'ignored_stale_payment_failed' &&
        lateFail.body.creditsAdded === 0,
      'Delayed payment.failed is safely ignored without downgrading captured subscription'
    );
    const oSubAfter = await db.getSubscriptionAuthoritative(oUid);
    const oPayAfter = await db.getPaymentAuthoritative(oSubId);
    assert(
      oSubAfter?.status === 'trial' &&
        oPayAfter?.status === 'captured' &&
        oPayAfter?.verificationStatus === 'verified',
      'Captured PaymentRecord and active trial status remain intact after late payment.failed'
    );

    // Also test stale delayed subscription.halted event older than lastCapturedAt
    const staleHalted = await postWebhook({
      event_id: `evt_stale_halted_${Date.now()}`,
      created_at: failTs,
      event: 'subscription.halted',
      payload: { subscription: { entity: { id: oSubId, notes: { userId: oUid } } } }
    });
    assert(staleHalted.body.status === 'ignored_stale_event', 'Delayed subscription.halted older than capture is ignored');
    const oSubStillTrial = await db.getSubscriptionAuthoritative(oUid);
    assert(oSubStillTrial?.status === 'trial', 'Subscription remains trial after stale subscription.halted');

    // Unpaid subscription payment.failed cannot remain active and keeps intro offer unclaimed
    const unpaidUser = await db.getOrCreateUserAsync({
      firebaseUid: `uid_focus_unpaid_${Date.now()}`,
      email: `unpaid_${Date.now()}@example.com`,
      name: 'Unpaid User'
    });
    const uSubId = `sub_focus_unpaid_${Date.now()}`;
    await db.setSubscription({
      id: uSubId,
      userId: unpaidUser.user.id,
      planId: 'plan_intro_daily',
      planName: 'Trail Offer',
      provider: 'razorpay',
      mandateId: uSubId,
      subscriptionId: uSubId,
      status: 'active',
      startAt: new Date().toISOString(),
      nextChargeAt: new Date(Date.now() + 86400000).toISOString(),
      renewalAmount: 499
    });
    await db.recordPayment({
      id: `pay_rec_${Date.now()}_unpaid`,
      orderId: uSubId,
      paymentId: '',
      subscriptionId: uSubId,
      mandateId: uSubId,
      planId: 'plan_intro_daily',
      userId: unpaidUser.user.id,
      provider: 'razorpay',
      amount: 1,
      currency: 'INR',
      type: 'intro_mandate',
      status: 'pending',
      isAutoPay: true,
      verificationStatus: 'unverified',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    await postWebhook({
      event_id: `evt_unpaid_fail_${Date.now()}`,
      created_at: Math.floor(Date.now() / 1000),
      event: 'payment.failed',
      payload: {
        payment: {
          entity: {
            id: `pay_unpaid_fail_${Date.now()}`,
            amount: 100,
            currency: 'INR',
            status: 'failed',
            subscription_id: uSubId,
            error_description: 'Insufficient balance'
          }
        }
      }
    });
    const unpaidMe = await getAuthMe(unpaidUser.user.id);
    assert(
      unpaidMe.body.activeSubscription?.status === 'payment_failed' &&
        unpaidMe.body.hasActivePlan === false &&
        unpaidMe.body.wallet.balance === 0 &&
        unpaidMe.body.isIntroEligible === true,
      'Unpaid subscription payment.failed marks payment_failed, hasActivePlan=false, 0 credits, and preserves intro eligibility'
    );

    console.log('\n--- TEST 4: Disclosure Lock, Config Integrity, Secret Scoping & Live Server Probes ---');
    const plansModalSource = fs.readFileSync(path.resolve(process.cwd(), 'src/components/PlansModal.tsx'), 'utf-8');
    const approvedDisclosure =
      'Subscription auto-renews at the fixed price and billing frequency shown on your payment screen, unless cancelled at least 24 hours before renewal.';
    const disclosureCount = plansModalSource.split(approvedDisclosure).length - 1;
    assert(disclosureCount === 1, `PlansModal preserves exact single approved disclosure sentence verbatim once (count=${disclosureCount})`);
    const sheetDisclosureCount =
      plansModalSource.split('₹1 for 24 hours, then ₹499 every 7 days until cancellation').length - 1;
    assert(
      sheetDisclosureCount === 1 &&
        plansModalSource.includes("description:\n          currentPlan.id === 'plan_intro_daily'\n            ? '₹1 for 24 hours, then ₹499 every 7 days until cancellation'"),
      'Razorpay sheet description includes explicit ₹1/24h then ₹499/7d text without adding extra customer-facing UI banners'
    );

    const introPlan = CENTRAL_SUBSCRIPTION_PLANS.find((p) => p.id === 'plan_intro_daily');
    assert(
      Boolean(introPlan) &&
        introPlan!.price === 1 &&
        introPlan!.includedCredits === 40 &&
        introPlan!.renewalPrice === 499 &&
        introPlan!.renewalCredits === 400 &&
        introPlan!.renewalInterval === 'weekly' &&
        SUBSCRIPTION_CONFIG.disclosureText === approvedDisclosure,
      'Locked plan IDs, INR amounts (₹1/₹499), weekly interval, credits (40/400) & config untouched'
    );

    const adapterBytes = fs.readFileSync(path.resolve(process.cwd(), 'src/services/payments/razorpayAdapter.ts'));
    const adapterSha256 = crypto.createHash('sha256').update(adapterBytes).digest('hex');
    assert(
      adapterSha256 === '78d76c04324259a53cb08ac156a7d3f5ba02d5656d939d90e07ceae2491f1e05',
      'razorpayAdapter.ts remains completely unmodified (exact SHA-256 match)'
    );

    // Verify public endpoints in server.ts NEVER expose secret presence booleans while admin endpoints requireAdmin + expose booleans only
    const serverSrc = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf-8');
    const versionBlockMatch = serverSrc.match(/app\.get\('\/api\/version'[\s\S]*?\n\}\);/);
    const payConfigMatch = serverSrc.match(/app\.get\('\/api\/payments\/config'[\s\S]*?\n\}\);/);
    assert(
      Boolean(versionBlockMatch && !versionBlockMatch[0].includes('razorpayWebhookSecretPresent') && !versionBlockMatch[0].includes('razorpayKeySecretPresent')),
      '/api/version public route does NOT expose Razorpay secret presence booleans'
    );
    assert(
      Boolean(payConfigMatch && !payConfigMatch[0].includes('razorpayWebhookSecretPresent') && !payConfigMatch[0].includes('razorpayKeySecretPresent')),
      '/api/payments/config public route does NOT expose Razorpay secret presence booleans'
    );
    assert(
      serverSrc.includes("app.get('/api/admin/health-check', requireAdmin") &&
        serverSrc.includes('razorpayWebhookSecretPresent: Boolean(process.env.RAZORPAY_WEBHOOK_SECRET?.trim())') &&
        serverSrc.includes("const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim();"),
      'Admin-gated /api/admin/health-check and Module 5 diagnostics expose boolean-only Razorpay secret presence'
    );

    // Boot real server.ts on ephemeral port in isolated test mode to verify HTTP responses on real routes
    const livePort = 3299;
    const child = spawn('npx', ['tsx', 'server.ts'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(livePort),
        NODE_ENV: 'test',
        IS_ISOLATED_TEST: 'true',
        DISABLE_HMR: 'true',
        RAZORPAY_KEY_ID: 'rzp_test_focused_123',
        RAZORPAY_KEY_SECRET: 'rzp_key_sec_focused_123',
        RAZORPAY_WEBHOOK_SECRET: webhookSecret
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    try {
      let ready = false;
      for (let i = 0; i < 40; i++) {
        try {
          const r = await fetch(`http://127.0.0.1:${livePort}/api/version`);
          if (r.ok) {
            ready = true;
            break;
          }
        } catch {}
        await new Promise((r) => setTimeout(r, 250));
      }
      assert(ready, `Real server.ts booted cleanly on isolated test port ${livePort}`);
      if (ready) {
        const vJson = await (await fetch(`http://127.0.0.1:${livePort}/api/version`)).json();
        assert(
          vJson.paymentsSecrets === undefined && JSON.stringify(vJson).indexOf('razorpayWebhookSecretPresent') === -1,
          'Live /api/version response excludes Razorpay secret booleans'
        );
        const cfgJson = await (await fetch(`http://127.0.0.1:${livePort}/api/payments/config`)).json();
        assert(
          cfgJson.paymentsSecrets === undefined && JSON.stringify(cfgJson).indexOf('rzp_key_sec') === -1,
          'Live /api/payments/config response excludes secret booleans & secret values'
        );
        const adminFail = await fetch(`http://127.0.0.1:${livePort}/api/admin/health-check`);
        assert(adminFail.status === 403, 'Live /api/admin/health-check rejects unauthenticated callers with HTTP 403');

        const badHook = await fetch(`http://127.0.0.1:${livePort}/api/razorpay/webhook`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': 'invalid_sig' },
          body: JSON.stringify({ event: 'subscription.cancelled', event_id: 'evt_bad_sig' })
        });
        assert(badHook.status === 400, 'Live /api/razorpay/webhook strictly rejects invalid HMAC signature with HTTP 400');
      }
    } finally {
      child.kill('SIGTERM');
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    try {
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    } catch {}
  }

  console.log(`\n=== FOCUSED RAZORPAY VERIFICATION SUMMARY: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

runFocusedRazorpayTests().catch((err) => {
  console.error('[FATAL TEST ERROR]', err);
  process.exit(1);
});
