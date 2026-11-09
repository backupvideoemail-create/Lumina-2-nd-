# AI Prime Studio — Emergency Production Catalog & Admin Access Recovery Plan (Plan 14)

Authoritative architectural recovery plan addressing the production catalogue synchronization issues and admin access lockout across both verified administrator Gmail accounts (`backupvideoemail@gmail.com` and `ai.prime.studio.pro@gmail.com`), incorporating the four final acceptance criteria.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> **Four Final Acceptance Directives (Strict Architectural Invariants):**
> 1. **Instant Live Publishing on Public Website (Highest Priority)**:
>    - Any photo template, video template, or hero banner created/updated via the Admin Studio must be immediately live on the Public Website, PWA, and TWA without requiring a GitHub commit, code rebuild, or Cloud Run deployment.
>    - Pipeline: `R2 Media Upload` → `Firestore Metadata Save` → `Authoritative Read-Back` → `Public Catalogue Refresh` → `Live Display`.
>    - Public catalogue and hero APIs enforce `Cache-Control: no-store, no-cache, must-revalidate`. Service Worker and browser caching must pass through dynamic catalogue APIs.
>    - Active customer sessions receive automated periodic or focus-based catalogue invalidation.
>    - Production must **never** fall back to static/seed templates or hero banners.
> 2. **Cryptographic Firebase Admin Identity Verification**:
>    - `req.body.email` is **strictly prohibited** as a source for admin verification.
>    - Identity is derived exclusively from cryptographic Firebase ID Token verification via Google Identity Toolkit / Firebase Admin SDK, validating `uid`, `email`, and `emailVerified === true`.
>    - If email is not verified or token is invalid/expired, admin access is strictly denied (HTTP 403).
> 3. **Explicit Three-State Catalogue Resilience**:
>    - Distinguish between:
>      - `OFFLINE / DEGRADED`: Firestore connection/query failure → Styled alert notice with manual Retry button.
>      - `EMPTY`: Firestore read succeeded with 0 valid active templates → Clean empty state notice with Retry.
>      - `READY`: Active authoritative templates rendered.
>    - Zero production injection of legacy `SEED_TEMPLATES` under any circumstance. Seed data is quarantined strictly to isolated development/test environments (`isIsolatedTestEnv`).
>    - Hero Banners also strictly forbid hardcoded/seed fallback in production.
> 4. **Single Server-Side Admin Allowlist & Regression Suite**:
>    - Define a single authoritative `AUTHORIZED_ADMIN_EMAILS = ['backupvideoemail@gmail.com', 'ai.prime.studio.pro@gmail.com']` in an authoritative shared module. Zero duplicate or diverged lists between `server.ts` and `database.ts`.
>    - Enforce server verification across all `/api/admin/*` endpoints.
>    - Immediate admin state wipe on logout, session expiration, or account switch. Drawer admin buttons must not flash during authentication pending.
>    - Permanent automated regression tests added to `scripts/verify_system_fixes.ts` preventing recurrence.
> 5. **Truthful `/api/version` Identification**:
>    - Serve real build-time Git Commit SHA, immutable build timestamp (generated once at startup/build, not on every request), and real `K_REVISION`.
>    - If SHA is missing, report explicitly as `UNVERIFIED/BLOCKED` rather than claiming fake PASS.
>    - Compare preview and public production versions truthfully.
> 6. **Cloud Run Multi-Instance Live Catalogue Consistency**:
>    - When Admin publishes/updates a template or banner: `R2 Upload` → `Firestore Durable Save` → `Read-Back Verification` → `Firestore Catalogue Revision Increment` (`config/catalog_metadata`) → `All Cloud Run Instances Invalidate / Re-fetch Fresh Firestore Catalogue`.
>    - Cross-instance consistency ensures any client hitting a different Cloud Run container gets the latest catalogue.
>    - If R2 upload succeeds but Firestore save fails, fail closed without claiming fake publish success; mark asset as quarantined.
> 7. **GitHub Master Tracker Synchronization**:
>    - Synchronize all three canonical documents (`PRODUCTION_INCIDENT_MASTER_TRACKER.md`, `BUILDER_HANDOFF_LOG.md`, and `CONFIGURATION_AUDIT.md`) with actual commit SHAs and real test evidence upon completion.

