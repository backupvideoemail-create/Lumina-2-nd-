import crypto from 'crypto';
import { AuthoritativeDatabaseError, type ProductionDatabase } from '../db/database.ts';
import type { PaymentRecord, UserSubscription } from '../../types/index.ts';
import {
  CENTRAL_TOP_UP_PACKS,
  calculateNextCalendarDayStartDate,
  getSubscriptionPlanById,
  getTopUpPackById
} from '../../config/subscriptionConfig.ts';

export interface RazorpayGatewayClient {
  getPayment(paymentId: string): Promise<any>;
  getSubscription(subscriptionId: string): Promise<any>;
  getSubscriptionInvoices?(subscriptionId: string): Promise<any[]>;
}

function getLiveAuthHeader(): string | null {
  const keyId = process.env.RAZORPAY_KEY_ID || '';
  const keySecret = process.env.RAZORPAY_KEY_SECRET || '';
  if (!keyId || !keySecret) return null;
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;
}

export const defaultRazorpayGatewayClient: RazorpayGatewayClient = {
  async getPayment(paymentId: string) {
    const auth = getLiveAuthHeader();
    if (!auth) throw new Error('Razorpay credentials missing on server.');
    const res = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: { Authorization: auth }
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Razorpay payment lookup failed: HTTP ${res.status} - ${errText}`);
    }
    return await res.json();
  },

  async getSubscription(subscriptionId: string) {
    const auth = getLiveAuthHeader();
    if (!auth) throw new Error('Razorpay credentials missing on server.');
    const res = await fetch(`https://api.razorpay.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
      headers: { Authorization: auth }
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Razorpay subscription lookup failed: HTTP ${res.status} - ${errText}`);
    }
    return await res.json();
  },

  async getSubscriptionInvoices(subscriptionId: string) {
    const auth = getLiveAuthHeader();
    if (!auth) return [];
    const res = await fetch(`https://api.razorpay.com/v1/invoices?subscription_id=${encodeURIComponent(subscriptionId)}`, {
      headers: { Authorization: auth }
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.items) ? data.items : [];
  }
};

export function verifyRazorpayWebhookHmac(rawBody: Buffer, signature: string, webhookSecret: string): boolean {
  if (!webhookSecret || !signature || !rawBody) return false;
  try {
    const expectedSignature = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
    const expectedBuf = Buffer.from(expectedSignature, 'utf-8');
    const sigBuf = Buffer.from(signature, 'utf-8');
    if (expectedBuf.length !== sigBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, sigBuf);
  } catch {
    return false;
  }
}

export function resolvePlanFromHints(hints: {
  storedPlanId?: string;
  notePlanId?: string;
  noteItemId?: string;
  subPlanId?: string;
  storedType?: string;
  storedAmount?: number;
  paymentAmountPaise?: number;
}) {
  const candidates = [hints.storedPlanId, hints.noteItemId, hints.notePlanId, hints.subPlanId].filter(
    (c): c is string => typeof c === 'string' && !c.startsWith('sub_') && !c.startsWith('order_') && !c.startsWith('pay_')
  );

  for (const id of candidates) {
    if (id === 'plan_intro_daily' || id === 'sub_intro_daily') {
      return getSubscriptionPlanById('plan_intro_daily');
    }
    if (id === 'plan_weekly_pass' || id === 'sub_weekly_creator' || id === 'plan_Tl03htLvt1ohPD') {
      return getSubscriptionPlanById('plan_weekly_pass');
    }
    if (id === 'plan_monthly_pass' || id === 'sub_monthly_creator' || id === 'plan_Tl35j58elYmOpi') {
      return getSubscriptionPlanById('plan_monthly_pass');
    }
    if (id === 'plan_TjsjORpnQrwUzl') {
      return getSubscriptionPlanById('plan_intro_daily');
    }
  }

  if (hints.storedType === 'intro_mandate' || hints.storedAmount === 1 || hints.paymentAmountPaise === 100) {
    return getSubscriptionPlanById('plan_intro_daily');
  }
  if (hints.paymentAmountPaise === 19900) {
    return getSubscriptionPlanById('plan_weekly_pass');
  }
  if (hints.paymentAmountPaise === 99800) {
    return getSubscriptionPlanById('plan_monthly_pass');
  }
  return null;
}

export async function findLatestPaymentForSubscription(
  subscriptionId: string,
  gateway: RazorpayGatewayClient = defaultRazorpayGatewayClient
): Promise<{ subscription: any | null; payment: any | null; invoices: any[] }> {
  let subscription: any = null;
  let invoices: any[] = [];
  let payment: any = null;

  try {
    subscription = await gateway.getSubscription(subscriptionId);
  } catch {
    subscription = null;
  }

  if (gateway.getSubscriptionInvoices) {
    try {
      invoices = await gateway.getSubscriptionInvoices(subscriptionId);
      const sorted = [...invoices].sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
      const capturedCandidate = sorted.find((inv) => inv.payment_id && inv.status === 'paid') || sorted.find((inv) => inv.payment_id);
      if (capturedCandidate?.payment_id) {
        try {
          payment = await gateway.getPayment(capturedCandidate.payment_id);
        } catch {
          payment = null;
        }
      }
    } catch {
      invoices = [];
    }
  }

  return { subscription, payment, invoices };
}

export interface WebhookProcessResult {
  httpStatus: number;
  body: Record<string, any>;
}

function extractProviderTimestampSec(event: any, payment?: any): number | undefined {
  const candidates = [event?.created_at, payment?.created_at];
  for (const val of candidates) {
    if (typeof val === 'number' && Number.isFinite(val) && val > 0) {
      return val;
    }
  }
  return undefined;
}

function computePaidThroughAtIso(params: {
  isIntro: boolean;
  validityDays?: number;
  validityHours?: number;
  currentEndUnix?: number;
  startAtUnix?: number;
  nowMs?: number;
}): string {
  const nowMs = params.nowMs ?? Date.now();
  if (typeof params.currentEndUnix === 'number' && Number.isFinite(params.currentEndUnix) && params.currentEndUnix > 0) {
    return new Date(params.currentEndUnix * 1000).toISOString();
  }
  if (params.isIntro) {
    if (typeof params.startAtUnix === 'number' && Number.isFinite(params.startAtUnix) && params.startAtUnix * 1000 > nowMs) {
      return new Date(params.startAtUnix * 1000).toISOString();
    }
    return new Date(nowMs + (params.validityHours || 24) * 3600000).toISOString();
  }
  return new Date(nowMs + (params.validityDays || 7) * 86400000).toISOString();
}

function hasFuturePaidThrough(sub: UserSubscription | null | undefined, nowMs: number = Date.now()): boolean {
  if (!sub?.paidThroughAt) return false;
  const parsed = Date.parse(sub.paidThroughAt);
  return !Number.isNaN(parsed) && parsed > nowMs;
}

function isStaleEventForSubscription(
  sub: UserSubscription | null | undefined,
  eventCreatedAtSec?: number
): boolean {
  if (!sub || !eventCreatedAtSec) return false;
  if (sub.lastCapturedAt) {
    const lastCapMs = Date.parse(sub.lastCapturedAt);
    if (!Number.isNaN(lastCapMs) && eventCreatedAtSec < Math.floor(lastCapMs / 1000)) {
      return true;
    }
  }
  if (typeof sub.lastWebhookEventAt === 'number' && eventCreatedAtSec < sub.lastWebhookEventAt) {
    return true;
  }
  return false;
}

