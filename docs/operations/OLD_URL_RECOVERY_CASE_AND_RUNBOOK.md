# AI Prime Studio — Old Public URL Recovery Technical Case, Owner Audit Checklist & Conditional Rollback Runbook

**Target Public URL:** `https://ai-prime-studio-photo-video.ai.studio`  
**Current Sandbox Applet ID (Unverified as Published Owner until Step 1):** `42c53264-bee7-4cc4-8151-566990563e0f`  
**Existing Production Cloud Run:** Project `gen-lang-client-0525281130` (`221269328833`) · Service `ai-prime-studio-photo-video` · Region `asia-southeast1`  
**Authoritative Firebase / Firestore:** Project `ai-prime-studio` (`855598524398`) · Database `(default)`  
**Authoritative Storage:** Cloudflare R2 Bucket `lumina-prime-ai-media`  
**Verification Script:** `npx tsx scripts/verify_public_url_recovery.ts` (strictly read-only)

---

## 1. Verified Technical Evidence (Zero-Guessing Baseline)

Live read-only verification proved the following facts about `https://ai-prime-studio-photo-video.ai.studio`:

1. **Old Public URL is 100% LIVE (Not Deleted / Not Broken):**
   - `GET https://ai-prime-studio-photo-video.ai.studio/` → `HTTP/2 200 OK` (`AI Prime Studio - AI Video & Photo Creator`, `last-modified: Wed, 18 Nov 2026 11:13:04 GMT`).
   - Primary JS bundle `/assets/index-GupXvNt3.js` → `HTTP/2 200 OK`.
   - `GET /api/version`, `GET /api/banners`, `GET /api/templates` → all `HTTP/2 200 OK`, connected to Firestore `ai-prime-studio/(default)` (`databaseMode: firestore_authoritative`, `databaseGuardBlocked: false`, 8 templates, 9 FaceSwap scenes).
2. **Exact Hosting & DNS Proof:**
   - `ai-prime-studio-photo-video.ai.studio` and `ai-prime-studio-photo-video-221269328833.asia-southeast1.run.app` resolve to the **exact same 8 Google Cloud Run Singapore (`asia-southeast1`) Frontend IPs**: `34.143.72.2` – `34.143.79.2`.
   - Wildcard TLS certificate (`CN=ai.studio`, `SAN=DNS:ai.studio, DNS:*.ai.studio`, issued by `Google Trust Services WE2`) is valid from `Nov 3 2026` to `Jan 26 2027`.
   - Both endpoints return the identical Cloud Run revision: **`ai-prime-studio-photo-video-00036-h5r`**.
3. **Why Application Source Code Cannot Unlock AI Studio Publish Wizard:**
   - Revision `00036-h5r` is an older pre-hardening build (missing newer `sanitizedGuard` / `verifiedGithubBaselineSha` fields on `/api/version`).
   - The inability to select `ai-prime-studio-photo-video.ai.studio` inside the AI Studio Publish Wizard is caused by **Google AI Studio's internal Applet ↔ GCP Project ↔ `.ai.studio` publishing association** (the Publish Wizard is currently locked to display name `AI Prime Studio`, whereas the live `.ai.studio` domain is actively bound to `gen-lang-client-0525281130` / `ai-prime-studio-photo-video`).
   - **No source code edit inside the repository can modify Google AI Studio's internal Publish Wizard project lock.**

---

## 2. Owner Read-Only Console Verification (Do First — Zero Mutations)

> **STRICT FREEZE:** Do **NOT** click Publish, Republish, Remix, Unpublish, Delete, Change Billing Account, or Import Projects during these checks.

### Step 1 — Identify Original Published Applet & Check Publish Panel
1. Open **Google AI Studio Apps (Created by you):** https://aistudio.google.com/apps
2. Check every **AI Prime Studio** app card for the **Globe Icon / App URLs** showing `ai-prime-studio-photo-video.ai.studio`.
3. Open that app and copy the exact **Applet ID** from the browser address bar. Compare it to `42c53264-bee7-4cc4-8151-566990563e0f`.
4. Perform a full browser **Hard Refresh (`Ctrl+Shift+R` / `Cmd+Shift+R`)**, open the identified Original App, and inspect its **Publish Panel** (read-only):
   - Is **`Republish`** available for `ai-prime-studio-photo-video.ai.studio`?
   - Which **Project Name** appears in the Publish Panel?