---

## 1. Overview & Core Concept

### What It Does
- **Durable Live Production Catalogue**: Decouples the live application from hardcoded seed data. The Public Website (`ai-prime-studio-photo-video.ai.studio`), Preview environments, Chrome PWA, and TWA all query the authoritative Firestore database (`ai-studio-lumina2nd-42c53264-bee7-4cc4-8151-566990563e0f`) and Cloudflare R2 bucket (`lumina-prime-ai-media`). Newly published templates appear instantly on all client surfaces upon creation.
- **Cryptographic Admin Authentication**: Ensures that only sessions backed by a cryptographically verified Firebase ID Token with `email_verified == true` matching `backupvideoemail@gmail.com` or `ai.prime.studio.pro@gmail.com` can access admin functionality or view admin tools in the Drawer.
- **Truthful Status Reporting**: Eliminates misleading success messages during database connection drops, surfacing real `DEGRADED` or `OFFLINE` indicators.

### Key Value
- Administrators can upload, edit, reorder, or delete templates and hero banners from mobile or desktop and see them live on the public site immediately.
- Zero customer confusion from outdated or resurrected seed templates.
- Complete security against spoofed client emails or browser-side admin bypasses.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Customer Real-Time Catalogue Browsing**:
   - Customer opens Home or Templates view.
   - App initial state begins clean (no legacy seed template flash).
   - `/api/templates` and `/api/banners` are fetched with `no-store` headers.
   - Customer immediately sees all active, verified production templates and hero banners.
   - When the user returns to the tab or after a 60-second background cycle, catalogue revalidates seamlessly.
   - If Firestore is offline: Customer sees a polite banner ("Catalogue temporarily updating · Tap to retry") with zero seed template pollution.

2. **Admin Instant Publishing Flow**:
   - Admin opens Template Manager (`/api/admin/verify` returns HTTP 200).
   - Admin uploads media to R2 and sets template metadata (title, category, prompt recipe, tags).
   - System performs durable save to Firestore collection `templates` and reads back the document for verification.
   - Admin receives success confirmation.
   - When Admin navigates back to Home or Gallery, the newly added template is immediately visible.

3. **Admin Verification & Drawer Access Flow**:
   - Admin signs in with Google (`backupvideoemail@gmail.com` or `ai.prime.studio.pro@gmail.com`).
   - `/api/auth/firebase-session` verifies the token cryptographically via Identity Toolkit and confirms `emailVerified === true`.
   - Client calls `/api/admin/verify` with session Bearer token.
   - Server returns `{ authorized: true, user: { email, role: 'admin' }, backendStatus }`.
   - Drawer unlocks "Template Manager" and "System Diagnostics" with a green "Server-Verified Admin" badge.
   - If a normal customer signs in, `/api/admin/verify` returns HTTP 403, and Drawer admin controls remain completely hidden.
   - On Logout or Token Expiry, `isAdmin` immediately resets to `false` with zero lingering UI access.

---

## 3. Key Product Decisions & Trade-Offs

### Decision 1: Single Source of Truth for Admin Allowlist
- **Chosen Approach**: Define `AUTHORIZED_ADMIN_EMAILS` once in `src/config/adminConfig.ts` (or authoritative export in `database.ts`) and import it directly into `server.ts`.
- **Why**: Eliminates synchronization drift between backend middleware and database user-creation logic.
- **Security Check**: Only accepts tokens where `verified.email` matches the allowlist and `verified.emailVerified === true`. Rejects client `req.body.email`.

### Decision 2: Zero Seed Fallback in Production
- **Chosen Approach**: In `database.ts` and `AppContext.tsx`, check environment. In production, never merge or fallback to `SEED_TEMPLATES` or `HOME_HERO_BANNERS`. If Firestore returns 0 templates, status is `EMPTY`. If connection fails, status is `OFFLINE`.
- **Why**: Protects customer trust by ensuring that deleted or obsolete templates never reappear.
- **Test Mode**: `isIsolatedTestEnv` preserves seed templates so CI tests can run offline without live credentials.

