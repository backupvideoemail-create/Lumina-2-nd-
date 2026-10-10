# Google Play Store Release & Razorpay UPI AutoPay Architecture Plan

A comprehensive, production-grade architecture plan to release **AI Prime Studio** on the Google Play Store (`com.aiprimestudio.app`) using a Native Android Kotlin + Jetpack Compose app, unified Google Sign-In account balance synchronization, and an audited solution for web Razorpay UPI AutoPay recurring payments.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> The following core decisions were confirmed by you in Phase 1:
> - **Android Architecture**: Native Kotlin & Jetpack Compose app calling backend REST APIs.
> - **Cross-Platform Sync**: Unified account balance & credits synced via Google Sign-In across Web & Android.
> - **Google Play Package Name**: `com.aiprimestudio.app`.
> - **Google Play Console Account**: Using a different Gmail account for Play Console is 100% fine and has no technical conflict with Firebase or Razorpay.

---

## 1. Overview & Core Concept

### What It Delivers
1. **Google Play Console & Android App Project Structure**:
   - Complete Native Kotlin + Jetpack Compose Android client project (`android/`) tailored to `com.aiprimestudio.app`.
   - Google Sign-In integration authenticating to the backend, sharing identical user profiles, credit balances, and generated videos.
   - Dual-rail payment abstraction:
     - **Web**: Razorpay Subscriptions & UPI AutoPay (or fallback one-time UPI if merchant capabilities restrict recurring UPI).
     - **Android (Google Play)**: Google Play Billing Library (v6/v7) for in-app subscriptions and credit packs, compliant with Google Play policy.
2. **Web UPI AutoPay Root-Cause Resolution**:
   - Diagnostic analysis of why Razorpay checkout displayed Cards and E-Mandate instead of UPI AutoPay.
   - Elimination of checkout configuration blockers, customer registration compliance, and transparent merchant capability reporting.

### Target Audience & Persona
- Content creators, Instagram Reels influencers, and digital marketers seeking 1-click trending AI transformations both on mobile browsers and native Android devices.

---

## 2. User Experience & Visual Design

### Native Android & Web Dual Experience
- **Consistent Visual Identity**:
  - Dark cinematic aesthetic matching AI Prime Studio (`#07060b` obsidian background, `#ff9f00` amber gold primary accent, `#a855f7` neon violet flair).
  - Material 3 Design tokens on Android aligned with Tailwind CSS tokens on Web.
  - Full-bleed creator hero banners, touch targets $\ge 48\text{px}$, and seamless bottom navigation.
- **Unified Sign-In Flow**:
  - Web: Google One-Tap / Firebase Auth Google Provider.
  - Android: Google Credential Manager API -> ID Token passed to backend -> Firebase / Session token returned.
  - Credit balance, plan tier, and video library update in real-time across both platforms.

---

## 3. Key Product Decisions & Trade-Offs

### Decision 1: Google Play Console Account with Different Gmail
- **Analysis**: Google Play Console account does NOT need to match the Firebase admin or Razorpay email (`backupvideoemail@gmail.com`).
- **Mechanism**:
  - The Play Console app connects to Firebase via the Android App SHA-1/SHA-256 fingerprint registered in Firebase Console under `com.aiprimestudio.app`.
  - Google Cloud OAuth Web Client ID and Android Client ID authenticate users regardless of which Google account owns the Play Console.

### Decision 2: Google Play Policy Compliance on Payments
- **Policy Rule**: Google Play policies mandate that digital goods, subscriptions, and AI credits purchased inside an Android app downloaded from Google Play MUST use **Google Play Billing** (not external Razorpay checkout buttons inside the Android APK).
- **Architecture**:
  - Web uses `/api/payments/checkout/order` with Razorpay adapter.
  - Android client calls `/api/billing/googleplay/verify` using Google Play Billing purchase tokens.
  - Backend credit engine grants credits to the unified `userId` collection in Firestore.

### Decision 3: Razorpay Recurring UPI AutoPay Root Cause & Solution
- **The Issue**:
  - Razorpay merchant accounts require specific approval and bank aggregator routing for **UPI AutoPay** (`recurring.upi_autopay`).
  - When a merchant account only has one-time UPI enabled (`methods.upi = true`, but `methods.recurring.upi = false`), Razorpay's checkout modal automatically hides the UPI tab for recurring subscriptions and only displays Cards & E-Mandate (NetBanking/NACH).
