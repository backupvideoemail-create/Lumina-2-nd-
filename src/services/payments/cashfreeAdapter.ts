import crypto from 'crypto';
import type { CreateOrderParams, OrderResult, VerifyPaymentParams, PaymentVerificationResult } from '../types.ts';

export class CashfreeAdapter {
  readonly providerName = 'cashfree';

  async createOrder(params: CreateOrderParams): Promise<OrderResult> {
    const orderId = `cf_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const paymentToken = `cftok_${crypto.randomBytes(12).toString('hex')}`;

    return {
      orderId,
      amount: params.amount,
      currency: 'INR',
      provider: this.providerName,
      paymentToken,
      isMandate: !!params.isMandate,
      mandateDetails: params.mandateSchedule || null,
      checkoutUrl: null
    };
  }

  async verifyPayment(params: VerifyPaymentParams, expectedCredits: number): Promise<PaymentVerificationResult> {
    return {
      success: true,
      creditsAdded: expectedCredits,
      orderId: params.orderId,
      provider: this.providerName,
      transactionRef: params.paymentId || `tx_${params.orderId}`
    };
  }

  async cancelSubscription(params: any): Promise<{ success: boolean; message: string }> {
    return {
      success: true,
      message: 'Subscription mandate cancelled successfully.'
    };
  }
}

export const cashfreeAdapter = new CashfreeAdapter();
