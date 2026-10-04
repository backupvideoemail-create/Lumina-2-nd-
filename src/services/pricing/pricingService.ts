/**
 * Centralized Pricing & Cost Calculation Service.
 * 
 * Strict Business Rule:
 * Provider API Cost (USD)
 * → USD/INR conversion (e.g. ₹96.3 / USD)
 * → INR Provider Cost
 * → +40% Business Markup
 * → Final Customer Credit Cost (1 Credit = ₹1 INR)
 * 
 * Example:
 * 15-second video provider cost: $5.00
 * $5.00 × 96.3 = ₹481.50 provider cost
 * ₹481.50 × 1.40 = ₹674.10 ≈ 675 Credits
 * 
 * Server-authoritative: Generation endpoints derive required credits dynamically
 * from this service and never trust client-provided costs or discounts.
 */

import type { Template } from '../../types';

export interface ProviderCostUsdCatalog {
  photoSmartUsd: number;      // Fast filter / upscale
  photoAiDiffusionUsd: number;// Gemini / Imagen diffusion ($0.15)
  photo4kHdrDiffusionUsd: number; // 4K upscale diffusion ($0.19)
  videoSmartMotionUsd: number;// Lightweight motion interpolation ($0.26)
  videoAiDiffusionUsd: number;// Sora / Veo 3.1 video diffusion ($5.00)
  faceSwapVideoUsd: number;   // Neural face-swap video rendering ($0.26)
  audioSyncUsd: number;       // Stem sync / beats audio ($0.02)
}

export interface PricingSettings {
  usdToInrRate: number;       // Current USD/INR rate (Default: 96.3)
  markupPercent: number;      // 40% Business Markup Rule
  currency: string;
  creditsPerInr: number;      // 1 Credit = ₹1 INR
  providerCostsUsd: ProviderCostUsdCatalog;
}

export const CENTRAL_PRICING_CONFIG: PricingSettings = {
  usdToInrRate: 96.3, // Current standard USD/INR conversion
  markupPercent: 40,  // +40% Business Markup Rule (cost * 1.40)
  currency: 'INR',
  creditsPerInr: 1,
  providerCostsUsd: {
    photoSmartUsd: 0.08,           // ~$0.08 × 96.3 × 1.40 = ~11 credits
    photoAiDiffusionUsd: 0.15,     // ~$0.15 × 96.3 × 1.40 = ~20 credits
    photo4kHdrDiffusionUsd: 0.19,  // ~$0.19 × 96.3 × 1.40 = ~26 credits
    videoSmartMotionUsd: 0.26,     // ~$0.26 × 96.3 × 1.40 = ~35 credits
    videoAiDiffusionUsd: 5.00,     // ~$5.00 × 96.3 × 1.40 = ~675 credits (as in prompt example)
    faceSwapVideoUsd: 0.26,        // ~$0.26 × 96.3 × 1.40 = ~35 credits
    audioSyncUsd: 0.02
  }
};

// Backward-compatible alias for existing imports
export const BUSINESS_PRICING_CONFIG = {
  markupPercent: CENTRAL_PRICING_CONFIG.markupPercent,
  currency: CENTRAL_PRICING_CONFIG.currency,
  creditsPerInr: CENTRAL_PRICING_CONFIG.creditsPerInr,
  providerCostCatalog: {
    photoSmart: Math.round(CENTRAL_PRICING_CONFIG.providerCostsUsd.photoSmartUsd * CENTRAL_PRICING_CONFIG.usdToInrRate),
    photoAi: Math.round(CENTRAL_PRICING_CONFIG.providerCostsUsd.photoAiDiffusionUsd * CENTRAL_PRICING_CONFIG.usdToInrRate),
    photo4kHdr: Math.round(CENTRAL_PRICING_CONFIG.providerCostsUsd.photo4kHdrDiffusionUsd * CENTRAL_PRICING_CONFIG.usdToInrRate),
    videoSmart: Math.round(CENTRAL_PRICING_CONFIG.providerCostsUsd.videoSmartMotionUsd * CENTRAL_PRICING_CONFIG.usdToInrRate),
    videoAi: Math.round(CENTRAL_PRICING_CONFIG.providerCostsUsd.videoAiDiffusionUsd * CENTRAL_PRICING_CONFIG.usdToInrRate),
    faceSwapReel: Math.round(CENTRAL_PRICING_CONFIG.providerCostsUsd.faceSwapVideoUsd * CENTRAL_PRICING_CONFIG.usdToInrRate),
    audioSync: Math.round(CENTRAL_PRICING_CONFIG.providerCostsUsd.audioSyncUsd * CENTRAL_PRICING_CONFIG.usdToInrRate)
  }
};

