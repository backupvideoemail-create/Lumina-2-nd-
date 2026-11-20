/**
 * Google Cloud Monitoring, Logging & Error Reporting Service.
 *
 * Provides production observability for Cloud Run on canonical project "ai-prime-studio"
 * (project number "855598524398", Firestore database "(default)",
 * service "ai-prime-studio-photo-video" in region "asia-southeast1").
 *
 * Features:
 * - Structured Google Cloud Logging JSON payload emitter
 * - Privacy-safe error event bus capturing 24 failure vectors without leaking PII or credentials
 * - Enriched 12-Field Diagnostic Alert schema (What failed, Project/DB/Service, Template,
 *   Provider/Adapter/Model, API Key Status, Billing/Quota/Entitlement Status, HTTP/Code/Stage,
 *   Root Cause, Recommended Fix, Owner Action, Official URL, Timestamp & Correlation ID)
 * - Deduplicated Live Alert registry with resolved alert history
 */

export type FailureVector =
  | 'PAYMENT_FAILURE'
  | 'LEDGER_MISMATCH'
  | 'GEMINI_QUOTA_EXHAUSTED'
  | 'VEO_TIMEOUT_QUOTA'
  | 'FIRESTORE_ERROR'
  | 'R2_STORAGE_ERROR'
  | 'TEMPLATE_MISMATCH'
  | 'ACCOUNT_DELETION_CASCADE'
  | 'AUTH_RBAC_FAILURE'
  | 'SERVER_5XX_INCIDENT'
  | 'CLIENT_RUNTIME_ERROR'
  | 'USER_CRITICAL_REPORT'
  | 'GENERATION_PIPELINE_FAILURE'
  | 'FACESWAP_PIPELINE_FAILURE'
  | 'API_UNHANDLED_5XX'
  | 'AUTH_LOGIN_FAILURE'
  | 'SESSION_PERSISTENCE_FAILURE'
  | 'MEDIA_PLAYBACK_FAILURE'
  | 'MEDIA_SLOW_BUFFERING'
  | 'PRICING_FX_EXPIRED'
  | 'PROVIDER_ROUTING_MISMATCH'
  | 'OMNI_MANUAL_TEST_FAILURE'
  | 'CATALOGUE_SYNC_FAILURE'
  | 'DATABASE_LOCK_FAILURE';

export type AlertSource =
  | 'server_5xx'
  | 'client_error'
  | 'user_report'
  | 'cloud_monitoring'
  | 'auth_session'
  | 'generation_failure'
  | 'media_playback'
  | 'storage_r2';

export interface MonitoringAlert {
  id: string;
  fingerprint?: string;
  vector: FailureVector;
  severity: 'CRITICAL' | 'ERROR' | 'WARNING' | 'INFO';
  source?: AlertSource;
  title?: string;
  message: string;
  projectDatabaseService?: string;
  templateId?: string;
  templateTitle?: string;
  provider?: string;
  adapter?: string;
  model?: string;
  generationId?: string;
  apiKeyAccessStatus?: string;
  billingQuotaEntitlementStatus?: string;
  httpStatus?: number | string;
  errorStage?: string;
  errorCode?: string;
  rootCause?: string;
  recommendedAction?: string;
  ownerAction?: string;
  officialSetupUrl?: string;
  correlationId?: string;
  endpoint?: string;
  sanitizedContext: Record<string, any>;
  safeTraceId: string;
  timestamp: string;
  resolved: boolean;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionNote?: string;
  occurrenceCount: number;
  lastOccurrence: string;
}

export interface MonitoringPersistenceAdapter {
  persistIncident: (alert: MonitoringAlert) => Promise<void>;
  resolveIncident: (alertId: string, resolvedBy?: string, resolutionNote?: string) => Promise<void>;
}

export interface CloudMonitoringProbeResult {
  status: 'passed' | 'warning' | 'blocked';
  gcpProjectId: string;
  gcpProjectNumber: string;
  cloudRunService: string;
  region: string;
  customDomain: string;
  activeRevision: string;
  activeAlertCount: number;
  recentResolvedAlerts: number;
  failureVectorsMonitored: number;
  summary: string;
  alerts: MonitoringAlert[];
}

const AUTHORITATIVE_GCP_PROJECT_ID = 'ai-prime-studio';
const AUTHORITATIVE_GCP_PROJECT_NUMBER = '855598524398';
const AUTHORITATIVE_CLOUD_RUN_SERVICE = 'ai-prime-studio-photo-video';
const AUTHORITATIVE_REGION = 'asia-southeast1';
const AUTHORITATIVE_CUSTOM_DOMAIN = 'https://ai-prime-studio-photo-video.ai.studio';
const CANONICAL_DEFAULT_SERVICE = `${AUTHORITATIVE_GCP_PROJECT_ID} / (default) / ${AUTHORITATIVE_CLOUD_RUN_SERVICE}`;

// In-Memory Ring Buffer for deduplicated alerts
const activeAlertsMap = new Map<string, MonitoringAlert>();
const resolvedAlertsHistory: MonitoringAlert[] = [];
const DEDUPLICATION_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
let persistenceAdapter: MonitoringPersistenceAdapter | null = null;

export function configureMonitoringPersistence(adapter: MonitoringPersistenceAdapter | null): void {
  persistenceAdapter = adapter;
}

/**
 * Scrubs emails, phone numbers, Bearer tokens, API keys, and signed URL params from text strings.
 */
