# Android & Google Play Store Public Release Implementation Plan (Final Master Revision)

Engineering specification to release AI Prime Studio (`com.aiprimestudio.app`) on Google Play Store with Android 16 (API 36) compliance, Android Gradle Plugin 8.9.1, Gradle Wrapper 8.11.1, Google Play Billing 8.0.0, the exact locked product catalog, full billing lifecycle & RTDN handling, Google OAuth -> Firebase ID Token exchange, dual Firebase configuration preservation, dedicated release keystore CI signing, and zero-touch preservation of all existing Web features, pricing models, and templates.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> **Preserved Locked Product IDs & Subscription Economics**
> The product IDs and business economics are verified against `server.ts` and `src/config/subscriptionConfig.ts` and locked without modification:
> - **Subscriptions**:
>   - `sub_double_bonanza_weekly`: ₹1 intro for 24h (40 credits), then ₹499 weekly auto-renewal (400 credits).
>   - `sub_weekly_creator`: ₹199 / 7 days (230 credits). *(Resolved: Not "sub_weekly")*.
>   - `sub_monthly_creator`: ₹998 / 30 days (1200 credits). *(Resolved: Not "sub_monthly")*.
> - **In-App Consumables (Top-Ups)**:
>   - `topup_49`: ₹49 for 45 credits.
>   - `topup_99`: ₹99 for 95 credits.
>   - `topup_199`: ₹199 for 200 credits.
>   - `topup_399`: ₹399 for 420 credits.
> - **Zero-Touch Rule**: No prices, credit amounts, validities, renewal cycles, or introductory offers will be changed.

> [!IMPORTANT]
> **Complete Google Play Billing 8.0.0 Lifecycle**
> - **Pending Purchases**: Enforce `PendingPurchasesParams`. When `purchaseState == PENDING`, app alerts user and strictly DOES NOT grant credits.
> - **Restore Purchases**: Query `queryPurchasesAsync` for both `INAPP` and `SUBS` on startup and via an in-app "Restore Purchases" button in Profile/Billing screens.
> - **Duplicate Protection & Idempotency**: Client deduplicates in-flight tokens; server checks `prodDb.getPayment(orderId)` and `prodDb.getPaymentByPaymentId(purchaseToken)` before crediting.
> - **Server Verification**: Client calls `POST /api/billing/googleplay/verify`. No client-side credit granting.
> - **Acknowledgement & Consumption**:
>   - Consumables: App calls `BillingClient.consumeAsync()` only AFTER backend returns `verified: true`.
>   - Subscriptions: App calls `BillingClient.acknowledgePurchase()` only AFTER backend confirmation.
> - **Real-Time Developer Notifications (RTDN)**: `POST /api/billing/googleplay/rtdn` processes Pub/Sub events for renewals, cancellations, and expirations with OIDC token validation.

> [!IMPORTANT]
> **Dual Firebase Configuration Preservation**
> - Both configurations are verified present in workspace:
>   1. `android/app/google-services.json` configured for package `com.aiprimestudio.app`.
>   2. `android/app/src/debug/google-services.json` configured for package `com.aiprimestudio.app.debug`.
> - Git tracking rules in `.gitignore` strictly preserve these files (`!android/app/google-services.json`, `!android/app/src/debug/google-services.json`).
> - Verification protocol: GitHub sync diff will be audited before push to ensure the production JSON is never deleted.

> [!WARNING]
> **CRITICAL DECISION GATE: Backend Server URL & Fail-Safe Release Configuration**
> - **Development Server Verified**: Runtime inspection confirms `APP_URL=https://ais-dev-falbvqcbalccpvwe3g24he-788336175738.asia-east1.run.app` (`K_SERVICE=ais-dev-falbvqcbalccpvwe3g24he`). This is strictly a development/staging Cloud Run instance.
> - **NO Unverified Fallback**: All hardcoded placeholder URLs (including `api.aiprimestudio.com`) have been removed.
> - **Fail-Safe Release Enforcement**:
>   - **Debug Builds**: Default to `https://ais-dev-falbvqcbalccpvwe3g24he-788336175738.asia-east1.run.app`.
>   - **Release Builds**: Require an explicitly verified `PROD_SERVER_URL` via Gradle parameter (`-PPROD_SERVER_URL=...`) or CI environment variable (`PROD_SERVER_URL`). If missing, Gradle fails at build time: `"CRITICAL: Release build requires a verified 'PROD_SERVER_URL'. Refusing to build release bundle without a confirmed production endpoint."`
>   - **No Silent Fallback**: Release builds will NEVER silently fall back to the development server.

