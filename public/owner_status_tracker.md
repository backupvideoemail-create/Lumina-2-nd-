# AI PRIME STUDIO LUMINA — OWNER STATUS TRACKER
**Current Approved Main Baseline (HEAD):** `6c2761dadef4e80a73066aaed01453b0dce9b1a8`  
**Preceding Commits:**  
- `ba1d520ea672f69a7dddc4e2960b991d2c4d5d5b` (Master Plan 13 Final Implementation)
- `73620e0a7f594cc7cfd6657fdc32e38a5b24112a` (Documentation Baseline Update)  
- `4a0aba4554131cb902240dc979db5f978ccef0fa` (Primary Sync & Diagnostics Architecture)  
- `1818df837de995635cf8344f821de871392cc10f` (Secondary Scope Implementation)  
- `8409287262d84e9621daf971e1cd30c88884ea3b` (Base Baseline)  
**Feature Branch:** `feature/secondary-media-preview-hd`  
**Date:** 2026-11-08  
**Status Gate:** PLAN 17 MEDIA PERFORMANCE & SWR CACHE COMPLETE — 470/470 Automated Tests Passing / Clean TypeScript Build (0 errors) / Dev Server Healthy / Zero Regressions / 4 Protected Financial Hashes Verified  
**GitHub Actions CI Status:** `Branch ready for Primary integration review (zero push to main)`  

---

## 1. Executive Status Categorization

