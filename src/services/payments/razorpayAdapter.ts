/**
 * Production Razorpay Adapter for UPI AutoPay Subscriptions & Orders.
 * 
 * Rules:
 * - Real API integration via https://api.razorpay.com/v1
 * - Live key verification (rzp_live_...)
 * - Server-side HMAC-SHA256 signature verification on payments and webhooks
 * - No fake or simulated mandate fallbacks in production mode
 */

import crypto from 'crypto';
import type {
  CreateOrderParams,
  OrderResult,
  VerifyPaymentParams,
  PaymentVerificationResult
} from '../types.ts';

export interface RazorpaySubscriptionConfig {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  isLive: boolean;
}

export interface CreateSubscriptionResult {
  subscriptionId: string;
  planId: string;
  shortUrl?: string;
  status: string;
  totalCount: number;
  currentStart?: number;
  currentEnd?: number;
}

export class RazorpayAdapter {
  readonly providerName = 'razorpay';
  private cachedPlans: Record<string, string> = {};

  private getConfig(): RazorpaySubscriptionConfig {
    const keyId = process.env.RAZORPAY_KEY_ID || '';
    const keySecret = process.env.RAZORPAY_KEY_SECRET || '';
    // RAZORPAY_WEBHOOK_SECRET is strictly mandatory; never fallback to keySecret
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || '';
    const isLive = Boolean(keyId && keySecret && !keyId.startsWith('rzp_test_'));

    return { keyId, keySecret, webhookSecret, isLive };
  }

  getPublicConfig() {
    const config = this.getConfig();
    return {
      provider: this.providerName,
      keyId: config.keyId,
      currency: 'INR',
      isLive: config.isLive,
      webhookConfigured: Boolean(config.webhookSecret)
    };
  }

  /**
   * Resolves or creates a real Razorpay AutoPay Plan for recurring billing.
   * Daily cadence: period: 'daily', interval: 1 for ₹499 renewal.
   */
  async getOrCreateAutoPayPlan(
    amountInRupees = 499,
    period: 'daily' | 'weekly' | 'monthly' = 'daily'
  ): Promise<string> {
    const config = this.getConfig();
    if (!config.keyId || !config.keySecret) {
      throw new Error('Razorpay credentials missing on server.');
    }

    const cacheKey = `${period}_${amountInRupees}`;
    if (this.cachedPlans[cacheKey]) {
      return this.cachedPlans[cacheKey];
    }

    const authHeader = Buffer.from(`${config.keyId}:${config.keySecret}`).toString('base64');
    const response = await fetch('https://api.razorpay.com/v1/plans', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authHeader}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        period,
        interval: 1,
        item: {
          name: `Lumina Double Bonanza ${period === 'daily' ? 'Daily' : period} AutoPay`,
          amount: Math.round(amountInRupees * 100),
          currency: 'INR',
          description: `Lumina AI Studio ${period === 'daily' ? '400 Daily' : period} Recurring Credits AutoPay`
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Failed to create Razorpay Plan (${period} ₹${amountInRupees}): HTTP ${response.status} - ${errText}`);
    }

    const plan = await response.json();
    this.cachedPlans[cacheKey] = plan.id;
    return plan.id;
  }

  /**
   * Creates a real Razorpay UPI AutoPay Subscription.
   */
  async createSubscription(params: {
    userId: string;
    userEmail?: string;
    userPhone?: string;
    totalCycles?: number;
    startAt?: number;
    amountInRupees?: number;
    period?: 'daily' | 'weekly' | 'monthly';
  }): Promise<CreateSubscriptionResult> {
    const config = this.getConfig();
    if (!config.keyId || !config.keySecret) {
      throw new Error('Razorpay credentials missing on server.');
    }

    const planId = await this.getOrCreateAutoPayPlan(params.amountInRupees || 499, params.period || 'daily');
    const authHeader = Buffer.from(`${config.keyId}:${config.keySecret}`).toString('base64');

    const payload: any = {
      plan_id: planId,
      total_count: params.totalCycles || (params.period === 'daily' ? 365 : 52),
      quantity: 1,
      customer_notify: 1,
      notes: {
        userId: params.userId,
        product: `Lumina AutoPay (${params.period || 'daily'})`
      }
    };

    if (params.startAt && params.startAt > Math.floor(Date.now() / 1000) + 300) {
      payload.start_at = params.startAt;
    }

    const res = await fetch('https://api.razorpay.com/v1/subscriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authHeader}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Razorpay subscription creation failed: HTTP ${res.status} - ${errText}`);
    }