> [!IMPORTANT]
> **Android 16 (API 36) Toolchain Upgrade**
> - **Target SDK**: `targetSdk = 36` (Mandatory for Google Play submissions from August 31, 2026).
> - **Compile SDK**: `compileSdk = 36`.
> - **Android Gradle Plugin (AGP)**: Upgraded from 8.4.1 to **`8.9.1`** (Official AGP supporting Android 16 / API 36).
> - **Gradle Wrapper**: Upgraded from 8.6 to **`8.11.1`** (Compatible with AGP 8.9+).
> - **Dependencies**: `firebase-bom:33.1.0` + `firebase-auth-ktx` added to support the Google -> Firebase ID Token exchange.

> [!IMPORTANT]
> **Release Keystore & Google Play App Signing**
> - **Dedicated Release Keystore**: Standard production keystore configured with GitHub CI secret support (`KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`).
> - **Secret Protection**: Keystores (`*.keystore`, `*.jks`) and credential files are strictly ignored in `.gitignore` and never committed to source control.
> - **Play App Signing**: Project owner creates and backs up this permanent keystore securely for Google Play Console Play App Signing enrollment and future app updates.

---

### 1. Overview & Core Concept

AI Prime Studio (`com.aiprimestudio.app`) is a cinema-grade AI video and photo transformation suite for Android creators:

- **What It Does**: Native Android app enabling mobile creators to log in with Google (exchanged for Firebase ID Token), browse live cloud templates, upload high-resolution source photos, dispatch real AI generation jobs, poll status in real time, save completed results to their device gallery, and purchase credit top-ups or subscriptions via Google Play Billing 8.0.0.
- **Target Audience**: Mobile creators, Instagram reel influencers, and digital media agencies.
- **Key Value**: Native performance, server-authoritative billing, zero dummy UI, and total compliance with Google Play Developer Policies.

---

### 2. User Experience & Visual Design

#### Key User Flows
1. **Google Authentication & Secure Session**:
   - Creator taps "Sign in with Google" on ProfileScreen.
   - Android Credential Manager returns a Google OAuth ID Token (`googleIdToken`).
   - `AuthManager` signs into Firebase via `GoogleAuthProvider.getCredential(googleIdToken, null)` and `FirebaseAuth.signInWithCredential()`.
   - Acquires the authentic Firebase ID Token via `currentUser.getIdToken(true)`.
   - Transmits `firebaseIdToken` to `POST /api/auth/firebase-session`.
   - The backend validates the token against Google's Identity Toolkit, generating a durable session token.
   - Stored in Android EncryptedSharedPreferences and injected into the OkHttp `Authorization: Bearer <token>` interceptor.

2. **Template Catalog Browsing**:
   - `HomeScreen` executes `GET /api/templates`.
   - Deserialized into `TemplatesResponse(val templates: List<TemplateItem>)`.
   - Coil loads cached cover assets with graceful fallback.
   - Tapping a template navigates to `StudioScreen` passing template ID, title, and credit cost.

3. **Real End-to-End Generation Pipeline (No Dummy Placeholders)**:
   - **Step 1 (Picker)**: Creator selects an image using Android's native `ActivityResultContracts.PickVisualMedia`.
   - **Step 2 (Upload)**: Image is read as Base64 and sent to `POST /api/media/upload`, obtaining a server `fileId`.
   - **Step 3 (Pre-flight Credit Check)**: App verifies creator has sufficient balance. If insufficient, prompts to purchase credits.
   - **Step 4 (Submit Job)**: App calls `POST /api/generations/create` with `{ templateId, mediaFileId, customerPrompt }`, receiving `{ generationId, status: "pending" }`.
   - **Step 5 (Active Status Polling)**: App launches a coroutine polling `GET /api/generations/{id}/status` every 2.5 seconds, showing real progression (`pending` → `processing` → `completed`).
   - **Step 6 (Result Actions)**: Completed media is displayed with native "Save to Device" (`MediaStore`) and Android System Share Sheet.

4. **Complete Google Play Billing 8.0.0 Purchase & Subscription Flow**:
   - Products registered in Play Console:
     - Consumable Top-Ups: `topup_49`, `topup_99`, `topup_199`, `topup_399`.
     - Subscriptions: `sub_double_bonanza_weekly`, `sub_weekly_creator`, `sub_monthly_creator`.
   - `BillingManager` queries products via `BillingClient.queryProductDetailsAsync`.
   - User launches purchase flow with `BillingFlowParams`.
   - If purchase is in `PENDING` state: App displays "Payment processing by bank/Google Play" and does NOT grant credits.
   - Once state is `PURCHASED`, the app calls `POST /api/billing/googleplay/verify` with `{ purchaseToken, productId, orderId, isSubscription }`.
   - Backend cryptographically verifies the transaction with Google Play Developer API and increments credits in Firestore.
   - Upon verification success:
     - Subscriptions are acknowledged via `BillingClient.acknowledgePurchase`.
     - Consumables are consumed via `BillingClient.consumeAsync`.
   - In-app "Restore Purchases" button invokes `queryPurchasesAsync` and re-verifies active entitlements.

