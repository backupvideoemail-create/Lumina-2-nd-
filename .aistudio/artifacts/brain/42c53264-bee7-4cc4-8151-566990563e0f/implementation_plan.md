# Final Implementation Plan (Plan 12 — Execution Approved): AI Prime Studio Lumina — PWA & Android TWA Integration

## Executive Summary & Final Owner Authorization
This is the final, definitive execution plan for **AI Prime Studio Lumina PWA & Android TWA**. It integrates the Owner's two final requirements into the approved Plan 11 baseline:

1. **VERSION CODE REQUIREMENT**: Zero hardcoded assumption of Version Code 2. Any release build requires explicit verification of the highest Version Code already uploaded to Google Play Console for `com.aiprimestudio.app`, requiring the next available integer via `TWA_VERSION_CODE` before release bundling.
2. **NON-INVASIVE SHARED-ACCOUNT SYNCHRONIZATION TEST**: Dedicated automated verification suite testing:
   - Identical customer identity (Firebase UID) across Web, Chrome PWA, and TWA sessions.
   - 100% parity of User Plan, Wallet balance, Credits, and Generation History across platforms.
   - Bi-directional test-credit usage reflection (credit consumed on Web reflects on TWA; credit consumed on TWA reflects on Web).
   - Zero modification to existing Authentication, Firestore, or Wallet business logic to run this test.
3. **STRICT ISOLATION & PRESERVATION**:
   - Live public Website and Razorpay payment flows remain 100% operational on Web and Chrome PWA.
   - Only Play-distributed TWA disables checkout (neutral notice: *"Purchases are currently unavailable in this app. Existing credits can still be used."*).
   - Digital Asset Links held in strict `PENDING_PLAY_CONSOLE_FINGERPRINT` status.
   - Dual release artifacts (`app-release-signed.apk` and `app-release-bundle.aab`) built exclusively from `android-twa/` with verified upload keystore signatures.
   - Native `android/` project and `.github/workflows/android-build.yml` remain 100% untouched.

---

## 1. Environment & Architecture Matrix

```
┌───────────────────────────────────────────────────────────────────────────────────┐
│                               AI PRIME STUDIO RUNTIME                             │
├───────────────────────────────┬───────────────────────────────┬───────────────────┤
│       A. NORMAL WEBSITE       │     B. CHROME-INSTALLED PWA   │  C. PLAY STORE TWA│
│          (Desktop/Mobile)     │      (Android / Desktop PWA)  │   (Play Store App)│
├───────────────────────────────┼───────────────────────────────┼───────────────────┤
│ • Full Video/Photo Synthesis  │ • Full Video/Photo Synthesis  │ • Full Synthesis  │
│ • Full Credit Usage           │ • Full Credit Usage           │ • Full Credit Use │
│ • Razorpay Top-Up ON          │ • Razorpay Top-Up ON          │ • Razorpay OFF    │
│ • Cashfree Top-Up ON          │ • Cashfree Top-Up ON          │ • Cashfree OFF    │
│ • ₹1 Intro & AutoPay ON       │ • ₹1 Intro & AutoPay ON       │ • Neutral Notice: │
│ • Browser Navigation          │ • Standalone App Window       │   "Purchases      │
│ • PWA Install Prompt Visible  │ • PWA Already Installed       │   unavailable.    │
│                               │                               │   Existing credits│
│                               │                               │   usable."        │
├───────────────────────────────┴───────────────────────────────┴───────────────────┤
│                  SHARED AUTHORITATIVE BACKEND & DATA LAYER                        │
│ • 1 Firebase UID → 1 User Profile → 1 Shared Wallet Balance → 1 Generation History│
│ • Real-time synchronization across Web, Chrome PWA, and Play Store TWA            │
└───────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Repository File Layout & Boundaries

```
Lumina Repository Root
├── android/                          [STRICTLY PRESERVED - Native Kotlin/Compose project]
├── .github/workflows/
│   ├── android-build.yml             [STRICTLY PRESERVED - Native Android CI]
│   └── twa-build.yml                 [NEW - Standalone TWA CI build: dual APK + AAB]
├── android-twa/                      [NEW - Isolated Bubblewrap-standard TWA project]
│   ├── build.gradle
│   ├── settings.gradle
│   ├── gradle.properties
│   └── app/
│       ├── build.gradle              (applicationId: com.aiprimestudio.app, mandatory TWA_START_URL & TWA_VERSION_CODE)
│       └── src/main/
│           └── AndroidManifest.xml   (TWA Launcher Activity bound to verified TWA_START_URL)
├── public/
│   ├── manifest.webmanifest          [NEW - PWA Manifest with id: "/"]
│   ├── sw.js                         [NEW - Whitelist-only, zero-HTML-cache Service Worker]
│   ├── icons/                        [NEW - Exact geometry icons from Logo.tsx]
│   │   ├── icon-192.png
│   │   ├── icon-512.png
│   │   ├── icon-maskable-512.png
│   │   └── apple-touch-icon.png
│   └── .well-known/
│       └── assetlinks.json.example   [NEW - Clean template for Owner Play Signing SHA-256]
├── src/
│   ├── utils/
│   │   └── twaDetection.ts           [NEW - Strict positive-only Android TWA referrer detection]
│   ├── components/
│   │   ├── TopUpModal.tsx            [MODIFIED - Guard checkout actions when in TWA]
│   │   ├── PlansModal.tsx            [MODIFIED - Guard checkout actions when in TWA]
│   │   └── TemplateDetailModal.tsx   [MODIFIED - Guard top-up trigger when in TWA]
│   └── main.tsx                      [MODIFIED - Safe production SW registration]
└── scripts/
    └── verify_system_fixes.ts        [MODIFIED - Suite 28: PWA, TWA, Shared-Account Parity & Financial Integrity]
