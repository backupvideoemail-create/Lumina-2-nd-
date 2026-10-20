# AI Prime Studio — Comprehensive Production Stability & Precision Media Plan (Safety Revised)

Deliver a verified, production-hardened implementation plan for AI Prime Studio that enforces strict data safety, exact payment endpoint integration, server-side verified Admin testing, reliable template asset recovery, and an authentic cancellation flow.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The following core safeguards have been locked based on your explicit review:

1. **R2 Asset Safety & Zero-Guessing Policy**:
   - Assets in Cloudflare R2 are **never merged merely because filenames or prefixes look similar**.
   - Automatic grouping into a single `Template` record occurs **only when a reliable shared template ID and explicit asset-role mapping** (Face Thumbnail, BEFORE sample, AFTER result/cover) confirm the relationship.
   - Ambiguous or unlinked legacy assets are preserved in an **Unassigned Recovery Inventory** (`unassignedRecoveryAssets`) accessible to the Admin; **no files are ever guessed or deleted**.
2. **Existing Payment Route Integrity**:
   - Strictly reuse the confirmed existing endpoints in `server.ts`:
     - `POST /api/payments/checkout/order` (Order initiation)
     - `POST /api/payments/verify` (Multi-index payment verification and activation)
     - `POST /api/payments/webhook` & `/api/razorpay/webhook` (Gateway webhooks)
     - `POST /api/subscription/cancel` (Subscription & mandate cancellation)
   - Do **not** create duplicate payment routes.
   - Preserve the live Razorpay plan `plan_TjsjORpnQrwUzl` (₹499 weekly renewal, 400 credits) without unnecessary changes.
3. **Server-Verified Admin Free Testing**:
   - Admin authentication verifies the Firebase Auth ID token server-side via `adminAuth.verifyIdToken(token)`—**client-supplied emails in request bodies or custom headers are never trusted**.
   - Only for the verified email `ai.prime.studio.pro@gmail.com`, the server bypasses the user credit balance check and payment requirements for generation.
   - Real AI provider token/image generation costs are recorded in the server audit log (`admin_test_runs`); customer payment validation and wallet balances remain 100% strict and secure.
4. **Verifiable Cancellation in Account Settings**:
   - Integrate the existing backend cancellation endpoint (`POST /api/subscription/cancel`) and frontend hook `cancelSubscription()` directly into the **Account & Wallet view (`TransactionLedgerModal.tsx`)**.
   - Disclose the exact verified billing terms in `PlansModal.tsx`:
     - *"₹1 Intro Offer for 24 hours (40 credits), then renews at ₹499/week (400 credits per weekly renewal). Manage or cancel auto-renewal anytime in Account & Wallet Settings."*
     - No unverified "100% money-back guarantee" claims, no misleading strikethroughs, and no fake countdown timers.

---

## 1. Overview & Core Concept

AI Prime Studio is an AI photo and video transformation studio designed for high conversion and photorealistic results.

This implementation stabilizes the full-stack system:
1. **Interactive Draggable BEFORE/AFTER Slider**: Full-frame comparison in `TemplateDetailModal.tsx` allowing customers to inspect before vs. after styling, with a compact display-only Face Thumbnail.
2. **End-to-End Asset Role Integrity**:
   - `CUSTOMER_SOURCE_PHOTO`: Customer's uploaded photo is the sole facial identity anchor.
   - `TEMPLATE_AFTER_REFERENCE`: Visual target for scene, pose, attire, and atmosphere (reused as Cover).
   - `TEMPLATE_BEFORE_REFERENCE`: Optional starting appearance context.
   - `TEMPLATE_FACE_THUMBNAIL`: Admin example face for display only; never replaces customer photo.
3. **Data Safety & Reliable Persistence**: Authoritative Firestore storage with local backup, zero-deletion policy, and strict ID-based orphan recovery.
4. **Transparent Billing & Real Cancellation**: Verifiable ₹1 trial / ₹499 weekly renewal with working in-app cancellation.

---

## 2. User Experience & Visual Design

