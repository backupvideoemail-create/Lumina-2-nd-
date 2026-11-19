# AI PRIME STUDIO — CONFIGURATION & ENVIRONMENT AUDIT (RECONCILED)
**Repository:** `backupvideoemail-create/Lumina-2-nd-`  
**Verified Main Baseline:** `1ee049a00d241ca9c3f26a1d2a7f7e9d6dcf6047`  
**Cloud Run Service:** `ai-prime-studio-photo-video` (`asia-southeast1`, hosted in legacy GCP project `gen-lang-client-0525281130`)  
**Public App URL:** `https://ai-prime-studio-photo-video.ai.studio`  
**Reconciliation Date:** 2026-11-19  

---

## 1. Authoritative Target Reconciliation (Supersedes 2026-11-08 Audit)

> **Notice:** Earlier 2026-11-08 notes mentioning named Firestore database `ai-studio-lumina2nd-...` or treating `gen-lang-client-0525281130` as the application's Firestore/Auth project are **SUPERSEDED**.

- **Authoritative Customer Database & Auth Project:** `ai-prime-studio`
- **Authoritative Firestore Database ID:** `(default)` (legacy named databases are strictly blocked by `src/services/db/database.ts`)
- **Authoritative Cloudflare R2 Bucket:** `lumina-prime-ai-media` (strictly preserved; zero bucket creation or migration)
- **Legacy Cloud Run Hosting & Android Identity:** `gen-lang-client-0525281130` / Project Number `221269328833` / Package `com.aiprimestudio.app` (preserved intentionally so the public URL and Android builds do not break)

---

## 2. Runtime Environment Inventory

| Variable Name | Required Scope | Sandbox Local Status | Live Cloud Run Target Status | Notes / Action |
|:---|:---|:---|:---|:---|
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Backend (`ai-prime-studio`) | Configured (bound to `ai-prime-studio`) | Secret Manager Recommended | Must belong strictly to `ai-prime-studio`; fail closed if missing/mismatched `project_id` |
| `FIRESTORE_DATABASE_ID` | DB Guard | `(default)` | `(default)` (Live on rev `00036-h5r+`) | Must be unset or exactly `(default)` |
| `R2_BUCKET_NAME` | Storage | Env-dependent | `lumina-prime-ai-media` | Never modify or create alternate buckets |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Storage | Env-dependent | Secret Manager Recommended | Migrate from plain Cloud Run env vars to Secret Manager & rotate cleanly |
| `GEMINI_API_KEY` | AI Photo & Omni 1.2 Video | Env-dependent | Secret Manager Recommended | Powers `geminiAdapter` + `videoProviderAdapter` (`gemini-omni-1.2-flash`) |
| `HIGGSFIELD_API_KEY` | Face Swap | Optional / Gated | Optional Secret Manager | Customer generation gated until `ENABLE_GENJUTSU_CUSTOMER_GENERATION=true` |
| `RAZORPAY_*` / `ADMIN_SECRET_KEY` | Payments & Admin | Env-dependent | Secret Manager Recommended | Protect razorpay/cashfree/admin secrets in Secret Manager |
| `AUTHORIZED_ADMIN_EMAILS` | Admin Auth | `src/config/adminConfig.ts` | Authoritative code config | `backupvideoemail@gmail.com`, `ai.prime.studio.pro@gmail.com` |

---

## 3. Security & Secret Manager Hardening Directives
1. **Staged Secret Manager Migration**: Bind sensitive credentials (`FIREBASE_SERVICE_ACCOUNT_KEY`, `GEMINI_API_KEY`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `ADMIN_SECRET_KEY`) via Google Cloud Secret Manager (`--set-secrets`) on `ai-prime-studio-photo-video`, verify live health on the new revision, then remove duplicate plain-text env vars (`--remove-env-vars`).
2. **Staged Credential Rotation**: Rotate previously screenshot-exposed keys one service at a time (R2 token, Gemini API key, Razorpay secret if exposed, Firebase Service Account private key) only AFTER confirming the new Secret Manager version resolves cleanly.
3. **No Speculative Missing Claims**: Missing external secrets inside the isolated sandbox container never override verified live Cloud Run bindings.