    const data = await res.json();
    return {
      subscriptionId: data.id,
      planId: data.plan_id,
      shortUrl: data.short_url,
      status: data.status,
      totalCount: data.total_count,
      currentStart: data.current_start,
      currentEnd: data.current_end
    };
  }

  /**
   * Creates a real order on Razorpay for payment authorization.
   */
  async createOrder(params: CreateOrderParams): Promise<OrderResult> {
    const config = this.getConfig();

    if (!config.keyId || !config.keySecret) {
      throw new Error('Razorpay credentials (RAZORPAY_KEY_ID & RAZORPAY_KEY_SECRET) are missing on the server.');
    }

    const authHeader = Buffer.from(`${config.keyId}:${config.keySecret}`).toString('base64');
    const amountInPaise = Math.round(params.amount * 100);

    const payload = {
      amount: amountInPaise,
      currency: 'INR',
      receipt: `rcpt_${Date.now()}_${params.userId.slice(-6)}`,
      notes: {
        userId: params.userId,
        itemId: params.itemId,
        isMandate: String(params.isMandate || false),
        itemTitle: params.itemTitle || ''
      }
    };

    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authHeader}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('[Razorpay Order Creation Failed]:', response.status, errBody);
      throw new Error(`Razorpay order creation failed: HTTP ${response.status} - ${errBody}`);
    }

    const liveOrder = await response.json();

    return {
      orderId: liveOrder.id,
      amount: params.amount,
      currency: 'INR',
      provider: this.providerName,
      paymentToken: liveOrder.id,
      isMandate: Boolean(params.isMandate),
      mandateDetails: params.mandateSchedule || null,
      checkoutUrl: null
    };
  }

  /**
   * Verifies payment signature and state with strict production security:
   * - Signature is MANDATORY (reject if missing)
   * - Timing-safe HMAC-SHA256 signature verification (reject if mismatch)
   * - Real Razorpay Payment API lookup (reject if API lookup fails or not captured)
   * - Server-side order verification (reject if order_id mismatch)
   * - Currency and amount verification (reject if INR or amount mismatch)
   * - Absolutely NO verified: true fallback
   */
  async verifyPayment(params: VerifyPaymentParams & {
    subscriptionId?: string;
    expectedAmountRupees?: number;
  }): Promise<PaymentVerificationResult> {
    const config = this.getConfig();

    if (!config.keySecret) {
      return {
        verified: false,
        paymentId: params.paymentId,
        orderId: params.orderId,
        error: 'Razorpay secret key not configured on server'
      };
    }

    // 1. Signature is strictly mandatory
    if (!params.signature || typeof params.signature !== 'string') {
      return {
        verified: false,
        paymentId: params.paymentId,
        orderId: params.orderId,
        error: 'Payment signature is mandatory. Unsigned payments are rejected.'
      };
    }

    if (!params.paymentId) {
      return {
        verified: false,
        paymentId: '',
        orderId: params.orderId,
        error: 'Missing Razorpay paymentId'
      };
    }

    // 2. Cryptographic signature check (timing-safe)
    let payloadToSign = `${params.orderId}|${params.paymentId}`;
    if (params.subscriptionId) {
      payloadToSign = `${params.paymentId}|${params.subscriptionId}`;
    }

    const expectedSignature = crypto
      .createHmac('sha256', config.keySecret)
      .update(payloadToSign)
      .digest('hex');

    const signatureBuffer = Buffer.from(params.signature, 'utf-8');
    const expectedBuffer = Buffer.from(expectedSignature, 'utf-8');

    if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
      // Also try alternative payload if both orderId and subscriptionId exist
      let altValid = false;
      if (params.subscriptionId && params.orderId) {
        const altSig = crypto.createHmac('sha256', config.keySecret).update(`${params.orderId}|${params.paymentId}`).digest('hex');
        const altBuf = Buffer.from(altSig, 'utf-8');
        if (signatureBuffer.length === altBuf.length && crypto.timingSafeEqual(signatureBuffer, altBuf)) {
          altValid = true;
        }
      }

      if (!altValid) {
        return {
          verified: false,
          paymentId: params.paymentId,
          orderId: params.orderId,
          error: 'Cryptographic signature mismatch. Tampering detected.'
        };
      }
    }

    // 3. Mandatory Razorpay Payment API status lookup
    if (!config.keyId || !config.keySecret) {
      return {
        verified: false,
        paymentId: params.paymentId,
        orderId: params.orderId,
        error: 'Server credentials missing for Razorpay API lookup.'
      };
    }

    try {
      const authHeader = Buffer.from(`${config.keyId}:${config.keySecret}`).toString('base64');
      const rzpRes = await fetch(`https://api.razorpay.com/v1/payments/${params.paymentId}`, {
        headers: { 'Authorization': `Basic ${authHeader}` }
      });

      if (!rzpRes.ok) {
        const errText = await rzpRes.text();
        return {
          verified: false,
          paymentId: params.paymentId,
          orderId: params.orderId,
          error: `Razorpay payment verification API lookup failed (HTTP ${rzpRes.status}): ${errText}`
        };
      }

      const paymentData = await rzpRes.json();

      // Only confirmed/captured payment is allowed
      if (paymentData.status !== 'captured') {
        return {
          verified: false,
          paymentId: params.paymentId,
          orderId: params.orderId,
          status: paymentData.status,
          error: `Payment is not in confirmed captured state (current status: ${paymentData.status})`
        };
      }

      // Verify currency is INR
      if (paymentData.currency !== 'INR') {
        return {
          verified: false,
          paymentId: params.paymentId,
          orderId: params.orderId,
          error: `Currency mismatch: expected INR, received ${paymentData.currency}`
        };
      }

      // Verify order association if orderId is given
      if (params.orderId && paymentData.order_id && paymentData.order_id !== params.orderId) {
        return {
          verified: false,
          paymentId: params.paymentId,
          orderId: params.orderId,
          error: `Order ID mismatch: expected ${params.orderId}, payment tied to ${paymentData.order_id}`
        };
      }

      // Verify expected amount if provided
      if (params.expectedAmountRupees) {
        const expectedPaise = Math.round(params.expectedAmountRupees * 100);
        if (paymentData.amount !== expectedPaise) {
          return {
            verified: false,
            paymentId: params.paymentId,
            orderId: params.orderId,
            error: `Payment amount mismatch: expected ₹${params.expectedAmountRupees}, received ₹${paymentData.amount / 100}`
          };
        }
      }

      return {
        verified: true,
        success: true,
        paymentId: params.paymentId,
        orderId: params.orderId,
        status: paymentData.status,
        amount: paymentData.amount / 100,
        provider: this.providerName
      };
    } catch (err: any) {
      return {
        verified: false,
        paymentId: params.paymentId,
        orderId: params.orderId,
        error: `Network error during Razorpay payment status lookup: ${err.message}`
      };
    }
  }

  /**
   * Verifies incoming webhook signature on the raw request buffer.
   * RAZORPAY_WEBHOOK_SECRET is strictly mandatory.
   */
  verifyWebhookSignature(rawBody: Buffer, signature: string): boolean {
    const config = this.getConfig();
    const secret = config.webhookSecret;
    if (!secret || !signature) {
      console.warn('[Razorpay Webhook] Signature rejected: RAZORPAY_WEBHOOK_SECRET or signature header missing');
      return false;
    }

    try {
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(rawBody)
        .digest('hex');

      const expectedBuffer = Buffer.from(expectedSignature, 'utf-8');
      const signatureBuffer = Buffer.from(signature, 'utf-8');

      if (expectedBuffer.length !== signatureBuffer.length) {
        return false;
      }

      return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
    } catch (err) {
      console.error('[Razorpay Webhook Verification Error]:', err);
      return false;
    }
  }

  /**
   * Cancels a subscription / recurring mandate on Razorpay.
   * Strict validation: requires actual Razorpay subscription ID (e.g. sub_...).
   */
  async cancelSubscription(subscriptionId: string): Promise<boolean> {
    const config = this.getConfig();
    if (!config.keyId || !config.keySecret) return false;

    if (!subscriptionId || !subscriptionId.startsWith('sub_')) {
      console.error(`[Razorpay Cancel] Refusing cancel: '${subscriptionId}' is not a real Razorpay subscription ID.`);
      return false;
    }

    try {
      const authHeader = Buffer.from(`${config.keyId}:${config.keySecret}`).toString('base64');
      const response = await fetch(`https://api.razorpay.com/v1/subscriptions/${subscriptionId}/cancel`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${authHeader}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ cancel_at_cycle_end: 0 })
      });

      return response.ok;
    } catch (err) {
      console.error('[Razorpay Subscription Cancel Error]:', err);
      return false;
    }
  }
}

export const razorpayAdapter = new RazorpayAdapter();