### Step 2 — Match All 3 GCP Project Display Names to Real Project IDs
1. Open **Cloud Resource Manager:** https://console.cloud.google.com/cloud-resource-manager
2. Record exact `Display Name` ↔ `Project ID` ↔ `Project Number` for:
   - `AI Prime Studio`
   - `Old Default Gemini Project`
   - `Default Gemini Project`
3. Confirm which name is **`gen-lang-client-0525281130`** (`221269328833`) and which is **`ai-prime-studio`** (`855598524398`).

### Step 3 — Inspect Cloud Run & Domain Mapping in Both Projects
- **`gen-lang-client-0525281130`:**
  - Service & Revisions: https://console.cloud.google.com/run/detail/asia-southeast1/ai-prime-studio-photo-video/revisions?project=gen-lang-client-0525281130
  - Networking: https://console.cloud.google.com/run/detail/asia-southeast1/ai-prime-studio-photo-video/networking?project=gen-lang-client-0525281130
  - Domain Mappings: https://console.cloud.google.com/run/domains?project=gen-lang-client-0525281130
  - Verify: `ai-prime-studio-photo-video-00036-h5r` has `100%` traffic, healthy status, and **Request-Based Billing** (`CPU is only allocated during request processing`).
- **`ai-prime-studio`:**
  - Cloud Run Services: https://console.cloud.google.com/run?project=ai-prime-studio
  - Domain Mappings: https://console.cloud.google.com/run/domains?project=ai-prime-studio

### Step 4 — Separate Read-Only Billing & Payment Profile Warning Audit
- `gen-lang-client-0525281130` Billing: https://console.cloud.google.com/billing/linkedaccount?project=gen-lang-client-0525281130
- `ai-prime-studio` Billing: https://console.cloud.google.com/billing/linkedaccount?project=ai-prime-studio
- Payment Profiles & Warnings: https://console.cloud.google.com/billing
- Record the exact text of the Payment Profile Warning and whether each project's billing account is `Active` or `Warning/Suspended`. **Do not switch or unlink billing accounts.**

---

## 3. Ready-to-Submit Google Support Technical Case (Use Only If Step 1 Shows No Valid Republish)

**Support Channels:**
- Google Cloud Support Cases: https://console.cloud.google.com/support/cases?project=gen-lang-client-0525281130
- Google AI Studio In-App Help: top-right `?` → **Send Feedback / Get Help**
- Google AI Developers Forum: https://discuss.ai.google.dev/

**Copy-Paste Technical Ticket (replace bracketed fields strictly with verified Step 1–4 facts):**

```text
Subject: Request to Restore AI Studio Publish Association for Existing Live .ai.studio URL (ai-prime-studio-photo-video.ai.studio)

Hello Google AI Studio / Google Cloud Support Team,

Our production application is currently live and healthy on its original AI Studio public URL,
but the AI Studio Publish Wizard no longer offers Republish to the existing URL and reports
it as unavailable due to a linked GCP project mismatch. We want to preserve the exact existing
public URL and existing Cloud Run service without remixing, unpublishing, or causing downtime.

Verified Production Details:
- Existing Public URL: https://ai-prime-studio-photo-video.ai.studio
- Verified Live Status: HTTP 200 on / and /api/version (TLS *.ai.studio valid Nov 3 2026 - Jan 26 2027)
- Verified DNS Parity: Resolves to identical Cloud Run asia-southeast1 IPs (34.143.72.2 - 34.143.79.2) as
  https://ai-prime-studio-photo-video-221269328833.asia-southeast1.run.app
- Active Cloud Run Service: ai-prime-studio-photo-video
- Active Cloud Run Region: asia-southeast1
- Active Cloud Run Revision: ai-prime-studio-photo-video-00036-h5r
- Hosting GCP Project ID / Number: gen-lang-client-0525281130 / 221269328833
- Authoritative Firebase/Firestore Project ID / Number: ai-prime-studio / 855598524398 (Database: (default))
- Current Sandbox Applet ID: 42c53264-bee7-4cc4-8151-566990563e0f
- Original Published Applet ID verified in Apps list: [FILL_FROM_STEP_1]
- Project Display Name / ID shown in Publish Wizard: [FILL_FROM_STEP_2]

Requested Action:
Please restore the AI Studio Publish / Republish association between our original Applet and
the existing live deployment/URL (https://ai-prime-studio-photo-video.ai.studio on project
gen-lang-client-0525281130, service ai-prime-studio-photo-video) without unpublishing,
deleting the Cloud Run service, or changing our Firebase/Firestore database (ai-prime-studio/(default)).

Thank you.
```