- **The Technical Correction**:
  - Ensure customer registration (`customer_id` with 10-digit phone and email) is passed to `Razorpay(options)` as mandated by NPCI UPI AutoPay circulars.
  - Remove any legacy restrictive configuration blocks that override standard checkout method lists.
  - Add an automated live diagnostic endpoint `/api/payments/razorpay/capabilities` so the exact merchant activation status from Razorpay API can be inspected in real time.

---

## 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                        AI PRIME STUDIO ECOSYSTEM                       │
└────────────────────────────────────────────────────────────────────────┘
          │                                              │
          ▼                                              ▼
┌───────────────────────────────┐              ┌───────────────────────────────┐
│     Web Client (React)        │              │  Android App (Kotlin Compose) │
│  - Tailwind CSS + Lucide      │              │  - Material 3 + Jetpack Nav   │
│  - Razorpay Checkout SDK      │              │  - Google Play Billing v7     │
│  - Google Sign-In             │              │  - Google Credential Manager  │
└──────────────┬────────────────┘              └──────────────┬────────────────┘
               │                                              │
               ▼                                              ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│                            Backend Express Server                             │
│                                                                               │
│  ├── /api/auth/*              Unified Google Token Exchange & Session         │
│  ├── /api/user/profile        Shared Credits, Plan Status & Video History     │
│  ├── /api/payments/*          Web Razorpay Orders, Subscriptions & Webhooks   │
│  ├── /api/billing/googleplay  Android Play Store Purchase Token Verification  │
│  └── /api/ai/*                Video Generation, Face Swap, Template Engine    │
└──────────────────────────────────────┬────────────────────────────────────────┘
                                       │
                    ┌──────────────────┴──────────────────┐
                    ▼                                     ▼
        ┌───────────────────────┐             ┌───────────────────────┐
        │   Firestore Database  │             │   Cloudflare R2       │
        │ - users / subscriptions│             │ - User uploads        │
        │ - transactions / videos│             │ - Generated AI videos │
        └───────────────────────┘             └───────────────────────┘
```

### Action Checklist: What I Will Do vs What You Will Do

#### What I Will Do (Code & Architecture):
1. **Provide complete Android project structure**:
   - Gradle build scripts (`build.gradle.kts`, `app/build.gradle.kts`) with `com.aiprimestudio.app`, AndroidX, Jetpack Compose, and Google Play Billing.
   - Android Kotlin architecture with MVVM: UI views (Home, Template Browser, Generation Studio, Profile, Subscription Paywall).
   - Backend integration layer (Retrofit/OkHttp) communicating with `https://ais-dev-...run.app`.
   - Unified Google Sign-In helper linking the Android app to the existing Firestore user account.
2. **Add Android Google Play purchase verification route on server**:
   - `/api/billing/googleplay/verify` to validate Play Store subscription purchases and grant credits.
3. **Enhance Razorpay integration in Web checkout**:
   - Clean up `PlansModal.tsx` and `razorpayAdapter.ts` to ensure full NPCI/Razorpay compliance for UPI AutoPay (passing registered customer details, removing any display block conflicts).
   - Implement diagnostic API `/api/payments/razorpay/capabilities` so you can verify live Razorpay account capabilities directly from your backend.

#### What You Will Do (External Consoles & Accounts):
1. **Google Play Console Account**:
   - Register your Google Play Console account ($25 one-time fee) using any Google email you prefer.
2. **Firebase Console**:
   - Add an Android App in Firebase Console with package name `com.aiprimestudio.app`.
   - Download `google-services.json` and place it in `android/app/`.
3. **Razorpay Dashboard**:
   - If Razorpay merchant methods report `recurring.upi: false`, submit a quick ticket requesting "Enable UPI AutoPay feature for Subscriptions" on your live Merchant ID.

---

## 5. Verification Plan

1. **Compilation Check**: Run `compile_applet` on the backend and web application to verify zero regressions.
2. **Diagnostic Test**: Query `/api/payments/razorpay/capabilities` to audit live merchant recurring capabilities.
3. **Android Source Validation**: Verify all Kotlin files, manifests, and Gradle scripts conform to `com.aiprimestudio.app` standards.