5. **Policy Compliance & Account Deletion**:
   - `ProfileScreen` contains an "Account Deletion" button.
   - Confirmation dialog clearly explains permanent deletion of wallet credits and media.
   - Confirming calls `DELETE /api/auth/account`.
   - Permanent external web link provided for Google Play Account Deletion compliance.
   - Generated result cards include a "Report Inappropriate Content" menu item calling `POST /api/reports`.

---

### 3. Key Product Decisions & Trade-Offs

1. **Two-Stage Google -> Firebase Token Exchange**:
   - *Chosen Approach*: Credential Manager Google ID Token is exchanged for a Firebase ID Token using Android Firebase Auth SDK before calling `server.ts`.
   - *Why*: Google Identity Toolkit `accounts:lookup` requires a Firebase ID Token, not a raw Google OAuth token. This ensures 100% cryptographic validity without modifying the server.
2. **Strict Release Backend Validation**:
   - *Chosen Approach*: Release builds fail at Gradle build-time if `PROD_SERVER_URL` is not provided.
   - *Why*: Prevents accidental release of an APK/AAB communicating with temporary sandbox instances or non-existent placeholder domains.
3. **AGP 8.9.1 & Gradle 8.11.1 for Target SDK 36**:
   - *Chosen Approach*: Upgrade root Gradle build to AGP 8.9.1 and Gradle 8.11.1.
   - *Why*: AGP 8.9.1 is engineered for Android 16 (API 36) compilation.
4. **Authoritative Server Billing Verification**:
   - *Chosen Approach*: Never trust client-reported purchases. All purchases must be verified by `server.ts` via Google Play Developer API before credits or subscriptions are activated.

---

### 4. Technical Architecture & Verified API Mapping

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   ANDROID APP (targetSdk 36 / PBL 8.0.0)                    │
│                                                                             │
│  ┌──────────────────┐   ┌────────────────────┐   ┌───────────────────────┐  │
│  │    HomeScreen    │   │    StudioScreen    │   │     ProfileScreen     │  │
│  │ (Templates Grid) │   │ (Pick/Upload/Poll) │   │ (Auth/Delete/Restore) │  │
│  └────────┬─────────┘   └─────────┬──────────┘   └───────────┬───────────┘  │
│           │                       │                          │              │
│  ┌────────▼───────────────────────▼──────────────────────────▼───────────┐  │
│  │                       AppRepository & ApiService                      │  │
│  │                                                                       │  │
│  │  1. GET    /api/templates                  -> { templates: [...] }     │  │
│  │  2. POST   /api/auth/firebase-session      -> { token, user, wallet } │  │
│  │  3. GET    /api/auth/me                    -> { user, wallet, plan }  │  │
│  │  4. POST   /api/media/upload               -> { fileId, url }         │  │
│  │  5. POST   /api/generations/create         -> { generationId, status }│  │
│  │  6. GET    /api/generations/:id/status     -> { generation: {...} }   │  │
│  │  7. DELETE /api/auth/account               -> { success: true }       │  │
│  │  8. POST   /api/reports                    -> { success: true }       │  │
│  │  9. POST   /api/billing/googleplay/verify  -> { success, balance }    │  │
│  └────────────────────────────────────┬──────────────────────────────────┘  │
│                                       │                                     │
│  ┌────────────────────────────────────▼──────────────────────────────────┐  │
│  │                 BillingManager (Play Billing Library 8.0.0)           │  │
│  │  - Consumables: topup_49, topup_99, topup_199, topup_399             │  │
│  │  - Subscriptions: sub_double_bonanza_weekly, sub_weekly_creator,     │  │
│  │                   sub_monthly_creator                                 │  │
│  │  - Pending purchase handling & Restore Purchases                      │  │
│  │  - Post-verification Acknowledgement & Consumption                    │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────┬─────────────────────────────────────┘
                                        │ HTTPS / Bearer Token
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     BACKEND (server.ts / Cloud Run)                         │
│                                                                             │
│  ┌───────────────────────────┐           ┌───────────────────────────────┐  │
│  │  Identity Toolkit Auth    │           │  Google Play Developer API    │  │
│  │  (Real ID Token Verifier) │           │  (Receipt Verify & RTDN)      │  │
│  └─────────────┬─────────────┘           └───────────────┬───────────────┘  │
│                │                                         │                  │
│  ┌─────────────▼─────────────────────────────────────────▼───────────────┐  │
│  │      Authoritative Cloud Firestore DB & Cloudflare R2 Storage         │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 5. Verified Command Execution Results & Status Separation

