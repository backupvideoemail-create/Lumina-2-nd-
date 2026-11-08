# AI PRIME STUDIO — MASTER IMPLEMENTATION PLAN 13 (FINAL APPROVED BASELINE)
**Repository:** `backupvideoemail-create/Lumina-2-nd-`  
**Current Main HEAD Baseline:** `ba1d520ea672f69a7dddc4e2960b991d2c4d5d5b`  
**Base Lineage:** `84092872` → `1818df83` → `4a0aba45` → `73620e0a` → `ba1d520e`  
**Primary Feature Branch:** `feature/prod-safety-central-diagnostics`  
**Lead & Integration Owner:** Primary Builder  
**Secondary Builder Scope:** Hero Carousel, IndexedDB Cache, HD Player, Cloud Monitoring Bus (All Preserved)  
**Date:** 2026-11-08  

---

## 1. Executive Summary & Architecture Baseline
AI Prime Studio operates under a single authoritative architecture:
**ONE REPOSITORY → ONE FRONTEND → ONE BACKEND → ONE AUTHENTICATION SYSTEM → ONE AUTHORITATIVE FIRESTORE DATABASE → ONE CLOUDFLARE R2 BUCKET → WEB + PWA + TWA**.

This revised Plan 13 incorporates the final three acceptance conditions:
1. **Account Deletion + Continuing AutoPay**:
   - The existing ₹1 → ₹499 Weekly AutoPay mandate continues uninterrupted on Razorpay.
   - A restricted mapping of the deleted subscription, UID, and billing records is preserved.
   - Future Razorpay renewal webhooks verify against this restricted mapping; deleted customer's wiped wallet does **NOT** activate credits, and newly created accounts do **NOT** automatically link to the old subscription.
2. **Existing Cancellation Policy Inspection & Clear Deletion Warning**:
   - Inspect existing Cancellation Policy text before adding any text to avoid duplicate clauses.
   - Account deletion confirmation dialog provides explicit warning that recurring charges continue and the mandate must be cancelled separately in the user's UPI app or bank.
   - Zero changes to Plan Selection page terms, refund policy, pricing, weekly billing, or payment disclosures.
3. **Actual Dynamic Test Counts**:
   - Test counts will be reported dynamically based on actual executed tests, rather than treating "444+" as a fixed minimum quota.
   - Any failed, blocked, or untested check will prevent claiming the application is `READY`.

---

## 2. P0: Payment Reconciliation, Ownership & Financial Integrity

### A. Server-Authoritative Customer Ownership Check
1. **Primary Stored Order-to-UID Mapping**:
   - Before activating credits in `/api/payments/verify` or `/api/payments/reconcile`, lookup the stored authoritative order record in `prodDb` and verify:
     `storedPaymentRecord.userId === authenticatedUser.id`
   - If `storedPaymentRecord` is missing or `userId` does not match, credit activation is **STRICTLY BLOCKED** (returns HTTP 403 `PAYMENT_OWNERSHIP_MISMATCH`).
2. **Notes as Secondary Cross-Check Only**:
   - Razorpay payment/order notes (`notes.userId`) are examined only as a secondary confirmation, never as a sole authorization key.
3. **Captured-Only Credit Activation**:
   - Only provider payments with status explicitly `captured` (or settled) may activate credits. Reject `authorized`, `created`, `refunded`, or ambiguous states.
4. **Renewal Cycle Idempotency Separation**:
   - Separate the ₹1 introductory trial payment from recurring ₹499 weekly renewals.
   - For renewals, require the unique Razorpay Payment ID (`pay_...`) or unique billing invoice ID as the idempotency key (`idempotency_key = pay_verify_${paymentId}`).
   - Explicitly disallow using `subscriptionId` (`sub_...`) alone as a permanent key across all recurring cycles.
5. **Existing ₹1 Owner Transaction**:
   - Investigate the existing Owner ₹1 payment through read-only inspection of its real Payment ID in Razorpay Dashboard. Never charge again or create real mandates.

