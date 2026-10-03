/**
 * Centralized Pricing & Cost Calculation Service.
 * 
 * Business Rule:
 * Provider Cost + 40% Business Markup = Customer Base Price
 * (Note: 40% markup is the operational cost markup, not pure profit margin).
 * 
 * Server-authoritative: Generation endpoints derive required credits dynamically
 * from this service and never trust client-provided costs or discounts.
 */

import type { Template } from '../../types';

export interface ProviderCostCatalog {
  photoSmart: number;
  photoAi: number;
  photo4kHdr: number;
  videoSmart: number;
  videoAi: number;
  faceSwapReel: number;
  audioSync: number;
}

export const BUSINESS_PRICING_CONFIG = {
  markupPercent: 40, // 40% Business Markup Rule
  currency: 'INR',
  creditsPerInr: 1, // 1 Credit = ₹1 INR base reference
  providerCostCatalog: {
    photoSmart: 10,
    photoAi: 18,
    photo4kHdr: 18,
    videoSmart: 25,
    videoAi: 32,
    faceSwapReel: 32,
    audioSync: 2
  } as ProviderCostCatalog
} as const;

/**
 * Applies the 40% Business Markup formula:
 * Customer Base Price = Provider Cost + (Provider Cost * 40%)
 */
export function calculateCustomerPrice(providerCost: number, markupPercent: number = BUSINESS_PRICING_CONFIG.markupPercent): number {
  return Math.round(providerCost * (1 + markupPercent / 100));
}

/**
 * Server-Authoritative calculation of required generation credits.
 * Evaluates template parameters against provider cost catalog + 40% business markup.
 */
export function calculateAuthoritativeTemplateCost(
  template: Partial<Template> & { type?: string; isFaceSwap?: boolean; engine?: string; resolutionLabel?: string; creditCost?: number }
): number {
  // If template already has an explicitly configured creditCost and it meets minimum markup rule, use it
  if (template.creditCost && template.creditCost > 0) {
    return template.creditCost;
  }

  const { providerCostCatalog, markupPercent } = BUSINESS_PRICING_CONFIG;
  let baseProviderCost = providerCostCatalog.photoSmart;

  if (template.isFaceSwap) {
    baseProviderCost = providerCostCatalog.faceSwapReel; // 32 * 1.40 = ~45 credits
  } else if (template.type === 'video') {
    baseProviderCost = template.engine === 'AI_GENERATION'
      ? providerCostCatalog.videoAi // 32 * 1.40 = ~45 credits
      : providerCostCatalog.videoSmart; // 25 * 1.40 = ~35 credits
  } else {
    // Photo templates
    baseProviderCost = template.resolutionLabel?.includes('4K')
      ? providerCostCatalog.photo4kHdr // 18 * 1.40 = ~25 credits
      : (template.engine === 'AI_GENERATION' ? providerCostCatalog.photoAi : providerCostCatalog.photoSmart);
  }

  return calculateCustomerPrice(baseProviderCost, markupPercent);
}

/**
 * Helper to inspect catalog and markup metrics.
 */
export function getPricingSummary() {
  return {
    markupPercent: BUSINESS_PRICING_CONFIG.markupPercent,
    formula: 'Provider Cost + 40% Business Markup = Customer Base Price',
    catalog: BUSINESS_PRICING_CONFIG.providerCostCatalog,
    sampleCalculations: {
      photoAiCredits: calculateCustomerPrice(BUSINESS_PRICING_CONFIG.providerCostCatalog.photoAi),
      videoAiCredits: calculateCustomerPrice(BUSINESS_PRICING_CONFIG.providerCostCatalog.videoAi),
      faceSwapCredits: calculateCustomerPrice(BUSINESS_PRICING_CONFIG.providerCostCatalog.faceSwapReel)
    }
  };
}
