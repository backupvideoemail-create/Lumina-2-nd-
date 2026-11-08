# AI PRIME STUDIO LUMINA — PRODUCTION INCIDENT MASTER TRACKER
**Repository:** `backupvideoemail-create/Lumina-2-nd-`  
**Current Approved Main Baseline (HEAD):** `ba1d520ea672f69a7dddc4e2960b991d2c4d5d5b`  
**Preceding Commits:**  
- `73620e0a7f594cc7cfd6657fdc32e38a5b24112a` (Documentation Baseline Update)  
- `4a0aba4554131cb902240dc979db5f978ccef0fa` (Primary Sync & Diagnostics Architecture)  
- `1818df837de995635cf8344f821de871392cc10f` (Secondary Scope Implementation)  
- `8409287262d84e9621daf971e1cd30c88884ea3b` (Base Baseline)  
**Branches:** `feature/secondary-hero-cache-sync` (Secondary Scope) / `feature/prod-safety-central-diagnostics` (Primary Scope)  
**Lead Builder:** Primary Builder (Sole Integration Owner)  
**Secondary Builder:** Implementation Owner (Hero, Cache, HD Player, Diagnostics 14 Modules, Monitoring Probe)  
**Last Updated:** 2026-11-08  

---

## 1. Master Incident & Requirement Status Matrix