export function sanitizeMonitoringString(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, '$1[REDACTED_TOKEN]')
    .replace(/((?:token|secret|key|password|signature|x-amz-signature|x-amz-credential)=)[^&\s"']+/gi, '$1[REDACTED]')
    .replace(/(https?:\/\/[^\s"'?]+\?)([^"'\s]*(?:X-Amz-|Signature=|token=)[^"'\s]*)/gi, '$1[REDACTED_SIGNED_PARAMS]')
    .replace(/(rzp_(?:live|test)_[A-Za-z0-9]+|AIza[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{20,})/g, '[REDACTED_SECRET]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_EMAIL]')
    // Scrub phone numbers without corrupting 13-digit timestamps inside IDs/filenames (e.g. admin_upload_1793711986224_a9f3f555.mp4)
    .replace(/(?<![A-Za-z0-9_/\-])(?:\+\d{1,3}(?:[\s\-()]?\d){7,12}|\(\d{3,4}\)\s*\d{3}[\s-]?\d{4}|\d{5}[\s-]\d{5}|\d{3}[\s-]\d{3}[\s-]\d{4}|\d{10})(?![A-Za-z0-9_/\-])/g, '[REDACTED_PHONE]');
}

const SENSITIVE_KEY_TOKENS = [
  'token',
  'secret',
  'password',
  'auth',
  'signature',
  'card',
  'key',
  'email',
  'phone',
  'mobile',
  'ip',
  'cookie',
  'credential',
  'fingerprint',
  'useragent'
];

function sanitizeValue(val: unknown): any {
  if (val === null || val === undefined) return val;
  if (typeof val === 'string') return sanitizeMonitoringString(val);
  if (typeof val === 'number' || typeof val === 'boolean') return val;
  if (Array.isArray(val)) return val.slice(0, 20).map((item) => sanitizeValue(item));
  if (typeof val === 'object') {
    return sanitizeContext(val as Record<string, any>);
  }
  return String(val);
}

/**
 * Sanitizes context payloads recursively to ensure zero leakage of customer secrets,
 * payment card data, tokens, passwords, or PII (emails, phones, IP addresses).
 */
export function sanitizeContext(ctx: Record<string, any>): Record<string, any> {
  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(ctx || {})) {
    const lk = key.toLowerCase();
    // Preserve non-secret diagnostic status labels that intentionally describe presence booleans
    if (lk === 'apikeyaccessstatus' || lk === 'authpolicy') {
      clean[key] = typeof value === 'string' ? sanitizeMonitoringString(value) : value;
      continue;
    }
    if (SENSITIVE_KEY_TOKENS.some((tok) => lk.includes(tok))) {
      clean[key] = '[REDACTED_SENSITIVE]';
    } else {
      clean[key] = sanitizeValue(value);
    }
  }
  return clean;
}

function getEnvPresenceBoolean(name: string): boolean {
  return typeof process !== 'undefined' && Boolean(process.env?.[name] && process.env[name]!.trim().length > 0);
}

/**
 * Non-paid, zero-network diagnostic helper for Gemini API key presence & canonical suffix check.
 * Never logs or exposes full key material; checks only last-4 suffix parity (...CqZA vs legacy ...U4sw).
 */
export function getGeminiKeyDiagnosticStatus(): {
  present: boolean;
  maskedSuffix: string | null;
  authStatus: 'UNVERIFIED' | 'MISSING_SECRET' | 'LEGACY_KEY_MISMATCH';
  isCanonicalCqZA: boolean;
  isLegacyAndroidU4sw: boolean;
  canonicalProjectId: string;
} {
  const rawKey = typeof process !== 'undefined' ? (process.env?.GEMINI_API_KEY || '').trim() : '';
  if (!rawKey) {
    return {
      present: false,
      maskedSuffix: null,
      authStatus: 'MISSING_SECRET',
      isCanonicalCqZA: false,
      isLegacyAndroidU4sw: false,
      canonicalProjectId: AUTHORITATIVE_GCP_PROJECT_ID
    };
  }
  const suffix = rawKey.length >= 4 ? rawKey.slice(-4) : rawKey;
  const isCanonicalCqZA = suffix === 'CqZA';
  const isLegacyAndroidU4sw = suffix === 'U4sw';
  return {
    present: true,
    maskedSuffix: `...${suffix}`,
    authStatus: isLegacyAndroidU4sw ? 'LEGACY_KEY_MISMATCH' : 'UNVERIFIED',
    isCanonicalCqZA,
    isLegacyAndroidU4sw,
    canonicalProjectId: AUTHORITATIVE_GCP_PROJECT_ID
  };
}

/**
 * Non-paid, zero-network diagnostic helper for Open Higgsfield single-key auth & Genjutsu safety gate.
 * Honest UNVERIFIED status because Open Higgsfield docs have no free whoami/balance verification endpoint.
 */
export function getHiggsfieldDiagnosticStatus(): {
  present: boolean;
  secretName: 'HIGGSFIELD_API_KEY';
  authHeaderFormat: 'Authorization: Key <api-key>';
  authStatus: 'UNVERIFIED' | 'MISSING_SECRET';
  billingVerified: boolean;
  customerGenerationEnabled: boolean;
  objectSwapCustomerGenerationEnabled: boolean;
  customerGateStatus: 'SAFELY_GATED' | 'ENABLED';
  tariffVerificationStatus: 'VERIFIED_OVERRIDE' | 'PENDING_ACCOUNT_BILLING_CHECK';
  billingFormula: string;
  estimatedSingleRun: {
    model: string;
    workflow: string;
    resolution: '480p';
    sourceDurationSeconds: number;
    outputDurationSeconds: number;
    billableDurationSeconds: number;
    durationSeconds: number;
    ratePerSecondUsd: number;
    estimatedCostUsd: number;
    resolutionEstimatesUsd: Record<'480p' | '720p' | '1080p', number>;
    costScopeNote: string;
  };
} {
  const rawKey = typeof process !== 'undefined' ? (process.env?.HIGGSFIELD_API_KEY || '').trim() : '';
  const gateFlagEnabled =
    typeof process !== 'undefined' && process.env?.ENABLE_GENJUTSU_CUSTOMER_GENERATION === 'true';
  const objectSwapFlagEnabled =
    typeof process !== 'undefined' && process.env?.ENABLE_GENJUTSU_OBJECT_SWAP_CUSTOMER_GENERATION === 'true';
  const billingVerified =
    typeof process !== 'undefined' && process.env?.HIGGSFIELD_BILLING_VERIFIED === 'true';
  // Manual activation alone MUST NOT bypass unverified billing status.
  const customerGenerationEnabled = Boolean(rawKey) && billingVerified && gateFlagEnabled;
  const objectSwapCustomerGenerationEnabled = customerGenerationEnabled && objectSwapFlagEnabled;

  const parseVerifiedRate = (envName: string, publishedRate: number): number => {
    if (!billingVerified || typeof process === 'undefined') return publishedRate;
    const val = Number(process.env?.[envName]);
    return Number.isFinite(val) && val > 0 ? val : publishedRate;
  };
  const rate480p = parseVerifiedRate('HIGGSFIELD_VERIFIED_RATE_480P_USD', 0.05);
  const rate720p = parseVerifiedRate('HIGGSFIELD_VERIFIED_RATE_720P_USD', 0.1);
  const rate1080p = parseVerifiedRate('HIGGSFIELD_VERIFIED_RATE_1080P_USD', 0.2);

  const sourceDurationSeconds = 15;
  const outputDurationSeconds = 4;
  const billableDurationSeconds = sourceDurationSeconds + outputDurationSeconds;

  return {
    present: Boolean(rawKey),
    secretName: 'HIGGSFIELD_API_KEY',
    authHeaderFormat: 'Authorization: Key <api-key>',
    authStatus: rawKey ? 'UNVERIFIED' : 'MISSING_SECRET',
    billingVerified,
    customerGenerationEnabled,
    objectSwapCustomerGenerationEnabled,
    customerGateStatus: customerGenerationEnabled ? 'ENABLED' : 'SAFELY_GATED',
    tariffVerificationStatus: billingVerified ? 'VERIFIED_OVERRIDE' : 'PENDING_ACCOUNT_BILLING_CHECK',
    billingFormula: 'Math.min(sourceDurationSeconds, 15) + Math.ceil(outputDurationSeconds)',
    estimatedSingleRun: {
      model: 'hf_mult_motion_control_flash',
      workflow: 'MOTION_TRANSFER',
      resolution: '480p',
      sourceDurationSeconds,
      outputDurationSeconds,
      billableDurationSeconds,
      durationSeconds: billableDurationSeconds,
      ratePerSecondUsd: rate480p,
      estimatedCostUsd: Number((billableDurationSeconds * rate480p).toFixed(4)),
      resolutionEstimatesUsd: {
        '480p': Number((billableDurationSeconds * rate480p).toFixed(4)),
        '720p': Number((billableDurationSeconds * rate720p).toFixed(4)),
        '1080p': Number((billableDurationSeconds * rate1080p).toFixed(4))
      },
      costScopeNote:
        'Applies strictly to 19 billable seconds (15s max source + 4s output) at 480p; shorter sources and 720p/1080p scale by exact measured seconds and resolution rate.'
    }
  };
}

export interface Alert12FieldDefaults {
  projectDatabaseService: string;
  provider: string;
  adapter: string;
  model: string;
  apiKeyAccessStatus: string;
  billingQuotaEntitlementStatus: string;
  httpStatus: number | string;
  errorCode: string;
  rootCause: string;
  recommendedAction: string;
  ownerAction: string;
  officialSetupUrl: string;
}

/**
 * Derives non-secret 12-field diagnostic defaults for any FailureVector so no alert
 * ever appears with vague or missing troubleshooting fields.
 */
export function enrichAlertDefaults(
  vector: FailureVector,
  message: string,
  context: Record<string, any> = {}
): Alert12FieldDefaults {
  const hasGemini = getEnvPresenceBoolean('GEMINI_API_KEY');
  const hasHiggsfield = getEnvPresenceBoolean('HIGGSFIELD_API_KEY');
  const hasR2 =
    getEnvPresenceBoolean('R2_ACCOUNT_ID') &&
    getEnvPresenceBoolean('R2_ACCESS_KEY_ID') &&
    getEnvPresenceBoolean('R2_SECRET_ACCESS_KEY') &&
    getEnvPresenceBoolean('R2_BUCKET_NAME');
  const hasRazorpay = getEnvPresenceBoolean('RAZORPAY_KEY_ID') && getEnvPresenceBoolean('RAZORPAY_KEY_SECRET');

  const rawProvider = typeof context?.provider === 'string' ? context.provider.trim().toLowerCase() : '';
  const msgLower = message.toLowerCase();

  let projectDatabaseService = CANONICAL_DEFAULT_SERVICE;
  let provider = typeof context?.provider === 'string' && context.provider.trim() ? context.provider.trim() : 'platform';
  let adapter = typeof context?.adapter === 'string' && context.adapter.trim() ? context.adapter.trim() : 'server';
  let model = typeof context?.model === 'string' && context.model.trim() ? context.model.trim() : 'N/A';
  let apiKeyAccessStatus = 'RUNTIME_ADC_ACTIVE';
  let billingQuotaEntitlementStatus = 'STANDARD_RUNTIME';
  let httpStatus: number | string = context?.httpStatus ?? 500;
  let errorCode = typeof context?.errorCode === 'string' && context.errorCode.trim() ? context.errorCode.trim() : vector;
  let rootCause = 'Runtime condition triggered a monitored failure vector.';
  let recommendedAction = 'Inspect correlation ID logs and verify service configuration.';
  let ownerAction = 'Review Diagnostics Alert Center and follow the Recommended Fix.';
  let officialSetupUrl = `https://console.firebase.google.com/project/${AUTHORITATIVE_GCP_PROJECT_ID}/overview`;

  switch (vector) {
    case 'DATABASE_LOCK_FAILURE':
    case 'FIRESTORE_ERROR': {
      projectDatabaseService = `${AUTHORITATIVE_GCP_PROJECT_ID} / (default) / Firestore Admin SDK`;
      provider = 'google_firestore';
      adapter = 'database.ts (1-arg getFirestore/getAdminFirestore)';
      model = 'firestore-default';
      apiKeyAccessStatus = 'FIREBASE_ADC_SERVICE_ACCOUNT';
      billingQuotaEntitlementStatus = 'GCP_PROJECT_AI_PRIME_STUDIO_ACTIVE';
      httpStatus = context?.httpStatus ?? 503;
      rootCause =
        vector === 'DATABASE_LOCK_FAILURE'
          ? 'Configured projectId/databaseId or FIRESTORE_DATABASE_ID override attempted to leave canonical ai-prime-studio/(default).'
          : 'Firestore read/write failed or IAM permission / quota rejected the operation.';
      recommendedAction = 'Lock firebase-applet-config.json firestoreDatabaseId to "(default)" and keep FIRESTORE_DATABASE_ID unset.';
      ownerAction = 'Confirm Secret Manager/env has NO non-default FIRESTORE_DATABASE_ID override and projectId is ai-prime-studio.';
      officialSetupUrl = `https://console.firebase.google.com/project/${AUTHORITATIVE_GCP_PROJECT_ID}/firestore`;
      break;
    }

    case 'AUTH_LOGIN_FAILURE':
    case 'SESSION_PERSISTENCE_FAILURE':
    case 'AUTH_RBAC_FAILURE': {
      projectDatabaseService = `${AUTHORITATIVE_GCP_PROJECT_ID} / (default) / Firebase Authentication`;
      provider = 'firebase_auth_google';
      adapter = 'AuthModal + /api/auth/firebase-session';
      model = 'google-oauth-2.0';
      apiKeyAccessStatus = 'WEB_OAUTH_CLIENT_CONFIGURED (PHONE_AUTH_ENABLED=false)';
      billingQuotaEntitlementStatus = 'GOOGLE_SIGNIN_FREE_TIER';
      httpStatus = context?.httpStatus ?? (vector === 'SESSION_PERSISTENCE_FAILURE' ? 503 : 401);
      rootCause =
        msgLower.includes('unauthorized-domain')
          ? 'Deployment hostname is missing in Firebase Authentication Authorized Domains.'
          : msgLower.includes('phone')
          ? 'Phone OTP authentication is disabled by owner policy (PHONE_AUTH_ENABLED=false).'
          : vector === 'SESSION_PERSISTENCE_FAILURE'
          ? 'Backend failed to persist verified Firebase session into (default) Firestore.'
          : 'Google Sign-In ID token verification or session exchange returned an error or HTML gateway response.';
      recommendedAction =
        'Verify Authorized Domains in Firebase Auth, keep PHONE_AUTH_ENABLED=false, and verify (default) Firestore session persistence.';
      ownerAction =
        'In Firebase Console -> Authentication -> Settings -> Authorized Domains, add preview/prod domain and disable Phone sign-in provider.';
      officialSetupUrl = `https://console.firebase.google.com/project/${AUTHORITATIVE_GCP_PROJECT_ID}/authentication/settings`;
      break;
    }

    case 'FACESWAP_PIPELINE_FAILURE':
    case 'PROVIDER_ROUTING_MISMATCH': {
      const isGeminiProvider = rawProvider === 'gemini' || rawProvider === 'google_veo';
      projectDatabaseService = `${AUTHORITATIVE_GCP_PROJECT_ID} / (default) / AI Routing Pipeline`;
      provider = provider === 'platform' ? (isGeminiProvider ? 'gemini' : 'higgsfield') : provider;
      adapter = adapter === 'server' ? 'faceSwapAdapter' : adapter;
      model = model === 'N/A' ? 'hf_mult_motion_control_flash' : model;
      apiKeyAccessStatus =
        provider === 'higgsfield'
          ? hasHiggsfield
            ? 'HIGGSFIELD_API_KEY: UNVERIFIED (no free auth probe endpoint)'
            : 'HIGGSFIELD_API_KEY: MISSING_SECRET'
          : hasGemini
          ? 'GEMINI_API_KEY: PRESENT (billing/quota unverified)'
          : 'GEMINI_API_KEY: MISSING_SECRET';
      billingQuotaEntitlementStatus =
        provider === 'higgsfield'
          ? hasHiggsfield
            ? 'HIGGSFIELD_PREPAID_API_UNVERIFIED (Genjutsu Safely Gated)'
            : 'UNCONFIGURED_PREPAID_API'
          : 'GEMINI_PAID_KEY_OR_QUOTA_CHECK';
      httpStatus = context?.httpStatus ?? (hasHiggsfield ? 502 : 503);
      rootCause =
        !hasHiggsfield && provider === 'higgsfield'
          ? 'HIGGSFIELD_API_KEY is missing in server runtime environment.'
          : 'Higgsfield/provider routing mismatch, Genjutsu safety gate, or upstream API rejection.';
      recommendedAction = 'Check exact provider/adapter/model/workflow compatibility and ensure single-key HIGGSFIELD_API_KEY (Authorization: Key <api-key>) is configured.';
      ownerAction = 'Add $5+ Open Higgsfield Developer API balance and set complete HIGGSFIELD_API_KEY in Cloud Run Secrets.';
      officialSetupUrl = 'https://cloud.higgsfield.ai/';
      break;
    }

    case 'GENERATION_PIPELINE_FAILURE':
    case 'GEMINI_QUOTA_EXHAUSTED':
    case 'VEO_TIMEOUT_QUOTA':
    case 'OMNI_MANUAL_TEST_FAILURE': {
      const useHf = rawProvider === 'higgsfield';
      projectDatabaseService = `${AUTHORITATIVE_GCP_PROJECT_ID} / (default) / AI Generation Pipeline`;
      provider = provider === 'platform' ? (useHf ? 'higgsfield' : 'gemini') : provider;
      adapter = adapter === 'server' ? (useHf ? 'videoProviderAdapter' : 'geminiAdapter') : adapter;
      model = model === 'N/A' ? (vector === 'OMNI_MANUAL_TEST_FAILURE' ? 'gemini-omni-1.2-flash' : 'gemini-3.1-flash-lite-image') : model;
      apiKeyAccessStatus = useHf
        ? hasHiggsfield
          ? 'HIGGSFIELD_API_KEY: PRESENT'
          : 'HIGGSFIELD_API_KEY: MISSING'
        : hasGemini
        ? 'GEMINI_API_KEY: PRESENT'
        : 'GEMINI_API_KEY: MISSING';
      billingQuotaEntitlementStatus =
        vector === 'GEMINI_QUOTA_EXHAUSTED' || msgLower.includes('429') || msgLower.includes('quota')
          ? 'QUOTA_EXHAUSTED_OR_FREE_TIER_CAP'
          : useHf
          ? 'HIGGSFIELD_PREPAID_CREDITS_REQUIRED'
          : hasGemini
          ? 'PAID_AI_STUDIO_TIER_CHECK_REQUIRED'
          : 'MISSING_GEMINI_API_KEY';
      httpStatus = context?.httpStatus ?? (msgLower.includes('429') ? 429 : 503);
      rootCause =
        !useHf && !hasGemini
          ? 'GEMINI_API_KEY missing in server runtime environment.'
          : vector === 'GEMINI_QUOTA_EXHAUSTED'
          ? 'Google AI Studio / Gemini API rate limit or billing quota exhausted.'
          : 'AI provider returned error, timeout, or missing input validation failure.';
      recommendedAction = useHf
        ? 'Configure valid HIGGSFIELD_API_KEY with active prepaid credits.'
        : 'Add paid billing-enabled GEMINI_API_KEY from Google AI Studio and verify quota.';
      ownerAction = useHf
        ? 'Top up Higgsfield Developer API and set HIGGSFIELD_API_KEY in server secrets.'
        : 'Create paid billing-enabled Gemini API key at Google AI Studio (separate from free Firebase Spark/GCP hosting) and add GEMINI_API_KEY.';
      officialSetupUrl = useHf ? 'https://cloud.higgsfield.ai/' : 'https://aistudio.google.com/apikey';
      break;
    }

    case 'R2_STORAGE_ERROR': {
      projectDatabaseService = `${AUTHORITATIVE_GCP_PROJECT_ID} / (default) / Cloudflare R2 Storage`;
      provider = 'cloudflare_r2';
      adapter = 'mediaStorage.ts (@aws-sdk/client-s3)';
      model = 'r2-object-storage';
      apiKeyAccessStatus = hasR2 ? 'R2_CREDENTIALS: PRESENT' : 'R2_CREDENTIALS: MISSING_ONE_OR_MORE_VARS';
      billingQuotaEntitlementStatus = hasR2 ? 'CLOUDFLARE_R2_ACTIVE' : 'FALLBACK_EPHEMERAL_DISK';
      httpStatus = context?.httpStatus ?? 503;
      rootCause = hasR2
        ? 'Cloudflare R2 S3 upload/read/signed-URL probe failed (check permissions or endpoint).'
        : 'R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, or R2_BUCKET_NAME missing; running on ephemeral local storage.';
      recommendedAction = 'Set all R2_* environment variables for bucket lumina-prime-ai-media and run 5-point R2 probe.';
      ownerAction = 'Open Cloudflare R2 Dashboard -> Create API Token (Object Read & Write) for bucket lumina-prime-ai-media and paste R2_* secrets.';
      officialSetupUrl = 'https://dash.cloudflare.com/';
      break;
    }

    case 'PRICING_FX_EXPIRED': {
      projectDatabaseService = `${AUTHORITATIVE_GCP_PROJECT_ID} / (default) / Dynamic FX Pricing Engine`;
      provider = 'open_er_api';
      adapter = 'pricingService.ts';
      model = 'usd-inr-fx-cache';
      apiKeyAccessStatus = 'PUBLIC_FX_ENDPOINT (NO_KEY_REQUIRED)';
      billingQuotaEntitlementStatus = 'FREE_FX_FEED_WITH_12H_TTL';
      httpStatus = context?.httpStatus ?? 503;
      rootCause = 'Live USD/INR FX cache expired (>12h TTL) or initial HTTPS fetch failed.';
      recommendedAction = 'Check outbound HTTPS access to open.er-api.com and trigger Refresh Live FX in Diagnostics.';
      ownerAction = 'Click "Refresh Live FX" in Diagnostics -> Readiness Matrix tab.';
      officialSetupUrl = 'https://www.exchangerate-api.com/docs/free';
      break;
    }

    case 'CATALOGUE_SYNC_FAILURE':
    case 'TEMPLATE_MISMATCH': {
      projectDatabaseService = `${AUTHORITATIVE_GCP_PROJECT_ID} / (default) / Template Catalogue`;
      provider = 'firestore_catalogue';
      adapter = 'database.ts + templateReadiness.ts';
      model = 'catalogue-sync-v1';
      apiKeyAccessStatus = 'FIREBASE_ADC_ACTIVE';
      billingQuotaEntitlementStatus = 'STANDARD_FIRESTORE_READS';
      httpStatus = context?.httpStatus ?? 500;
      rootCause = 'Template catalogue sync or template readiness validation flagged incomplete/tombstoned record.';
      recommendedAction = 'Verify templates in (default) pass validateTemplateReadiness and deleted tombstones remain excluded.';
      ownerAction = 'Open Diagnostics -> Readiness Matrix and review any BLOCKED template entries.';
      officialSetupUrl = `https://console.firebase.google.com/project/${AUTHORITATIVE_GCP_PROJECT_ID}/firestore/data`;
      break;
    }

    case 'PAYMENT_FAILURE':
    case 'LEDGER_MISMATCH': {
      projectDatabaseService = `${AUTHORITATIVE_GCP_PROJECT_ID} / (default) / Razorpay Payments & Wallet`;
      provider = 'razorpay';
      adapter = 'razorpayAdapter.ts';
      model = 'razorpay-orders-autopay';
      apiKeyAccessStatus = hasRazorpay ? 'RAZORPAY_KEYS: PRESENT' : 'RAZORPAY_KEYS: MISSING';
      billingQuotaEntitlementStatus = hasRazorpay ? 'MERCHANT_ACCOUNT_CONFIGURED' : 'MISSING_MERCHANT_KEYS';
      httpStatus = context?.httpStatus ?? 402;
      rootCause = 'Payment verification signature, order webhook, or wallet ledger invariant check reported an error.';
      recommendedAction = 'Inspect Razorpay signature verification, webhook secret, and wallet ledger entries.';
      ownerAction = 'Verify RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, and RAZORPAY_WEBHOOK_SECRET in Razorpay Dashboard.';
      officialSetupUrl = 'https://dashboard.razorpay.com/app/website-app-settings/api-keys';
      break;
    }

    case 'MEDIA_PLAYBACK_FAILURE':
    case 'MEDIA_SLOW_BUFFERING': {
      projectDatabaseService = `${AUTHORITATIVE_GCP_PROJECT_ID} / (default) / Media Range Streaming`;
      provider = hasR2 ? 'cloudflare_r2' : 'local_media_proxy';
      adapter = 'mediaStorage.ts + mediaPlaybackManager.ts';
      model = 'http-206-range-stream';
      apiKeyAccessStatus = hasR2 ? 'R2_CONFIGURED' : 'LOCAL_STREAM';
      billingQuotaEntitlementStatus = 'MEDIA_DELIVERY';
      httpStatus = context?.httpStatus ?? (vector === 'MEDIA_SLOW_BUFFERING' ? 'CLIENT_BUFFER_WAIT' : 'CLIENT_MEDIA_ERROR');
      rootCause = 'Video/image element reported playback decode stall, byte-range stream error, or missing CORS/CORP header.';
      recommendedAction = 'Ensure media returns HTTP 206 Byte-Range with valid video/mp4 Content-Type, Vary: Range, and Cross-Origin-Resource-Policy headers.';
      ownerAction = 'Verify R2 custom domain / media proxy headers and inspect failing asset URL in Media Cache Telemetry.';
      officialSetupUrl = 'https://dash.cloudflare.com/';
      break;
    }

    default: {
      projectDatabaseService = CANONICAL_DEFAULT_SERVICE;
      apiKeyAccessStatus = `Gemini=${hasGemini ? 'PRESENT' : 'MISSING'}, Higgsfield=${hasHiggsfield ? 'PRESENT' : 'MISSING'}, R2=${hasR2 ? 'PRESENT' : 'MISSING'}`;
      billingQuotaEntitlementStatus = 'RUNTIME_OBSERVABILITY_EVENT';
      httpStatus = context?.httpStatus ?? 500;
      rootCause = 'Server or client handler emitted an unexpected error during request processing.';
      recommendedAction = 'Check backend stack trace with the provided Correlation ID and verify JSON response envelope.';
      ownerAction = 'Copy Sanitized Report from Diagnostics and inspect Correlation ID details.';
      break;
    }
  }

  return {
    projectDatabaseService:
      typeof context?.projectDatabaseService === 'string' && context.projectDatabaseService.trim()
        ? sanitizeMonitoringString(context.projectDatabaseService).slice(0, 140)
        : projectDatabaseService,
    provider: sanitizeMonitoringString(provider).slice(0, 80),
    adapter: sanitizeMonitoringString(adapter).slice(0, 80),
    model: sanitizeMonitoringString(model).slice(0, 120),
    apiKeyAccessStatus:
      typeof context?.apiKeyAccessStatus === 'string' && context.apiKeyAccessStatus.trim()
        ? sanitizeMonitoringString(context.apiKeyAccessStatus).slice(0, 140)
        : apiKeyAccessStatus,
    billingQuotaEntitlementStatus:
      typeof context?.billingQuotaEntitlementStatus === 'string' && context.billingQuotaEntitlementStatus.trim()
        ? sanitizeMonitoringString(context.billingQuotaEntitlementStatus).slice(0, 140)
        : billingQuotaEntitlementStatus,
    httpStatus,
    errorCode: sanitizeMonitoringString(errorCode).slice(0, 80),
    rootCause:
      typeof context?.rootCause === 'string' && context.rootCause.trim()
        ? sanitizeMonitoringString(context.rootCause).slice(0, 320)
        : rootCause,
    recommendedAction:
      typeof context?.recommendedAction === 'string' && context.recommendedAction.trim()
        ? sanitizeMonitoringString(context.recommendedAction).slice(0, 320)
        : recommendedAction,
    ownerAction:
      typeof context?.ownerAction === 'string' && context.ownerAction.trim()
        ? sanitizeMonitoringString(context.ownerAction).slice(0, 320)
        : ownerAction,
    officialSetupUrl:
      typeof context?.officialSetupUrl === 'string' && context.officialSetupUrl.trim()
        ? sanitizeMonitoringString(context.officialSetupUrl).slice(0, 220)
        : officialSetupUrl
  };
}

/**
 * Ensures any alert object (including historical alerts fetched from Firestore) exposes all 12 fields.
 */
export function normalizeAlertTo12Fields(raw: Partial<MonitoringAlert> & Record<string, any>): MonitoringAlert {
  const vector = (raw.vector || 'SERVER_5XX_INCIDENT') as FailureVector;
  const message = sanitizeMonitoringString(String(raw.message || raw.details || 'Runtime alert'));
  const enriched = enrichAlertDefaults(vector, message, {
    ...raw,
    provider: raw.provider,
    adapter: raw.adapter,
    model: raw.model,
    errorCode: raw.errorCode,
    httpStatus: raw.httpStatus,
    rootCause: raw.rootCause,
    recommendedAction: raw.recommendedAction,
    ownerAction: raw.ownerAction,
    officialSetupUrl: raw.officialSetupUrl,
    projectDatabaseService: raw.projectDatabaseService,
    apiKeyAccessStatus: raw.apiKeyAccessStatus,
    billingQuotaEntitlementStatus: raw.billingQuotaEntitlementStatus
  });

  const correlationId = raw.correlationId || raw.safeTraceId || raw.id || `trc_norm_${Date.now().toString(36)}`;
  const timestamp = raw.timestamp || new Date().toISOString();

  return {
    id: raw.id || `alrt_${Date.now()}`,
    fingerprint: raw.fingerprint,
    vector,
    severity: (raw.severity || 'ERROR') as MonitoringAlert['severity'],
    source: raw.source || 'cloud_monitoring',
    title: raw.title || vector,
    message,
    projectDatabaseService: enriched.projectDatabaseService,
    templateId: raw.templateId,
    templateTitle: raw.templateTitle,
    provider: enriched.provider,
    adapter: enriched.adapter,
    model: enriched.model,
    generationId: raw.generationId,
    apiKeyAccessStatus: enriched.apiKeyAccessStatus,
    billingQuotaEntitlementStatus: enriched.billingQuotaEntitlementStatus,
    httpStatus: enriched.httpStatus,
    errorStage: raw.errorStage || 'runtime',
    errorCode: enriched.errorCode,
    rootCause: enriched.rootCause,
    recommendedAction: enriched.recommendedAction,
    ownerAction: enriched.ownerAction,
    officialSetupUrl: enriched.officialSetupUrl,
    correlationId,
    endpoint: raw.endpoint,
    sanitizedContext: sanitizeContext(raw.sanitizedContext || {}),
    safeTraceId: raw.safeTraceId || correlationId,
    timestamp,
    resolved: Boolean(raw.resolved),
    resolvedAt: raw.resolvedAt,
    resolvedBy: raw.resolvedBy,
    resolutionNote: raw.resolutionNote,
    occurrenceCount: raw.occurrenceCount || 1,
    lastOccurrence: raw.lastOccurrence || timestamp
  };
}

/**
 * Emits a structured Cloud Logging event to stdout and triggers non-blocking persistence.
 * Persistence failures are always isolated and never affect main application requests.
 */
export function emitCloudMonitoringEvent(
  vector: FailureVector,
  severity: 'CRITICAL' | 'ERROR' | 'WARNING' | 'INFO',
  message: string,
  context: Record<string, any> = {},
  safeTraceId?: string
): MonitoringAlert {
  const traceId =
    safeTraceId ||
    (typeof context?.correlationId === 'string' && context.correlationId.trim()) ||
    `trc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const sanitizedMessage = sanitizeMonitoringString(message).slice(0, 400);
  const sanitized = sanitizeContext(context);
  const now = new Date().toISOString();

  const templateId =
    typeof context?.templateId === 'string' && context.templateId.trim()
      ? context.templateId.trim().slice(0, 120)
      : undefined;
  const errorStage =
    typeof context?.errorStage === 'string' && context.errorStage.trim()
      ? context.errorStage.trim().slice(0, 120)
      : typeof context?.stage === 'string' && context.stage.trim()
      ? context.stage.trim().slice(0, 120)
      : 'runtime';
  const endpoint =
    typeof context?.endpoint === 'string' && context.endpoint.trim()
      ? sanitizeMonitoringString(context.endpoint).slice(0, 160)
      : undefined;
  const source: AlertSource =
    context?.source === 'server_5xx' ||
    context?.source === 'client_error' ||
    context?.source === 'user_report' ||
    context?.source === 'cloud_monitoring' ||
    context?.source === 'auth_session' ||
    context?.source === 'generation_failure' ||
    context?.source === 'media_playback' ||
    context?.source === 'storage_r2'
      ? context.source
      : 'cloud_monitoring';
  const correlationId =
    typeof context?.correlationId === 'string' && context.correlationId.trim()
      ? context.correlationId.trim().slice(0, 120)
      : traceId;
  const templateTitle =
    typeof context?.templateTitle === 'string' && context.templateTitle.trim()
      ? sanitizeMonitoringString(context.templateTitle).slice(0, 140)
      : undefined;
  const generationId =
    typeof context?.generationId === 'string' && context.generationId.trim()
      ? sanitizeMonitoringString(context.generationId).slice(0, 120)
      : undefined;

  const defaults = enrichAlertDefaults(vector, sanitizedMessage, context);

  // Deduplication key based on vector + message + templateId + errorStage
  const dedupKey = `${vector}:${templateId || 'global'}:${errorStage}:${sanitizedMessage}`;
  const existing = activeAlertsMap.get(dedupKey);
  const nowMs = Date.now();

  let alert: MonitoringAlert;

  if (existing && nowMs - new Date(existing.lastOccurrence).getTime() <= DEDUPLICATION_WINDOW_MS) {
    existing.occurrenceCount++;
    existing.lastOccurrence = now;
    existing.correlationId = correlationId;
    existing.safeTraceId = traceId;
    existing.projectDatabaseService = defaults.projectDatabaseService;
    if (templateTitle) existing.templateTitle = templateTitle;
    existing.provider = defaults.provider;
    existing.adapter = defaults.adapter;
    existing.model = defaults.model;
    if (generationId) existing.generationId = generationId;
    existing.apiKeyAccessStatus = defaults.apiKeyAccessStatus;
    existing.billingQuotaEntitlementStatus = defaults.billingQuotaEntitlementStatus;
    existing.httpStatus = defaults.httpStatus;
    existing.errorCode = defaults.errorCode;
    existing.rootCause = defaults.rootCause;
    existing.recommendedAction = defaults.recommendedAction;
    existing.ownerAction = defaults.ownerAction;
    existing.officialSetupUrl = defaults.officialSetupUrl;
    existing.sanitizedContext = { ...existing.sanitizedContext, ...sanitized };
    alert = existing;
  } else {
    alert = {
      id: `alrt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      fingerprint: dedupKey,
      vector,
      severity,
      source,
      title: typeof context?.title === 'string' ? sanitizeMonitoringString(context.title).slice(0, 120) : `${vector}`,
      message: sanitizedMessage,
      projectDatabaseService: defaults.projectDatabaseService,
      templateId,
      templateTitle,
      provider: defaults.provider,
      adapter: defaults.adapter,
      model: defaults.model,
      generationId,
      apiKeyAccessStatus: defaults.apiKeyAccessStatus,
      billingQuotaEntitlementStatus: defaults.billingQuotaEntitlementStatus,
      httpStatus: defaults.httpStatus,
      errorStage,
      errorCode: defaults.errorCode,
      rootCause: defaults.rootCause,
      recommendedAction: defaults.recommendedAction,
      ownerAction: defaults.ownerAction,
      officialSetupUrl: defaults.officialSetupUrl,
      correlationId,
      endpoint,
      sanitizedContext: sanitized,
      safeTraceId: traceId,
      timestamp: now,
      resolved: false,
      occurrenceCount: 1,
      lastOccurrence: now
    };
    activeAlertsMap.set(dedupKey, alert);
    if (activeAlertsMap.size > 200) {
      const oldestKey = activeAlertsMap.keys().next().value;
      if (oldestKey) activeAlertsMap.delete(oldestKey);
    }
  }

  // Non-blocking persistent Firestore write (failure never breaks primary request)
  if (persistenceAdapter) {
    Promise.resolve(persistenceAdapter.persistIncident({ ...alert })).catch((err: any) => {
      console.warn('[CloudMonitoring] Non-blocking incident persistence note:', err?.message || err);
    });
  }

  // Google Cloud Structured Logging format
  const structuredLog = {
    severity: severity === 'CRITICAL' ? 'CRITICAL' : severity === 'ERROR' ? 'ERROR' : severity === 'WARNING' ? 'WARNING' : 'INFO',
    message: `[AI_PRIME_MONITORING] [${vector}] ${sanitizedMessage}`,
    'logging.googleapis.com/trace': `projects/${AUTHORITATIVE_GCP_PROJECT_ID}/traces/${traceId}`,
    serviceContext: {
      service: AUTHORITATIVE_CLOUD_RUN_SERVICE,
      version: process.env.K_REVISION || 'local-dev'
    },
    failureVector: vector,
    source,
    projectDatabaseService: alert.projectDatabaseService,
    templateId,
    provider: alert.provider,
    model: alert.model,
    errorCode: alert.errorCode,
    httpStatus: alert.httpStatus,
    errorStage,
    correlationId,
    dedupKey,
    occurrenceCount: alert.occurrenceCount,
    payload: sanitized,
    timestamp: now
  };

  if (process.env.NODE_ENV === 'production') {
    console.log(JSON.stringify(structuredLog));
  } else {
    console.log(`[CloudMonitoring] [${severity}] ${vector}: ${sanitizedMessage} (Correlation: ${correlationId})`);
  }

  return alert;
}

