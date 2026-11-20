/**
 * Centralized Pricing, Live USD/INR FX & Cost Calculation Service.
 *
 * Strict Business Rule:
 * Actual Provider Cost (USD)
 * -> Fresh Live USD/INR Conversion (with TTL cache; fail-closed if expired!)
 * -> INR Provider Cost
 * -> +40% Business Markup (applied strictly ONCE)
 * -> Final Customer Credit Cost (1 Credit = ₹1 INR)
 *
 * Multi-Unit Tariff Support:
 * - Photo models: `per_image` tariff (e.g., gemini-2.5-flash-image = $0.039/image)
 * - Video / FaceSwap models: `per_second` tariff (duration × resolution tariff)
 * - Smart FFmpeg canvas: local fixed credit / $0 provider cost
 *
 * Strict Safety Separation:
 * - Low-level `calculateEstimatedProviderCostUsd(..., allowPublishedListPriceFallback: false)`
 *   keeps strict PENDING_QUOTE behavior when account-specific quote verification is absent.
 * - Customer-facing `calculateCustomerTemplateQuote` / `calculateCustomerFaceSwapQuote`
 *   computes exact credits from verified account quotes OR published official tariffs when FX is fresh,
 *   while remaining strictly blocked on `isEvaluationOnly` models (like Gemini Omni 1.2) or expired FX.
 */

import type { FxRateStatus, Template } from '../../types';

export interface ProviderCostUsdCatalog {
  photoSmartUsd: number;
  photoAiDiffusionUsd: number;
  photo4kHdrDiffusionUsd: number;
  videoSmartMotionUsd: number;
  videoAiDiffusionUsd: number;
  faceSwapVideoUsd: number;
  audioSyncUsd: number;
}

export interface PricingSettings {
  usdToInrRate: number;
  rateSource: string;
  updatedAt: string;
  expiresAt: string;
  lastVerifiedRate: number;
  markupPercent: number;
  currency: string;
  creditsPerInr: number;
  providerCostsUsd: ProviderCostUsdCatalog;
}

export type SupportStatus = 'SUPPORTED' | 'UNSUPPORTED' | 'UNKNOWN';
export type VerificationStatus = 'VERIFIED' | 'PENDING_QUOTE' | 'NOT_TESTED';
export type BillingUnit = 'per_image' | 'per_second';

export interface ResolutionTariff {
  resolution: '480p' | '720p' | '1080p';
  publishedListPricePerSecondUsd: number;
  openApiDocPricePerSecondUsd?: number;
  accountQuotePerSecondUsd?: number;
  publishedListPricePerImageUsd?: number;
  accountQuotePerImageUsd?: number;
  supportStatus: SupportStatus;
  renderingTestStatus: VerificationStatus;
}