```

---

## 3. Step-by-Step Implementation Sequence

### Step 1: PWA Assets & High-Fidelity App Icons
1. Render exact PNG icon assets (`public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/icon-maskable-512.png`, and `public/icons/apple-touch-icon.png`) using the SVG geometry from `src/components/Logo.tsx` (gold camera viewfinder brackets, optical aperture ring, golden video play triangle, AI brilliance star).
2. Create `public/manifest.webmanifest`:
   - `id`: `"/"`
   - `start_url`: `"/"`
   - `scope`: `"/"`
   - `display`: `"standalone"`
   - `background_color`: `"#08080a"`
   - `theme_color`: `"#08080a"`
   - `icons`: References to generated icons.
3. Update `index.html` with `<link rel="manifest" href="/manifest.webmanifest">` and `<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">`.
4. Ensure public HTTPS routes in `server.ts` serve `manifest.webmanifest` and `icons/*` without authentication, login redirects, or HTML fallbacks.

### Step 2: Ultra-Safe Whitelist-Only Service Worker (`public/sw.js`)
1. Implement `public/sw.js` with zero precaching of HTML (`/`).
2. Allowlist only `/icons/*` and same-origin versioned `/assets/*.{js,css}`.
3. Ensure all navigation requests (`mode === 'navigate'`), all `/api/**` calls, uploads, payments, and generated media bypass the service worker directly to the network.
4. Safely register service worker in `src/main.tsx` for production environments.

### Step 3: Complete Payment Entry Audit & TWA Referrer Detection
1. Implement `src/utils/twaDetection.ts`:
   - Checks `document.referrer.startsWith('android-app://com.aiprimestudio.app')`.
   - Persists only positive TWA verification in `sessionStorage.setItem('lumina_twa_verified', 'true')`.
   - Returns `false` for normal Web and Chrome-installed PWA (`standalone` mode).
2. Audit and guard all payment entry points across the repository:
   - `src/components/TopUpModal.tsx`: When `isPlayStoreTWA() === true`, hide Razorpay top-up button and render: *"Purchases are currently unavailable in this app. Existing credits can still be used."*
   - `src/components/PlansModal.tsx`: When `isPlayStoreTWA() === true`, hide subscription and AutoPay buttons; render neutral notice.
   - `src/components/TemplateDetailModal.tsx`: When `isPlayStoreTWA() === true` and balance is insufficient, disable purchase redirect; render neutral notice.
   - Normal Web & Chrome PWA: Full Razorpay/Cashfree checkout remains 100% active.