---

## 4. Conditional Backup Only — Pre-Deploy Backup, Canary Revision & Instant Rollback Runbook

> **DO NOT EXECUTE WITHOUT SEPARATE EXPLICIT OWNER APPROVAL.**
> Direct Cloud Run deployment does **NOT** guarantee restoring the AI Studio Publish Wizard UI association. It is documented strictly as a Conditional Backup with full configuration snapshot, zero-traffic canary verification, and instant rollback to `ai-prime-studio-photo-video-00036-h5r`.

### 4.1 Read-Only Configuration Backup (Safe to Run Anytime in Cloud Shell)
```bash
# 1. Export full existing Cloud Run service YAML (env vars, secrets, CPU throttling, memory, scaling)
gcloud run services describe ai-prime-studio-photo-video \
  --project=gen-lang-client-0525281130 \
  --region=asia-southeast1 \
  --format=yaml > backup-ai-prime-studio-photo-video-$(date +%Y%m%d-%H%M%S).yaml

# 2. Verify active revision, traffic split, and Request-Based Billing (cpu-throttling = true)
gcloud run services describe ai-prime-studio-photo-video \
  --project=gen-lang-client-0525281130 \
  --region=asia-southeast1 \
  --format="table(status.latestReadyRevisionName,status.traffic[].revisionName,status.traffic[].percent,spec.template.metadata.annotations['run.googleapis.com/cpu-throttling'])"

# 3. Export existing domain mappings (if any)
gcloud beta run domain-mappings list \
  --project=gen-lang-client-0525281130 \
  --region=asia-southeast1 \
  --format=yaml > backup-domain-mappings-$(date +%Y%m%d-%H%M%S).yaml
```

### 4.2 Zero-Traffic Canary Revision Procedure (ONLY After Separate Owner Approval)
1. Push verified code to GitHub `main` and confirm remote CI passes 100%.
2. Deploy to the **existing** service (`ai-prime-studio-photo-video`) in `gen-lang-client-0525281130` (`asia-southeast1`) with **`--no-traffic`**, **`--tag=canary`**, and **`--cpu-throttling`** (preserving Request-Based Billing and all existing env vars/secrets — never using `--clear-env-vars` or `--set-env-vars` destructively).
3. Run `TARGET_URL=https://canary---ai-prime-studio-photo-video-221269328833.asia-southeast1.run.app npx tsx scripts/verify_public_url_recovery.ts` and test login, templates, R2 playback, and one Gemini photo generation on the zero-traffic canary URL.
4. Only after canary passes 100%, shift traffic to the verified revision.

### 4.3 Instant 1-Command Rollback Plan (If Anything Regresses)
```bash
gcloud run services update-traffic ai-prime-studio-photo-video \
  --project=gen-lang-client-0525281130 \
  --region=asia-southeast1 \
  --to-revisions=ai-prime-studio-photo-video-00036-h5r=100
```

---

## 5. Reference Matrix — Exact Places Requiring Updates ONLY If a New URL Is Ever Forced

*(Reference only — no new URL is being created.)*

1. **Firebase Auth Authorized Domains** (`ai-prime-studio` → Authentication → Settings → Authorized domains)
2. **Google Cloud Web OAuth Client** (`855598524398-ljcakleqr4dgknkkhskp4kr9oph8o1a9` → Authorized JavaScript origins)
3. **Razorpay Webhooks** (`https://<NEW_URL>/api/razorpay/webhook`)
4. **Cloud Run Env Vars** (`APP_URL`, `PROD_SERVER_URL`, and if Play RTDN is active: `PUBSUB_AUDIENCE` / `RTDN_AUDIENCE`)
5. **Codebase Domain Constants** (`src/services/video/videoTrimmer.ts` trusted origin host list & `src/services/monitoring/cloudMonitoring.ts` `AUTHORITATIVE_CUSTOM_DOMAIN`)
6. **Android Builds & AssetLinks** (`android/app/build.gradle.kts`, `android-twa` `TWA_START_URL`, `public/.well-known/assetlinks.json`, new Play Console AAB)
7. **Cloudflare R2 CORS** (`lumina-prime-ai-media`, only if origin-restricted rather than `*`)
8. **Customer-Facing External Links** (Play Store listing, social bio links, bookmarks)

**Unchanged & Safe Regardless of URL:** Firestore `ai-prime-studio/(default)` customer data, wallets, templates, and all Cloudflare R2 media objects.