| ID | Module / Area | Priority | Status | Root Cause / Working Hypothesis | Assigned Builder | Files Changed / Protected | Tests & Verification | Owner Approval Status |
|:---|:---|:---|:---|:---|:---|:---|:---|:---|
| **P0-01** | Payment 503 / 401 Crash | **P0** | **AUTOMATED_TESTED** | *HYPOTHESIS*: Cloud Run cold start or revision deployment returned 503 HTML; client `res.json()` crashed on char 'S'. | Primary Builder | `src/context/AppContext.tsx` (Protected: `razorpayAdapter.ts`) | Safe response parser test; pending payment localStorage check | Approved for feature branch |
| **P1-01** | Central Admin Diagnostics Dashboard | **P1** | **AUTOMATED_TESTED** | Previous diagnostics lacked modularity (10 modules) and honest counts. | Primary Builder | `src/components/DiagnosticsModal.tsx`, `server.ts` | 10 modules tested; zero side-effect verification | Approved for feature branch |
| **P1-02** | Credit Ledger Calculation Mismatch | **P1** | **AUTOMATED_TESTED** | Diagnostic test 9 compared un-isolated test user balance without atomic isolation. | Primary Builder | `server.ts` (diagnostics runner) | Formula: `after === initial + packCredits`; 100% refund pass | Approved for feature branch |
| **P1-03** | Diagnostics History Firestore Persistence | **P1** | **AUTOMATED_TESTED** | In-memory history was lost on container restarts; requires dedicated collection. | Primary Builder | `server.ts`, Firestore collection `diagnostics_history` | Firestore read/write test for run records | Approved for feature branch |
| **P2-01** | Environment & Secrets Configuration | **P2** | **AUTOMATED_TESTED** | Sandbox local mode lacks Cloud Run Secret Manager bindings; marked accurately. | Primary Builder | `docs/operations/CONFIGURATION_AUDIT.md` | Non-speculative verification; zero redundant buckets | Approved for feature branch |
| **P3-01** | Admin Navigation Drawer Security | **P3** | **AUTOMATED_TESTED** | Guest creators could see Template Manager & Diagnostics in Drawer menu. | Primary Builder | `src/components/Drawer.tsx`, `server.ts` | Non-admin receives HTTP 403; UI hides admin items | Approved for feature branch |
| **P4-01** | Template Catalogue Synchronization | **P4** | **AUTOMATED_TESTED** | Missing `Cache-Control: no-store` on `/api/templates`; missing `/api/version`. | Primary Builder | `server.ts` | `/api/version` returns commit SHA & count; no-store verified | Approved for feature branch |
| **P5-01** | End-to-End Account Deletion | **P5** | **AUTOMATED_TESTED** | AutoPay mandate was not cancelled on Razorpay; missing loading UI. | Primary Builder | `src/components/LegalModal.tsx`, `server.ts` | `razorpayAdapter.cancelSubscription` called; media wiped | Approved for feature branch |
| **P6-01** | Mobile Number Duplicate Removal | **P6** | **AUTOMATED_TESTED** | Authenticated creators re-prompted for phone number in `PlansModal.tsx`. | Primary Builder | `src/components/PlansModal.tsx` | Prefill `user?.phone`; skips modal when valid | Approved for feature branch |
| **P7-01** | Original App Icon SVG Standards | **P7** | **AUTOMATED_TESTED** | `stopColor`/`stopOpacity` normalized to standard SVG kebab-case attributes. | Primary Builder | `public/icons/logo-icon.svg`, `public/icons/*` | Visual geometry parity verified against `Logo.tsx` | Approved for feature branch |
| **P8-01** | Android TWA SDK 36 Alignment | **P8** | **AUTOMATED_TESTED** | TWA app Gradle aligned to `compileSdk 36` and `targetSdk 36`. Native Android preserved. | Primary Builder | `android-twa/app/build.gradle` (Protected: `android/`) | Gradle configuration check; zero changes to `android/` | Approved for feature branch |
| **SEC-01** | Hero Carousel 8.0s + Swipe Navigation | **P1** | **AUTOMATED_TESTED** | Rotation timer was 5.5s; touch events lacked boundary wrap, dual-trigger suppression, and control exclusions. | Secondary Builder | `src/views/HomeView.tsx` | 8000ms timer, circular bounds, 450ms gesture throttle, controls excluded, tab-pause | Approved for feature branch |
| **SEC-02** | Persistent Media Cache (IndexedDB LRU) | **P1** | **AUTOMATED_TESTED** | Memory-only blob cache was cleared on page reload or navigation away. | Secondary Builder | `src/services/media/mediaCacheStorage.ts`, `src/services/media/hdDownloadQueue.ts` | IndexedDB `lumina_media_cache`, 100MB cap / 80% quota LRU, inFlight dedup, active URL protect | Approved for feature branch |
| **SEC-03** | In-Place HD Detail Video Upgrade | **P1** | **AUTOMATED_TESTED** | Video player remounted DOM and lost playback timestamp when upgrading to HD. | Secondary Builder | `src/components/TemplateDetailModal.tsx`, `src/components/TemplateCard.tsx` | In-place swap (`currentTime`, `paused`, `muted` preserved via one-time loadeddata), genuine Blob check | Approved for feature branch |
| **SEC-04** | Gallery Idle Prefetching | **P2** | **AUTOMATED_TESTED** | Gallery previews waited for on-screen scroll before initiating download. | Secondary Builder | `src/views/TemplatesView.tsx` | `requestIdleCallback` prefetch for top 8 items at 'low' priority; Data Saver check | Approved for feature branch |
| **SEC-05** | Central Diagnostics 14 Modules + Telemetry | **P1** | **AUTOMATED_TESTED** | Central diagnostics had 10 modules; lacked Firestore sync, R2 5-point, cross-builder sync, and GCP probe. | Secondary Builder | `server.ts`, `src/components/DiagnosticsModal.tsx` | Modules 11–14 executed, client media cache telemetry card rendered, testType and lastRun badges | Approved for feature branch |
| **SEC-06** | Google Cloud Monitoring Event Bus | **P1** | **AUTOMATED_TESTED** | Production failure vectors (payment 401/503, Gemini 402, R2 failure) lacked centralized logging and live alert ring. | Secondary Builder | `src/services/monitoring/cloudMonitoring.ts`, `server.ts` | 9 vectors captured without PII, deduplicated alerts, resolution endpoint | Approved for feature branch |

---

## 2. Standardized Status Taxonomy
- `PLAN_APPROVED` — Approved by Owner; ready for execution.
- `IN_PROGRESS` — Code and tests being executed in feature branch.
- `AUTOMATED_TESTED` — Passed TypeScript typecheck, linter, and automated test suite.
- `DEVICE_TEST_PENDING` — Awaiting physical/mobile browser verification.
- `OWNER_REVIEW_PENDING` — Ready for Owner review before production deployment.
- `DEPLOYMENT_PENDING` — Approved for deployment; pending live Cloud Run release.
- `PRODUCTION_VERIFIED` — Verified live on public domain.
- `CLOSED` — Incident resolved and confirmed.
