import crypto from 'crypto';
import { CreateOrderParams, OrderResult, VerifyPaymentParams, PaymentVerificationResult } from '../types';

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
}

export const cashfreeAdapter = new CashfreeAdapter();
