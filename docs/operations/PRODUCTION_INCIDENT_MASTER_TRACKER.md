# AI PRIME STUDIO LUMINA — PRODUCTION INCIDENT MASTER TRACKER
**Repository:** `backupvideoemail-create/Lumina-2-nd-`  
**Current Approved Commit SHA:** `349bbfa6f0f4c453114dc4e1c033c762ce6cffea`  
**Branch:** `feature/prod-safety-central-diagnostics`  
**Lead Builder:** Primary Builder (Sole Integration Owner)  
**Last Updated:** 2026-11-07  

---

## 1. Master Incident & Requirement Status Matrix

| ID | Module / Area | Priority | Status | Root Cause / Working Hypothesis | Assigned Builder | Files Changed / Protected | Tests & Verification | Owner Approval Status |
|:---|:---|:---|:---|:---|:---|:---|:---|:---|
| **P0-01** | Payment 503 / 401 Crash | **P0** | **IN_PROGRESS** | *HYPOTHESIS*: Cloud Run cold start or revision deployment returned 503 HTML; client `res.json()` crashed on char 'S'. | Primary Builder | `src/context/AppContext.tsx` (Protected: `razorpayAdapter.ts`) | Safe response parser test; pending payment localStorage check | Approved for feature branch |
| **P1-01** | Central Admin Diagnostics Dashboard | **P1** | **IN_PROGRESS** | Previous diagnostics lacked modularity (10 modules) and honest counts. | Primary Builder | `src/components/DiagnosticsModal.tsx`, `server.ts` | 10 modules tested; zero side-effect verification | Approved for feature branch |
| **P1-02** | Credit Ledger Calculation Mismatch | **P1** | **IN_PROGRESS** | Diagnostic test 9 compared un-isolated test user balance without atomic isolation. | Primary Builder | `server.ts` (diagnostics runner) | Formula: `after === initial + packCredits`; 100% refund pass | Approved for feature branch |
| **P1-03** | Diagnostics History Firestore Persistence | **P1** | **IN_PROGRESS** | In-memory history was lost on container restarts; requires dedicated collection. | Primary Builder | `server.ts`, Firestore collection `diagnostics_history` | Firestore read/write test for run records | Approved for feature branch |
| **P2-01** | Environment & Secrets Configuration | **P2** | **IN_PROGRESS** | Sandbox local mode lacks Cloud Run Secret Manager bindings; marked accurately. | Primary Builder | `docs/operations/CONFIGURATION_AUDIT.md` | Non-speculative verification; zero redundant buckets | Approved for feature branch |
| **P3-01** | Admin Navigation Drawer Security | **P3** | **IN_PROGRESS** | Guest creators could see Template Manager & Diagnostics in Drawer menu. | Primary Builder | `src/components/Drawer.tsx`, `server.ts` | Non-admin receives HTTP 403; UI hides admin items | Approved for feature branch |
| **P4-01** | Template Catalogue Synchronization | **P4** | **IN_PROGRESS** | Missing `Cache-Control: no-store` on `/api/templates`; missing `/api/version`. | Primary Builder | `server.ts` | `/api/version` returns commit SHA & count; no-store verified | Approved for feature branch |
| **P5-01** | End-to-End Account Deletion | **P5** | **IN_PROGRESS** | AutoPay mandate was not cancelled on Razorpay; missing loading UI. | Primary Builder | `src/components/LegalModal.tsx`, `server.ts` | `razorpayAdapter.cancelSubscription` called; media wiped | Approved for feature branch |
| **P6-01** | Mobile Number Duplicate Removal | **P6** | **IN_PROGRESS** | Authenticated creators re-prompted for phone number in `PlansModal.tsx`. | Primary Builder | `src/components/PlansModal.tsx` | Prefill `user?.phone`; skips modal when valid | Approved for feature branch |
| **P7-01** | Original App Icon SVG Standards | **P7** | **IN_PROGRESS** | `stopColor`/`stopOpacity` normalized to standard SVG kebab-case attributes. | Primary Builder | `public/icons/logo-icon.svg`, `public/icons/*` | Visual geometry parity verified against `Logo.tsx` | Approved for feature branch |
| **P8-01** | Android TWA SDK 36 Alignment | **P8** | **IN_PROGRESS** | TWA app Gradle aligned to `compileSdk 36` and `targetSdk 36`. Native Android preserved. | Primary Builder | `android-twa/app/build.gradle` (Protected: `android/`) | Gradle configuration check; zero changes to `android/` | Approved for feature branch |

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