export interface ModelRegistryEntry {
  modelId: string;
  provider: 'higgsfield' | 'gemini' | 'smart_template';
  adapterId: 'geminiAdapter' | 'faceSwapAdapter' | 'videoProviderAdapter' | 'smartCanvas';
  workflow:
    | 'VIDEO_FACE_REPLACEMENT'
    | 'OBJECT_SWAP'
    | 'MOTION_TRANSFER'
    | 'VIDEO_EDIT'
    | 'IMAGE_TO_VIDEO'
    | 'PHOTO_EDIT'
    | 'PHOTO_GENERATION';
  billingUnit: BillingUnit;
  publishedPerImageUsd?: number;
  accountQuotePerImageUsd?: number;
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

export interface FaceSwapProviderOption {
  provider: string;
  providerLabel: string;
  adapters: Array<{
    adapter: string;
    adapterLabel: string;
    models: Array<{
      model: string;
      modelLabel: string;
      workflows: Array<{ workflow: string; workflowLabel: string }>;
      supportedResolutions: Array<'480p' | '720p' | '1080p'>;
      isEvaluationOnly?: boolean;
    }>;
  }>;
}

/**
 * Cascading FaceSwap / Character Video Provider -> Adapter -> Model -> Workflow Compatibility Matrix.
 */
export const FACE_SWAP_COMPATIBLE_COMBINATIONS: FaceSwapProviderOption[] = [
  {
    provider: 'higgsfield',
    providerLabel: 'Higgsfield AI (Genjutsu Light)',
    adapters: [
      {
        adapter: 'faceSwapAdapter',
        adapterLabel: 'Higgsfield Genjutsu Motion & Swap Adapter',
        models: [
          {
            model: 'hf_mult_motion_control_flash',
            modelLabel: 'Motion Control Flash (genjutsu-light/motion-transfer/v1.0)',
            workflows: [
              { workflow: 'MOTION_TRANSFER', workflowLabel: 'Motion Transfer & Face Swap (MOTION_TRANSFER)' }
            ],
            supportedResolutions: ['480p', '720p', '1080p']
          },
          {
            model: 'hf_mult_replace_object_flash',
            modelLabel: 'Object Swap Flash (genjutsu-light/object-swap/v1.0)',
            workflows: [
              { workflow: 'OBJECT_SWAP', workflowLabel: 'Character / Object Swap (OBJECT_SWAP)' }
            ],
            supportedResolutions: ['720p', '1080p']
          }
        ]
      }
    ]
  },
  {
    provider: 'gemini',
    providerLabel: 'Google Gemini Video (Omni 1.2 Flash)',
    adapters: [
      {
        adapter: 'videoProviderAdapter',
        adapterLabel: 'Gemini Interactions Omni Video Adapter',
        models: [
          {
            model: 'gemini-omni-1.2-flash',
            modelLabel: 'Gemini Omni 1.2 Flash',
            workflows: [
              { workflow: 'VIDEO_EDIT', workflowLabel: 'Omni Video Edit (VIDEO_EDIT)' },
              { workflow: 'IMAGE_TO_VIDEO', workflowLabel: 'Image-to-Video (IMAGE_TO_VIDEO)' }
            ],
            supportedResolutions: ['720p', '1080p'],
            isEvaluationOnly: true
          }
        ]
      }
    ]
  }
];

/**
 * Legacy / Alias Model Normalization Map (preserves templates untouched while resolving registry specs cleanly).
 */
export const MODEL_ALIAS_MAP: Record<string, string> = {
  'gemini-omni-1.1-flash': 'gemini-omni-1.2-flash',
  'gemini-2.5-flash-preview-image': 'gemini-2.5-flash-image',
  'editorial-v1': 'gemini-3.1-flash-image',
  'aesthetic-v2': 'gemini-3.1-flash-image',
  'monochrome-pro': 'gemini-3.1-flash-image',
  'higgsfield/genjutsu-light/motion-transfer/v1.0': 'hf_mult_motion_control_flash',
  'higgsfield/genjutsu/motion-transfer/v1.0': 'hf_mult_motion_control_flash',
  'higgsfield/genjutsu-light/object-swap/v1.0': 'hf_mult_replace_object_flash'
};

export function resolveCanonicalModelId(modelId?: string | null): string {
  const clean = (modelId || '').trim();
  if (!clean) return '';
  return MODEL_ALIAS_MAP[clean] || clean;
}

export function getRegisteredModelEntry(modelId?: string | null): ModelRegistryEntry | undefined {
  const clean = (modelId || '').trim();
  if (!clean) return undefined;
  if (MODEL_REGISTRY[clean]) return MODEL_REGISTRY[clean];
  const canonical = resolveCanonicalModelId(clean);
  return MODEL_REGISTRY[canonical];
}

/**
 * Authoritative Model Registry.
 */
export const MODEL_REGISTRY: Record<string, ModelRegistryEntry> = {
  'hf_mult_motion_control_flash': {
    modelId: 'hf_mult_motion_control_flash',
    provider: 'higgsfield',
    adapterId: 'faceSwapAdapter',
    workflow: 'MOTION_TRANSFER',
    billingUnit: 'per_second',
    resolutionTariffs: {
      '480p': { resolution: '480p', publishedListPricePerSecondUsd: 0.05, openApiDocPricePerSecondUsd: 0.0739, supportStatus: 'UNKNOWN', renderingTestStatus: 'NOT_TESTED' },
      '720p': { resolution: '720p', publishedListPricePerSecondUsd: 0.10, openApiDocPricePerSecondUsd: 0.1471, supportStatus: 'UNKNOWN', renderingTestStatus: 'NOT_TESTED' },
      '1080p': { resolution: '1080p', publishedListPricePerSecondUsd: 0.20, openApiDocPricePerSecondUsd: 0.2936, supportStatus: 'UNKNOWN', renderingTestStatus: 'NOT_TESTED' }
    },
    appDefaultResolution: '480p',
    minDurationSeconds: 4,
    maxDurationSeconds: 4,
    appDefaultDurationSeconds: 4,
    billsSourceVideo: true,
    endpointVerificationStatus: 'PENDING_QUOTE',
    generationTestStatus: 'NOT_TESTED'
  },
  'hf_mult_replace_object_flash': {
    modelId: 'hf_mult_replace_object_flash',
    provider: 'higgsfield',
    adapterId: 'faceSwapAdapter',
    workflow: 'OBJECT_SWAP',
    billingUnit: 'per_second',
    resolutionTariffs: {
      '480p': { resolution: '480p', publishedListPricePerSecondUsd: 0.05, openApiDocPricePerSecondUsd: 0.0739, supportStatus: 'UNSUPPORTED', renderingTestStatus: 'NOT_TESTED' },
      '720p': { resolution: '720p', publishedListPricePerSecondUsd: 0.10, openApiDocPricePerSecondUsd: 0.1471, supportStatus: 'UNKNOWN', renderingTestStatus: 'NOT_TESTED' },
      '1080p': { resolution: '1080p', publishedListPricePerSecondUsd: 0.20, openApiDocPricePerSecondUsd: 0.2936, supportStatus: 'UNKNOWN', renderingTestStatus: 'NOT_TESTED' }
    },
    appDefaultResolution: '720p',
    minDurationSeconds: 4,
    maxDurationSeconds: 4,
    appDefaultDurationSeconds: 4,
    billsSourceVideo: true,
    endpointVerificationStatus: 'PENDING_QUOTE',
    generationTestStatus: 'NOT_TESTED'
  },
  'gemini-2.5-flash-image': {
    modelId: 'gemini-2.5-flash-image',
    provider: 'gemini',
    adapterId: 'geminiAdapter',
    workflow: 'PHOTO_GENERATION',
    billingUnit: 'per_image',
    publishedPerImageUsd: 0.039,
    resolutionTariffs: {
      '480p': { resolution: '480p', publishedListPricePerSecondUsd: 0, publishedListPricePerImageUsd: 0.039, supportStatus: 'SUPPORTED', renderingTestStatus: 'NOT_TESTED' },
      '720p': { resolution: '720p', publishedListPricePerSecondUsd: 0, publishedListPricePerImageUsd: 0.039, supportStatus: 'SUPPORTED', renderingTestStatus: 'NOT_TESTED' },
      '1080p': { resolution: '1080p', publishedListPricePerSecondUsd: 0, publishedListPricePerImageUsd: 0.039, supportStatus: 'SUPPORTED', renderingTestStatus: 'NOT_TESTED' }
    },
    appDefaultResolution: '1080p',
    billsSourceVideo: false,
    endpointVerificationStatus: 'VERIFIED',
    generationTestStatus: 'NOT_TESTED'
  },
  'gemini-3.1-flash-lite-image': {
    modelId: 'gemini-3.1-flash-lite-image',
    provider: 'gemini',
    adapterId: 'geminiAdapter',
    workflow: 'PHOTO_GENERATION',
    billingUnit: 'per_image',
    publishedPerImageUsd: 0.045,
    resolutionTariffs: {
      '480p': { resolution: '480p', publishedListPricePerSecondUsd: 0, publishedListPricePerImageUsd: 0.045, supportStatus: 'SUPPORTED', renderingTestStatus: 'NOT_TESTED' },
      '720p': { resolution: '720p', publishedListPricePerSecondUsd: 0, publishedListPricePerImageUsd: 0.045, supportStatus: 'SUPPORTED', renderingTestStatus: 'NOT_TESTED' },
      '1080p': { resolution: '1080p', publishedListPricePerSecondUsd: 0, publishedListPricePerImageUsd: 0.045, supportStatus: 'SUPPORTED', renderingTestStatus: 'NOT_TESTED' }
    },
    appDefaultResolution: '1080p',
    billsSourceVideo: false,
    endpointVerificationStatus: 'VERIFIED',
    generationTestStatus: 'NOT_TESTED'
  },
  'gemini-3.1-flash-image': {
    modelId: 'gemini-3.1-flash-image',
    provider: 'gemini',
    adapterId: 'geminiAdapter',
    workflow: 'PHOTO_GENERATION',
    billingUnit: 'per_image',
    publishedPerImageUsd: 0.067,
    resolutionTariffs: {
      '480p': { resolution: '480p', publishedListPricePerSecondUsd: 0, publishedListPricePerImageUsd: 0.067, supportStatus: 'SUPPORTED', renderingTestStatus: 'NOT_TESTED' },
      '720p': { resolution: '720p', publishedListPricePerSecondUsd: 0, publishedListPricePerImageUsd: 0.067, supportStatus: 'SUPPORTED', renderingTestStatus: 'NOT_TESTED' },
      '1080p': { resolution: '1080p', publishedListPricePerSecondUsd: 0, publishedListPricePerImageUsd: 0.067, supportStatus: 'SUPPORTED', renderingTestStatus: 'NOT_TESTED' }
    },
    appDefaultResolution: '1080p',
    billsSourceVideo: false,
    endpointVerificationStatus: 'VERIFIED',
    generationTestStatus: 'NOT_TESTED'
  },
  'gemini-omni-1.2-flash': {
    modelId: 'gemini-omni-1.2-flash',
    provider: 'gemini',
    adapterId: 'videoProviderAdapter',
    workflow: 'VIDEO_EDIT',
    billingUnit: 'per_second',
    resolutionTariffs: {
      '480p': { resolution: '480p', publishedListPricePerSecondUsd: 0, supportStatus: 'UNSUPPORTED', renderingTestStatus: 'NOT_TESTED' },
      '720p': { resolution: '720p', publishedListPricePerSecondUsd: 0.15, supportStatus: 'SUPPORTED', renderingTestStatus: 'NOT_TESTED' },
      '1080p': { resolution: '1080p', publishedListPricePerSecondUsd: 0.30, supportStatus: 'SUPPORTED', renderingTestStatus: 'NOT_TESTED' }
    },
    appDefaultResolution: '720p',
    minDurationSeconds: 3,
    maxDurationSeconds: 15,
    appDefaultDurationSeconds: 5,
    billsSourceVideo: false,
    endpointVerificationStatus: 'VERIFIED',
    generationTestStatus: 'NOT_TESTED',
    isEvaluationOnly: true
  },
  'smart_canvas_ffmpeg': {
    modelId: 'smart_canvas_ffmpeg',
    provider: 'smart_template',
    adapterId: 'smartCanvas',
    workflow: 'VIDEO_EDIT',
    billingUnit: 'per_second',
    resolutionTariffs: {
      '480p': { resolution: '480p', publishedListPricePerSecondUsd: 0, supportStatus: 'SUPPORTED', renderingTestStatus: 'NOT_TESTED' },
      '720p': { resolution: '720p', publishedListPricePerSecondUsd: 0, supportStatus: 'SUPPORTED', renderingTestStatus: 'NOT_TESTED' },
      '1080p': { resolution: '1080p', publishedListPricePerSecondUsd: 0, supportStatus: 'SUPPORTED', renderingTestStatus: 'NOT_TESTED' }
    },
    appDefaultResolution: '720p',
    billsSourceVideo: false,
    endpointVerificationStatus: 'VERIFIED',
    generationTestStatus: 'NOT_TESTED'
  }
};

// =========================================================================
// LIVE USD/INR FX ENGINE WITH FRESHNESS TTL (NEVER HARDCODES 94.26 OR 96.3)
// =========================================================================

export const FX_DEFAULT_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours cache freshness window

interface InternalFxState {
  rate: number | null;
  source: string;
  fetchedAtMs: number | null;
  expiresAtMs: number | null;
  lastError: string | null;
  ttlMs: number;
}

const fxState: InternalFxState = {
  rate: null,
  source: 'UNINITIALIZED',
  fetchedAtMs: null,
  expiresAtMs: null,
  lastError: null,
  ttlMs: FX_DEFAULT_TTL_MS
};

let fxOnPersistCallback: ((record: {
  rate: number;
  source: string;
  fetchedAt: string;
  expiresAt: string;
}) => void) | null = null;

let fxOnExpiredAlertCallback: ((status: FxRateStatus) => void) | null = null;

export function configureFxHooks(hooks: {
  onPersist?: (record: { rate: number; source: string; fetchedAt: string; expiresAt: string }) => void;
  onExpiredAlert?: (status: FxRateStatus) => void;
}): void {
  fxOnPersistCallback = hooks.onPersist || null;
  fxOnExpiredAlertCallback = hooks.onExpiredAlert || null;
}

export function hydrateFxCache(record: {
  rate: number;
  source: string;
  fetchedAt: string;
  expiresAt: string;
}): void {
  if (!record || !Number.isFinite(record.rate) || record.rate <= 0) return;
  const fetchedMs = new Date(record.fetchedAt).getTime();
  const expiresMs = new Date(record.expiresAt).getTime();
  if (!Number.isFinite(fetchedMs) || !Number.isFinite(expiresMs)) return;
  fxState.rate = Number(record.rate.toFixed(4));
  fxState.source = record.source || 'PERSISTED_CACHE';
  fxState.fetchedAtMs = fetchedMs;
  fxState.expiresAtMs = expiresMs;
  fxState.lastError = null;
  if (Date.now() < expiresMs) {
    CENTRAL_PRICING_CONFIG.usdToInrRate = fxState.rate;
    CENTRAL_PRICING_CONFIG.lastVerifiedRate = fxState.rate;
    CENTRAL_PRICING_CONFIG.rateSource = fxState.source;
    CENTRAL_PRICING_CONFIG.updatedAt = new Date(fetchedMs).toISOString();
    CENTRAL_PRICING_CONFIG.expiresAt = new Date(expiresMs).toISOString();
  }
}

export function resetFxCacheForTest(): void {
  fxState.rate = null;
  fxState.source = 'UNINITIALIZED';
  fxState.fetchedAtMs = null;
  fxState.expiresAtMs = null;
  fxState.lastError = null;
  fxState.ttlMs = FX_DEFAULT_TTL_MS;
}

export function setFxTestState(params: {
  rate: number | null;
  source?: string;
  fetchedAtMs?: number | null;
  expiresAtMs?: number | null;
  lastError?: string | null;
  ttlMs?: number;
}): FxRateStatus {
  fxState.rate = params.rate;
  fxState.source = params.source || 'TEST_FX_FIXTURE';
  fxState.fetchedAtMs = params.fetchedAtMs ?? (params.rate ? Date.now() : null);
  fxState.expiresAtMs = params.expiresAtMs ?? (params.rate ? Date.now() + (params.ttlMs || FX_DEFAULT_TTL_MS) : null);
  fxState.lastError = params.lastError ?? null;
  if (params.ttlMs) fxState.ttlMs = params.ttlMs;
  const st = getLiveFxStatus();
  if (st.isFresh && fxState.rate) {
    CENTRAL_PRICING_CONFIG.usdToInrRate = fxState.rate;
    CENTRAL_PRICING_CONFIG.lastVerifiedRate = fxState.rate;
    CENTRAL_PRICING_CONFIG.rateSource = fxState.source;
    if (st.fetchedAt) CENTRAL_PRICING_CONFIG.updatedAt = st.fetchedAt;
    if (st.expiresAt) CENTRAL_PRICING_CONFIG.expiresAt = st.expiresAt;
  }
  return st;
}

export function getLiveFxStatus(): FxRateStatus {
  const now = Date.now();
  const ttlMinutes = Math.round(fxState.ttlMs / 60000);
  if (fxState.rate && fxState.rate > 0 && fxState.expiresAtMs && fxState.fetchedAtMs) {
    const expired = now >= fxState.expiresAtMs;
    const isFetchedVeryRecently = now - fxState.fetchedAtMs < 5 * 60 * 1000 && !fxState.source.startsWith('PERSISTED');
    return {
      rate: fxState.rate,
      source: fxState.source,
      fetchedAt: new Date(fxState.fetchedAtMs).toISOString(),
      expiresAt: new Date(fxState.expiresAtMs).toISOString(),
      status: expired ? 'EXPIRED_UNAVAILABLE' : isFetchedVeryRecently ? 'FRESH' : 'CACHED_VALID',
      isFresh: !expired,
      ttlMinutes,
      lastError: fxState.lastError
    };
  }
  return {
    rate: null,
    source: fxState.source || 'UNINITIALIZED',
    fetchedAt: fxState.fetchedAtMs ? new Date(fxState.fetchedAtMs).toISOString() : null,
    expiresAt: fxState.expiresAtMs ? new Date(fxState.expiresAtMs).toISOString() : null,
    status: fxState.fetchedAtMs ? 'EXPIRED_UNAVAILABLE' : 'UNFETCHED_UNAVAILABLE',
    isFresh: false,
    ttlMinutes,
    lastError: fxState.lastError
  };
}

/**
 * Auto-fetches live USD/INR FX rate with TTL cache.
 * - Never returns hardcoded permanent 94.26 or stale 96.3 if expired!
 * - If live fetch fails and cached rate is still within TTL -> returns CACHED_VALID.
 * - If live fetch fails AND cached rate is expired or missing -> returns EXPIRED_UNAVAILABLE / UNFETCHED_UNAVAILABLE and fires Admin alert hook!
 */
export async function refreshLiveUsdInrRate(options: {
  force?: boolean;
  fetcher?: typeof fetch;
  ttlMs?: number;
} = {}): Promise<FxRateStatus> {
  const current = getLiveFxStatus();
  if (!options.force && current.isFresh && current.status === 'FRESH') {
    return current;
  }

  const doFetch = options.fetcher || (typeof fetch === 'function' ? fetch : undefined);
  const effectiveTtlMs = options.ttlMs || fxState.ttlMs || FX_DEFAULT_TTL_MS;
  if (options.ttlMs) fxState.ttlMs = options.ttlMs;

  if (!doFetch) {
    fxState.lastError = 'HTTP fetch unavailable in runtime';
    const afterErr = getLiveFxStatus();
    if (!afterErr.isFresh && fxOnExpiredAlertCallback) {
      fxOnExpiredAlertCallback(afterErr);
    }
    return afterErr;
  }

  const endpoints: Array<{ url: string; source: string; extract: (d: any) => number | undefined }> = [
    {
      url: 'https://open.er-api.com/v6/latest/USD',
      source: 'LIVE_FX_OPEN_ER_API',
      extract: (d: any) => Number(d?.rates?.INR)
    },
    {
      url: 'https://api.frankfurter.app/latest?from=USD&to=INR',
      source: 'LIVE_FX_FRANKFURTER',
      extract: (d: any) => Number(d?.rates?.INR)
    }
  ];

  const errors: string[] = [];
  for (const ep of endpoints) {
    try {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
      const timer = controller ? setTimeout(() => controller.abort(), 6000) : undefined;
      const res = await doFetch(ep.url, controller ? { signal: controller.signal } : undefined);
      if (timer) clearTimeout(timer);
      if (!res.ok) {
        errors.push(`${ep.source}: HTTP ${res.status}`);
        continue;
      }
      const data = await res.json();
      const parsedRate = ep.extract(data);
      if (!parsedRate || !Number.isFinite(parsedRate) || parsedRate <= 20 || parsedRate >= 500) {
        errors.push(`${ep.source}: Invalid INR rate payload`);
        continue;
      }
      const nowMs = Date.now();
      const expiresMs = nowMs + effectiveTtlMs;
      const cleanRate = Number(parsedRate.toFixed(4));
      fxState.rate = cleanRate;
      fxState.source = ep.source;
      fxState.fetchedAtMs = nowMs;
      fxState.expiresAtMs = expiresMs;
      fxState.lastError = null;

      CENTRAL_PRICING_CONFIG.usdToInrRate = cleanRate;
      CENTRAL_PRICING_CONFIG.lastVerifiedRate = cleanRate;
      CENTRAL_PRICING_CONFIG.rateSource = ep.source;
      CENTRAL_PRICING_CONFIG.updatedAt = new Date(nowMs).toISOString();
      CENTRAL_PRICING_CONFIG.expiresAt = new Date(expiresMs).toISOString();

      if (fxOnPersistCallback) {
        fxOnPersistCallback({
          rate: cleanRate,
          source: ep.source,
          fetchedAt: CENTRAL_PRICING_CONFIG.updatedAt,
          expiresAt: CENTRAL_PRICING_CONFIG.expiresAt
        });
      }

      return getLiveFxStatus();
    } catch (err: any) {
      errors.push(`${ep.source}: ${err?.message || 'fetch failed'}`);
    }
  }

  fxState.lastError = errors.join(' | ');
  const postFailStatus = getLiveFxStatus();
  if (!postFailStatus.isFresh && fxOnExpiredAlertCallback) {
    fxOnExpiredAlertCallback(postFailStatus);
  }
  return postFailStatus;
}

export function getAuthoritativeFxForCustomerPricing(): {
  available: boolean;
  rate?: number;
  fxStatus: FxRateStatus;
  errorCode?: string;
  reason?: string;
} {
  const fxStatus = getLiveFxStatus();
  if (fxStatus.isFresh && fxStatus.rate && fxStatus.rate > 0) {
    return { available: true, rate: fxStatus.rate, fxStatus };
  }
  if (fxOnExpiredAlertCallback) {
    fxOnExpiredAlertCallback(fxStatus);
  }
  return {
    available: false,
    fxStatus,
    errorCode: 'FX_RATE_EXPIRED',
    reason:
      fxStatus.status === 'EXPIRED_UNAVAILABLE'
        ? `Live USD/INR FX cache expired at ${fxStatus.expiresAt} and live FX fetch failed (${fxStatus.lastError || 'offline'}).`
        : `Live USD/INR FX rate has not been fetched yet (${fxStatus.lastError || 'awaiting live FX fetch'}).`
  };
}

/**
 * Stage 1: Strict Pre-Generation Estimated Provider Cost (USD)
 * Fails closed with PENDING_QUOTE if resolution support or billing rules are UNKNOWN
 * (when allowPublishedListPriceFallback is false).
 */
export function getConfiguredHiggsfieldAccountRateOverride(res: '480p' | '720p' | '1080p'): number | undefined {
  if (typeof process === 'undefined' || process.env?.HIGGSFIELD_BILLING_VERIFIED !== 'true') return undefined;
  const raw =
    res === '480p'
      ? process.env?.HIGGSFIELD_VERIFIED_RATE_480P_USD
      : res === '720p'
      ? process.env?.HIGGSFIELD_VERIFIED_RATE_720P_USD
      : process.env?.HIGGSFIELD_VERIFIED_RATE_1080P_USD;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function resolveAuthoritativeTemplatePricing(params: {
  modelId?: string | null;
  type: 'photo' | 'video';
  engine?: string;
  resolution?: '480p' | '720p' | '1080p';
  durationSeconds?: number;
  sourceVideoDurationSeconds?: number;
  fallbackProviderCostUsd?: number;
  fallbackCreditCost?: number;
}): {
  providerCostUsd: number;
  creditCost: number;
  source: 'MODEL_REGISTRY' | 'SMART_TEMPLATE' | 'FALLBACK';
} {
  if (params.engine === 'SMART_TEMPLATE' || params.modelId === 'smart_canvas_ffmpeg') {
    const costUsd = Number(params.fallbackProviderCostUsd) > 0 ? Number(params.fallbackProviderCostUsd) : 0;
    const credits =
      costUsd > 0
        ? calculateCreditsFromUsd(costUsd) || Math.max(1, Number(params.fallbackCreditCost) || 10)
        : Math.max(1, Number(params.fallbackCreditCost) || 10);
    return { providerCostUsd: costUsd, creditCost: credits, source: 'SMART_TEMPLATE' };
  }

  const entry = getRegisteredModelEntry(params.modelId);
  if (!entry) {
    const costUsd = Number(params.fallbackProviderCostUsd) > 0 ? Number(params.fallbackProviderCostUsd) : 0.08;
    return {
      providerCostUsd: costUsd,
      creditCost: calculateCreditsFromUsd(costUsd) || Math.max(1, Number(params.fallbackCreditCost) || 12),
      source: 'FALLBACK'
    };
  }

  const effectiveRes = params.resolution || entry.appDefaultResolution || (entry.billingUnit === 'per_image' ? '1080p' : '480p');
  const effectiveDur = entry.billingUnit === 'per_image' ? 1 : Math.ceil(Number(params.durationSeconds) || entry.appDefaultDurationSeconds || 4);
  const est = calculateEstimatedProviderCostUsd({
    modelId: entry.modelId,
    resolution: effectiveRes,
    sourceVideoDurationSeconds:
      entry.billsSourceVideo === true
        ? Math.min(15, Number(params.sourceVideoDurationSeconds) > 0 ? Number(params.sourceVideoDurationSeconds) : 15)
        : undefined,
    requestedOutputDurationSeconds: effectiveDur,
    allowPublishedListPriceFallback: true
  });

  if (est.status === 'QUOTED' && est.estimatedProviderCostUsd !== undefined) {
    return {
      providerCostUsd: est.estimatedProviderCostUsd,
      creditCost: calculateEstimatedCustomerCredits(est.estimatedProviderCostUsd) || Math.max(1, Number(params.fallbackCreditCost) || 10),
      source: 'MODEL_REGISTRY'
    };
  }

  const costUsd = Number(params.fallbackProviderCostUsd) > 0 ? Number(params.fallbackProviderCostUsd) : 0.25;
  return {
    providerCostUsd: costUsd,
    creditCost: calculateCreditsFromUsd(costUsd) || Math.max(1, Number(params.fallbackCreditCost) || 10),
    source: 'FALLBACK'
  };
}

export function calculateEstimatedProviderCostUsd(params: {
  modelId: string;
  resolution: '480p' | '720p' | '1080p';
  sourceVideoDurationSeconds?: number;
  requestedOutputDurationSeconds: number;
  allowPublishedListPriceFallback?: boolean;
}): {
  status: 'QUOTED' | 'PENDING_QUOTE' | 'UNSUPPORTED';
  estimatedProviderCostUsd?: number;
  quoteBasis?: 'ACCOUNT_QUOTE' | 'PUBLISHED_LIST_PRICE';
  billingUnit?: BillingUnit;
  reason?: string;
} {
  const entry = getRegisteredModelEntry(params.modelId);
  if (!entry) return { status: 'UNSUPPORTED', reason: `Model ${params.modelId} is not registered.` };

  const tariff = entry.resolutionTariffs[params.resolution];
  if (!tariff || tariff.supportStatus === 'UNSUPPORTED') {
    return { status: 'UNSUPPORTED', reason: `Resolution ${params.resolution} is unsupported by ${params.modelId}.` };
  }

  // Handle per_image billing models cleanly (Gemini Photo models)
  if (entry.billingUnit === 'per_image') {
    const hasAccountQuote = Boolean(
      (tariff.accountQuotePerImageUsd && tariff.accountQuotePerImageUsd > 0) ||
      (entry.accountQuotePerImageUsd && entry.accountQuotePerImageUsd > 0)
    );
    const quoteBasis: 'ACCOUNT_QUOTE' | 'PUBLISHED_LIST_PRICE' = hasAccountQuote
      ? 'ACCOUNT_QUOTE'
      : 'PUBLISHED_LIST_PRICE';
    const perImageRate =
      tariff.accountQuotePerImageUsd ||
      entry.accountQuotePerImageUsd ||
      tariff.publishedListPricePerImageUsd ||
      entry.publishedPerImageUsd;

    if (!hasAccountQuote && !params.allowPublishedListPriceFallback) {
      return {
        status: 'PENDING_QUOTE',
        quoteBasis: 'PUBLISHED_LIST_PRICE',
        billingUnit: 'per_image',
        reason: `Account-specific quote is required for photo model ${entry.modelId}. Published list price ($${perImageRate}/image) requires explicit list-price authorization.`
      };
    }

    if (!perImageRate || perImageRate <= 0) {
      return { status: 'PENDING_QUOTE', billingUnit: 'per_image', reason: `Per-image tariff missing for ${entry.modelId}.` };
    }

    return {
      status: 'QUOTED',
      estimatedProviderCostUsd: Number(perImageRate.toFixed(4)),
      quoteBasis,
      billingUnit: 'per_image'
    };
  }

  // UNKNOWN resolution capability must NOT return QUOTED; fail closed with PENDING_QUOTE
  if (tariff.supportStatus === 'UNKNOWN' && !params.allowPublishedListPriceFallback) {
    return {
      status: 'PENDING_QUOTE',
      billingUnit: 'per_second',
      reason: `Resolution ${params.resolution} capability is unverified (UNKNOWN) for model ${params.modelId}.`
    };
  }

  // UNKNOWN billing rule must NOT assume output-only when strict
  if (entry.billsSourceVideo === 'UNKNOWN' && !params.allowPublishedListPriceFallback) {
    return {
      status: 'PENDING_QUOTE',
      billingUnit: 'per_second',
      reason: `Source video billing policy is unverified (UNKNOWN) for model ${params.modelId}. Dual-duration tariff cannot be quoted.`
    };
  }

  // Account rate lookup uses module-level getConfiguredHiggsfieldAccountRateOverride helper

  const configuredAccountRate =
    entry.provider === 'higgsfield' ? getConfiguredHiggsfieldAccountRateOverride(params.resolution) : undefined;
  const effectiveAccountRate =
    configuredAccountRate !== undefined
      ? configuredAccountRate
      : tariff.accountQuotePerSecondUsd;

  const hasAccountQuote = Boolean(effectiveAccountRate && effectiveAccountRate > 0);
  const quoteBasis: 'ACCOUNT_QUOTE' | 'PUBLISHED_LIST_PRICE' = hasAccountQuote
    ? 'ACCOUNT_QUOTE'
    : 'PUBLISHED_LIST_PRICE';

  // Smart template local ffmpeg is free
  if (entry.provider === 'smart_template') {
    return { status: 'QUOTED', estimatedProviderCostUsd: 0, quoteBasis: 'ACCOUNT_QUOTE', billingUnit: 'per_second' };
  }

  if (!hasAccountQuote && !params.allowPublishedListPriceFallback) {
    return {
      status: 'PENDING_QUOTE',
      quoteBasis: 'PUBLISHED_LIST_PRICE',
      billingUnit: 'per_second',
      reason: `Account-specific quote is required for model ${params.modelId} at ${params.resolution}. Published list price cannot be used without explicit quote authorization.`
    };
  }

  const rate = hasAccountQuote
    ? effectiveAccountRate!
    : tariff.publishedListPricePerSecondUsd;

  if (rate === undefined || rate <= 0) {
    return { status: 'PENDING_QUOTE', billingUnit: 'per_second', reason: 'Provider rate quote is unverified.' };
  }

  if (entry.billsSourceVideo === true) {
    if (!params.sourceVideoDurationSeconds || params.sourceVideoDurationSeconds <= 0) {
      return { status: 'PENDING_QUOTE', billingUnit: 'per_second', reason: 'Source video duration (first 15s max) is required for dual-duration quote.' };
    }
    const clampedSourceSeconds = Math.min(15, Math.max(0, params.sourceVideoDurationSeconds));
    const roundedOutputSeconds = Math.ceil(Math.max(1, params.requestedOutputDurationSeconds));
    const totalEstimatedSeconds = clampedSourceSeconds + roundedOutputSeconds;
    return {
      status: 'QUOTED',
      estimatedProviderCostUsd: Number((totalEstimatedSeconds * rate).toFixed(4)),
      quoteBasis,
      billingUnit: 'per_second'
    };
  }

  const roundedOutputOnly = Math.ceil(Math.max(1, params.requestedOutputDurationSeconds));
  return {
    status: 'QUOTED',
    estimatedProviderCostUsd: Number((roundedOutputOnly * rate).toFixed(4)),
    quoteBasis,
    billingUnit: 'per_second'
  };
}

/**
 * Customer-facing authoritative quote calculator:
 * Uses Live Fresh USD/INR FX + +40% single markup + verified/published tariff.
 * Fails closed ONLY if:
 *  - model is `isEvaluationOnly: true` (e.g. Omni 1.2) unless `isEvaluationMode: true`
 *  - live USD/INR FX is expired/unavailable (or requires fresh fetch)
 *  - model is unregistered / incompatible resolution or unsupported duration
 */
export function calculateCustomerTemplateQuote(params: {
  modelId: string;
  type: 'photo' | 'video';
  resolution?: '480p' | '720p' | '1080p';
  durationSeconds?: number;
  sourceVideoDurationSeconds?: number;
  engine?: string;
  creditCost?: number;
  providerCostUsd?: number;
  isEvaluationMode?: boolean;
  fxRateOverride?: number;
}): {
  status: 'QUOTED' | 'EVALUATION_ONLY' | 'FX_EXPIRED' | 'UNSUPPORTED' | 'UNCONFIGURED';
  credits: number;
  estimatedProviderCostUsd: number | null;
  usdToInrRate: number | null;
  quoteBasis?: 'ACCOUNT_QUOTE' | 'PUBLISHED_LIST_PRICE' | 'SMART_TEMPLATE';
  billingUnit?: BillingUnit;
  reason?: string;
} {
  if (params.engine === 'SMART_TEMPLATE' || params.modelId === 'smart_canvas_ffmpeg') {
    const fxCheck = params.fxRateOverride
      ? { available: true, rate: params.fxRateOverride }
      : getAuthoritativeFxForCustomerPricing();
    const rate = fxCheck.rate || CENTRAL_PRICING_CONFIG.usdToInrRate;
    const credits = params.providerCostUsd && params.providerCostUsd > 0
      ? calculateEstimatedCustomerCredits(params.providerCostUsd, rate)
      : (params.creditCost || 10);
    return {
      status: 'QUOTED',
      credits,
      estimatedProviderCostUsd: params.providerCostUsd || 0,
      usdToInrRate: rate,
      quoteBasis: 'SMART_TEMPLATE',
      billingUnit: params.type === 'photo' ? 'per_image' : 'per_second'
    };
  }

  const entry = getRegisteredModelEntry(params.modelId);
  if (!entry) {
    return {
      status: 'UNCONFIGURED',
      credits: 0,
      estimatedProviderCostUsd: null,
      usdToInrRate: null,
      reason: `Model '${params.modelId}' is not registered in server MODEL_REGISTRY.`
    };
  }

  if (entry.isEvaluationOnly && !params.isEvaluationMode) {
    return {
      status: 'EVALUATION_ONLY',
      credits: 0,
      estimatedProviderCostUsd: null,
      usdToInrRate: null,
      billingUnit: entry.billingUnit,
      reason: `Model '${entry.modelId}' is guarded for Owner evaluation until real generation verification completes.`
    };
  }

  const effectiveRes = params.resolution || entry.appDefaultResolution || (entry.billingUnit === 'per_image' ? '1080p' : '480p');
  const effectiveDuration = entry.billingUnit === 'per_image'
    ? 1
    : Math.ceil(Math.max(1, Number(params.durationSeconds) || entry.appDefaultDurationSeconds || 4));

  if (
    entry.billingUnit === 'per_second' &&
    entry.minDurationSeconds !== undefined &&
    entry.maxDurationSeconds !== undefined &&
    (effectiveDuration < entry.minDurationSeconds || effectiveDuration > entry.maxDurationSeconds)
  ) {
    return {
      status: 'UNSUPPORTED',
      credits: 0,
      estimatedProviderCostUsd: null,
      usdToInrRate: null,
      billingUnit: entry.billingUnit,
      reason: `Output duration ${effectiveDuration}s is outside verified bounds [${entry.minDurationSeconds}s - ${entry.maxDurationSeconds}s] for ${entry.modelId}.`
    };
  }

  const fxRes = params.fxRateOverride
    ? { available: true, rate: params.fxRateOverride }
    : getAuthoritativeFxForCustomerPricing();

  if (!fxRes.available || !fxRes.rate) {
    return {
      status: 'FX_EXPIRED',
      credits: 0,
      estimatedProviderCostUsd: null,
      usdToInrRate: null,
      billingUnit: entry.billingUnit,
      reason: (fxRes as any).reason || 'Live USD/INR FX rate expired or unavailable.'
    };
  }

  const usdEst = calculateEstimatedProviderCostUsd({
    modelId: entry.modelId,
    resolution: effectiveRes,
    sourceVideoDurationSeconds: params.sourceVideoDurationSeconds,
    requestedOutputDurationSeconds: effectiveDuration,
    allowPublishedListPriceFallback: true
  });

  if (usdEst.status !== 'QUOTED' || usdEst.estimatedProviderCostUsd === undefined) {
    return {
      status: 'UNSUPPORTED',
      credits: 0,
      estimatedProviderCostUsd: null,
      usdToInrRate: fxRes.rate,
      billingUnit: entry.billingUnit,
      reason: usdEst.reason || 'Unsupported configuration.'
    };
  }

  const credits = calculateEstimatedCustomerCredits(usdEst.estimatedProviderCostUsd, fxRes.rate);
  return {
    status: 'QUOTED',
    credits,
    estimatedProviderCostUsd: usdEst.estimatedProviderCostUsd,
    usdToInrRate: fxRes.rate,
    quoteBasis: usdEst.quoteBasis,
    billingUnit: entry.billingUnit
  };
}

/**
 * Authoritative FaceSwap quote calculator:
 * Enforces verified duration limits (default/max 4s per current Genjutsu Light listing)
 * and dual-duration billing: Math.min(sourceDuration, 15) + Math.ceil(outputDuration).
 */
export function calculateAuthoritativeFaceSwapQuote(params: {
  modelId?: string;
  resolution?: '480p' | '720p' | '1080p';
  durationSeconds?: number;
  sourceVideoDurationSeconds?: number;
  fxRateOverride?: number;
}): {
  status: 'QUOTED' | 'EVALUATION_ONLY' | 'FX_EXPIRED' | 'UNSUPPORTED' | 'UNCONFIGURED';
  durationSeconds: number;
  sourceDurationSeconds: number | null;
  billableDurationSeconds: number | null;
  modelId: string;
  resolution: '480p' | '720p' | '1080p';
  providerRatePerSecondUsd: number | null;
  costUsd: number | null;
  usdToInrRate: number | null;
  credits: number;
  quoteBasis?: string;
  reason?: string;
} {
  const resolvedModel = resolveCanonicalModelId(params.modelId || 'hf_mult_motion_control_flash');
  const entry = getRegisteredModelEntry(resolvedModel);
  const minDur = entry?.minDurationSeconds ?? 4;
  const maxDur = entry?.maxDurationSeconds ?? 4;
  const roundedRequested = Math.ceil(Number(params.durationSeconds) || minDur);
  const clampedDuration = Math.max(minDur, Math.min(maxDur, roundedRequested));
  const resolvedRes = params.resolution || entry?.appDefaultResolution || '480p';
  const clampedSourceDuration =
    params.sourceVideoDurationSeconds && params.sourceVideoDurationSeconds > 0
      ? Math.min(15, params.sourceVideoDurationSeconds)
      : undefined;

  const quote = calculateCustomerTemplateQuote({
    modelId: resolvedModel,
    type: 'video',
    resolution: resolvedRes,
    durationSeconds: clampedDuration,
    sourceVideoDurationSeconds: clampedSourceDuration,
    fxRateOverride: params.fxRateOverride
  });

  const tariff = entry?.resolutionTariffs[resolvedRes];
  const verifiedOverride = entry?.provider === 'higgsfield' ? getConfiguredHiggsfieldAccountRateOverride(resolvedRes) : undefined;
  const perSec = verifiedOverride ?? (tariff ? (tariff.accountQuotePerSecondUsd || tariff.publishedListPricePerSecondUsd) : null);

  return {
    status: quote.status,
    durationSeconds: clampedDuration,
    sourceDurationSeconds: clampedSourceDuration ?? null,
    billableDurationSeconds: clampedSourceDuration !== undefined ? clampedSourceDuration + clampedDuration : null,
    modelId: resolvedModel,
    resolution: resolvedRes,
    providerRatePerSecondUsd: perSec,
    costUsd: quote.estimatedProviderCostUsd,
    usdToInrRate: quote.usdToInrRate,
    credits: quote.credits,
    quoteBasis: quote.quoteBasis,
    reason: quote.reason
  };
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
  const activeRate = rate && rate > 0 ? rate : (getLiveFxStatus().rate || CENTRAL_PRICING_CONFIG.usdToInrRate);
  const inrProviderCost = estimatedProviderCostUsd * activeRate;
  const customerBasePrice = inrProviderCost * (1 + markupPercent / 100);
  return Math.max(1, Math.ceil(customerBasePrice * creditsPerInr));
}

export interface ActualProviderCostMeasurement {
  costUsd: number;
  actualProviderCostUsd: number;
  isExactTransactionCost: boolean;
  basis: 'provider_receipt' | 'estimated_tariff' | 'unmeasured';
}

/**
 * Stage 3: Post-Generation Actual Provider Cost (USD)
 * Distinctly separates actual provider transaction receipts from tariff estimates.
 */
export function measureActualProviderCostUsd(params: {
  modelId: string;
  resolution: '480p' | '720p' | '1080p';
  actualBillableDurationSeconds?: number;
  providerTransactionCostUsd?: number;
}): ActualProviderCostMeasurement {
  if (params.providerTransactionCostUsd !== undefined && params.providerTransactionCostUsd >= 0) {
    return {
      costUsd: params.providerTransactionCostUsd,
      actualProviderCostUsd: params.providerTransactionCostUsd,
      isExactTransactionCost: true,
      basis: 'provider_receipt'
    };
  }
  const entry = getRegisteredModelEntry(params.modelId);
  if (entry?.billingUnit === 'per_image') {
    const tariff = entry.resolutionTariffs[params.resolution];
    const perImg =
      tariff?.accountQuotePerImageUsd ||
      entry.accountQuotePerImageUsd ||
      tariff?.publishedListPricePerImageUsd ||
      entry.publishedPerImageUsd ||
      0;
    return {
      costUsd: perImg,
      actualProviderCostUsd: perImg,
      isExactTransactionCost: false,
      basis: perImg > 0 ? 'estimated_tariff' : 'unmeasured'
    };
  }
  const tariff = entry?.resolutionTariffs[params.resolution];
  const verifiedOverride = entry?.provider === 'higgsfield' ? getConfiguredHiggsfieldAccountRateOverride(params.resolution) : undefined;
  const rate = verifiedOverride ?? (tariff?.accountQuotePerSecondUsd || tariff?.publishedListPricePerSecondUsd || 0);
  const billableSec = params.actualBillableDurationSeconds || 0;
  const calculatedCost = billableSec * rate;
  return {
    costUsd: calculatedCost,
    actualProviderCostUsd: calculatedCost,
    isExactTransactionCost: false,
    basis: billableSec > 0 && rate > 0 ? 'estimated_tariff' : 'unmeasured'
  };
}

/**
 * Stage 4: Actual Cost Reconciliation
 * Bounded refund policy: refunds differences when verified actual usage is lower than reserved,
 * refunds 100% on failure, and strictly never post-debits customer wallet.
 */
export function reconcileCostOnCompletion(params: {
  reservedCredits: number;
  actualProviderCostUsd?: number;
  rate?: number;
  markupPercent?: number;
  isFailed: boolean;
  hasExactTransactionReceipt?: boolean;
}): { finalChargeCredits: number; refundCredits: number; isSettled: boolean } {
  if (params.isFailed) {
    return { finalChargeCredits: 0, refundCredits: params.reservedCredits, isSettled: true };
  }
  if (params.actualProviderCostUsd !== undefined && params.actualProviderCostUsd >= 0) {
    const actualCredits = calculateEstimatedCustomerCredits(
      params.actualProviderCostUsd,
      params.rate || getLiveFxStatus().rate || CENTRAL_PRICING_CONFIG.usdToInrRate,
      params.markupPercent || CENTRAL_PRICING_CONFIG.markupPercent
    );
    if (actualCredits < params.reservedCredits) {
      const refund = params.reservedCredits - actualCredits;
      return { finalChargeCredits: actualCredits, refundCredits: refund, isSettled: true };
    }
  }
  return { finalChargeCredits: params.reservedCredits, refundCredits: 0, isSettled: true };
}

export const CENTRAL_PRICING_CONFIG: PricingSettings = {
  usdToInrRate: 0, // Populated dynamically from live FX engine (never statically trusted in customer billing without fresh TTL)
  rateSource: 'LIVE_FX_PENDING_INIT',
  updatedAt: '',
  expiresAt: '',
  lastVerifiedRate: 0,
  markupPercent: 40, // +40% Business Markup Rule (cost * 1.40) applied strictly ONCE
  currency: 'INR',
  creditsPerInr: 1, // 1 Credit = ₹1 INR
  providerCostsUsd: {
    photoSmartUsd: 0.039,
    photoAiDiffusionUsd: 0.045,
    photo4kHdrDiffusionUsd: 0.067,
    videoSmartMotionUsd: 0.26,
    videoAiDiffusionUsd: 0.75,
    faceSwapVideoUsd: 0.25,
    audioSyncUsd: 0.02
  }
};

export const BUSINESS_PRICING_CONFIG = {
  markupPercent: CENTRAL_PRICING_CONFIG.markupPercent,
  currency: CENTRAL_PRICING_CONFIG.currency,
  creditsPerInr: CENTRAL_PRICING_CONFIG.creditsPerInr,
  providerCostCatalog: {
    photoSmart: 4,
    photoAi: 5,
    photo4kHdr: 7,
    videoSmart: 25,
    videoAi: 72,
    faceSwapReel: 25,
    audioSync: 2
  }
};

export function calculateCreditsFromUsd(
  costUsd: number,
  rate?: number,
  markupPercent = CENTRAL_PRICING_CONFIG.markupPercent
): number {
  const activeRate = rate || getLiveFxStatus().rate || CENTRAL_PRICING_CONFIG.usdToInrRate;
  if (!activeRate || activeRate <= 0) return 0;
  const inrProviderCost = costUsd * activeRate;
  const customerBasePrice = inrProviderCost * (1 + markupPercent / 100);
  return Math.max(1, Math.round(customerBasePrice));
}

export function calculateCustomerPrice(
  providerCostInr: number,
  markupPercent: number = CENTRAL_PRICING_CONFIG.markupPercent
): number {
  return Math.round(providerCostInr * (1 + markupPercent / 100));
}

/**
 * Low-level strict quote check (preserves strict allowPublishedListPriceFallback=false fail-closed behavior).
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
  if (template.engine === 'SMART_TEMPLATE' || template.model === 'smart_canvas_ffmpeg') {
    if (template.providerCostUsd && template.providerCostUsd > 0) {
      return calculateCreditsFromUsd(template.providerCostUsd);
    }
    return template.creditCost || 10;
  }

  const isVideo = template.type === 'video';
  const modelId = template.model || (isVideo ? 'hf_mult_motion_control_flash' : 'gemini-3.1-flash-lite-image');
  const resolution =
    template.resolutionLabel === '480p' || template.resolutionLabel === '720p' || template.resolutionLabel === '1080p'
      ? template.resolutionLabel
      : undefined;
  const duration = isVideo ? template.durationSeconds : 1;

  if (!resolution || (isVideo && (!duration || duration <= 0))) {
    return 0;
  }

  const estimate = calculateEstimatedProviderCostUsd({
    modelId,
    resolution: resolution as any,
    requestedOutputDurationSeconds: duration || 1,
    allowPublishedListPriceFallback: false
  });

  if (estimate.status === 'QUOTED' && estimate.estimatedProviderCostUsd !== undefined) {
    return calculateEstimatedCustomerCredits(estimate.estimatedProviderCostUsd);
  }

  return 0;
}

/**
 * DEPRECATED COMPATIBILITY SHIM:
 * Uses authoritative quote + live FX when available instead of static $0.05 * 96.3.
 */
export function calculateFaceSwapCredits(durationSeconds: number = 4): {
  durationSeconds: number;
  providerRatePerSecondUsd: number;
  costUsd: number;
  credits: number;
  status?: string;
} {
  const quote = calculateAuthoritativeFaceSwapQuote({
    modelId: 'hf_mult_motion_control_flash',
    resolution: '480p',
    durationSeconds
  });
  return {
    durationSeconds: quote.durationSeconds,
    providerRatePerSecondUsd: quote.providerRatePerSecondUsd || 0.05,
    costUsd: quote.costUsd ?? Number((quote.durationSeconds * 0.05).toFixed(3)),
    credits: quote.credits,
    status: quote.status
  };
}

export function updatePricingSettings(updates: Partial<PricingSettings>) {
  if (updates.usdToInrRate && Number.isFinite(updates.usdToInrRate) && updates.usdToInrRate > 0) {
    setFxTestState({
      rate: updates.usdToInrRate,
      source: updates.rateSource || 'ADMIN_MANUAL_RATE'
    });
  }
  if (updates.markupPercent) CENTRAL_PRICING_CONFIG.markupPercent = updates.markupPercent;
  if (updates.providerCostsUsd) {
    CENTRAL_PRICING_CONFIG.providerCostsUsd = {
      ...CENTRAL_PRICING_CONFIG.providerCostsUsd,
      ...updates.providerCostsUsd
    };
  }
}

export function getPricingSummary() {
  const fx = getLiveFxStatus();
  return {
    usdToInrRate: fx.rate,
    fxStatus: fx,
    markupPercent: CENTRAL_PRICING_CONFIG.markupPercent,
    formula: 'Actual Provider Cost (USD) × Fresh Live USD/INR Rate × 1.40 Markup = Customer Credits (1 Credit = ₹1 INR)',
    usdCatalog: CENTRAL_PRICING_CONFIG.providerCostsUsd
  };
}
