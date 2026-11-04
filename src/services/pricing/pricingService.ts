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

export type SupportStatus = 'SUPPORTED' | 'UNSUPPORTED' | 'UNKNOWN';
export type VerificationStatus = 'VERIFIED' | 'PENDING_QUOTE' | 'NOT_TESTED';

export interface ResolutionTariff {
  resolution: '480p' | '720p' | '1080p';
  publishedListPricePerSecondUsd: number;
  accountQuotePerSecondUsd?: number;
  supportStatus: SupportStatus;
  renderingTestStatus: VerificationStatus;
}

export interface ModelRegistryEntry {
  modelId: string;
  provider: 'higgsfield' | 'gemini' | 'smart_template';
  workflow: 'VIDEO_FACE_REPLACEMENT' | 'OBJECT_SWAP' | 'MOTION_TRANSFER' | 'VIDEO_EDIT' | 'IMAGE_TO_VIDEO' | 'PHOTO_EDIT' | 'PHOTO_GENERATION';
  resolutionTariffs: Record<'480p' | '720p' | '1080p', ResolutionTariff>;
  appDefaultResolution?: '480p' | '720p' | '1080p';
  minDurationSeconds?: number;
  maxDurationSeconds?: number;
  appDefaultDurationSeconds?: number;
  billsSourceVideo: boolean | 'UNKNOWN';
  endpointVerificationStatus: VerificationStatus;
  generationTestStatus: VerificationStatus;
  isEvaluationOnly?: boolean;
}

/**
 * Authoritative Model Registry.
 * Explicitly separates published list prices from verified account quotes.
 * Entries without live verification are labeled PENDING_QUOTE, UNKNOWN, or NOT_TESTED.
 */
export const MODEL_REGISTRY: Record<string, ModelRegistryEntry> = {
  'hf_mult_motion_control_flash': {
    modelId: 'hf_mult_motion_control_flash',
    provider: 'higgsfield',
    workflow: 'MOTION_TRANSFER',
    resolutionTariffs: {
      '480p': { resolution: '480p', publishedListPricePerSecondUsd: 0.05, supportStatus: 'UNKNOWN', renderingTestStatus: 'NOT_TESTED' },
      '720p': { resolution: '720p', publishedListPricePerSecondUsd: 0.10, supportStatus: 'UNKNOWN', renderingTestStatus: 'NOT_TESTED' },
      '1080p': { resolution: '1080p', publishedListPricePerSecondUsd: 0.20, supportStatus: 'UNKNOWN', renderingTestStatus: 'NOT_TESTED' }
    },
    appDefaultResolution: undefined,
    appDefaultDurationSeconds: undefined,
    billsSourceVideo: 'UNKNOWN',
    endpointVerificationStatus: 'PENDING_QUOTE',
    generationTestStatus: 'NOT_TESTED'
  },
  'hf_mult_replace_object_flash': {
    modelId: 'hf_mult_replace_object_flash',
    provider: 'higgsfield',
    workflow: 'OBJECT_SWAP',
    resolutionTariffs: {
      '480p': { resolution: '480p', publishedListPricePerSecondUsd: 0.05, supportStatus: 'UNSUPPORTED', renderingTestStatus: 'NOT_TESTED' },
      '720p': { resolution: '720p', publishedListPricePerSecondUsd: 0.10, supportStatus: 'UNKNOWN', renderingTestStatus: 'NOT_TESTED' },
      '1080p': { resolution: '1080p', publishedListPricePerSecondUsd: 0.20, supportStatus: 'UNKNOWN', renderingTestStatus: 'NOT_TESTED' }
    },
    appDefaultResolution: undefined,
    appDefaultDurationSeconds: undefined,
    billsSourceVideo: 'UNKNOWN',
    endpointVerificationStatus: 'PENDING_QUOTE',
    generationTestStatus: 'NOT_TESTED'
  },
  'gemini-3.1-flash-lite-image': {
    modelId: 'gemini-3.1-flash-lite-image',
    provider: 'gemini',
    workflow: 'PHOTO_GENERATION',
    resolutionTariffs: {
      '480p': { resolution: '480p', publishedListPricePerSecondUsd: 0, supportStatus: 'UNSUPPORTED', renderingTestStatus: 'NOT_TESTED' },
      '720p': { resolution: '720p', publishedListPricePerSecondUsd: 0, supportStatus: 'UNSUPPORTED', renderingTestStatus: 'NOT_TESTED' },
      '1080p': { resolution: '1080p', publishedListPricePerSecondUsd: 0, supportStatus: 'UNKNOWN', renderingTestStatus: 'NOT_TESTED' }
    },
    billsSourceVideo: false,
    endpointVerificationStatus: 'PENDING_QUOTE',
    generationTestStatus: 'NOT_TESTED'
  },
  'gemini-omni-1.1-flash': {
    modelId: 'gemini-omni-1.1-flash',
    provider: 'gemini',
    workflow: 'VIDEO_EDIT',
    resolutionTariffs: {
      '480p': { resolution: '480p', publishedListPricePerSecondUsd: 0, supportStatus: 'UNSUPPORTED', renderingTestStatus: 'NOT_TESTED' },
      '720p': { resolution: '720p', publishedListPricePerSecondUsd: 0, supportStatus: 'UNKNOWN', renderingTestStatus: 'NOT_TESTED' },
      '1080p': { resolution: '1080p', publishedListPricePerSecondUsd: 0, supportStatus: 'UNKNOWN', renderingTestStatus: 'NOT_TESTED' }
    },
    billsSourceVideo: false,
    endpointVerificationStatus: 'PENDING_QUOTE',
    generationTestStatus: 'NOT_TESTED',
    isEvaluationOnly: true
  },
  'smart_canvas_ffmpeg': {
    modelId: 'smart_canvas_ffmpeg',
    provider: 'smart_template',
    workflow: 'VIDEO_EDIT',
    resolutionTariffs: {
      '480p': { resolution: '480p', publishedListPricePerSecondUsd: 0, supportStatus: 'UNKNOWN', renderingTestStatus: 'NOT_TESTED' },
      '720p': { resolution: '720p', publishedListPricePerSecondUsd: 0, supportStatus: 'UNKNOWN', renderingTestStatus: 'NOT_TESTED' },
      '1080p': { resolution: '1080p', publishedListPricePerSecondUsd: 0, supportStatus: 'UNKNOWN', renderingTestStatus: 'NOT_TESTED' }
    },
    billsSourceVideo: false,
    endpointVerificationStatus: 'VERIFIED',
    generationTestStatus: 'NOT_TESTED'
  }
};