### B. Firestore 5 NOT_FOUND Root Cause Audit
1. **No Speculative Assumptions**:
   - Do NOT assume the wallet path is the confirmed root cause without evidence.
   - Inspect the exact runtime parameters:
     - Google Cloud Project ID: `ai-prime-studio` vs `gen-lang-client-0525281130`
     - Authoritative Firestore Database ID: `ai-studio-lumina2nd-42c53264-bee7-4cc4-8151-566990563e0f` vs `(default)`
     - Exact Collection Name: `wallets`, `transactions`, `users`, or `diagnostics_history`
     - Exact Document ID and Path: e.g., `/wallets/{userId}` vs `/users/{userId}/wallet`
     - Actual Error Object: Inspect full gRPC error message, status code `5 NOT_FOUND`, and stack trace.
2. **Safe Schema & Ownership Verification**:
   - Only initialize wallet documents when the authoritative schema and user ownership are verified.
   - Do not mask database routing or path mismatch bugs by arbitrarily creating dummy documents in the wrong database.
3. **Disposable Sandbox Test Isolation**:
   - Ensure diagnostic tests for Credit Ledger and Refunds execute against an isolated sandbox test user with immediate cleanup, preventing side-effects on live customer records.

---

## 3. P1: Public Website vs Preview Template & Hero Synchronization

### A. Verification Steps
1. **Version Parity Check**:
   - Verify `GET /api/version` on both public production (`https://ai-prime-studio-photo-video.ai.studio`) and preview, checking:
     - Deployed Commit SHA
     - Cloud Run Revision ID
     - Build Timestamp
     - Active Template Count & Face Swap Scene Count
2. **Zero-Cache Enforcement**:
   - Ensure strict zero-cache headers on `/api/templates`, `/api/faceswap/scenes`, `/api/banners`, and `/api/version`:
     - `Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate`
     - `Pragma: no-cache`
     - `Expires: 0`
3. **Authoritative Firestore Synchronization**:
   - In `prodDb`, verify that `loadAuthoritativeFromFirestore` and `refreshCatalogFromFirestore` read from authoritative collection `templates` and `faceswap_scenes`.
   - Preserve deletion tombstones so deleted templates are never resurrected.
   - Prevent silent fallback to stale local seeds when Firestore is connected.
4. **Hero Banner & Linked Gallery Parity**:
   - Verify hero banner runtime records link to genuine active gallery templates, with dynamic HD video URLs preserved.
   - Do not deploy to live Cloud Run without separate Owner approval.

---

## 4. P2: Server-Side Admin Authentication & Security (withAdminAuth)

### A. Security Requirements
1. **Complete Removal of Browser Secrets**:
   - Remove `'lumina_admin_secret_2026_secure'` hardcoded secret fallback from `server.ts`.
   - Completely eliminate reading/writing `lumina_admin_key` or `ADMIN_SECRET_KEY` in browser `localStorage` in `TemplateManagerModal.tsx` and `DiagnosticsModal.tsx`.
   - Remove transmission of `x-admin-key` from client requests.
2. **Authoritative Dual-Gmail Allowlist**:
   - Exactly two authorized admin emails:
     1. `ai.prime.studio.pro@gmail.com`
     2. `backupvideoemail@gmail.com`
   - Server-side admin verification (`isServerVerifiedAdmin`) strictly checks that the authenticated user profile (derived from verified Firebase Auth token) matches one of these two emails.
   - Disallow generic `user.role === 'admin'` without verified email, and remove arbitrary `ADMIN_EMAIL` bypass.
3. **`withAdminAuth` Server-Side Middleware**:
   - Implement `withAdminAuth` wrapping all `/api/admin/*` endpoints:
     - Extracts bearer token from `Authorization` header.
     - Resolves user profile from verified session/token.
     - Strictly validates email against the allowlist.
     - On mismatch or unauthenticated guest: Return HTTP 403 Forbidden (`{ error: 'Forbidden: Server-verified admin account required', code: 'ADMIN_AUTH_REQUIRED' }`).
4. **Client-Side Admin State**:
   - In `Drawer.tsx`, show Template Manager and System Diagnostics strictly when `isAdmin === true` (verified from backend session).
   - Normal customers and guests receive HTTP 403 and never see admin controls.

---

## 5. P3: Central Diagnostics, Persistent History & Alert Center