### 2.1 Interactive Draggable BEFORE/AFTER Split Slider (`TemplateDetailModal.tsx`)
- **Container**: Responsive aspect-ratio container (`aspect-[9/16] sm:aspect-[3/4] rounded-3xl overflow-hidden relative select-none touch-none`).
- **Split Mechanics**:
  - Base layer: Full-frame BEFORE image.
  - Top layer: Transformed AFTER sample clipped dynamically via:
    `clipPath: polygon(0 0, ${sliderPosition}% 0, ${sliderPosition}% 100%, 0 100%)`.
  - Ergonomic draggable vertical divider with a circular tactile knob containing dual arrows (`◄ ►`).
  - Pointer/touch tracking (`onPointerDown`, `onPointerMove`, `onPointerUp`) with `setPointerCapture` for smooth performance on mobile and desktop.
- **Labels**: Semi-transparent floating chips:
  - Left: "BEFORE (Original)" in sky-blue typography.
  - Right: "AFTER (AI Result)" in amber/emerald typography.
- **Face Thumbnail Badge**:
  - Bottom-left corner floating badge (`w-14 h-16 rounded-2xl border border-white/20 shadow-xl overflow-hidden`).
  - Clear caption: "Face Sample · Admin Example".

### 2.2 Transparent Pricing & Real Cancellation (`PlansModal.tsx` & `TransactionLedgerModal.tsx`)
- **Plans Modal (`PlansModal.tsx`)**:
  - Card 1: "1-Day Intro Pass" with prominent **₹1** headline.
  - Disclosed terms: "Includes 40 credits for 24 hours. Renews at ₹499/week (400 credits/cycle) via Razorpay AutoPay. Cancel anytime in Account & Wallet Settings."
  - Removed misleading crossed-out ₹499 and removed fake countdown timer.
- **Account & Wallet View (`TransactionLedgerModal.tsx`)**:
  - Displays active subscription status (e.g. "Active · Trial Offer · Renews in X days").
  - Provides a verified "Cancel Auto-Renewal" button that invokes `cancelSubscription()` via `POST /api/subscription/cancel`.
  - Shows success toast and updates subscription status to `cancelled` without revoking remaining paid days.

### 2.3 Off-Screen Media Viewport Optimization
- `TemplateCard.tsx` and detail views maintain `IntersectionObserver` logic:
  - Videos autoplay only when $\ge 50\%$ visible within the active viewport, pausing immediately when scrolled away.
  - All preview videos load `muted={true}` and `playsInline={true}`.

---

## 3. Key Product Decisions & Trade-Offs

### 3.1 Strict R2 Asset Grouping vs. Unassigned Inventory
- **Decision**: Group R2 assets into a template **only when they share a reliable template ID** in their filename or metadata (e.g., `tpl_<id>_face`, `tpl_<id>_before`, `tpl_<id>_after`).
- **Ambiguous Assets**: Any R2 assets that do not possess a verifiable template ID are routed to an `unassignedRecoveryAssets` list in the Admin Template Manager. No files are deleted or guessed into existing templates.

### 3.2 Server-Side Firebase Auth for Admin Bypass
- **Decision**: Authenticate the user via `adminAuth.verifyIdToken(token)` inside `requireAuth`.
- **Admin Verification**: Check `decodedToken.email === 'ai.prime.studio.pro@gmail.com'`.
  - If verified, the server bypasses wallet credit deduction and payment checks for generation.
  - Logs model ID, prompt, and actual provider token/image cost to `admin_test_runs`.
  - Client-supplied emails in request bodies or headers are ignored for authorization.

### 3.3 Authoritative Single-Call Prompt Assembly
- **Decision**: Standardize prompt generation in `src/config/globalMasterPrompt.ts`:
  $$\text{Unified Prompt} = \text{GLOBAL\_MASTER\_PROMPT} + \text{CATEGORY\_PROMPT} + \text{TEMPLATE\_RECIPE} + \text{USER\_INSTRUCTIONS}$$
- **Routing**: `aiRouter.ts` passes `CUSTOMER_SOURCE_PHOTO` as Image 1, `TEMPLATE_AFTER_REFERENCE` as Image 2, and optional `TEMPLATE_BEFORE_REFERENCE` as Image 3 to the provider adapter.

---

## 4. Technical Architecture & Data Strategy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          CLIENT FRONTEND (React SPA)                        │
│                                                                             │
│  ┌───────────────────────┐  ┌─────────────────────────┐  ┌───────────────┐ │
│  │   Template Detail     │  │  Account & Wallet Modal │  │  Plans Modal  │ │
│  │(Draggable Split View) │  │ (Active Sub & Cancel Btn)│  │(₹1/wk Clean UX)│ │
│  └───────────┬───────────┘  └────────────┬────────────┘  └───────┬───────┘ │
└──────────────┼───────────────────────────┼───────────────────────┼─────────┘
               │                           │                       │
               ▼                           ▼                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       EXPRESS SERVER PROXY (server.ts)                      │