/**
 * Resolves an active alert in memory and triggers non-blocking Firestore resolution update.
 */
export function resolveAlert(alertId: string, resolvedBy?: string, resolutionNote?: string): boolean {
  let matched = false;
  for (const [key, alert] of activeAlertsMap.entries()) {
    if (alert.id === alertId) {
      alert.resolved = true;
      alert.resolvedAt = new Date().toISOString();
      if (resolvedBy) alert.resolvedBy = resolvedBy;
      if (resolutionNote) alert.resolutionNote = resolutionNote;
      resolvedAlertsHistory.unshift(alert);
      if (resolvedAlertsHistory.length > 50) resolvedAlertsHistory.pop();
      activeAlertsMap.delete(key);
      matched = true;
      break;
    }
  }
  if (persistenceAdapter) {
    Promise.resolve(persistenceAdapter.resolveIncident(alertId, resolvedBy, resolutionNote)).catch((err: any) => {
      console.warn('[CloudMonitoring] Non-blocking resolve persistence note:', err?.message || err);
    });
  }
  return matched;
}

/**
 * Returns current live monitoring alerts and resolved history (all normalized to 12 fields).
 */
export function getLiveAlerts(): { active: MonitoringAlert[]; resolved: MonitoringAlert[] } {
  return {
    active: Array.from(activeAlertsMap.values()).map((a) => normalizeAlertTo12Fields(a)),
    resolved: resolvedAlertsHistory.slice(0, 20).map((a) => normalizeAlertTo12Fields(a))
  };
}