export async function processRazorpayWebhookEvent(params: {
  db: ProductionDatabase;
  rawBody: Buffer;
  signature: string;
  event: any;
  headerEventId?: string;
  webhookSecret?: string;
  gateway?: RazorpayGatewayClient;
}): Promise<WebhookProcessResult> {
  const secret = params.webhookSecret ?? process.env.RAZORPAY_WEBHOOK_SECRET ?? '';
  if (!secret) {
    return {
      httpStatus: 400,
      body: {
        error: 'Invalid webhook signature',
        message: 'RAZORPAY_WEBHOOK_SECRET is mandatory and not configured on server'
      }
    };
  }

  if (!verifyRazorpayWebhookHmac(params.rawBody, params.signature, secret)) {
    return {
      httpStatus: 400,
      body: { error: 'Invalid webhook cryptographic signature' }
    };
  }

  const event = params.event;
  if (!event || !event.event) {
    return {
      httpStatus: 400,
      body: { error: 'Malformed webhook payload' }
    };
  }

  const eventType = String(event.event);
  const rawHeaderEventId = typeof params.headerEventId === 'string' ? params.headerEventId.trim() : '';
  const eventId =
    (typeof event.event_id === 'string' && event.event_id.trim()) ||
    (typeof event.id === 'string' && event.id.trim()) ||
    rawHeaderEventId;

  if (!eventId) {
    return {
      httpStatus: 400,
      body: {
        error: 'Missing provider event identity',
        message: 'Provider webhook must include valid event_id, id, or x-razorpay-event-id header.'
      }
    };
  }

  const db = params.db;
  const gateway = params.gateway ?? defaultRazorpayGatewayClient;

  try {
  // Replay protection
  if (await db.isWebhookProcessed(eventId)) {
    return { httpStatus: 200, body: { status: 'ignored_duplicate', eventId } };
  }

  // 1. DEDICATED HANDLER: subscription.authenticated (Razorpay initial mandate + ₹1 upfront charge)
  if (eventType === 'subscription.authenticated') {
    const subEntity = event.payload?.subscription?.entity;
    let payment = event.payload?.payment?.entity;
    const subscriptionId = typeof subEntity?.id === 'string' ? subEntity.id : '';

    if (!subscriptionId || !subscriptionId.startsWith('sub_')) {
      return {
        httpStatus: 400,
        body: { error: 'Malformed subscription.authenticated webhook: missing valid subscription ID' }
      };
    }

    const validSubStatuses = ['authenticated', 'active'];
    if (!validSubStatuses.includes(String(subEntity?.status || ''))) {
      return {
        httpStatus: 200,
        body: {
          status: 'rejected_subscription_status',
          subscriptionId,
          subscriptionStatus: subEntity?.status || 'unknown'
        }
      };
    }

    // Look up stored pending payment / subscription authoritatively from Firestore
    const storedPayment =
      (await db.getPaymentAuthoritative(subscriptionId)) ||
      (payment?.id ? await db.getPaymentAuthoritative(payment.id) : null) ||
      (payment?.order_id ? await db.getPaymentAuthoritative(payment.order_id) : null);
    const existingSub = await db.getSubscriptionByMandateOrIdAuthoritative(subscriptionId);

    const subNotesUserId = typeof subEntity?.notes?.userId === 'string' ? subEntity.notes.userId.trim() : '';
    const payNotesUserId = typeof payment?.notes?.userId === 'string' ? payment.notes.userId.trim() : '';
    const notesUserId = subNotesUserId || payNotesUserId;

    if (storedPayment?.userId && notesUserId && storedPayment.userId !== notesUserId) {
      return {
        httpStatus: 400,
        body: { error: 'Subscription ownership mismatch between stored order and provider notes' }
      };
    }

    const userId = notesUserId || storedPayment?.userId || existingSub?.userId;
    const user = userId ? await db.getUserAuthoritative(userId) : null;
    if (!user) {
      return {
        httpStatus: 400,
        body: { error: 'Subscription user association not found or invalid' }
      };
    }

    // If webhook payload omitted payment entity OR payment isn't captured yet, optionally confirm live via Razorpay API when credentials exist
    if (!payment?.id && getLiveAuthHeader()) {
      const liveInfo = await findLatestPaymentForSubscription(subscriptionId, gateway);
      if (liveInfo.payment) {
        payment = liveInfo.payment;
      }
    } else if (payment?.id && payment.status !== 'captured' && getLiveAuthHeader()) {
      try {
        const refreshed = await gateway.getPayment(payment.id);
        if (refreshed?.id) payment = refreshed;
      } catch {
        // Keep webhook payload entity
      }
    }

    if (!payment || !payment.id) {
      return {
        httpStatus: 400,
        body: {
          error: 'subscription.authenticated missing verified payment entity',
          subscriptionId
        }
      };
    }

    const paymentId = String(payment.id);
    if (payment.subscription_id && payment.subscription_id !== subscriptionId) {
      return {
        httpStatus: 400,
        body: { error: 'Payment subscription_id mismatch in subscription.authenticated' }
      };
    }

    if (payment.currency !== 'INR') {
      return {
        httpStatus: 400,
        body: { error: `Currency mismatch: expected INR, received ${payment.currency}` }
      };
    }

    // Failed or non-captured payments MUST NEVER grant credits or consume intro offer
    if (payment.status === 'failed') {
      if (storedPayment && storedPayment.status !== 'captured') {
        storedPayment.paymentId = paymentId;
        storedPayment.status = 'failed';
        storedPayment.verificationStatus = 'failed';
        storedPayment.failureReason = payment.error_description || payment.error_reason || 'payment_failed';
        storedPayment.updatedAt = new Date().toISOString();
        await db.recordPayment(storedPayment);
      }
      await db.markWebhookProcessed(eventId);
      return {
        httpStatus: 200,
        body: { status: 'rejected_payment_failed', subscriptionId, paymentId }
      };
    }

    if (payment.status !== 'captured') {
      // e.g. 'authorized' only — preserve pending reconciliation state, do NOT grant credits or claim intro offer
      if (storedPayment && storedPayment.status !== 'captured') {
        storedPayment.paymentId = paymentId;
        storedPayment.status = payment.status === 'authorized' ? 'authorized' : 'pending';
        storedPayment.verificationStatus = 'unverified';
        storedPayment.updatedAt = new Date().toISOString();
        await db.recordPayment(storedPayment);
      }
      return {
        httpStatus: 200,
        body: {
          status: 'rejected_payment_not_captured',
          paymentStatus: payment.status,
          subscriptionId,
          paymentId
        }
      };
    }

    // Determine authoritative plan (Intro ₹1 = 40 credits NEVER 400 renewal credits)
    const resolvedPlan = resolvePlanFromHints({
      storedPlanId: storedPayment?.planId,
      noteItemId: payment.notes?.itemId,
      notePlanId: payment.notes?.planId || subEntity?.notes?.planId,
      subPlanId: existingSub?.planId,
      storedType: storedPayment?.type,
      storedAmount: storedPayment?.amount,
      paymentAmountPaise: payment.amount
    });

    if (!resolvedPlan) {
      return {
        httpStatus: 400,
        body: { error: 'Could not resolve authoritative plan for subscription.authenticated' }
      };
    }

    const expectedPaise = Math.round(resolvedPlan.price * 100);
    if (payment.amount !== expectedPaise) {
      return {
        httpStatus: 400,
        body: {
          error: 'Payment amount mismatch in subscription.authenticated',
          received: payment.amount,
          expected: expectedPaise,
          planId: resolvedPlan.id
        }
      };
    }

    // Strict one-time intro guard before crediting
    if (resolvedPlan.isIntro && expectedPaise !== 100) {
      return {
        httpStatus: 400,
        body: { error: 'Invalid intro payment amount; expected 100 paise (₹1)' }
      };
    }

    // Idempotent deduplication check across paymentId, subscriptionId, orderId
    const subVerifyKey = `pay_verify_${subscriptionId}`;
    const orderVerifyKey = payment.order_id ? `pay_verify_${payment.order_id}` : null;
    if (
      (await db.isPaymentProcessed(paymentId)) ||
      (await db.hasTransactionForReference(paymentId)) ||
      (await db.hasTransactionForReference(subscriptionId)) ||
      (await db.isWebhookProcessed(subVerifyKey)) ||
      (orderVerifyKey && (await db.isWebhookProcessed(orderVerifyKey)))
    ) {
      await db.markWebhookProcessed(eventId);
      return {
        httpStatus: 200,
        body: { status: 'already_processed', paymentId, subscriptionId }
      };
    }

    // Grant initial plan credits ONCE (40 credits for ₹1 intro; NEVER 400 renewal credits)
    const creditsToGrant = resolvedPlan.isIntro ? 40 : resolvedPlan.includedCredits;
    const referenceId = paymentId || subscriptionId;
    await db.creditWallet(
      user.id,
      creditsToGrant,
      `Subscription Activated: ${resolvedPlan.name} (₹${resolvedPlan.price})`,
      referenceId,
      'purchase',
      resolvedPlan.id
    );

    const nowIso = new Date().toISOString();
    const updatedPayment: PaymentRecord = {
      id: storedPayment?.id || `pay_rec_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      orderId: storedPayment?.orderId || subscriptionId,
      paymentId,
      subscriptionId,
      mandateId: subscriptionId,
      planId: resolvedPlan.id,
      userId: user.id,
      provider: 'razorpay',
      amount: resolvedPlan.price,
      currency: 'INR',
      type: resolvedPlan.isIntro ? 'intro_mandate' : 'subscription',
      status: 'captured',
      isAutoPay: true,
      verificationStatus: 'verified',
      createdAt: storedPayment?.createdAt || nowIso,
      updatedAt: nowIso
    };
    await db.recordPayment(updatedPayment);

    const nextCalDay = calculateNextCalendarDayStartDate();
    const nextChargeAt =
      subEntity?.start_at
        ? new Date(subEntity.start_at * 1000).toISOString()
        : subEntity?.charge_at
        ? new Date(subEntity.charge_at * 1000).toISOString()
        : resolvedPlan.isIntro
        ? nextCalDay.isoString
        : new Date(Date.now() + (resolvedPlan.validityDays || 7) * 86400000).toISOString();

    const eventCreatedAtSec = extractProviderTimestampSec(event, payment);
    const paidThroughAt = computePaidThroughAtIso({
      isIntro: Boolean(resolvedPlan.isIntro),
      validityDays: resolvedPlan.validityDays,
      validityHours: resolvedPlan.validityHours,
      currentEndUnix: subEntity?.current_end,
      startAtUnix: subEntity?.start_at,
      nowMs: Date.now()
    });
    const newSub: UserSubscription = {
      id: subscriptionId,
      userId: user.id,
      planId: resolvedPlan.id,
      planName: resolvedPlan.name,
      provider: 'razorpay',
      mandateId: subscriptionId,
      subscriptionId,
      introPaymentId: resolvedPlan.isIntro ? paymentId : existingSub?.introPaymentId,
      status: resolvedPlan.isIntro ? 'trial' : 'active',
      startAt: existingSub?.startAt || nowIso,
      nextChargeAt,
      paidThroughAt,
      lastCapturedPaymentId: paymentId,
      lastCapturedAt: nowIso,
      lastWebhookEventAt: eventCreatedAtSec ?? existingSub?.lastWebhookEventAt,
      renewalFailedAt: undefined,
      renewalFailureReason: undefined,
      renewalAmount: resolvedPlan.renewalPrice,
      createdAt: existingSub?.createdAt || nowIso,
      updatedAt: nowIso
    };
    await db.setSubscription(newSub);

    await db.markWebhookProcessed(subVerifyKey);
    if (orderVerifyKey) {
      await db.markWebhookProcessed(orderVerifyKey);
    }
    await db.markWebhookProcessed(eventId);

    return {
      httpStatus: 200,
      body: {
        status: 'processed',
        eventId,
        eventType,
        creditsAdded: creditsToGrant,
        planId: resolvedPlan.id,
        subscriptionId,
        paymentId
      }
    };
  }

  // 2. payment.captured
  if (eventType === 'payment.captured') {
    const payment = event.payload?.payment?.entity;
    if (!payment) {
      return { httpStatus: 400, body: { error: 'Malformed webhook: Missing payment entity' } };
    }

    const paymentId = payment.id;
    const orderId = payment.order_id;
    const subIdFromPayment = typeof payment.subscription_id === 'string' && payment.subscription_id.startsWith('sub_')
      ? payment.subscription_id
      : undefined;

    if (payment.status !== 'captured') {
      return { httpStatus: 400, body: { error: `Payment not captured: current status is ${payment.status}` } };
    }
    if (payment.currency !== 'INR') {
      return { httpStatus: 400, body: { error: `Currency mismatch: expected INR, received ${payment.currency}` } };
    }

    const storedPayment =
      (orderId ? await db.getPaymentAuthoritative(orderId) : null) ||
      (subIdFromPayment ? await db.getPaymentAuthoritative(subIdFromPayment) : null) ||
      (paymentId ? await db.getPaymentAuthoritative(paymentId) : null);

    const effectiveSubId = subIdFromPayment || storedPayment?.subscriptionId;

    if (
      (paymentId && (await db.isPaymentProcessed(paymentId))) ||
      (paymentId && (await db.hasTransactionForReference(paymentId))) ||
      (effectiveSubId && (await db.hasTransactionForReference(effectiveSubId))) ||
      (effectiveSubId && (await db.isWebhookProcessed(`pay_verify_${effectiveSubId}`))) ||
      (orderId && (await db.isWebhookProcessed(`pay_verify_${orderId}`)))
    ) {
      await db.markWebhookProcessed(eventId);
      return { httpStatus: 200, body: { status: 'already_processed', paymentId } };
    }

    const existingSub = effectiveSubId
      ? await db.getSubscriptionByMandateOrIdAuthoritative(effectiveSubId)
      : null;

    const userId = payment.notes?.userId || storedPayment?.userId || existingSub?.userId;
    const user = userId ? await db.getUserAuthoritative(userId) : null;
    if (!user) {
      return { httpStatus: 400, body: { error: 'Payment user association not found or invalid' } };
    }

    const noteType = payment.notes?.type;
    const noteItemId = payment.notes?.itemId || payment.notes?.planId;
    const isTopUp =
      noteType === 'topup' ||
      (typeof noteItemId === 'string' && noteItemId.startsWith('topup_')) ||
      (typeof storedPayment?.planId === 'string' && storedPayment.planId.startsWith('topup_'));

    let expectedPaise = 0;
    let creditsToAdd = 0;
    let creditDescription = '';
    let grantType: 'topup' | 'purchase' = 'purchase';
    let resolvedItemId = '';
    let resolvedPlanObj: ReturnType<typeof getSubscriptionPlanById> | null = null;

    if (isTopUp) {
      const topupId = noteItemId || storedPayment?.planId || CENTRAL_TOP_UP_PACKS[0].id;
      const pack = getTopUpPackById(topupId) || CENTRAL_TOP_UP_PACKS[0];
      expectedPaise = Math.round(pack.price * 100);
      creditsToAdd = pack.credits;
      creditDescription = `Top-Up Webhook: ${pack.name}`;
      grantType = 'topup';
      resolvedItemId = pack.id;
    } else {
      const plan =
        resolvePlanFromHints({
          storedPlanId: storedPayment?.planId,
          noteItemId: payment.notes?.itemId,
          notePlanId: payment.notes?.planId,
          subPlanId: existingSub?.planId,
          storedType: storedPayment?.type,
          storedAmount: storedPayment?.amount,
          paymentAmountPaise: payment.amount
        }) || getSubscriptionPlanById('plan_intro_daily');

      resolvedPlanObj = plan;
      expectedPaise = Math.round(plan.price * 100);
      creditsToAdd = plan.isIntro ? 40 : plan.includedCredits;
      creditDescription = `Webhook Credit: ${plan.name}`;
      grantType = 'purchase';
      resolvedItemId = plan.id;
    }

    if (payment.amount !== expectedPaise) {
      return {
        httpStatus: 400,
        body: {
          error: 'Payment amount mismatch',
          received: payment.amount,
          expected: expectedPaise
        }
      };
    }

    await db.creditWallet(user.id, creditsToAdd, creditDescription, paymentId || effectiveSubId || orderId, grantType, resolvedItemId);

    const nowIso = new Date().toISOString();
    if (storedPayment) {
      storedPayment.paymentId = paymentId || storedPayment.paymentId;
      storedPayment.planId = storedPayment.planId || resolvedItemId;
      storedPayment.subscriptionId = effectiveSubId || storedPayment.subscriptionId;
      storedPayment.status = 'captured';
      storedPayment.verificationStatus = 'verified';
      storedPayment.updatedAt = nowIso;
      await db.recordPayment(storedPayment);
    } else {
      await db.recordPayment({
        id: `pay_rec_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        orderId: orderId || effectiveSubId || paymentId,
        paymentId,
        subscriptionId: effectiveSubId,
        mandateId: effectiveSubId,
        planId: resolvedItemId,
        userId: user.id,
        provider: 'razorpay',
        amount: payment.amount / 100,
        currency: 'INR',
        type: isTopUp ? 'one_time' : resolvedPlanObj?.isIntro ? 'intro_mandate' : 'subscription',
        status: 'captured',
        isAutoPay: Boolean(effectiveSubId),
        verificationStatus: 'verified',
        createdAt: nowIso,
        updatedAt: nowIso
      });
    }

    // Activate subscription if this was an AutoPay initial charge captured via payment.captured
    if (!isTopUp && effectiveSubId && resolvedPlanObj) {
      const currentSub = await db.getSubscriptionAuthoritative(user.id);
      const capEventTs = extractProviderTimestampSec(event, payment);
      const paidThroughAt = computePaidThroughAtIso({
        isIntro: Boolean(resolvedPlanObj.isIntro),
        validityDays: resolvedPlanObj.validityDays,
        validityHours: resolvedPlanObj.validityHours,
        nowMs: Date.now()
      });
      if (
        !currentSub ||
        currentSub.status === 'payment_failed' ||
        currentSub.status === 'past_due' ||
        currentSub.status === 'on_hold' ||
        currentSub.mandateId !== effectiveSubId ||
        !currentSub.paidThroughAt
      ) {
        const nextCalDay = calculateNextCalendarDayStartDate();
        await db.setSubscription({
          id: effectiveSubId,
          userId: user.id,
          planId: resolvedPlanObj.id,
          planName: resolvedPlanObj.name,
          provider: 'razorpay',
          mandateId: effectiveSubId,
          subscriptionId: effectiveSubId,
          introPaymentId: resolvedPlanObj.isIntro ? paymentId : currentSub?.introPaymentId,
          status: resolvedPlanObj.isIntro ? 'trial' : 'active',
          startAt: currentSub?.startAt || nowIso,
          nextChargeAt: resolvedPlanObj.isIntro
            ? nextCalDay.isoString
            : new Date(Date.now() + (resolvedPlanObj.validityDays || 7) * 86400000).toISOString(),
          paidThroughAt,
          lastCapturedPaymentId: paymentId,
          lastCapturedAt: nowIso,
          lastWebhookEventAt: capEventTs ?? currentSub?.lastWebhookEventAt,
          renewalFailedAt: undefined,
          renewalFailureReason: undefined,
          renewalAmount: resolvedPlanObj.renewalPrice,
          createdAt: currentSub?.createdAt || nowIso,
          updatedAt: nowIso
        });
      }
    }

    if (orderId) {
      await db.markWebhookProcessed(`pay_verify_${orderId}`);
    }
    if (effectiveSubId) {
      await db.markWebhookProcessed(`pay_verify_${effectiveSubId}`);
    }
    await db.markWebhookProcessed(eventId);
    return {
      httpStatus: 200,
      body: { status: 'processed', eventId, creditsAdded: creditsToAdd, paymentId }
    };
  }

  // 3. subscription.charged (Strict recurring renewal handler: ₹499 = 400 credits; NEVER grants 400 on ₹1)
  if (eventType === 'subscription.charged') {
    const subEntity = event.payload?.subscription?.entity;
    const payment = event.payload?.payment?.entity;
    const subscriptionId = subEntity?.id;
    const paymentId = payment?.id;
    const userId = subEntity?.notes?.userId || payment?.notes?.userId;

    if (paymentId && ((await db.isPaymentProcessed(paymentId)) || (await db.hasTransactionForReference(paymentId)))) {
      await db.markWebhookProcessed(eventId);
      return { httpStatus: 200, body: { status: 'already_processed', paymentId } };
    }

    const storedPay = subscriptionId ? await db.getPaymentAuthoritative(subscriptionId) : null;
    const sub = subscriptionId
      ? await db.getSubscriptionByMandateOrIdAuthoritative(subscriptionId)
      : userId
      ? await db.getSubscriptionAuthoritative(userId)
      : null;
    const targetUserId = userId || sub?.userId || storedPay?.userId;

    const chargedAmountPaise = payment?.amount;
    const plan = getSubscriptionPlanById(sub?.planId || storedPay?.planId || 'plan_intro_daily');
    const expectedRenewalPaise = Math.round((plan?.renewalPrice || 499) * 100);

    // Explicit Safety Guard: ₹1 (100 paise) MUST NEVER pass renewal verification or grant 400 renewal credits
    if (
      payment?.status !== 'captured' ||
      payment?.currency !== 'INR' ||
      chargedAmountPaise === 100 ||
      chargedAmountPaise !== expectedRenewalPaise
    ) {
      return {
        httpStatus: 200,
        body: {
          status: 'rejected_payment_mismatch',
          chargedAmountPaise,
          expectedRenewalPaise
        }
      };
    }

    const targetUser = targetUserId ? await db.getUserAuthoritative(targetUserId) : null;
    if (!targetUserId || !targetUser) {
      return {
        httpStatus: 400,
        body: { error: 'Subscription renewal user association not found' }
      };
    }

    const renewalCredits = plan?.renewalCredits || 400;
    const nowIso = new Date().toISOString();
    await db.creditWallet(
      targetUserId,
      renewalCredits,
      `AI Prime AutoPay Renewal (${sub?.planName || plan?.name || 'Trail Offer'}) (₹${plan?.renewalPrice || 499})`,
      paymentId || eventId,
      'subscription',
      sub?.planId || plan?.id || 'plan_intro_daily'
    );

    await db.recordPayment({
      id: `pay_ren_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      orderId: payment.order_id || paymentId || eventId,
      paymentId: paymentId || eventId,
      subscriptionId: subscriptionId || sub?.mandateId,
      mandateId: subscriptionId || sub?.mandateId,
      planId: sub?.planId || plan?.id || 'plan_intro_daily',
      userId: targetUserId,
      provider: 'razorpay',
      amount: (chargedAmountPaise || expectedRenewalPaise) / 100,
      currency: 'INR',
      type: 'recurring_renewal',
      status: 'captured',
      isAutoPay: true,
      verificationStatus: 'verified',
      createdAt: nowIso,
      updatedAt: nowIso
    });

    if (sub) {
      const renEventTs = extractProviderTimestampSec(event, payment);
      sub.status = 'active';
      sub.cancelledAt = undefined;
      sub.renewalFailedAt = undefined;
      sub.renewalFailureReason = undefined;
      if (subEntity?.charge_at) {
        sub.nextChargeAt = new Date(subEntity.charge_at * 1000).toISOString();
      } else if (subEntity?.current_end) {
        sub.nextChargeAt = new Date(subEntity.current_end * 1000).toISOString();
      } else {
        sub.nextChargeAt = new Date(Date.now() + (plan?.validityDays || 7) * 86400000).toISOString();
      }
      sub.paidThroughAt = computePaidThroughAtIso({
        isIntro: false,
        validityDays: plan?.validityDays || 7,
        currentEndUnix: subEntity?.current_end || subEntity?.charge_at,
        nowMs: Date.now()
      });
      sub.lastCapturedPaymentId = paymentId || eventId;
      sub.lastCapturedAt = nowIso;
      if (renEventTs) sub.lastWebhookEventAt = renEventTs;
      sub.updatedAt = nowIso;
      await db.setSubscription(sub);
    }

    await db.markWebhookProcessed(eventId);
    return {
      httpStatus: 200,
      body: {
        status: 'processed',
        eventId,
        eventType,
        creditsAdded: renewalCredits,
        paymentId
      }
    };
  }

  // 4. Official Razorpay Status-Only Lifecycle Events (STRICTLY ZERO CREDITS + Idempotent + Out-of-Order Protected)
  const STATUS_ONLY_SUBSCRIPTION_EVENTS: Record<string, UserSubscription['status']> = {
    'subscription.activated': 'active',
    'subscription.resumed': 'active',
    'subscription.pending': 'past_due',
    'subscription.halted': 'on_hold',
    'subscription.paused': 'paused',
    'subscription.completed': 'expired',
    'subscription.cancelled': 'cancelled'
  };

  if (Object.prototype.hasOwnProperty.call(STATUS_ONLY_SUBSCRIPTION_EVENTS, eventType)) {
    const targetStatus = STATUS_ONLY_SUBSCRIPTION_EVENTS[eventType];
    const subEntity = event.payload?.subscription?.entity;
    const subscriptionId = typeof subEntity?.id === 'string' ? subEntity.id.trim() : '';
    const notesUserId = typeof subEntity?.notes?.userId === 'string' ? subEntity.notes.userId.trim() : '';

    if (!subscriptionId || !subscriptionId.startsWith('sub_')) {
      return {
        httpStatus: 400,
        body: { error: `Malformed ${eventType} webhook: missing valid subscription ID` }
      };
    }

    const sub =
      (await db.getSubscriptionByMandateOrIdAuthoritative(subscriptionId)) ||
      (notesUserId ? await db.getSubscriptionAuthoritative(notesUserId) : null);

    if (sub && notesUserId && sub.userId !== notesUserId) {
      return {
        httpStatus: 400,
        body: { error: `Subscription ownership mismatch in ${eventType}` }
      };
    }

    if (!sub) {
      await db.markWebhookProcessed(eventId);
      return {
        httpStatus: 200,
        body: {
          status: 'ignored_subscription_not_found',
          eventId,
          eventType,
          subscriptionId,
          creditsAdded: 0
        }
      };
    }

    const eventCreatedAtSec = extractProviderTimestampSec(event);
    const isDowngradeOrInactive = targetStatus !== 'active';
    if (isDowngradeOrInactive && isStaleEventForSubscription(sub, eventCreatedAtSec)) {
      await db.markWebhookProcessed(eventId);
      return {
        httpStatus: 200,
        body: {
          status: 'ignored_stale_event',
          eventId,
          eventType,
          subscriptionId,
          preservedStatus: sub.status,
          creditsAdded: 0
        }
      };
    }

    const nowIso = new Date().toISOString();
    sub.status = targetStatus;
    if (targetStatus === 'cancelled') {
      sub.cancelledAt = sub.cancelledAt || nowIso;
    } else if (targetStatus === 'active') {
      sub.cancelledAt = undefined;
      sub.renewalFailedAt = undefined;
      sub.renewalFailureReason = undefined;
      // Sync extended current_end ONLY if this subscription already has a verified captured payment
      if (
        (sub.introPaymentId || sub.lastCapturedPaymentId) &&
        typeof subEntity?.current_end === 'number' &&
        subEntity.current_end > 0
      ) {
        const providerEndIso = new Date(subEntity.current_end * 1000).toISOString();
        const currentPaidMs = sub.paidThroughAt ? Date.parse(sub.paidThroughAt) : 0;
        if (Number.isNaN(currentPaidMs) || subEntity.current_end * 1000 > currentPaidMs) {
          sub.paidThroughAt = providerEndIso;
        }
      }
    }
    if (eventCreatedAtSec) {
      sub.lastWebhookEventAt = eventCreatedAtSec;
    }
    sub.updatedAt = nowIso;
    await db.setSubscription(sub);
    await db.markWebhookProcessed(eventId);

    return {
      httpStatus: 200,
      body: {
        status: 'processed',
        eventId,
        eventType,
        subscriptionId,
        subscriptionStatus: sub.status,
        paidThroughPreserved: hasFuturePaidThrough(sub),
        creditsAdded: 0
      }
    };
  }

  // 5. payment.failed (Zero credits + preserves distinct attempts + protects newer captures & paidThroughAt + prevents falsely active unpaid subscriptions)
  if (eventType === 'payment.failed') {
    const payment = event.payload?.payment?.entity;
    const paymentId = typeof payment?.id === 'string' ? payment.id.trim() : '';
    const orderId = typeof payment?.order_id === 'string' ? payment.order_id.trim() : '';
    const subId = typeof payment?.subscription_id === 'string' && payment.subscription_id.startsWith('sub_')
      ? payment.subscription_id.trim()
      : '';
    const failureReason = payment?.error_description || payment?.error_reason || 'payment_failed';
    const eventCreatedAtSec = extractProviderTimestampSec(event, payment);
    const nowIso = new Date().toISOString();

    const storedByPaymentId = paymentId ? await db.getPaymentAuthoritative(paymentId) : null;
    const storedByOrderOrSub =
      (orderId ? await db.getPaymentAuthoritative(orderId) : null) ||
      (subId ? await db.getPaymentAuthoritative(subId) : null);
    const storedPayment = storedByPaymentId || storedByOrderOrSub;

    // Only update existing record in-place if it belongs to THIS exact payment attempt (or is an unassigned pending placeholder) and is NOT captured/verified.
    const existingHasDifferentAttempt = Boolean(
      storedPayment &&
        paymentId &&
        storedPayment.paymentId &&
        storedPayment.paymentId !== storedPayment.subscriptionId &&
        storedPayment.paymentId !== paymentId
    );
    const isSamePaymentOrPlaceholder = Boolean(
      storedPayment &&
        storedPayment.status !== 'captured' &&
        storedPayment.verificationStatus !== 'verified' &&
        !existingHasDifferentAttempt
    );

    if (storedPayment && isSamePaymentOrPlaceholder) {
      storedPayment.paymentId = paymentId || storedPayment.paymentId;
      storedPayment.status = 'failed';
      storedPayment.verificationStatus = 'failed';
      storedPayment.failureReason = failureReason;
      storedPayment.updatedAt = nowIso;
      await db.recordPayment(storedPayment);
    } else if (paymentId || (orderId && orderId !== subId)) {
      // Distinct payment attempt (e.g. pay_50_failed_1 while pay_50_auth_only exists):
      // Store strictly as its OWN separate payment-attempt record WITHOUT overwriting pay_50_auth_only or shared payments/{subId}!
      const attemptKey = (orderId && orderId !== subId) ? orderId : paymentId;
      const attemptSub =
        subId || storedPayment?.subscriptionId
          ? await db.getSubscriptionByMandateOrIdAuthoritative(subId || storedPayment!.subscriptionId!)
          : null;
      const attemptUserId =
        (typeof payment?.notes?.userId === 'string' ? payment.notes.userId.trim() : '') ||
        storedPayment?.userId ||
        attemptSub?.userId ||
        '';
      if (attemptUserId && !storedByPaymentId) {
        const failedAttemptRecord: PaymentRecord = {
          id: `pay_att_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
          orderId: attemptKey,
          paymentId: paymentId || attemptKey,
          subscriptionId: subId || storedPayment?.subscriptionId || undefined,
          mandateId: subId || storedPayment?.mandateId || undefined,
          planId: storedPayment?.planId || payment?.notes?.planId || payment?.notes?.itemId || 'plan_intro_daily',
          userId: attemptUserId,
          provider: 'razorpay',
          amount: typeof payment?.amount === 'number' ? payment.amount / 100 : (storedPayment?.amount || 1),
          currency: typeof payment?.currency === 'string' ? payment.currency : 'INR',
          type: storedPayment?.type || (subId ? 'intro_mandate' : 'one_time'),
          status: 'failed',
          isAutoPay: Boolean(subId || storedPayment?.isAutoPay),
          verificationStatus: 'failed',
          failureReason,
          createdAt: nowIso,
          updatedAt: nowIso
        };
        await db.recordPayment(failedAttemptRecord);
      }
    }

    const effectiveSubId = subId || storedPayment?.subscriptionId || '';
    const isSubscriptionLinkedFailure = Boolean(
      effectiveSubId ||
        storedPayment?.type === 'intro_mandate' ||
        storedPayment?.type === 'recurring_renewal' ||
        storedPayment?.type === 'subscription'
    );

    const sub = isSubscriptionLinkedFailure
      ? effectiveSubId
        ? await db.getSubscriptionByMandateOrIdAuthoritative(effectiveSubId)
        : storedPayment?.userId
        ? await db.getSubscriptionAuthoritative(storedPayment.userId)
        : null
      : null;

    if (sub) {
      const paymentAlreadyCaptured = Boolean(
        paymentId &&
          (sub.lastCapturedPaymentId === paymentId ||
            sub.introPaymentId === paymentId ||
            (await db.isPaymentProcessed(paymentId)))
      );
      const staleAgainstCapture = isStaleEventForSubscription(sub, eventCreatedAtSec);

      if (paymentAlreadyCaptured || staleAgainstCapture) {
        await db.markWebhookProcessed(eventId);
        return {
          httpStatus: 200,
          body: {
            status: 'ignored_stale_payment_failed',
            eventId,
            eventType,
            subscriptionId: sub.subscriptionId || sub.mandateId || sub.id,
            preservedStatus: sub.status,
            creditsAdded: 0
          }
        };
      }

      sub.renewalFailedAt = nowIso;
      sub.renewalFailureReason = failureReason;
      if (eventCreatedAtSec) {
        sub.lastWebhookEventAt = eventCreatedAtSec;
      }
      // Paid-through protection: never cut off remaining access of a previously captured cycle
      if (hasFuturePaidThrough(sub)) {
        if (sub.status !== 'cancelled') {
          sub.status = 'past_due';
        }
      } else if (sub.status !== 'cancelled') {
        sub.status = 'payment_failed';
      }
      sub.updatedAt = nowIso;
      await db.setSubscription(sub);
    }

    await db.markWebhookProcessed(eventId);
    return {
      httpStatus: 200,
      body: {
        status: 'recorded_payment_failure',
        eventId,
        eventType,
        creditsAdded: 0
      }
    };
  }

  // 6. Unknown / Unhandled event types: NEVER mark unknown webhook events processed
  console.warn(`[Razorpay Webhook] Unhandled event type '${eventType}' (eventId=${eventId}) ignored without marking processed.`);
  return {
    httpStatus: 200,
    body: { status: 'ignored_unhandled_event', eventType, eventId }
  };
  } catch (err: any) {
    if (err instanceof AuthoritativeDatabaseError) {
      return {
        httpStatus: 503,
        body: {
          error: err.message,
          code: err.code,
          retryable: true
        }
      };
    }
    throw err;
  }
}

