/**
 * Centralized Pricing, Provider Cost Catalog, and Business Configuration
 * 
 * Existing Business Pricing Rule:
 * Provider Cost + 40% Business Markup = Customer Base Price
 * (Note: 40% markup means Math.round(cost * 1.40), not 40% profit margin)
 */

export interface ProviderCostCatalog {
  photoSmart: number;      // Fast neural filter template
  photoAi: number;         // Full Gemini / Imagen diffusion
  videoSmart: number;      // Motion effects video template
  videoAi: number;         // Veo / Sora video diffusion
  faceSwapVideo: number;   // Neural face-swap video rendering
}

export const CENTRAL_PROVIDER_COSTS: ProviderCostCatalog = {
  photoSmart: 10,
  photoAi: 20,
  videoSmart: 25,
  videoAi: 35,
  faceSwapVideo: 32
};

export const BUSINESS_CONFIG = {
  markupPercent: 40, // 40% Business Markup
  creditsPerInr: 1,  // 1 Credit = ₹1 INR baseline value

  // UPI AutoPay Production Configuration
  autoPay: {
    introPriceInr: 1,             // ₹1 introductory authorization payment
    renewalPriceInr: 499,         // ₹499 weekly recurring payment
    renewalInterval: 'weekly' as const, // Weekly recurring schedule matching live gateway plan_TjsjORpnQrwUzl
    renewalCreditsGrant: 400,     // 400 Credits added each verified billing cycle
    mandateMaxAmountInr: 499,
    planId: 'plan_TjsjORpnQrwUzl',
    planName: 'Lumina AutoPay (Double Bonanza)',
    disclosureText: '₹1 today for 24-hr trial · then ₹499 auto-renews via UPI AutoPay for 400 credits until cancelled.'
  },

  // Payment Gateways
  defaultProvider: 'razorpay' as const,
  supportedProviders: ['razorpay', 'cashfree'] as const
};

/**
 * Calculates authoritative customer credit cost based on provider cost + 40% business markup.
 * Formula: Provider Cost + 40% Business Markup = Customer Base Price
 */
export function calculateAuthoritativeCreditCost(
  type: 'photo' | 'video' | 'faceswap',
  engine: 'SMART_TEMPLATE' | 'AI_GENERATION' = 'AI_GENERATION'
): number {
  let providerCost = 0;

  if (type === 'faceswap') {
    providerCost = CENTRAL_PROVIDER_COSTS.faceSwapVideo;
  } else if (type === 'video') {
    providerCost = engine === 'AI_GENERATION'
      ? CENTRAL_PROVIDER_COSTS.videoAi
      : CENTRAL_PROVIDER_COSTS.videoSmart;
  } else {
    providerCost = engine === 'AI_GENERATION'
      ? CENTRAL_PROVIDER_COSTS.photoAi
      : CENTRAL_PROVIDER_COSTS.photoSmart;
  }

  // Provider Cost + 40% Business Markup = Customer Base Price
  const customerBasePrice = Math.round(providerCost * (1 + BUSINESS_CONFIG.markupPercent / 100));
  return customerBasePrice;
}