│                                                                             │
│  • POST /api/generate ──> Admin Bypass Check (Verified Firebase Auth Token) │
│  • POST /api/payments/checkout/order ──> Standard Order Creation            │
│  • POST /api/payments/verify ──> Multi-Index Lookup & ₹1 Activation          │
│  • POST /api/subscription/cancel ──> Razorpay Mandate Cancellation         │
│  • GET  /api/media/:filename ──> Real MIME & Cache-Control Stream           │
└──────────────┬───────────────────────────┬──────────────────────────────────┘
               │                           │
               ▼                           ▼
┌───────────────────────────────┐   ┌─────────────────────────────────────────┐
│     CLOUDFLARE R2 STORAGE     │   │      FIRESTORE & LOCAL DATABASE         │
│                               │   │                                         │
│ • /public/tpl_face_{id}       │   │ • templates/{templateId}                │
│ • /public/tpl_before_{id}     │   │ • users/{userId} & wallets/{userId}     │
│ • /public/tpl_after_{id}      │   │ • payments/{orderId}                    │
│ • Unassigned Recovery List    │   │ • subscriptions/{userId}                │
└───────────────────────────────┘   └─────────────────────────────────────────┘
```

### 4.1 Step-by-Step Implementation Flow

1. **Step 1: Backup & Protect Existing Data**
   - Verify existing records in `data/database/` and Firestore. Ensure zero data deletion.

2. **Step 2: Interactive Draggable BEFORE/AFTER Slider (`src/components/TemplateDetailModal.tsx`)**
   - Replace floating before thumbnail with a full-frame interactive split comparison.
   - Implement pointer-driven horizontal slider with touch capture.
   - Display compact floating Face Reference badge with "Display Only" clarity.

3. **Step 3: Account Settings Cancellation & Plans UX (`src/components/TransactionLedgerModal.tsx` & `src/components/PlansModal.tsx`)**
   - Add "Active Subscription & Cancel Auto-Renewal" section in `TransactionLedgerModal.tsx` wired to `cancelSubscription()`.
   - Update `PlansModal.tsx` to display verified terms: "₹1 First Day Trial, renews at ₹499/week (400 credits/week)". Remove fake countdown, fake strike-through, and unverified refund claims.

4. **Step 4: Durable Persistence & Multi-Asset Recovery Audit (`src/services/db/database.ts`)**
   - Update `recoverOrphanedTemplatesFromR2()` to group assets only when a reliable shared template ID confirms the link.
   - Route ambiguous assets to an `unassignedRecoveryAssets` inventory without deleting them.

5. **Step 5: Authoritative Prompt Hierarchy & Input Roles (`src/services/ai/aiRouter.ts` & `geminiAdapter.ts`)**
   - Ensure prompt is built once via `buildUnifiedGenerationPrompt()`.
   - Route `CUSTOMER_SOURCE_PHOTO` as Image 1, `TEMPLATE_AFTER_REFERENCE` as Image 2, and optional `TEMPLATE_BEFORE_REFERENCE` as Image 3.
   - Validate required inputs prior to calling external APIs.

6. **Step 6: Server-Side Verified Admin Free Testing (`server.ts`)**
   - In `/api/generate` and `/api/faceswap/generate`, verify admin identity strictly via server-decoded Firebase Auth token (`req.user.email === 'ai.prime.studio.pro@gmail.com'`).
   - Bypass wallet credit deduction for verified admin; record actual provider cost in `admin_test_runs`.

7. **Step 7: Payment Verification & Reconciliation (`server.ts`)**
   - Keep existing `/api/payments/verify` endpoint with multi-index lookup (`orderId`, `subscriptionId`, `paymentId`) to ensure ₹1 payments activate 40 credits reliably.

8. **Step 8: Google Sign-In Branding Guidance**
   - Provide exact Google Cloud Console OAuth Consent Screen configuration instructions to display "AI Prime Studio" instead of GCP project numbers.

9. **Step 9: Testing & Verification**
   - Run `lint_applet` and `compile_applet`.
   - Verify server startup and endpoint health on port 3000.
   - Present final Requirement Ledger table with status, evidence, and remaining actions.
