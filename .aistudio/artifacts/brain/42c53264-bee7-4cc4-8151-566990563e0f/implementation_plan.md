# Final Approved Implementation Plan (Plan 12 — Execution Mode)

## Executive Summary & Final Owner Authorization
This document represents the definitive, approved implementation roadmap for **AI Prime Studio / Lumina** (`backupvideoemail-create/Lumina-2-nd-`, baseline commit `349bbfa6f0f4c453114dc4e1c033c762ce6cffea`).

All implementation work is executed on the isolated branch `feature/prod-safety-central-diagnostics`. The Primary Builder acts as sole integration owner, strictly preserving the live website, customer wallets, payment adapters, and the native Android project.

---

## 1. Implementation Priority Sequence

### Priority 1: Payment Resilience & Idempotent Auto-Reconciliation (P0)
- **Problem**: 503 Service Unavailable or 401 Unauthorized HTML responses from Cloud Run cause client-side `res.json()` crashes (`Unexpected token 'S'`).
- **Solution**:
  - Implement a resilient response parser in `src/context/AppContext.tsx` that inspects HTTP status and headers before parsing JSON, preventing uncaught syntax errors.
  - Store pending transaction identifiers (`orderId`, `paymentId`, `subscriptionId`, `timestamp`) in `localStorage` upon receiving the Razorpay `handler` callback.
  - Implement automatic background reconciliation (`/api/payments/reconcile`) upon network recovery or page reload.
  - Retain server-side webhook processing with strict HMAC-SHA256 signature verification and idempotent recording.

### Priority 2: Server-Verified Admin Security & Public Exposure Elimination (P3)
- **Problem**: Public visitors and guest creators could see the Template Manager and System Diagnostics in the navigation drawer.
- **Solution**:
  - In `src/components/Drawer.tsx`, hide "Template Manager" and "System Diagnostics" buttons from all users except verified admins (`backupvideoemail@gmail.com` and `ai.prime.studio.pro@gmail.com`).
  - In `server.ts`, enforce `requireAdmin` middleware on all `/api/admin/**` endpoints, cryptographically validating the session token and returning `HTTP 403 Forbidden` for unauthorized requests.

### Priority 3: Central Production Diagnostics Dashboard & Firestore History (P1)
- **Problem**: Previous diagnostics had limited modularity, lacked rich error context, and displayed misleading success summaries.
- **Solution**:
  - Overhaul `src/components/DiagnosticsModal.tsx` and server `/api/admin/diagnostics` with 10 structured modules.
  - Enrich every test with: actual status, failure reason, expected vs actual result, severity, environment, timestamp, commit SHA, Cloud Run revision, endpoint/provider, safe trace ID, root-cause hypothesis, recommended action, and run comparison.
  - Persist all runs permanently to Firestore collection `diagnostics_history`.
  - Dynamically calculate and render summary counts: `[XX Passed · YY Failed · ZZ Blocked · WW Warning]`. Never show "READY" while critical failures or required blocked tests exist.
  - Enforce zero financial side-effects (no live charges, no paid AI generation, no wallet mutation).

### Priority 4: Production Template & Firestore Synchronization (P4)
- **Problem**: Public website served stale or cached templates compared to preview environments.
- **Solution**:
  - Add explicit `Cache-Control: no-store, no-cache, must-revalidate` headers to `/api/templates` and `/api/faceswap/scenes`.
  - Add unauthenticated `/api/version` endpoint returning `commitSha`, `buildTime`, `cloudRunRevision`, and `templateCount`.
  - Ensure admin template mutations write to Firestore and read back authoritatively before confirmation.

### Priority 5: End-to-End Account Deletion & Mandate Cancellation (P5)
- **Problem**: Account deletion lacked loading feedback and did not verify cancellation of active Razorpay AutoPay subscriptions.
- **Solution**:
  - In `server.ts` (`DELETE /api/auth/account`), call `razorpayAdapter.cancelSubscription()` for any active subscription associated with the user.
  - Completely wipe user profile, auth identities, wallet access, generations, and customer R2 media.
  - In `src/components/LegalModal.tsx`, add clear instructions, loading indicators, and error dialogs.

### Priority 6: Mobile Number Auto-fill, Logo SVG Standards & TWA SDK 36 (P6, P7, P8)
- In `src/components/PlansModal.tsx`, automatically inspect and prefill verified `user?.phone`, skipping duplicate phone entry prompts.
- In `public/icons/logo-icon.svg`, normalize gradient attributes to standard kebab-case (`stop-color`, `stop-opacity`) and regenerate clean PNG icons matching `src/components/Logo.tsx`.
- In `android-twa/app/build.gradle`, align `compileSdk 36` and `targetSdk 36`. Native `android/` project remains 100% untouched.

---

## 2. Protected Subsystems (Zero Modifications Permitted)
- `src/services/payments/razorpayAdapter.ts`
- `src/services/payments/cashfreeAdapter.ts`
- `src/services/billing/googlePlayService.ts`
- `src/services/config/pricingAndConfig.ts`
- `android/` (Entire native Kotlin/Compose project)
- `.github/workflows/android-build.yml`

---

## 3. Operations Tracking & Deliverables
All incident progress, test counts, and builder handoffs will be maintained in:
- `docs/operations/PRODUCTION_INCIDENT_MASTER_TRACKER.md`
- `docs/operations/BUILDER_HANDOFF_LOG.md`
- `docs/operations/CONFIGURATION_AUDIT.md`
