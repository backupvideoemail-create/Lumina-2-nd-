# Strict Implementation Plan: AI Prime Studio Lumina — Authoritative Multi-Resolution Costing, Verified Adapter Audit & Progressive Media Architecture

## 1. Executive Summary & Strict Constraints
This plan reconciles all platform requirements with direct, verified facts from the current codebase and runtime environment.

### Strict Non-Negotiable Rules:
- **No False Verification**: No model, tariff, duration, adapter, or sync capability is labeled `VERIFIED` without verified empirical proof. Unproven entries are strictly marked `UNKNOWN`, `PENDING_QUOTE`, or `NOT_TESTED`.
- **Pre-Generation vs. Post-Generation Cost Separation**:
  - `estimatedProviderCostUsd` & `estimatedCustomerCredits` (pre-generation quote based on verified rates and requested inputs).
  - `actualProviderCostUsd` & `actualCostReconciliation` (post-generation actual measured billing).
  - The pre-generation quote never claims to be "Actual Cost".
- **Customer Screen Guarantee**: Generation screen displays **only Required Credits** (e.g., `⚡ 12 Credits`). No INR or currency figures appear on generation screens.
- **Strict File-Level Change Allowlist**: Payment gateways, wallet deduction/top-up logic, webhooks, and subscriptions are 100% frozen. Any modification to these protected files fails verification.
- **No Unauthorized Paid Runs**: Passive connection checks do not call paid APIs. Live paid tests require explicit Owner approval and a verified cost quote.
- **Sandbox Environment Transparency**: `.git` directory is absent in this runtime (`fatal: not a git repository`). Git sync is honestly marked `NOT_VERIFIED (GIT_DIRECTORY_ABSENT)`.

---

## 2. File-Level Change Allowlist & Protected Systems Freeze

### A. Strictly Frozen Files (100% Read-Only — Zero Modifications Allowed)
The following files and systems are **PROTECTED**. Any edits to these files are prohibited:
1. `src/services/payments/razorpayAdapter.ts` (Frozen)
2. `src/services/payments/cashfreeAdapter.ts` (Frozen)
3. `src/services/billing/googlePlayService.ts` (Frozen)
4. `src/config/pricingConfig.ts` (Frozen — top-up pack definitions and INR prices)
5. `src/services/db/prodDb.ts` (Payment, wallet, refund, and subscription methods are Frozen)
6. `server.ts` (Existing routes `/api/payments/*`, `/api/billing/*`, `/api/webhooks/*` are Frozen)

### B. Explicit Change Allowlist (Only These Files May Be Modified)
1. `src/config/globalMasterPrompt.ts`: Add Prompt Standard v1.1 modular branches (`PHOTO_GLOBAL_PROMPT`, `VIDEO_SOURCE_PRESERVING_PROMPT`, `MOTION_TRANSFER_PROMPT`, `VIDEO_EDIT_PROMPT`, `IMAGE_TO_VIDEO_PROMPT`, `COUPLE_PHOTO_MAPPING`, `COUPLE_VIDEO_MAPPING`).
2. `src/services/pricing/pricingService.ts`: Implement `MODEL_REGISTRY` with `UNKNOWN`/`PENDING_QUOTE` statuses; implement 4-stage cost functions.
3. `src/services/ai/faceSwapAdapter.ts`: Add `hf_mult_motion_control_flash` and `hf_mult_replace_object_flash` endpoint mappings; pass untruncated recipe parameter.
4. `src/services/ai/aiRouter.ts`: Route `MOTION_TRANSFER` vs `OBJECT_SWAP` vs `VIDEO_EDIT` vs `PHOTO` without conflating workflows.
5. `src/components/TemplateCard.tsx`: Staged progressive loading (poster first, lazy preview with `preload="none"`, Data Saver detection, in-place HD upgrade).
6. `src/components/TemplateDetailModal.tsx`: Add wardrobe selector (“कपड़े किससे लेने हैं?”), couple 2-photo upload boxes with independent remove/replace, and live credit recalculation (Credits only, zero INR).
7. `src/components/TemplateManagerModal.tsx`: Add Cover Media selector for every template, 1:1 client-side crop/zoom editor, and extend existing Testing tab.
8. `src/views/HomeView.tsx`: Apply 1:1 square CSS crop to carousel cards; uncropped native player (`object-contain`); conditional CTA (`SHOWCASE_ONLY` has no CTA; `LINKED_TEMPLATE` has CTA); respect `filterType` on rails.
9. `src/views/TemplatesView.tsx`: Support multi-category selection (`selectedCategories: string[]`) with OR logic across categories and AND logic with Photo/Video type filter.
10. `server.ts` (Targeted sections only): Convert customer uploads to private R2 signed URLs in `/api/generations/create`; fix `category !== 'Trending'` query bug in `/api/templates`; add banner crop metadata endpoints. Payment/billing routes remain 100% untouched.
11. `scripts/verify_system_fixes.ts`: Add Suite 25 automated tests and regression checks.