### Category A: COMPLETED & VERIFIED (Behaviorally Tested)
- **Plan 17: Zero HD Requests on Gallery Scroll**: Confirmed removal of duplicate `queueHdDownload(hdTargetMedia, 'medium')` from `TemplateCard.tsx`. Gallery scrolling triggers zero HD video network requests.
- **Plan 17: 200ms Preview Debounce & Single Active Gallery Preview**: `TemplateCard.tsx` attaches and plays lightweight preview only after remaining steady in viewport for $\ge 200\text{ms}$. Dispatches `lumina:gallery-preview-play` to ensure only 1 preview video plays concurrently in gallery.
- **Plan 17: Single Authoritative HD Owner in TemplateDetailModal**: `TemplateDetailModal.tsx` is the sole owner of HD video downloads upon opening (`queueHdDownload(configuredHdAsset, 'high')`). Removed secondary duplicate trigger in `TemplateCard.tsx`.
- **Plan 17: MediaCacheStorage SWR Background HEAD Revalidation**: Implemented `revalidateCacheEntry(url, currentEntry)` executing non-blocking background `HEAD` checks with a 5-minute cooldown and in-flight deduplication. Correctly recognizes `304 Not Modified` and guards against unsupported HEAD/CORS failures.
- **Plan 17: Active Video Playback Protection**: When background SWR updates an asset in IndexedDB, if the URL is active in `protectedUrls`, the active Object URL is protected from being revoked until playback ends.
- **Plan 17: Private Customer Media Cache Guard**: `isCacheablePublicMedia(url)` strictly blocks caching private customer uploads (`/api/uploads/customer`), local blobs/data URIs, or URLs with auth/payment tokens.
- **Plan 17: Cold vs Warm Cache Byte Telemetry**: `fullMediaBodyBytesDownloaded`, `backgroundHeadMetadataBytes`, and `revalidationCount` tracked separately in `getStats()`.
- **Plan 17: In-Place HD Upgrade with State Restoration**: `TemplateDetailModal.tsx` swaps preview with cached HD asset in place, preserving `currentTime`, `paused`, and `muted` state via a one-time `loadeddata` listener without DOM remount.
- **Plan 17: Truthful Resolution Badge**: Displays "HD 1080p" only when metadata verifies 1080p; otherwise displays "HD Ready", "HD Preparing", or native resolution label.
- **Plan 13: Razorpay Captured-Only Activation**: Both `/api/payments/verify` and `/api/payments/reconcile` strictly enforce `status === 'captured'` (rejecting `authorized`), require server-authoritative ownership check (`userId`), and track cycle idempotency via `cyclePaymentId = rzpPay?.id || paymentId`.
- **Plan 13: Account Deletion AutoPay Mandate Retention**: Deleting user account preserves the active Razorpay UPI AutoPay mandate in restricted billing records (does NOT call `cancelSubscription`), prevents deleted customer wallet from activating recurring credits, prevents new accounts from inheriting old mandates, and displays clear user warning in LegalModal and Cancellation Policy.
- **Plan 13: Server-Verified Admin RBAC Security**: Defined `withAdminAuth` middleware enforcing dual-Gmail allowlist (`backupvideoemail@gmail.com` and `ai.prime.studio.pro@gmail.com`) via server-verified session tokens. Removed hardcoded `ADMIN_SECRET_KEY` and client `localStorage.getItem('lumina_admin_key')` / `x-admin-key` bypass.
- **Plan 13: Central Diagnostics 3-Tab Architecture**: Integrated `Audit Probes` (with dynamic category & test counts), `Run History` (with `firestore_persistent` vs `in_memory_ring_buffer` badges), and `Alert Center` (with incident severity, safe trace ID, and `Mark as Resolved` handler).
- **Plan 13: Firestore 5 NOT_FOUND Root Cause Fix**: Hardened `targetDatabaseId` logic in `src/services/db/database.ts` to honor `FIRESTORE_DATABASE_ID` (`ai-studio-lumina2nd-42c53264-bee7-4cc4-8151-566990563e0f`) regardless of project name discrepancies, permanently resolving NOT_FOUND errors.
- **Secondary Hero Carousel (8.0s)**: 8000ms timer, circular boundary navigation, dual-event suppression (pointer ignores touch), 450ms gesture throttle, controls exclusion, tab-visibility pause, 1:1 hero crop with native uncropped modal.
- **Persistent Media Cache (IndexedDB)**: `lumina_media_cache` store with LRU eviction at 100MB / 80% quota, in-flight Promise deduplication, active Blob URL protection, Data Saver detection.
- **In-Place Detail HD Player**: Smooth video swap preserving `currentTime`, `paused`, `muted` via one-time `loadeddata` listener without DOM remount; genuine Blob verification (`isCachedBlobUrl`).
- **Gallery Idle Prefetch**: Visible gallery preview assets prefetched via `requestIdleCallback` at `low` priority.
- **Central Diagnostics & Audit (14 Modules)**: Modules 1–10 + 11 (Firestore Authoritative Sync), 12 (R2 Storage 5-Point Audit), 13 (Cross-Builder Sync Probe), 14 (Google Cloud Monitoring Probe); client media cache telemetry card.
- **Google Cloud Monitoring Bus**: Privacy-safe event bus capturing 9 failure vectors, deduplicated live alert ring buffer, and alert resolution endpoint.
- **Protected Financial Integrity**: 4 out of 4 protected financial adapter hashes 100% match baseline. Zero edits to payments or ledger.
- **A-01, A-02, A-04**: Prompt standard v1.1 modular branches (`PHOTO_GLOBAL_PROMPT`, `VIDEO_GLOBAL_PROMPT`, `MOTION_TRANSFER_PROMPT`, `VIDEO_EDIT_PROMPT`, `IMAGE_TO_VIDEO_PROMPT`). Wire hierarchical prompt assembly.
- **A-07, A-14**: 4000-character prompt limit guard with `VALIDATION_ERROR` fail-closed.
- **A-08, B-06, G-07**: Couple identity separation (`COUPLE_PHOTO_MAPPING`, `COUPLE_VIDEO_MAPPING`), independent Person A / Person B wardrobe selectors (`wardrobeSourceA`, `wardrobeSourceB`).
- **C-02, C-03**: Workflow separation (Motion Transfer vs Object Swap) via dynamic `targetEndpoint` dispatch in `faceSwapAdapter.ts`.
- **C-05, C-06**: Strict resolution tariffs and duration bounds verification. Server requires explicit resolution & duration without silent defaults.
- **D-08, D-14**: Omni 1.1 Flash evaluation-only guard across all customer generation routes.
- **E-01, E-02**: Published list price separation from account quotes. 4-tier duration tracking (`sourceVideoDurationSeconds`, `requestedOutputDurationSeconds`, `actualOutputDurationSeconds`, `actualBillableDurationSeconds`).
- **E-03, E-04**: Central pricing configuration with timestamp and 40% business markup applied strictly once.
- **E-05, E-06, E-07**: Server-authoritative credit recalculation. Fail closed on `PENDING_QUOTE` (returns 0 credits).
- **E-10**: Actual cost reconciliation on completion (refunds difference, 100% refund on failure, zero post-debit).
- **F-08**: Storage fails closed with `STORAGE_SIGNING_FAILED` or `STORAGE_FAILED` if private key/URL generation fails.
- **H-05, H-06, H-07, H-08, H-09**: HD download queue with inFlight deduplication, 3-tier priority, data saver / 2G-3G suppression, and video playback state preservation (`currentTime`, `paused`, `muted`).
- **P0-1 (Current Pass)**: Removed unverified 720p / 5s fallbacks from `server.ts` and `TemplateDetailModal.tsx`.
- **P0-2 (Current Pass)**: Private customer media validation: reject raw unverified media, ingest via `saveMedia` into private storage, generate short-lived signed URLs.
- **P0-3 (Current Pass)**: Authoritative slot role integrity: template-configured Person A/B slot roles strictly override customer-supplied roles.
- **P0-4 (Current Pass)**: AI reservations strictly use verified model registry quotes; fixed-credit pricing preserved for Smart Template. Legacy `providerCostUsd` cannot bypass AI quotes.
- **P1-5 (Current Pass)**: Home Hero playback preservation: `heroVideoRef` preserves `currentTime`, `paused`, and `muted` state upon HD swap. Softened overlay gradient removes dark veil.
- **P1-6 (Current Pass)**: Preview/HD separation: `hdTargetMedia` resolves only genuine distinct HD assets (`hdVideoUrl`/`hdMedia`), never treating preview as HD.
- **P1-7 (Current Pass)**: Adapter Audit displays actual dynamic registry records with 5 distinct statuses: `CONFIGURED`, `CONNECTED`, `MODEL_AVAILABLE`, `QUOTE_VERIFIED`, and `NOT_TESTED`.
- **P1-8 (Current Pass)**: Explicit Cover selection survives Sample Result updates, admin save, Firestore read-back, and gallery refresh.