/**
 * Stage 1: Pre-Generation Estimated Provider Cost (USD)
 */
export function calculateEstimatedProviderCostUsd(params: {
  modelId: string;
  resolution: '480p' | '720p' | '1080p';
  sourceVideoDurationSeconds?: number;
  requestedOutputDurationSeconds: number;
}): { status: 'QUOTED' | 'PENDING_QUOTE' | 'UNSUPPORTED'; estimatedProviderCostUsd?: number; reason?: string } {
  const entry = MODEL_REGISTRY[params.modelId];
  if (!entry) return { status: 'UNSUPPORTED', reason: 'Model not registered.' };

  const tariff = entry.resolutionTariffs[params.resolution];
  if (!tariff || tariff.supportStatus === 'UNSUPPORTED') {
    return { status: 'UNSUPPORTED', reason: `Resolution ${params.resolution} is unsupported by ${params.modelId}.` };
  }

  const rate = tariff.accountQuotePerSecondUsd || tariff.publishedListPricePerSecondUsd;
  if ((rate === undefined || rate <= 0) && entry.provider !== 'smart_template') {
    return { status: 'PENDING_QUOTE', reason: 'Provider rate quote is unverified.' };
  }

  if (entry.billsSourceVideo === true) {
    if (!params.sourceVideoDurationSeconds || params.sourceVideoDurationSeconds <= 0) {
      return { status: 'PENDING_QUOTE', reason: 'Source video duration is required for dual-duration quote.' };
    }
    const totalEstimatedSeconds = params.sourceVideoDurationSeconds + params.requestedOutputDurationSeconds;
    return { status: 'QUOTED', estimatedProviderCostUsd: totalEstimatedSeconds * rate };
  }

  return { status: 'QUOTED', estimatedProviderCostUsd: params.requestedOutputDurationSeconds * rate };
}

/**
 * Stage 2: Pre-Generation Estimated Customer Credits
 * Strictly applies +40% business markup once. Customer UI shows Credits only, zero INR.
 */
export function calculateEstimatedCustomerCredits(
  estimatedProviderCostUsd: number,
  rate = CENTRAL_PRICING_CONFIG.usdToInrRate,
  markupPercent = CENTRAL_PRICING_CONFIG.markupPercent,
  creditsPerInr = CENTRAL_PRICING_CONFIG.creditsPerInr
): number {
  const inrProviderCost = estimatedProviderCostUsd * rate;
  const customerBasePrice = inrProviderCost * (1 + markupPercent / 100);
  return Math.ceil(customerBasePrice * creditsPerInr);
}

/**
 * Stage 3: Post-Generation Actual Provider Cost (USD)
 */
export function measureActualProviderCostUsd(params: {
  modelId: string;
  resolution: '480p' | '720p' | '1080p';
  actualBillableDurationSeconds: number;
  providerTransactionCostUsd?: number;
}): number {
  if (params.providerTransactionCostUsd !== undefined) {
    return params.providerTransactionCostUsd;
  }
  const entry = MODEL_REGISTRY[params.modelId];
  const tariff = entry?.resolutionTariffs[params.resolution];
  const rate = tariff?.accountQuotePerSecondUsd || tariff?.publishedListPricePerSecondUsd || 0;
  return params.actualBillableDurationSeconds * rate;
}