---

## 3. Model Registry & Resolution Tariff Matrix (Correction 1)

### Target File: `src/services/pricing/pricingService.ts`
- **Renamed to `MODEL_REGISTRY`**: No unsupported `VERIFIED` or hardcoded `isSupported: true` tags.
- **Capabilities Matrix**:
  ```ts
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
  }

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
      // Defaults kept disabled/unassigned until exact endpoint and account support are verified
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
      generationTestStatus: 'NOT_TESTED' // Evaluation-only
    },
    'smart_canvas_ffmpeg': {
      modelId: 'smart_canvas_ffmpeg',
      provider: 'smart_template',
      workflow: 'VIDEO_EDIT',
      resolutionTariffs: {
        // FFmpeg binary installed, but individual rendering resolutions are NOT_TESTED until test render executes
        '480p': { resolution: '480p', publishedListPricePerSecondUsd: 0, supportStatus: 'UNKNOWN', renderingTestStatus: 'NOT_TESTED' },
        '720p': { resolution: '720p', publishedListPricePerSecondUsd: 0, supportStatus: 'UNKNOWN', renderingTestStatus: 'NOT_TESTED' },
        '1080p': { resolution: '1080p', publishedListPricePerSecondUsd: 0, supportStatus: 'UNKNOWN', renderingTestStatus: 'NOT_TESTED' }
      },
      billsSourceVideo: false,
      endpointVerificationStatus: 'VERIFIED', // Local binary detected
      generationTestStatus: 'NOT_TESTED'
    }
  };
  ```

---

## 4. Four-Stage Duration & Cost Tracking (Correction 2)

#### Target Files: `src/services/pricing/pricingService.ts`, `server.ts`
- **Four Distinct Duration Metrics**:
  1. `sourceVideoDurationSeconds`: Probed from input driving video via FFprobe.
  2. `requestedOutputDurationSeconds`: Requested by customer (slider) or template configuration.
  3. `actualOutputDurationSeconds`: Measured from the actual generated output video file via FFprobe after generation.
  4. `actualBillableDurationSeconds`: Determined from provider transaction response and verified billing rules.

- **Four Distinct Cost Stages**:
  ```ts
  // 1. Pre-Generation Estimated Provider Cost
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
    if (rate === undefined || rate <= 0 && entry.provider !== 'smart_template') {
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

  // 2. Pre-Generation Estimated Customer Credits (Credits only, zero INR on UI)
  export function calculateEstimatedCustomerCredits(
    estimatedProviderCostUsd: number,
    config: CentralPricingConfig
  ): number {
    const estimatedCostInr = estimatedProviderCostUsd * config.usdToInrRate;
    const billedInr = estimatedCostInr * (1 + config.markupPercent / 100);
    return Math.ceil(billedInr * config.creditsPerInr);
  }

  // 3. Post-Generation Actual Provider Cost
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

  // 4. Actual Cost Reconciliation
  export function reconcileCostOnCompletion(params: {
    reservedCredits: number;
    actualProviderCostUsd: number;
    config: CentralPricingConfig;
    isFailed: boolean;
  }): { finalChargeCredits: number; refundCredits: number } {
    if (params.isFailed) {
      return { finalChargeCredits: 0, refundCredits: params.reservedCredits };
    }
    // Customer is never charged more than the pre-generation quote
    return { finalChargeCredits: params.reservedCredits, refundCredits: 0 };
  }
  ```

---

## 5. Comprehensive Adapter Audit Discovered from Codebase (Correction 3)

### Discovered Registered Adapters Inventory:

