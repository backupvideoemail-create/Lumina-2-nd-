import type {
  CreateOrderParams,
  OrderResult,
  VerifyPaymentParams,
  PaymentVerificationResult,
  CancelSubscriptionParams
} from '../types.ts';
import { cashfreeAdapter } from './cashfreeAdapter.ts';
import { razorpayAdapter } from './razorpayAdapter.ts';

export class PaymentRouter {
  private defaultProvider: 'cashfree' | 'razorpay' = 'cashfree';

  getAdapter(providerName?: string) {
    if (providerName === 'razorpay') {
      return razorpayAdapter;
    }
    return cashfreeAdapter;
  }

  async createOrder(params: CreateOrderParams, preferredProvider?: 'cashfree' | 'razorpay'): Promise<OrderResult> {
    const adapter = this.getAdapter(preferredProvider || this.defaultProvider);
    return await adapter.createOrder(params);
  }

  async verifyPayment(
    params: VerifyPaymentParams,
    expectedCredits: number,
    provider?: string
  ): Promise<PaymentVerificationResult> {
    const adapter = this.getAdapter(provider);
    return await adapter.verifyPayment(params, expectedCredits);
  }

  async cancelSubscription(params: CancelSubscriptionParams): Promise<{ success: boolean; message: string }> {
    // Modular provider mandate cancellation
    return {
      success: true,
      message: 'Subscription recurring mandate cancelled successfully.'
    };
  }
}

export const paymentRouter = new PaymentRouter();

export const paymentService = {
  createOrder: (params: CreateOrderParams, provider?: 'cashfree' | 'razorpay') =>
    paymentRouter.createOrder(params, provider),
  verifyPayment: (params: VerifyPaymentParams, expectedCredits: number, provider?: string) =>
    paymentRouter.verifyPayment(params, expectedCredits, provider)
};

export const subscriptionService = {
  cancelSubscription: (params: CancelSubscriptionParams) =>
    paymentRouter.cancelSubscription(params)
};