export async function reconcileCustomerRazorpayPayment(params: {
  db: ProductionDatabase;
  userId: string;
  paymentId?: string;
  subscriptionId?: string;
  gateway?: RazorpayGatewayClient;
}): Promise<{ httpStatus: number; body: Record<string, any> }> {
  const db = params.db;
  const gateway = params.gateway ?? defaultRazorpayGatewayClient;
  const hasGatewayCreds = Boolean(params.gateway || getLiveAuthHeader());

  try {
  let requestedPayId = typeof params.paymentId === 'string' ? params.paymentId.trim() : '';
  let requestedSubId = typeof params.subscriptionId === 'string' ? params.subscriptionId.trim() : '';

  if (!requestedPayId && !requestedSubId) {
    const introState = await db.getIntroOfferStateAuthoritative(params.userId);
    if (introState.pendingPayment) {
      requestedSubId = introState.pendingPayment.subscriptionId || '';
      requestedPayId = introState.pendingPayment.paymentId || '';
    }
  }

  if (!requestedPayId && !requestedSubId) {
    return {
      httpStatus: 400,
      body: { error: 'Please provide paymentId or subscriptionId to reconcile.' }
    };
  }

  if (!hasGatewayCreds) {
    return {
      httpStatus: 503,
      body: {
        error: 'Razorpay server credentials are not configured in this environment to verify live payment status.',
        code: 'RAZORPAY_CREDENTIALS_MISSING'
      }
    };
  }

  let rzpPay: any = null;
  let rzpSub: any = null;
  let invoices: any[] = [];
  let requestedPayLookupError: string | null = null;

  if (requestedPayId) {
    try {
      rzpPay = await gateway.getPayment(requestedPayId);
    } catch (err: any) {
      requestedPayLookupError = err?.message || 'Razorpay payment lookup failed';
      console.warn(`[Reconcile] Payment lookup error for ${requestedPayId}:`, requestedPayLookupError);
    }
    // Fail closed when verifying a specific known Payment ID (e.g. pending authorized payment) and provider lookup fails:
    // Never substitute another payment or treat unavailability as proof that the authorization is terminal.
    if (requestedPayLookupError || !rzpPay) {
      return {
        httpStatus: 503,
        body: {
          error: requestedPayLookupError || `Unable to verify payment ${requestedPayId} with Razorpay gateway right now.`,
          code: 'PROVIDER_VERIFICATION_UNAVAILABLE',
          retryable: true
        }
      };
    }
  }

  const effectiveSubId = requestedSubId || (typeof rzpPay?.subscription_id === 'string' ? rzpPay.subscription_id : '');
  if (effectiveSubId) {
    try {
      const subInfo = await findLatestPaymentForSubscription(effectiveSubId, gateway);
      rzpSub = subInfo.subscription;
      invoices = subInfo.invoices;
      if (!rzpPay && subInfo.payment) {
        rzpPay = subInfo.payment;
      }
    } catch (err: any) {
      if (!rzpPay) {
        return {
          httpStatus: 503,
          body: {
            error: err?.message || 'Razorpay subscription lookup unavailable.',
            code: 'PROVIDER_VERIFICATION_UNAVAILABLE',
            retryable: true
          }
        };
      }
    }
  }

  if (!rzpPay && !rzpSub) {
    return {
      httpStatus: 404,
      body: { error: 'No transaction or mandate found on Razorpay with the provided identifiers.' }
    };
  }

  const resolvedPayId = rzpPay?.id || requestedPayId || '';
  const storedRec =
    (resolvedPayId ? await db.getPaymentAuthoritative(resolvedPayId) : null) ||
    (effectiveSubId ? await db.getPaymentAuthoritative(effectiveSubId) : null) ||
    (rzpPay?.order_id ? await db.getPaymentAuthoritative(rzpPay.order_id) : null);

  if (storedRec && storedRec.userId !== params.userId) {
    return {
      httpStatus: 403,
      body: {
        error: 'Payment ownership mismatch. This payment is associated with a different user account.',
        code: 'PAYMENT_OWNERSHIP_MISMATCH'
      }
    };
  }

  const notesUserId = rzpPay?.notes?.userId || rzpSub?.notes?.userId;
  if (notesUserId && notesUserId !== params.userId) {
    return {
      httpStatus: 403,
      body: {
        error: 'Payment notes ownership mismatch.',
        code: 'PAYMENT_OWNERSHIP_MISMATCH'
      }
    };
  }

  // Handle terminal failed/refunded/voided/expired payment explicitly proved by Razorpay Gateway
  const terminalPayStatus = String(rzpPay?.status || '').toLowerCase();
  if (terminalPayStatus === 'failed' || terminalPayStatus === 'refunded' || terminalPayStatus === 'voided' || terminalPayStatus === 'expired') {
    if (storedRec && storedRec.status !== 'captured') {
      storedRec.paymentId = resolvedPayId || storedRec.paymentId;
      storedRec.status = terminalPayStatus === 'refunded' ? 'refunded' : 'failed';
      storedRec.verificationStatus = terminalPayStatus === 'voided' ? 'voided' : 'failed';
      storedRec.failureReason = rzpPay.error_description || rzpPay.error_reason || `payment_${terminalPayStatus}`;
      storedRec.updatedAt = new Date().toISOString();
      await db.recordPayment(storedRec);
    }
    return {
      httpStatus: 400,
      body: {
        error: `Payment ${terminalPayStatus} on Razorpay (${rzpPay.error_description || 'declined'}). No credits granted; you may retry safely.`,
        code: 'PAYMENT_FAILED',
        providerPaymentStatus: terminalPayStatus,
        providerSubscriptionStatus: rzpSub?.status || 'N/A'
      }
    };
  }

  // Authorized-only or uncaptured subscription must NOT grant credits
  if (!rzpPay || rzpPay.status !== 'captured' || rzpPay.currency !== 'INR') {
    // Only mark an unattempted/non-authorized record failed from cancelled/expired/halted subscription.
    // An 'authorized' payment MUST remain pending_reconciliation until Razorpay confirms that exact Payment ID is terminal!
    if (
      rzpSub &&
      ['cancelled', 'expired', 'halted'].includes(String(rzpSub.status || '')) &&
      rzpPay?.status !== 'authorized' &&
      storedRec &&
      storedRec.status !== 'captured' &&
      storedRec.status !== 'authorized'
    ) {
      storedRec.status = 'failed';
      storedRec.verificationStatus = 'failed';
      storedRec.failureReason = `subscription_${rzpSub.status}`;
      storedRec.updatedAt = new Date().toISOString();
      await db.recordPayment(storedRec);
    } else if (rzpPay?.status === 'authorized' && storedRec && storedRec.status !== 'captured') {
      storedRec.paymentId = resolvedPayId || storedRec.paymentId;
      storedRec.status = 'authorized';
      storedRec.verificationStatus = 'unverified';
      storedRec.updatedAt = new Date().toISOString();
      await db.recordPayment(storedRec);
    }

    return {
      httpStatus: 400,
      body: {
        error: rzpPay
          ? `Transaction not captured yet. Payment status: ${rzpPay.status} (must be captured), Mandate status: ${rzpSub?.status || 'N/A'}`
          : `No captured payment found for subscription ${effectiveSubId} (Mandate status: ${rzpSub?.status || 'N/A'}, Invoices inspected: ${invoices.length}).`,
        code: rzpPay?.status === 'authorized' ? 'PAYMENT_ONLY_AUTHORIZED' : 'PAYMENT_NOT_CAPTURED',
        providerPaymentStatus: rzpPay?.status || 'none',
        providerSubscriptionStatus: rzpSub?.status || 'N/A'
      }
    };
  }

  // Strictly map verified INR captured amount to plan & credit grant
  let plan = getSubscriptionPlanById('plan_intro_daily');
  let creditsToGrant = 0;
  let grantType: 'purchase' | 'subscription' = 'purchase';
  let paymentRecordType: PaymentRecord['type'] = 'intro_mandate';
  let subStatus: UserSubscription['status'] = 'trial';

  if (rzpPay.amount === 100) {
    plan = getSubscriptionPlanById('plan_intro_daily');
    creditsToGrant = 40;
    grantType = 'purchase';
    paymentRecordType = 'intro_mandate';
    subStatus = 'trial';
  } else if (rzpPay.amount === 19900) {
    plan = getSubscriptionPlanById('plan_weekly_pass');
    creditsToGrant = 230;
    grantType = 'purchase';
    paymentRecordType = 'subscription';
    subStatus = 'active';
  } else if (rzpPay.amount === 99800) {
    plan = getSubscriptionPlanById('plan_monthly_pass');
    creditsToGrant = 1200;
    grantType = 'purchase';
    paymentRecordType = 'subscription';
    subStatus = 'active';
  } else if (rzpPay.amount === 49900) {
    plan = getSubscriptionPlanById('plan_intro_daily');
    creditsToGrant = 400;
    grantType = 'subscription';
    paymentRecordType = 'recurring_renewal';
    subStatus = 'active';
  } else {
    return {
      httpStatus: 400,
      body: {
        error: `Unrecognized captured payment amount ₹${rzpPay.amount / 100} (${rzpPay.amount} paise).`,
        code: 'AMOUNT_MISMATCH'
      }
    };
  }

  const cyclePaymentId = rzpPay.id;
  const referenceId = cyclePaymentId || effectiveSubId;

  const alreadyProcessed =
    (cyclePaymentId && (await db.isPaymentProcessed(cyclePaymentId))) ||
    (cyclePaymentId && (await db.hasTransactionForReference(cyclePaymentId))) ||
    (paymentRecordType !== 'recurring_renewal' && effectiveSubId && (await db.hasTransactionForReference(effectiveSubId))) ||
    (paymentRecordType !== 'recurring_renewal' && effectiveSubId && (await db.isWebhookProcessed(`pay_verify_${effectiveSubId}`)));

  if (alreadyProcessed) {
    return {
      httpStatus: 200,
      body: {
        success: true,
        alreadyProcessed: true,
        message: 'Payment was already reconciled and credits were granted.',
        wallet: await db.getWalletAuthoritative(params.userId),
        subscription: await db.getSubscriptionAuthoritative(params.userId)
      }
    };
  }

  const nowIso = new Date().toISOString();
  const paymentRecord: PaymentRecord = {
    id: storedRec?.id || `pay_rec_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    orderId: storedRec?.orderId || effectiveSubId || referenceId,
    paymentId: cyclePaymentId || referenceId,
    subscriptionId: effectiveSubId || storedRec?.subscriptionId || undefined,
    mandateId: effectiveSubId || storedRec?.mandateId || undefined,
    planId: plan.id,
    userId: params.userId,
    provider: 'razorpay',
    amount: rzpPay.amount / 100,
    currency: 'INR',
    type: paymentRecordType,
    status: 'captured',
    isAutoPay: Boolean(effectiveSubId || rzpSub),
    verificationStatus: 'verified',
    createdAt: storedRec?.createdAt || nowIso,
    updatedAt: nowIso
  };
  await db.recordPayment(paymentRecord);

  const nextCalDay = calculateNextCalendarDayStartDate();
  const nextChargeAt =
    rzpSub?.charge_at
      ? new Date(rzpSub.charge_at * 1000).toISOString()
      : rzpSub?.start_at
      ? new Date(rzpSub.start_at * 1000).toISOString()
      : subStatus === 'trial'
      ? nextCalDay.isoString
      : new Date(Date.now() + (plan.validityDays || 7) * 86400000).toISOString();

  const existingSub = await db.getSubscriptionAuthoritative(params.userId);
  const paidThroughAt = computePaidThroughAtIso({
    isIntro: subStatus === 'trial',
    validityDays: plan.validityDays,
    validityHours: plan.validityHours,
    currentEndUnix: rzpSub?.current_end,
    startAtUnix: rzpSub?.start_at,
    nowMs: Date.now()
  });
  const newSubscription: UserSubscription = {
    id: effectiveSubId || referenceId,
    userId: params.userId,
    planId: plan.id,
    planName: plan.name,
    provider: 'razorpay',
    mandateId: effectiveSubId || existingSub?.mandateId || '',
    subscriptionId: effectiveSubId || existingSub?.subscriptionId,
    introPaymentId: paymentRecordType === 'intro_mandate' ? cyclePaymentId : existingSub?.introPaymentId,
    status: subStatus,
    startAt: existingSub?.startAt || nowIso,
    nextChargeAt,
    paidThroughAt,
    lastCapturedPaymentId: cyclePaymentId || referenceId,
    lastCapturedAt: nowIso,
    renewalFailedAt: undefined,
    renewalFailureReason: undefined,
    renewalAmount: plan.renewalPrice,
    createdAt: existingSub?.createdAt || nowIso,
    updatedAt: nowIso
  };
  await db.setSubscription(newSubscription);

  await db.creditWallet(
    params.userId,
    creditsToGrant,
    `Reconciled ${plan.name} (₹${rzpPay.amount / 100})`,
    referenceId,
    grantType,
    plan.id
  );
  await db.markWebhookProcessed(`reconcile_${referenceId}`);
  if (paymentRecordType !== 'recurring_renewal' && effectiveSubId) {
    await db.markWebhookProcessed(`pay_verify_${effectiveSubId}`);
  }

  return {
    httpStatus: 200,
    body: {
      success: true,
      creditsAdded: creditsToGrant,
      paymentId: cyclePaymentId,
      subscriptionId: effectiveSubId || undefined,
      wallet: await db.getWalletAuthoritative(params.userId),
      subscription: newSubscription,
      message: `Reconciliation successful! ${creditsToGrant} credits and your ${plan.name} plan have been activated.`
    }
  };
  } catch (err: any) {
    if (err instanceof AuthoritativeDatabaseError) {
      return {
        httpStatus: 503,
        body: {
          error: err.message,
          code: err.code,
          retryable: true
        }
      };
    }
    throw err;
  }
}

export async function checkPendingIntroBeforeCheckout(params: {
  db: ProductionDatabase;
  userId: string;
  gateway?: RazorpayGatewayClient;
}): Promise<
  | { action: 'allow_checkout' }
  | { action: 'block_claimed' }
  | { action: 'block_pending'; pendingPayment: NonNullable<Awaited<ReturnType<ProductionDatabase['getIntroOfferStateAuthoritative']>>['pendingPayment']> }
  | { action: 'reconciled'; reconcileBody: Record<string, any> }
> {
  const introState = await params.db.getIntroOfferStateAuthoritative(params.userId);
  if (!introState.eligible || introState.status === 'claimed') {
    return { action: 'block_claimed' };
  }

  if (introState.status === 'pending_reconciliation' && introState.pendingPayment) {
    const pending = introState.pendingPayment;
    const hasGateway = Boolean(params.gateway || getLiveAuthHeader());
    if (hasGateway && (pending.paymentId || pending.subscriptionId)) {
      const recon = await reconcileCustomerRazorpayPayment({
        db: params.db,
        userId: params.userId,
        paymentId: pending.paymentId,
        subscriptionId: pending.subscriptionId,
        gateway: params.gateway
      });

      if (recon.httpStatus === 200 && recon.body?.success) {
        return { action: 'reconciled', reconcileBody: recon.body };
      }

      // If provider definitively reported that this pending Payment ID (or unattempted subscription) is terminal, allow clean retry.
      // If provider lookup failed (503) or older authorization is still 'authorized', retain pending_reconciliation & block checkout.
      const postCheck = await params.db.getIntroOfferStateAuthoritative(params.userId);
      if (postCheck.status === 'eligible') {
        return { action: 'allow_checkout' };
      }
    }

    return { action: 'block_pending', pendingPayment: pending };
  }

  return { action: 'allow_checkout' };
}