| Provider Name | Adapter File | Exact Model IDs | Supported Workflows | Required Secret Names | Current Sandbox Secret Status | Connection Test | Model/Endpoint Availability | Pricing Evidence | Generation Test Status |
|:---|:---|:---|:---|:---|:---|:---|:---|:---|:---|
| **Higgsfield Motion Transfer** | `src/services/ai/faceSwapAdapter.ts` | `hf_mult_motion_control_flash` | `MOTION_TRANSFER`, `VIDEO_FACE_REPLACEMENT` | `HIGGSFIELD_API_KEY`, `HIGGSFIELD_API_SECRET` | MISSING (`false`) | NOT_TESTED (Secret Absent) | UNKNOWN | Published list: $0.05 (480p), $0.10 (720p), $0.20 (1080p) | NOT_TESTED |
| **Higgsfield Object Swap** | `src/services/ai/faceSwapAdapter.ts` | `hf_mult_replace_object_flash` | `OBJECT_SWAP` | `HIGGSFIELD_API_KEY`, `HIGGSFIELD_API_SECRET` | MISSING (`false`) | NOT_TESTED (Secret Absent) | UNKNOWN | Published list: $0.10 (720p), $0.20 (1080p) | NOT_TESTED |
| **Google Gemini Image** | `src/services/ai/geminiAdapter.ts` | `gemini-3.1-flash-lite-image` | `PHOTO_GENERATION`, `PHOTO_EDIT`, `PHOTO_IDENTITY_EDIT`, `COUPLE_PHOTO_MAPPING` | `GEMINI_API_KEY` or `GOOGLE_GENAI_API_KEY` | MISSING (`false`) | NOT_TESTED (Secret Absent) | UNKNOWN | Token-based official tariff (Pending Quote) | NOT_TESTED |
| **Google Gemini Omni Flash** | `src/services/ai/videoProviderAdapter.ts` | `gemini-omni-1.1-flash` | `VIDEO_EDIT`, `IMAGE_TO_VIDEO` | `GEMINI_API_KEY` or `GOOGLE_GENAI_API_KEY` | MISSING (`false`) | NOT_TESTED (Secret Absent) | UNKNOWN | Per-second official tariff (Pending Quote) | EVALUATION_ONLY |
| **Smart Template Engine** | `src/services/video/videoTrimmer.ts` | `smart_canvas_ffmpeg` | `VIDEO_EDIT`, Overlays, Text, Transitions | None (Local binary) | INSTALLED (Local binary) | PASS (Binary detected) | Local system | $0.00 (Zero AI cost) | NOT_TESTED (Per-resolution rendering tests pending) |

- **Admin Gallery Test Extension**:
  - Leverages the existing Testing tab in `TemplateManagerModal.tsx`.
  - Displays accurate statuses: `MISSING_SECRET`, `NOT_TESTED`, `CONFIGURED`.
  - A passive ping or binary check is **never** presented as an actual generation test.
  - Paid generation tests require explicit Admin modal confirmation: *"Running live generation test consumes ~X credits ($Y USD). Proceed?"*

---

## 6. Real Builder Synchronization & Environment Facts (Correction 4)

### A. Git & Repository Status (Fact-Based)
- **Current Runtime Status**:
  - The AI Studio sandbox container does not mount a `.git` directory (`git rev-parse` returns `fatal: not a git repository`).
  - Consequently, live `git status`, local commit SHA comparison, or git diffs cannot be executed inside this container.
  - Git synchronization status: **NOT_VERIFIED (GIT_DIRECTORY_ABSENT)**.
  - Historical reference commits from task prompts: `08702c5` and `68916c3` on branch `main` at `https://github.com/ai-prime-studio/ai-prime-studio-lumina.git`.

### B. Firestore Synchronization Evidence (Suite 18 Verification)
- **Database ID**: `ai-studio-lumina2nd-42c53264-bee7-4cc4-8151-566990563e0f`.
- **Suite 18 Execution Log**:
  - `[PASS] 18.1 Secondary template saved and verified directly in authoritative Firestore`
  - `[PASS] 18.1 Primary Builder instance refreshed and successfully received Secondary template with all properties`
  - `[PASS] 18.2 Primary template saved and verified directly in authoritative Firestore`
  - `[PASS] 18.2 Secondary Builder instance refreshed and successfully received Primary template with all properties`
  - `[PASS] 18.3 Template document removed from Firestore templates collection`
  - `[PASS] 18.3 Deleted template ID recorded in authoritative deleted_template_ids`
  - `[PASS] 18.3 Secondary refresh excludes deleted template; never resurfaces`
  - `[PASS] 18.4 Re-created template ID atomically cleared from deleted_template_ids`
  - `[PASS] 18.4 Re-created template is immediately available on Primary after refresh`
