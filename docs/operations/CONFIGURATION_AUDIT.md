# AI PRIME STUDIO LUMINA — CONFIGURATION & ENVIRONMENT AUDIT
**Repository:** `backupvideoemail-create/Lumina-2-nd-`  
**Current Approved Main Baseline:** `4a0aba4554131cb902240dc979db5f978ccef0fa`  
**Previous Verified Commit:** `1818df837de995635cf8344f821de871392cc10f`  
**Base Commit:** `8409287262d84e9621daf971e1cd30c88884ea3b`  
**Feature Branch:** `feature/secondary-hero-cache-sync`  
**Execution Environment:** Sandbox Container vs. Cloud Run Secret Manager  
**Audit Date:** 2026-11-08  

---

## 1. Runtime Environment Inventory

| Variable Name | Required Scope | Sandbox Local Status | Live Cloud Run Target Status | Action Required |
|:---|:---|:---|:---|:---|
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Backend | `MISSING (Local Mode)` | Secret Manager Binding | Owner binds GCP Service Account JSON in Cloud Run Secret Manager |
| `FIRESTORE_DATABASE_ID` | DB / Client | `ai-studio-lumina2nd-42c53264...` | Configured | Verified in `firebase-applet-config.json` |
| `RAZORPAY_KEY_ID` | Payments | `Configured in Live` | Configured in Secret Manager | Live key used on production website |
| `RAZORPAY_KEY_SECRET` | Payments | `Configured in Live` | Configured in Secret Manager | Live secret used for HMAC verification |
| `RAZORPAY_WEBHOOK_SECRET` | Payments | `Configured in Live` | Configured in Secret Manager | Live secret used for webhook verification |
| `R2_ACCOUNT_ID` | Storage | `MISSING (Local Disk Mode)` | Secret Manager Binding | Owner binds Cloudflare R2 Account ID in Secret Manager |
| `R2_ACCESS_KEY_ID` | Storage | `MISSING (Local Disk Mode)` | Secret Manager Binding | Owner binds Cloudflare R2 Access Key ID in Secret Manager |
| `R2_SECRET_ACCESS_KEY` | Storage | `MISSING (Local Disk Mode)` | Secret Manager Binding | Owner binds Cloudflare R2 Secret Access Key in Secret Manager |
| `R2_BUCKET_NAME` | Storage | `lumina-prime-ai-media` | Configured | Verified bucket name matches authoritative configuration |
| `GEMINI_API_KEY` | AI Model | `Configured on Live` | Configured in Secret Manager | Owner checks Google AI Studio / GCP billing quota (resolves 402) |
| `HIGGSFIELD_API_KEY` | Face Swap | `PENDING_CONFIG` | Optional | Required only if Higgsfield Genjutsu Light is enabled |
| `ADMIN_SECRET_KEY` | Admin API | `Configured on Live` | Configured in Secret Manager | Protects sensitive administrative endpoints |
| `AUTHORIZED_ADMIN_EMAILS` | Admin Auth | `Single Config Module` | Configured (`src/config/adminConfig.ts`) | Single allowlist: `backupvideoemail@gmail.com` and `ai.prime.studio.pro@gmail.com` |

---

## 2. Environment Policy Directives (AC-07)
1. **No Speculative Missing Claims**: Missing variables in the local build container are accurately documented as `SANDBOX_LOCAL_MODE` and are **not** falsely claimed to be missing in production Cloud Run.
2. **Zero Redundancy**: No duplicate Google Cloud projects, Cloud Firestore databases, or Cloudflare R2 buckets will be created. The existing project `gen-lang-client-0525281130` and bucket `lumina-prime-ai-media` remain strictly authoritative.
3. **No Automatic Paid Activation**: Quota exhaustions (such as Gemini HTTP 402) are clearly documented for the Owner. No paid billing will be enabled automatically by code.