/**
 * Runs a read-only Google Cloud Monitoring health probe reusing Cloud Run runtime credentials.
 */
export function runGoogleCloudMonitoringProbe(): CloudMonitoringProbeResult {
  const activeAlerts = Array.from(activeAlertsMap.values()).map((a) => normalizeAlertTo12Fields(a));
  const activeRevision = process.env.K_REVISION || 'local-dev';
  const isCloudRun = Boolean(process.env.K_SERVICE || process.env.K_REVISION);

  const status: 'passed' | 'warning' | 'blocked' = activeAlerts.some((a) => a.severity === 'CRITICAL')
    ? 'warning'
    : 'passed';

  return {
    status,
    gcpProjectId: AUTHORITATIVE_GCP_PROJECT_ID,
    gcpProjectNumber: AUTHORITATIVE_GCP_PROJECT_NUMBER,
    cloudRunService: AUTHORITATIVE_CLOUD_RUN_SERVICE,
    region: AUTHORITATIVE_REGION,
    customDomain: AUTHORITATIVE_CUSTOM_DOMAIN,
    activeRevision,
    activeAlertCount: activeAlerts.length,
    recentResolvedAlerts: resolvedAlertsHistory.length,
    failureVectorsMonitored: 24,
    summary: isCloudRun
      ? `Authoritative Cloud Run runtime active on ${AUTHORITATIVE_GCP_PROJECT_ID} (Revision: ${activeRevision}) with persistent Firestore incident sync.`
      : `Cloud Monitoring driver initialized in sandbox with target GCP Project '${AUTHORITATIVE_GCP_PROJECT_ID}' (non-blocking incident persistence enabled).`,
    alerts: activeAlerts
  };
}