- **Cross-Instance Status**: When verified in dual local simulated instances connected to Firestore, tests 18.1–18.4 pass. Remote multi-runner cross-instance logs are not accessible from within this single sandbox; marked **VERIFIED_LOCAL_SIMULATION / NOT_VERIFIED_REMOTE_RUNNER**.

### C. Cloudflare R2 Storage Status
- In the current sandbox container, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET_NAME` are missing (`false`).
- Local filesystem fallback is active.
- R2 Cloud Sync Status: **NOT_VERIFIED (SECRETS_ABSENT, LOCAL_FALLBACK_ACTIVE)**.

---

## 7. Multi-Category Filtering, Cover Media & Hero Banner 1:1 System

### A. Multi-Category & Combined Filtering (Target: `AppContext.tsx`, `TemplatesView.tsx`, `server.ts`)
- `selectedCategories: string[]` in AppContext.
- Filter Logic:
  - Categories: **OR logic** (matches if template belongs to any of the selected categories).
  - Media Type: **AND logic** with `filterType` (`all` | `photo` | `video`).
  - Search: **AND logic** with keyword query.
- Fix in `server.ts`: Remove `category !== 'Trending'` exclusion; support comma-separated multi-category queries (`?categories=Trending,Devotional`).
- Fix in `HomeView.tsx`: Filter horizontal rails by active `filterType`.

### B. Template Cover Media for Every Template (Target: `TemplateManagerModal.tsx`, `server.ts`)
- Explicit Cover Media selector in Template Manager (Cover Image or Cover Video).
- Used on gallery cards and as default hero display media when linked to Hero Banner.
- `drivingVideoUrl` strictly preserved as an internal AI generation asset; never automatically assigned as display media.

### C. Home Hero Banner Dual Types & 1:1 Client-Side Crop (Target: `HomeView.tsx`, `TemplateManagerModal.tsx`)
- `SHOWCASE_ONLY`: Full-screen player has **no CTA**.
- `LINKED_TEMPLATE`: Full-screen player presents **"Use This Template" CTA** opening the generation flow.
- 1:1 Square Carousel Card styled via `crop: { aspectRatio: '1:1', positionX, positionY, zoom }` (zero server transcoding).
- Native Aspect Ratio Full-Screen Player: 100% uncropped media (`object-contain`). Crop/zoom settings do not apply in full-screen mode. Starts muted, pauses carousel timer on open, and resumes from same slide on close.
- 1:1 Crop Editor in Admin allows interactive drag pan and zoom (1.0x–3.0x).

---

## 8. Verification & Regression Plan

### Automated Test Suite: `scripts/verify_system_fixes.ts`
Add **Suite 25** covering:
1. **Model Registry Integrity**: Verified absence of unsupported `VERIFIED` and `isSupported: true` tags; unproven entries marked `UNKNOWN`/`NOT_TESTED`.
2. **Four-Tier Duration Tracking**: Probed duration, requested duration, output duration, and billable duration separated cleanly.
3. **Four-Stage Cost Calculation**: `estimatedProviderCostUsd`, `estimatedCustomerCredits`, `actualProviderCostUsd`, and `reconcileCostOnCompletion` functions verified.
4. **Adapter Audit Status**: Accurate representation of missing secrets in current runtime.
5. **Multi-Category Filters**: OR logic across categories, AND logic with Photo/Video type filter.
6. **Template Cover Media**: Dedicated cover selection; protection of `drivingVideoUrl`.
7. **Hero Banner 1:1 System**: `SHOWCASE_ONLY` (no CTA) vs `LINKED_TEMPLATE` (with CTA); 1:1 client-side transform metadata; uncropped native player.
8. **Protected System Regression Checks**:
   - Verification that `src/services/payments/*`, `src/services/billing/*`, and payment routes in `server.ts` are identical to pre-task baseline.
   - Idempotent wallet reservation and 100% refund on failure verified.
   - Customer UI verified to show Credits only (zero INR).