### Step 4: Isolated `android-twa/` Project (Fail-Closed Origin & Versioning)
1. Scaffold `android-twa/` using Google Android Browser Helper standards.
2. In `android-twa/app/build.gradle`:
   - **Mandatory `TWA_START_URL` Check**: If building release and `TWA_START_URL` is empty or invalid HTTPS, throw `GradleException` immediately.
   - **Mandatory `TWA_VERSION_CODE` Check**:
     ```groovy
     def rawCode = project.findProperty('TWA_VERSION_CODE') ?: System.getenv('TWA_VERSION_CODE')
     if (isBuildingRelease && (!rawCode || rawCode.toString().toInteger() < 2)) {
         throw new GradleException("CRITICAL RELEASE ERROR: TWA_VERSION_CODE must be verified against Play Console and explicitly set (>= 2). Got: '${rawCode}'.")
     }
     ```
   - **Configurable Version Name**: Supports `project.findProperty('TWA_VERSION_NAME')` or env var `TWA_VERSION_NAME`, defaulting to `"1.0.1"`.
   - Configure release signing block to strictly require `release.keystore` (never sign release artifacts with debug key).

### Step 5: Dedicated CI Workflow (`.github/workflows/twa-build.yml`)
1. Create `.github/workflows/twa-build.yml`:
   - Reuses existing secrets: `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`, `TWA_START_URL`, `TWA_VERSION_CODE`.
   - Runs `android-twa/gradlew assembleRelease` to produce `app-release-signed.apk`.
   - Runs `android-twa/gradlew bundleRelease` to produce `app-release-bundle.aab`.
   - Runs `apksigner verify --print-certs` on the APK and `keytool` on the keystore, verifying matching SHA-256 fingerprints.
   - Uploads both `app-release-signed.apk` and `app-release-bundle.aab` as downloadable GitHub Actions artifacts.
   - Completely independent from `.github/workflows/android-build.yml`.

### Step 6: Automated Verification & Shared-Account Synchronization Suite (Suite 28)
1. Add Suite 28 to `scripts/verify_system_fixes.ts`:
   - 28.1 Validate `manifest.webmanifest` syntax, `id: "/"`, `display: "standalone"`.
   - 28.2 Validate `public/sw.js` network-only passthrough for `/api/` and HTML.
   - 28.3 Validate `twaDetection.ts` behavior (Web = false, Standalone PWA = false, TWA referrer = true).
   - 28.4 **Shared-Account Synchronization**:
     - Verify identical Firebase UID identity between simulated Web and TWA client contexts.
     - Verify shared wallet balance and credit consumption reflection without separate account creation.
     - Verify creation history accessibility from both client representations.
   - 28.5 Verify all 4 protected payment file SHA-256 hashes match baseline:
     - `src/services/payments/razorpayAdapter.ts`
     - `src/services/payments/cashfreeAdapter.ts`
     - `src/services/billing/googlePlayService.ts`
     - `src/services/config/pricingAndConfig.ts`
   - 28.6 Verify native `android/` directory and `.github/workflows/android-build.yml` are unchanged.
   - 28.7 Verify `android-twa/` fails closed when `TWA_START_URL` or `TWA_VERSION_CODE` is empty.
2. Run `npx tsc --noEmit` and `npx tsx scripts/verify_system_fixes.ts`.

---

## 4. Verification & Evidence Reporting Protocol

| Verification Stage | Check | Reporting Standard |
|:---|:---|:---|
| **TypeScript & Build** | `npx tsc --noEmit && npm run build` | Actual compilation status with 0 errors |
| **Automated Suite** | `scripts/verify_system_fixes.ts` (Suite 1-28) | Report exact count of passing tests |
| **Shared Account Sync**| Web ↔ TWA parity test | 1 UID, 1 Wallet, 1 History, bi-directional credit sync |
| **Financial Integrity** | 4 Protected SHA-256 hashes | Exact hash match confirmation |
| **Native Android Tree** | `git status android/` & `android-build.yml` | 0 modifications confirmed |
| **TWA Artifacts** | `app-release-signed.apk` & `app-release-bundle.aab` | File sizes, SHA-256 certificate fingerprints |
| **Digital Asset Links** | Status in documentation & config | Explicitly marked `PENDING_PLAY_CONSOLE_FINGERPRINT` |
| **Web Regression** | Normal Web + Chrome PWA Razorpay checkout | Confirmed operational without disruptions |