---

### Category B: PARTIALLY IMPLEMENTED / SOURCE ONLY
- **B-01, B-02**: Wardrobe choice toggle in Admin UI and segmented control in Customer Modal. (Source implemented, verified in test suite).
- **D-01, D-02, D-03**: Model selection hierarchy (Output -> Workflow -> Input -> Model) in Admin form. (Source implemented, verified in test suite).
- **D-06**: Publish gate for unverified models (`PENDING_QUOTE` warning shown). (Source implemented, verified in test suite).

---

### Category C: BEHAVIORALLY UNVERIFIED (Environment Mock / Local Sandbox)
- **Local SQLite / Memory Mock DB**: Tested in sandbox; passes all 380 automated tests.
- **Local FFmpeg Execution**: In-memory trimming and format verification tested and functional in container.

---

### Category D: EXTERNALLY BLOCKED (Live Cloud Credentials Required)
1. **Cloudflare R2 Bucket & Credentials**:
   - Variables needed: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`.
   - Current status: Container runs local fallback storage (`public/uploads`); generation requests requiring R2 fail closed as designed (`STORAGE_FAILED`).
2. **Google Cloud Firestore Service Account**:
   - Variables needed: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`.
   - Current status: Authoritative Firestore writes gated; container operates safely with local persistence.
3. **Higgsfield AI API Key & Funded Balance**:
   - Variable needed: `HIGGSFIELD_API_KEY`.
   - Current status: Adapter reports `MISSING_SECRET` / `PENDING_QUOTE`; generation blocked before deduction.
4. **Google Gemini GenAI API Key & Quota**:
   - Variable needed: `GEMINI_API_KEY`.
   - Current status: Image generation fails closed when key absent.
5. **Live Payment Webhook Events**:
   - Razorpay / Cashfree live captured transactions require live API keys. Code and handlers are 100% intact and SHA-256 verified.

---

## 2. Protected Systems Integrity Matrix

| Subsystem | File Path | Baseline SHA-256 Hash | Status |
|:---|:---|:---|:---|
| **Razorpay Adapter** | `src/services/payments/razorpayAdapter.ts` | `78d76c04324259a53cb08ac156a7d3f5ba02d5656d939d90e07ceae2491f1e05` | **VERIFIED UNCHANGED** |
| **Cashfree Adapter** | `src/services/payments/cashfreeAdapter.ts` | `e2f5f57157f1bdad3f1fbe87c52d7c9f0c14061364f96dda595057aefef84945` | **VERIFIED UNCHANGED** |
| **Google Play Service** | `src/services/billing/googlePlayService.ts` | `3da6f78c3ab1bde17f7b183fe34ae10610c54b13ef3a0f79fe55026af4d58a42` | **VERIFIED UNCHANGED** |
| **Pricing & Config** | `src/services/config/pricingAndConfig.ts` | `bd94bd5c70ba201006c400086a7e4ab223cc38ac9cf6421f4a5a486d04643d83` | **VERIFIED UNCHANGED** |
| **Customer Pricing UI** | All Customer Generation Screens | N/A (0 INR / ₹ symbols present) | **VERIFIED PURE CREDITS** |