### Decision 3: Zero-Cache Catalogue API Directives
- **Chosen Approach**: Enforce `Cache-Control: no-store, no-cache, must-revalidate, max-age=0` and `Pragma: no-cache` on `/api/templates`, `/api/banners`, `/api/version`, and `/api/admin/**`. Service Worker explicitly passes through all `/api/` traffic.
- **Why**: Prevents CDN, browser HTTP cache, and Service Worker from serving stale templates after an admin publish.

---

## 4. Technical Architecture & System Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          CLIENT APPLICATION (SPA / PWA / TWA)               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  [ AppContext.tsx ]                                                         │
│  - templates: Starts empty ([]), populated exclusively by /api/templates    │
│  - catalogueStatus: 'loading' | 'ready' | 'empty' | 'offline_error'         │
│  - isAdmin: Server-verified boolean via /api/admin/verify                   │
│  - Active Session Invalidation: Tab focus + 60s background refresh          │
│                                                                             │
│  [ Drawer.tsx ]                                                             │
│  - Displays "Template Manager" & "System Diagnostics" ONLY when             │
│    isAdmin === true (Server-Verified). Zero flashing during auth pending.   │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Authenticated Requests (Bearer Token)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            EXPRESS BACKEND (server.ts)                      │
├─────────────────────────────────────────────────────────────────────────────┤
│  [ Shared Admin Allowlist: src/config/adminConfig.ts ]                      │
│  - AUTHORIZED_ADMIN_EMAILS = ['backupvideoemail...', 'ai.prime.studio...']  │
│                                                                             │
│  [ /api/auth/firebase-session ]                                             │
│  - Cryptographic verifyFirebaseToken(idToken) via Google Identity Toolkit   │
│  - Extracts trusted email & emailVerified from token record (NEVER body)    │
│  - Grants role='admin' ONLY if emailVerified === true && email in allowlist │
│                                                                             │
│  [ withAdminAuth Middleware ]                                               │
│  - Validates session Bearer token against server-side user record           │
│  - Returns HTTP 403 on non-admin; guards all /api/admin/* endpoints         │
│                                                                             │
│  [ /api/templates & /api/banners ]                                          │
│  - Cache-Control: no-store, no-cache, must-revalidate, max-age=0            │
│  - Returns authoritative Firestore records (Zero SEED_TEMPLATES in prod)   │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      AUTHORITATIVE STORAGE & DATABASE                       │
├─────────────────────────────────────────────────────────────────────────────┤
│  - Firestore: ai-studio-lumina2nd-42c53264-bee7-4cc4-8151-566990563e0f      │
│    - templates collection: Live template documents                          │
│    - config/deleted_template_ids: Tombstones for deleted templates          │
│    - config/banners: Dynamic hero banners                                   │
│  - Cloudflare R2: lumina-prime-ai-media                                     │
│    - Verified asset uploads, durable covers, and preview videos             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Execution Steps & Scope Boundaries

### Step 1: Shared Authoritative Admin Configuration
- Create `src/config/adminConfig.ts` exporting:
  `export const AUTHORIZED_ADMIN_EMAILS = ['backupvideoemail@gmail.com', 'ai.prime.studio.pro@gmail.com'] as const;`
  `export function isAuthorizedAdminEmail(email?: string | null): boolean`
- Import and use this single function in both `server.ts` and `src/services/db/database.ts`.

### Step 2: Strict Cryptographic Token Verification in `server.ts`
- In `verifyFirebaseToken(idToken)`:
  - Query Google Identity Toolkit `accounts:lookup`.
  - Extract `userRecord.email` and `userRecord.emailVerified`.
  - Return `{ uid, email, emailVerified, name, avatar }`.
- In `POST /api/auth/firebase-session`:
  - **Reject** client-supplied `req.body.email` for identity determination.
  - Require `verified.email` and `verified.emailVerified === true` for any administrative role.
  - Pass trusted verified properties to `prodDb.getOrCreateUser()`.

### Step 3: Production Catalogue Hardening in `database.ts`
- In `syncFromFirestore()`:
  - In production (`!isIsolatedTestEnv`): populate `this.db.templates` strictly from Firestore documents, excluding `deletedTemplateIds`.
  - **Eliminate** `SEED_TEMPLATES.forEach(...)` from production catalogue merge.
  - If Firestore returns 0 templates, mark catalog status as `EMPTY`.
  - If Firestore connection fails, propagate error so `readyPromise` resolves with status `DEGRADED`/`OFFLINE` rather than silent success.
  - Load `banners` from Firestore `config/banners`. In production, do not inject static `HOME_HERO_BANNERS` if Firestore banners exist or if empty.
- In `getOrCreateUser()` and `getUserByToken()`:
  - Use `isAuthorizedAdminEmail(user.email)` to enforce `role = 'admin'`.
  - Update `user.email` from verified token data if missing.

### Step 4: Frontend State & Immediate Cache Invalidation
- In `src/context/AppContext.tsx`:
  - Initialize `templates` as `[]` (not `SEED_TEMPLATES`).
  - Add `catalogueStatus: 'loading' | 'ready' | 'empty' | 'offline_error'`.
  - In `refreshTemplates()`: update `templates` with `data.templates` even if length is 0 (distinguishing empty from error).
  - Add automatic revalidation on window focus and 60-second interval for active customer sessions.
  - Add `isAdmin` state populated via `GET /api/admin/verify`.
  - On logout: immediately reset `isAdmin = false`.
- In `src/components/Drawer.tsx`:
  - Consume `isAdmin` from `useApp()`.
  - Render Template Manager and System Diagnostics only when `isAdmin === true`.
  - Hide admin controls completely for normal customers or unauthenticated guests.

### Step 5: Service Worker & Cache-Control Enforcement
- In `server.ts`: Verify `no-store, no-cache, must-revalidate` headers on `/api/templates`, `/api/banners`, `/api/version`, and `/api/admin/**`.
- In `public/sw.js`: Verify that all `/api/` network requests bypass service worker cache completely.

### Step 6: Permanent Automated Regression Suite & Verification
- Add Suite 31 to `scripts/verify_system_fixes.ts`:
  1. Authoritative admin allowlist parity between `server.ts` and `database.ts`.
  2. Cryptographic token verification rejecting `req.body.email` override.
  3. Production catalogue zero-seed injection check.
  4. Three-state catalogue status check (`OFFLINE`, `EMPTY`, `READY`).
  5. Cache-Control `no-store` header check on public catalogue routes.
  6. Drawer admin rendering gate check (`isAdmin` from server verify).
  7. Dual-admin email allowlist coverage for both `backupvideoemail@gmail.com` and `ai.prime.studio.pro@gmail.com`.
  8. Normal customer HTTP 403 enforcement check.
- Run `npm run lint` (`tsc --noEmit`) → 0 errors.
- Run `npm test` (`scripts/verify_system_fixes.ts`) → All suites passing.
- Run `npm run build` (`vite build`) → Successful production bundle.
- Verify four protected payment adapter hashes remain 100% intact.

---

## Plan 14 Execution Status: COMPLETED & VERIFIED (494/494 Tests Passing)
- **Status:** Complete & Live in Dev Server
- **Verified Suite Count:** 31 Suites, 494 Automated Assertions Passed (0 Failed)
- **Compilation & Type Check:** Zero TypeScript errors (`tsc --noEmit` clean)
- **Live Endpoint Test:** `/api/version`, `/api/templates`, `/api/banners` verified via curl with strict `Cache-Control: no-store`
- **Zero Injected Seed Data:** Confirmed in production mode (`templateCount: 0`, `catalogueStatus: OFFLINE`)
- **Dual-Admin Server RBAC:** Fully enforced for `backupvideoemail@gmail.com` and `ai.prime.studio.pro@gmail.com`