#### A. Verified Local Backend & Tooling Evidence
1. **Dev Server Restart**:
   - Tool: `restart_dev_server`
   - Result: `Dev server restarted successfully` on port 3000.
2. **TypeScript & Linter Check**:
   - Command: `npm run lint` (`tsc --noEmit`)
   - Exit Code: `0` (0 errors. All TypeScript types valid).
3. **Backend & Database Test Suite**:
   - Command: `npm test`
   - Exit Code: `0`
   - Output: `SYSTEM VERIFICATION SUMMARY: 195 PASSED, 0 FAILED` across all 20 test suites.
   *(Note: These 195 tests verify backend, Firestore transactions, template persistence, and API logic; they are NOT Android client E2E tests).*
4. **Environment & Server URL Audit**:
   - Command: `env | grep -E "APP_URL|K_SERVICE"`
   - Result: `APP_URL=https://ais-dev-falbvqcbalccpvwe3g24he-788336175738.asia-east1.run.app`, `K_SERVICE=ais-dev-falbvqcbalccpvwe3g24he`.
   - Classification: Development environment. Release build requires external `PROD_SERVER_URL`.

#### B. Android CI Build Status (Executed via GitHub Actions)
- **CI Workflow File**: `.github/workflows/android-build.yml`
- **Steps Tracked Separately**:
  1. `google-services.json` validation: Verifies client packages `com.aiprimestudio.app` and `com.aiprimestudio.app.debug`.
  2. Debug Build: `./gradlew assembleDebug` produces `app-debug.apk`.
  3. Release Build: `./gradlew bundleRelease` produces signed `app-release.aab` when `KEYSTORE_BASE64` is provided.
  4. Reporting: Debug APK status, Release AAB status, and signing status will be reported distinctly.

---

### 6. Implementation Workstreams

- **Workstream 1: Android Toolchain Upgrade (API 36 / AGP 8.9.1 / Gradle 8.11.1)**
  - Update `android/gradle/wrapper/gradle-wrapper.properties` to `gradle-8.11.1-bin.zip`.
  - Update `android/build.gradle.kts` to `com.android.application` version `8.9.1`.
  - Update `android/app/build.gradle.kts`:
    - `compileSdk = 36`, `targetSdk = 36`.
    - `billing-ktx:8.0.0`.
    - Add `firebase-bom:33.1.0` and `firebase-auth-ktx`.
    - Fail-safe `SERVER_URL` logic for release builds without fallback.
- **Workstream 2: Google -> Firebase ID Token Exchange in AuthManager**
  - Update `AuthManager.kt`:
    1. Receive `googleIdToken` from Credential Manager.
    2. Convert to `GoogleAuthProvider.getCredential(googleIdToken, null)`.
    3. Call `FirebaseAuth.getInstance().signInWithCredential()`.
    4. Call `currentUser.getIdToken(true)` to acquire real Firebase ID Token.
    5. Pass `firebaseIdToken` to `AppRepository.loginWithFirebaseSession()`.
- **Workstream 3: API Retrofit & Deserialization Layer**
  - Update `ApiService.kt` and `AppRepository.kt` to bind to verified `server.ts` routes (`TemplatesResponse`, `UploadMediaRequest/Response`, `CreateGenerationRequest/Response`, `GenerationStatusResponse`, `DeleteAccountResponse`).
- **Workstream 4: Real StudioScreen Generation Pipeline**
  - Implement Photo Picker (`ActivityResultContracts.PickVisualMedia`), Base64 upload to `/api/media/upload`, trigger `/api/generations/create`, coroutine polling on `/api/generations/:id/status`, and output media actions.
- **Workstream 5: Complete Google Play Billing 8.0.0 Lifecycle**
  - Update `BillingManager.kt`:
    - Correct product IDs: `sub_double_bonanza_weekly`, `sub_weekly_creator`, `sub_monthly_creator`, and `topup_49/99/199/399`.
    - Handle `Purchase.PurchaseState.PENDING` without crediting.
    - Implement restore purchases via `queryPurchasesAsync`.
    - In-flight deduplication.
    - Acknowledgement and consumption after server verification.
- **Workstream 6: ProfileScreen Account Deletion & Policy Links**
  - Implement delete account modal with call to `DELETE /api/auth/account`.
  - Add verified external policy and safety links.
- **Workstream 7: Firebase Config Preservation & Release Signing**
  - Verify and preserve `android/app/google-services.json` and `android/app/src/debug/google-services.json`.
  - Audit git diff before committing.
  - Update GitHub Actions release bundle workflow with fail-safe release URL requirements.