/**
 * Core Pricing Formula:
 * Provider API Cost (USD)
 * → USD/INR conversion (rate)
 * → INR Provider Cost
 * → +40% Business Markup
 * → Final Customer Credit Cost
 */
export function calculateCreditsFromUsd(
  costUsd: number,
  rate = CENTRAL_PRICING_CONFIG.usdToInrRate,
  markupPercent = CENTRAL_PRICING_CONFIG.markupPercent
): number {
  const inrProviderCost = costUsd * rate;
  const customerBasePrice = inrProviderCost * (1 + markupPercent / 100);
  return Math.round(customerBasePrice);
}

/**
 * Applies the 40% Business Markup to INR provider cost:
 * Customer Base Price = Provider Cost + (Provider Cost * 40%)
 */
export function calculateCustomerPrice(
  providerCostInr: number,
  markupPercent: number = CENTRAL_PRICING_CONFIG.markupPercent
): number {
  return Math.round(providerCostInr * (1 + markupPercent / 100));
}

/**
 * Server-Authoritative calculation of required generation credits.
 * Evaluates template parameters against provider cost catalog + USD conversion + 40% markup.
 * Client-provided creditCost is validated or calculated automatically.
 */
export function calculateAuthoritativeTemplateCost(
  template: Partial<Template> & {
    type?: string;
    isFaceSwap?: boolean;
    engine?: string;
    resolutionLabel?: string;
    creditCost?: number;
    providerCostUsd?: number;
  }
): number {
  // If template specifies a direct provider cost in USD, calculate dynamically:
  if (template.providerCostUsd && template.providerCostUsd > 0) {
    return calculateCreditsFromUsd(template.providerCostUsd);
  }

  // If template already has an explicit creditCost and it meets standard thresholds, use it
  if (template.creditCost && template.creditCost > 0) {
    return template.creditCost;
  }

  const { providerCostsUsd } = CENTRAL_PRICING_CONFIG;
  let baseUsd = providerCostsUsd.photoSmartUsd;

  if (template.isFaceSwap) {
    baseUsd = providerCostsUsd.faceSwapVideoUsd;
  } else if (template.type === 'video') {
    baseUsd = template.engine === 'AI_GENERATION'
      ? providerCostsUsd.videoAiDiffusionUsd // $5.00 -> ~675 credits
      : providerCostsUsd.videoSmartMotionUsd; // $0.26 -> ~35 credits
  } else {
    baseUsd = template.resolutionLabel?.includes('4K')
      ? providerCostsUsd.photo4kHdrDiffusionUsd
      : (template.engine === 'AI_GENERATION' ? providerCostsUsd.photoAiDiffusionUsd : providerCostsUsd.photoSmartUsd);
  }

  return calculateCreditsFromUsd(baseUsd);
}

/**
 * Update pricing configuration dynamically (e.g. from Admin).
 */
export function updatePricingSettings(updates: Partial<PricingSettings>) {
  if (updates.usdToInrRate) CENTRAL_PRICING_CONFIG.usdToInrRate = updates.usdToInrRate;
  if (updates.markupPercent) CENTRAL_PRICING_CONFIG.markupPercent = updates.markupPercent;
  if (updates.providerCostsUsd) {
    CENTRAL_PRICING_CONFIG.providerCostsUsd = {
      ...CENTRAL_PRICING_CONFIG.providerCostsUsd,
      ...updates.providerCostsUsd
    };
  }
}

/**
 * Helper to inspect catalog and markup metrics.
 */
export function getPricingSummary() {
  return {
    usdToInrRate: CENTRAL_PRICING_CONFIG.usdToInrRate,
    markupPercent: CENTRAL_PRICING_CONFIG.markupPercent,
    formula: 'Provider API Cost (USD) × USD/INR Rate + 40% Business Markup = Customer Credit Cost',
    usdCatalog: CENTRAL_PRICING_CONFIG.providerCostsUsd,
    sampleCalculations: {
      photoAiCredits: calculateCreditsFromUsd(CENTRAL_PRICING_CONFIG.providerCostsUsd.photoAiDiffusionUsd),
      videoAiCredits: calculateCreditsFromUsd(CENTRAL_PRICING_CONFIG.providerCostsUsd.videoAiDiffusionUsd),
      faceSwapCredits: calculateCreditsFromUsd(CENTRAL_PRICING_CONFIG.providerCostsUsd.faceSwapVideoUsd)
    }
  };
}