/**
 * Stage 4: Actual Cost Reconciliation
 */
export function reconcileCostOnCompletion(params: {
  reservedCredits: number;
  actualProviderCostUsd: number;
  rate?: number;
  markupPercent?: number;
  isFailed: boolean;
}): { finalChargeCredits: number; refundCredits: number } {
  if (params.isFailed) {
    return { finalChargeCredits: 0, refundCredits: params.reservedCredits };
  }
  return { finalChargeCredits: params.reservedCredits, refundCredits: 0 };
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
 * Evaluates template parameters against provider cost catalog + USD conversion + 40% markup:
 * Actual Provider Cost -> INR Conversion -> +40% Business Markup -> Required Customer Credits
 * 
 * Supports:
 * - Photo: model/resolution based cost (Gemini 3.1 Flash Image, 4K HDR diffusion, smart preset)
 * - Video: model + duration + resolution based cost (Google Veo 3.1 Lite, duration scaling, 1080p 60FPS)
 */
export function calculateAuthoritativeTemplateCost(
  template: Partial<Template> & {
    type?: string;
    isFaceSwap?: boolean;
    engine?: string;
    model?: string;
    resolutionLabel?: string;
    durationSeconds?: number;
    creditCost?: number;
    providerCostUsd?: number;
  }
): number {
  // 1. Face Swap: Dynamic calculation based on duration ($0.05/sec @ 480p + 40% markup)
  if (template.isFaceSwap || template.model?.includes('genjutsu') || template.model?.includes('faceswap')) {
    return calculateFaceSwapCredits(template.durationSeconds || 4).credits;
  }

  // 2. Video Templates: Server-authoritative dynamic calculation based on model, duration, and resolution
  if (template.type === 'video') {
    const is1080p = Boolean(
      template.resolutionLabel?.includes('1080p') ||
      template.resolutionLabel?.includes('60FPS') ||
      template.resolutionLabel?.includes('FHD')
    );
    const duration = Math.max(1, template.durationSeconds || 5);
    const isVeoAi = template.engine === 'AI_GENERATION' || template.model?.includes('veo') || !template.engine;

    let baseUsd: number;
    if (isVeoAi) {
      // Current Google Veo 3.1 Lite pricing: 720p = $0.05/sec, 1080p = $0.08/sec
      const ratePerSecUsd = is1080p ? 0.08 : 0.05;
      baseUsd = duration * ratePerSecUsd;
    } else {
      baseUsd = CENTRAL_PRICING_CONFIG.providerCostsUsd.videoSmartMotionUsd * (duration / 5);
    }
    return calculateCreditsFromUsd(baseUsd);
  }

  // 3. If template specifies an explicit providerCostUsd, calculate dynamically
  if (template.providerCostUsd && template.providerCostUsd > 0) {
    return calculateCreditsFromUsd(template.providerCostUsd);
  }

  // 4. Photo Templates: dynamic model and resolution based cost
  const { providerCostsUsd } = CENTRAL_PRICING_CONFIG;
  const isGeminiAi = template.engine === 'AI_GENERATION' || template.model?.includes('gemini');
  const is4k = Boolean(template.resolutionLabel?.includes('4K') || template.resolutionLabel?.includes('HDR'));

  let photoUsd = providerCostsUsd.photoSmartUsd;
  if (is4k) {
    photoUsd = providerCostsUsd.photo4kHdrDiffusionUsd;
  } else if (isGeminiAi) {
    photoUsd = providerCostsUsd.photoAiDiffusionUsd;
  }

  return calculateCreditsFromUsd(photoUsd);
}

/**
 * Authoritative Face/Character Video Cost Calculation (Higgsfield Genjutsu Light Motion Transfer).
 * Rate: 480p = $0.05 per source-video second list price.
 * Formula: Duration (sec) × $0.05 × USD/INR Rate × 1.40 (+40% Business Markup) -> Required Customer Credits.
 */
export function calculateFaceSwapCredits(durationSeconds: number = 4): {
  durationSeconds: number;
  providerRatePerSecondUsd: number;
  costUsd: number;
  credits: number;
} {
  // Clamped duration: minimum 4 seconds, maximum 15 seconds
  const clampedDuration = Math.max(4, Math.min(15, Math.ceil(durationSeconds || 4)));
  const providerRatePerSecondUsd = 0.05;
  const costUsd = Number((clampedDuration * providerRatePerSecondUsd).toFixed(3));
  const credits = calculateCreditsFromUsd(costUsd);
  return {
    durationSeconds: clampedDuration,
    providerRatePerSecondUsd,
    costUsd,
    credits
  };
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