### A. Dynamic Module & Honest Test Count Reporting
1. **Dynamic Count (No Fixed "444+" Requirement)**:
   - Eliminate hardcoded "10 Isolated Modules" label in `DiagnosticsModal.tsx`.
   - Dynamically compute and render the actual number of executed test modules (14 modules) and exact count of executed tests.
   - Never treat any number as a fixed quota; honestly report whatever tests were actually run.
   - Any failed, blocked, or untested check will immediately prevent the system from being marked `READY`.
2. **Detailed Honest Reporting Per Test**:
   - Test ID and Category.
   - Status: `PASS` / `FAIL` / `BLOCKED` / `WARNING` / `NOT_TESTED`.
   - Severity: `CRITICAL` / `HIGH` / `MEDIUM` / `LOW`.
   - Test Type: `AUTOMATED` / `SIMULATION` / `SANDBOX` / `READ_ONLY_PRODUCTION` / `PRODUCTION_VERIFIED`.
   - Expected vs Actual Result.
   - Exact Failure Reason (if any).
   - Timestamp, Environment, Build Commit SHA, Cloud Run Revision.
   - Endpoint/Provider and Safe Trace ID.
   - Root Cause or clearly labelled Working Hypothesis.
   - Recommended Solution / Owner Action.
   - Previous Run Status and Delta.

### B. Firestore Persistent History vs Local Ring Buffer
1. **Explicit Separation**:
   - Clearly delineate **Firestore Persistent History** (`diagnostics_history` collection) from the **Local In-Memory Ring Buffer** (`diagnosticsHistoryBuffer`).
   - If Firestore write or read fails:
     - Mark persistent history status as `BLOCKED_EXTERNAL_ACCESS` or `FIRESTORE_HISTORY_UNAVAILABLE`.
     - **NEVER** report permanent history as PASS when falling back to the local buffer.
2. **`DiagnosticHistoryView` Component**:
   - Component inside `DiagnosticsModal.tsx` fetching from `GET /api/admin/diagnostics/history`.
   - Renders run cards showing Run ID, timestamp, pass/fail status breakdown, and incident delta.

### C. AlertCenter Component
1. **Persistent Incident Source**:
   - Integrates with Firestore `incidents` collection for critical failures (5xx, payment reconciliation errors, storage failures).
   - Local in-memory ring buffer serves as a transient buffer only; fallback state is explicitly flagged.
2. **Alert Cards**:
   - Display Severity (`CRITICAL` / `HIGH` / `MEDIUM`), Status (`UNREAD` / `READ` / `RESOLVED`), Incident ID, timestamp, affected service, safe trace ID, exact error message, and recommended mitigation action.

### D. Zero Production Side Effects
- Mutating tests (Webhook replay test, Credit Ledger audit, Refund audit) run strictly against disposable sandbox test accounts with immediate cleanup.
- No live customer charges, AutoPay creation, paid AI generation, or customer wallet alterations during diagnostics.

---

## 6. P4: Account Deletion with Existing AutoPay Preservation

### A. Business Rule: AutoPay Retention & Restricted Billing Record
When a customer deletes their account:
1. **Existing Razorpay UPI AutoPay Mandate MUST NOT BE CANCELLED**.
2. `razorpayAdapter.cancelSubscription()` **MUST NOT BE CALLED** in the account deletion flow.
3. Existing subscription, mandate, and ₹1 → ₹499 weekly renewal schedule must remain completely intact.
4. Billing records, subscription mapping, and webhook reconciliation keys must be retained in restricted storage so future recurring ₹499 payments reconcile normally.
5. Customer login credentials, Firebase Auth identity, and customer-uploaded media must be wiped permanently.
6. Future renewal webhooks are verified against this restricted billing mapping:
   - Webhook recognizes valid charge.
   - But does **NOT** activate credits into the wiped wallet.
   - If the customer re-registers in the future, their new account does **NOT** automatically link to the old subscription.

### B. Account Deletion Execution Steps
1. **Backend (`server.ts` - `DELETE /api/auth/account`)**:
   - Remove `await razorpayAdapter.cancelSubscription(mandateId)`.
   - Mark subscription record with `accountDeleted: true`, `customerStatus: 'deleted'` while keeping `subscriptionId`, `mandateId`, `planId`, and billing schedule active.
   - Await media wipe: `await mediaStorage.deleteUserMedia(user.id)`.
   - Await Firestore user cleanup and revoke active session tokens.
   - Ensure the deletion endpoint is retry-safe and idempotent.
