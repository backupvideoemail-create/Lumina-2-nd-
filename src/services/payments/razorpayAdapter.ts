import crypto from 'crypto';
import type { CreateOrderParams, OrderResult, VerifyPaymentParams, PaymentVerificationResult } from '../types.ts';

export class RazorpayAdapter {
  readonly providerName = 'razorpay';

  async createOrder(params: CreateOrderParams): Promise<OrderResult> {
    const orderId = `rzp_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const paymentToken = `rzptok_${crypto.randomBytes(12).toString('hex')}`;

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

export const razorpayAdapter = new RazorpayAdapter();