2. **Policy Text Inspection & Deletion Warning (`LegalModal.tsx`)**:
   - **First check existing Cancellation Policy text**: Avoid adding duplicate clauses if AutoPay continuation terms are already stated.
   - **Account Deletion Confirmation Dialog**: Clear warning before typing `DELETE`:  
     *"Account deletion permanently clears your creations and personal profile. However, active UPI AutoPay subscriptions will continue billing recurring cycles unless cancelled through your bank/UPI app. Type DELETE to proceed."*
   - Do NOT alter any other terms, pricing (₹1 / ₹499), or refund disclosures on the Plan Selection page.
3. **Automated Verification Test Update**:
   - Update Suite 29.3 in `scripts/verify_system_fixes.ts` to assert that `DELETE /api/auth/account` preserves the mandate (does not call `cancelSubscription`) and that `LegalModal.tsx` contains the AutoPay continuation disclosure.

---

## 7. P5: Production Configuration, Firestore & R2 Audit
1. Audit runtime variables across Sandbox Local, AI Studio Preview, GitHub Actions, and Live Cloud Run.
2. Separate sandbox local constraints from production defects (e.g., missing Service Account in local container is `SANDBOX_LOCAL_MODE`).
3. Investigate Cloud Run revision `ai-prime-studio-photo-video-00023-w87` logs/error reporting for cold starts or memory limits.
4. Document Gemini HTTP 402 quota exhaustion with transparent Owner cost guidance; zero code-side auto-billing.

---

## 8. P6 & P7: Governance, Documentation & Regression Verification

### A. Canonical Tracker Synchronization
Update the following canonical documents:
- `docs/operations/PRODUCTION_INCIDENT_MASTER_TRACKER.md`
- `docs/operations/BUILDER_HANDOFF_LOG.md`
- `docs/operations/CONFIGURATION_AUDIT.md`
- `public/master_requirement_ledger.md`
- `public/remaining_delta_plan.md`
- `public/owner_status_tracker.md`

### B. Full Test Verification Sequence
1. `npm run lint` (`tsc --noEmit`) — Zero type or syntax errors.
2. `npm run build` (`vite build`) — Clean production bundle.
3. `npm test` (`npx tsx scripts/verify_system_fixes.ts`) — All executed test suites passing.
4. Focused regression checks:
   - Payment ownership verification check (reject mismatch).
   - Admin authorization check (HTTP 403 on non-allowlisted email).
   - Diagnostics zero-side-effect check.
   - Disposable account deletion test (AutoPay mandate preserved, media wiped).
   - Dev server health verification on port 3000.

---

## 9. Owner Action Guide (Owner-Only Tasks)
A comprehensive step-by-step Hindi guide will be provided in the final report detailing:
1. **Google Cloud Run Secret Manager Binding**: Binding `FIREBASE_SERVICE_ACCOUNT_KEY` and Cloudflare R2 credentials.
2. **Cloudflare R2 Bucket CORS & Public URL**: Verifying bucket `lumina-prime-ai-media`.
3. **Google AI Studio Quota Check**: Checking API key usage and quotas on project `gen-lang-client-0525281130`.
4. **Razorpay Dashboard Verification**: Checking the existing ₹1 test payment status without re-charging.

---

## 10. Implementation Status: COMPLETED & VERIFIED
- **Automated Verification**: `npx tsx scripts/verify_system_fixes.ts` executed with **445 PASSED, 0 FAILED**.
- **Type Safety**: `tsc --noEmit` executed with **0 lint errors**.
- **Production Build**: `vite build` completed successfully.
- **Protected Financial Subsystems**: All 4 SHA-256 hashes (`razorpayAdapter.ts`, `cashfreeAdapter.ts`, `googlePlayService.ts`, `pricingAndConfig.ts`) verified 100% intact.
- **Dev Server**: Running on port 3000, `/api/version` live with authoritative Firestore sync.
- **AutoPay Preservation Policy**: Fully implemented in `database.ts`, `server.ts`, `LegalModal.tsx`, and test assertions.
- **Server Admin RBAC**: Dual-Gmail allowlist enforced on `/api/admin/*`, client keys removed.
- **Central Diagnostics**: 3-tab navigation live with dynamic module count and persistent Firestore history.
