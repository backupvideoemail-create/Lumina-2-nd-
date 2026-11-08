# Secondary Builder: Master Implementation Plan v2.1
## AI Prime Studio Lumina — Hero Carousel, Persistent IndexedDB Media Cache, Cross-Builder Sync, Central Diagnostics & Google Cloud Monitoring

An authoritative architectural specification and execution plan governed by **Master Handoff v2.0**, **Master Implementation Contract A–P**, **Prompt Standard v1.1**, **Prompt Operating Standard v1.2**, and the **Locked Template System Source of Truth**.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The following core architectural boundaries and decisions are locked and accepted:
> - **Zero-Duplication Single System**: One Website → One Frontend → One Backend → One Auth System → One Authoritative Firestore DB (`ai-studio-lumina2nd-42c53264-bee7-4cc4-8151-566990563e0f`) → One Wallet → Web + PWA + TWA.
> - **Branch & Scope Boundary**: Base commit is verified as `8409287262d84e9621daf971e1cd30c88884ea3b` on GitHub `main`. All work is isolated to dedicated feature branch `feature/secondary-hero-cache-sync`. Direct push to `main`, merge, and production deployment by Secondary are **strictly prohibited**.
> - **Persistent Template Media Cache Engine**: Prioritizing **IndexedDB with LRU eviction and quota management** (`navigator.storage.estimate()`). Exclusively for public templates and marketing media. Never cache private customer uploads, generated results, signed R2 URLs, auth tokens, or payment data.
> - **Google Cloud Monitoring Module**: A read-only telemetry module housed strictly inside the existing Admin Diagnostics console, reusing the existing Cloud Run service account on `gen-lang-client-0525281130`. Zero new recurring SaaS subscriptions, zero paid third-party monitoring tools, and zero IAM permission expansions without explicit Owner + Primary approval. Missing IAM permissions report `BLOCKED_OWNER/PRIMARY`, never fake PASS.
> - **Strict Financial & Secret Isolation**: Primary Builder exclusively owns Razorpay, Cashfree, Google Play Billing, AutoPay mandates, Wallet, Credit Ledger, refunds, and production secrets. Secondary Builder is prohibited from modifying financial code or production credentials. Any `server.ts` edit requires function-level diffs proving protected payment routes remain 100% untouched.

---

## 1. Overview & Core Concept

- **Scope of Secondary Builder**:
  1. **Hero Banner Carousel**: Upgrade from 6000ms to exactly 8000ms auto-rotation with bidirectional touch/pointer swipe, boundary wrapping, manual navigation timer reset, pause/resume on modal open, video playback, and tab visibility change, while strictly preserving 1:1 square crop and uncropped native aspect ratio in fullscreen.
  2. **Professional Progressive Template Cache**: Extend `src/services/media/hdDownloadQueue.ts` with persistent IndexedDB storage (`lumina_media_cache`), LRU eviction, quota guards, and a strict progressive loading hierarchy: Poster immediately $\to$ Near-viewport Previews $\to$ Idle prefetch of remaining visible gallery previews $\to$ High-priority HD download on user click.
  3. **Seamless In-Place Detail Player Upgrade**: TemplateCard clicks queue genuine configured HD assets. `TemplateDetailModal` consumes cached HD URLs, upgrading the `<video>` element in place while preserving `currentTime`, paused/playing state, and mute state with zero audio pop or remount flicker.
  4. **Cross-Builder Synchronization Verification**: Implement bidirectional Primary $\leftrightarrow$ Secondary verification using independent workspaces: write, authoritative Firestore read-back, delete, tombstone verification, re-creation with tombstone removal, and complete cleanup.
  5. **Truthful Admin Diagnostics & Persistent History**: Upgrade `/api/admin/diagnostics` and `DiagnosticsModal` to persist run history in Firestore (`diagnostics_history`), retrieve after restart, display dynamic tallies, severity, test types, expected vs. actual results, commit SHAs, Cloud Run revisions, and safe trace IDs. Eliminate fake fallback SHAs (`349bbfa6`). Prohibit false "READY" status and guarantee zero financial or customer side effects.
  6. **Separate Firestore & R2 Health Reporting**: Report Firestore project/DB and authoritative read/write/read-back separately from Cloudflare R2 configuration, upload, read, delete, and pre-signed URL generation (5 distinct R2 checkpoints).
  7. **Google Cloud Monitoring Inside Admin Diagnostics**: Monitor Cloud Run request logs, container logs, system logs, 5xx error frequency, latency, active revision health, and privacy-safe application error events. Provide authenticated Live Alerts with deduplication and resolved incident history.
  8. **Privacy-Safe Application Event Telemetry**: Structured event emission across 9 critical operational vectors: Payment 401/503, Ledger mismatch, Gemini 402/RESOURCE_EXHAUSTED, Veo errors, Firestore failures, R2 failures, Template mismatches, Account Deletion partial failures, and Admin/Auth authorization rejections.
  9. **Admin RBAC Enforcement**: Server-verify both approved Admin emails (`backupvideoemail@gmail.com` and `ai.prime.studio.pro@gmail.com`) with strict HTTP 403 on every `/api/admin/**` endpoint.
  10. **Master Contract A–P & Filter Preservation**: Preserve all prompt branches, Prompt Standard v1.1, Operating Standard v1.2, Couple slot rules, and multi-category OR/AND filtering across Home and Templates.
  11. **Six Canonical Documentation Updates**: Maintain complete parity across `master_requirement_ledger.md`, `remaining_delta_plan.md`, `owner_status_tracker.md`, `PRODUCTION_INCIDENT_MASTER_TRACKER.md`, `BUILDER_HANDOFF_LOG.md`, and `CONFIGURATION_AUDIT.md`.

---

## 2. User Experience & Visual Design

Following the **Universal Frontend Design Constitution** and **Mobile & Touch-First Design Reference** (`references/10_mobile_touch_apps.md`):

### Key User Flows

1. **Hero Banner Interaction & Mobile Swipe**:
   - Customer views HomeView; Hero Banner 1 displays with a 1:1 aspect ratio and softened bottom-only gradient scrim (`from-black/80 via-black/30 to-transparent`).
   - The 8-second rotation timer advances. User swipes left or drags horizontally: the carousel transitions smoothly to Banner 2, resetting the 8-second timer.
   - User taps the PRO Badge or video: the Fullscreen Modal opens in native media ratio (`object-contain`); background rotation automatically pauses.
   - Swiping does not interfere with buttons, links, or video controls (`e.stopPropagation()`).
   - Removing a banner via Admin does not delete or deactivate its linked gallery template.

2. **Template Browsing & Instant In-Place HD Upgrade**:
   - Customer scrolls the Gallery. Posters render immediately with `loading="lazy"`.
   - Cards near the viewport trigger background prefetching of lightweight 480p preview videos at medium priority.
   - When the user taps a Template Card, the configured HD asset (`hdDisplayUrl` / `hdVideoUrl` / `hdMedia`) is queued at **High Priority**.
   - `TemplateDetailModal` opens immediately using preview media. When the HD asset completes downloading into IndexedDB, the player upgrades the video in place without restarting from 0:00 or interrupting audio.
   - If no genuine HD asset is configured or download fails, the modal retains preview media and displays a clean notice ("Preview Mode · HD Unavailable"). It never fakes an HD upgrade.

3. **Admin Diagnostics, Live Alerts & Telemetry**:
   - Authorized admins open "Diagnostics & Audit" from the Admin Drawer.
   - The console loads previous diagnostic history snapshots directly from Firestore `diagnostics_history`.
   - "Run Full Diagnostics" triggers verified non-destructive checks:
     - Real Git HEAD SHA, Feature Branch, Build Time, and Cloud Run Revision.
     - Separate Firestore DB health vs. Cloudflare R2 health (5 checkpoints: config, upload, read, delete, signed URL).
     - Persistent Cache utilization (total bytes stored, hit/miss counters, quota used %, pending queue count).
     - Google Cloud Monitoring health (Cloud Run container health, 5xx rate, latency, active revision status).
   - Live Alerts panel displays deduplicated alerts with incident IDs, severity, safe trace IDs, resolution status, and recommended actions.

### Visual Styling & Accessibility
- **Theme**: Luxury Cinematic Dark Mode (`#08080a` canvas, `#121216` card surfaces, `#d4af37` gold highlights, `#f59e0b` amber accents).
- **Typography**: Display headlines in `Cinzel` (bold, tracking-wide), primary interface in `Plus Jakarta Sans`, tabular figures in `font-mono tabular-nums`.
- **Ergonomics**: Minimum touch targets of $\ge 44 \times 44\text{px}$ on mobile; horizontal swipe containers use `touch-action: pan-y`.

---

## 3. Key Product Decisions & Trade-Offs

### Decision 1: IndexedDB Media Cache with LRU Eviction & Quota Management
- **Chosen Approach**: Native browser IndexedDB (`lumina_media_cache`, objectStore `media_blobs`) storing `Blob` data alongside structured metadata (`url`, `etag`, `mimeType`, `sizeBytes`, `lastAccessedAt`, `version`).
- **Why**: Allows fine-grained LRU eviction when cache exceeds 100MB or `navigator.storage.estimate()` indicates $>80\%$ quota utilization. Cache survives browser restarts and provides corrupt-entry recovery and telemetry reporting.
- **Alternatives Considered**: Cache Storage API (opaque size tracking, difficult LRU sorting in Safari), LocalStorage (5MB cap, cannot store binary Blobs).

### Decision 2: In-Place Video Player Swap
- **Chosen Approach**: Capture `currentTime`, `paused`, and `muted` state before swapping `<video>` `src` to the cached Blob URL, restoring state on `loadeddata`.
- **Why**: Remounting the React video element causes audio pops, black frame flashes, and resets scrubbing context. In-place swapping provides a seamless upgrade.

### Decision 3: Truthful Multi-Builder Git Metadata vs. Static Fallbacks
- **Chosen Approach**: Inject actual build environment variables (`process.env.COMMIT_SHA`, `process.env.K_REVISION`, `import.meta.env.VITE_COMMIT_SHA`). If unavailable, explicitly display `"UNKNOWN"`.
- **Why**: Eliminates hardcoded fallback hashes (`349bbfa6`) that produced false confidence in deployment synchronization.

### Decision 4: Read-Only Cloud Run Monitoring via Service Account
- **Chosen Approach**: Server-side probe leveraging default Cloud Run runtime identity to inspect container health, 5xx error frequency, and instance latency without modifying production IAM or adding third-party SaaS subscriptions.

---

## 4. Technical Architecture & Data Strategy

### System Component Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│ BROWSER CLIENT (React 19 SPA / PWA / TWA)                             │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  [ HomeView: Hero Carousel ]           [ TemplateCard / Gallery ]      │
│  - Exactly 8000ms Auto-Rotation Timer  - Lazy Viewport Intersection     │
│  - Touch / Pointer Swipe Handler       - Immediate Poster Display      │
│  - Manual Navigation Timer Reset       - Candidate Media Separation    │
│  - Visibility & Fullscreen Pause       - High-Priority Queue Dispatch  │
│                   │                                 │                  │
│                   ▼                                 ▼                  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ hdDownloadQueueManager (src/services/media/hdDownloadQueue.ts)   │  │
│  │ - 3-Tier Priority Queue (High / Medium / Low)                    │  │
│  │ - Concurrency Limiter (Max 2 Simultaneous Network Fetches)       │  │
│  │ - Data Saver & 2G/3G Cellular Bypass Detection                   │  │
│  │ - In-Flight Promise Deduplication Map                            │  │
│  └──────────────────┬───────────────────────────────────────────────┘  │
│                     │                                                  │
│                     ▼                                                  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Persistent IndexedDB Media Cache (`lumina_media_cache`)          │  │
│  │ - Object Store: `media_blobs` (Blob, ETag, MIME, Size, Access)   │  │
│  │ - LRU Eviction & Quota Guard (`navigator.storage.estimate`)      │  │
│  │ - Blob URL Lifecycle Manager (Revoke Unused Object URLs)         │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  [ TemplateDetailModal: In-Place HD Upgrade Player ]                   │
│  - Upgrades <video> in place; preserves currentTime, paused, muted     │
│                                                                        │
│  [ DiagnosticsModal: Unified Telemetry & Health Dashboard ]            │
│  - Dynamic PASS/FAIL/BLOCKED/WARNING counters (No false READY)         │
│  - Firestore History Snapshots (`diagnostics_history`)                 │
│  - Separate Firestore DB Health vs. R2 Storage Health (5 Checkpoints)  │
│  - Google Cloud Run Health, Privacy-Safe Events & Live Alerts          │
└─────────────────────────────────┬──────────────────────────────────────┘
                                  │ Authenticated API Requests
                                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│ EXPRESS BACKEND SERVER (server.ts)                                     │
├────────────────────────────────────────────────────────────────────────┤
│  [ Admin Security RBAC ]                                               │
│  - Strict server-side verification for backupvideoemail@gmail.com and  │
│    ai.prime.studio.pro@gmail.com; HTTP 403 on /api/admin/** for others │
│                                                                        │
│  [ /api/version ]                                                      │
│  - Truthful COMMIT_SHA, BUILD_TIME, K_REVISION (Zero hardcoded SHA)    │
│                                                                        │
│  [ /api/admin/diagnostics & /history ]                                 │
│  - Persists diagnostic run snapshot to Firestore `diagnostics_history` │
│  - Complete Diagnostics Result Schema (12 Modules)                     │
│  - Module 1: Firebase Auth Architecture                                │
│  - Module 2: Phone OTP Pipeline                                        │
│  - Module 3: High-Intent Auth Security                                 │
│  - Module 4: Server-Verified Admin RBAC                                │
│  - Module 5: Mandate Architecture Status (Read-Only)                   │
│  - Module 6: Webhook HMAC Cryptographic Primitives                     │
│  - Module 7: AutoPay Lifecycle & Pricing Status                        │
│  - Module 8: Webhook Idempotency Store Status                          │
│  - Module 9: Credit Ledger Invariant Verification (Read-Only)          │
│  - Module 10: AI Model Registry & Storage Configuration                │
│  - Module 11: Persistent Client Media Cache Telemetry                  │
│  - Module 12: Google Cloud Run & Monitoring Health Probe               │
│                                                                        │
│  [ Bidirectional Cross-Builder Sync Probe ]                            │
│  - Synthetic disposable records (`_sync_probe_secondary`)              │
│  - Authoritative Firestore write, read-back, tombstone, cleanup        │
└────────────────────────────────────────────────────────────────────────┘
```

### Complete Diagnostics Result Schema

Every diagnostic result must strictly satisfy:

```typescript
export type DiagnosticStatus = 'passed' | 'failed' | 'blocked' | 'warning' | 'not_tested';
export type DiagnosticSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type DiagnosticTestType = 
  | 'AUTOMATED' 
  | 'SIMULATION' 
  | 'SANDBOX' 
  | 'READ_ONLY_PRODUCTION' 
  | 'PRODUCTION_VERIFIED';

export interface DiagnosticItemResult {
  id: string;
  name: string;
  category: string;
  severity: DiagnosticSeverity;
  testType: DiagnosticTestType;
  endpointOrProvider: string;
  expectedResult: string;
  actualResult: string;
  status: DiagnosticStatus;
  failureReason?: string;
  rootCauseHypothesis?: string;
  recommendedAction?: string;
  timestamp: string;
  environment: 'production' | 'staging' | 'sandbox';
  commitSha: string;
  cloudRunRevision: string;
  safeTraceId: string;
  durationMs: number;
  lastSuccessfulRun?: string;
}

export interface DiagnosticRunSummary {
  runId: string;
  runTimestamp: string;
  environment: 'production' | 'staging' | 'sandbox';
  commitSha: string;
  cloudRunRevision: string;
  totalTests: number;
  passedCount: number;
  failedCount: number;
  blockedCount: number;
  warningCount: number;
  notTestedCount: number;
  overallStatus: 'READY' | 'DEGRADED' | 'CRITICAL_BLOCK' | 'UNVERIFIED';
  results: DiagnosticItemResult[];
}
```

### Google Cloud Monitoring & Live Alert Schema

```typescript
export interface CloudMonitoringAlert {
  incidentId: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  project: string;            // gen-lang-client-0525281130
  service: string;            // ai-prime-studio-photo-video
  revision: string;           // e.g. ai-prime-studio-photo-video-00023-w87
  errorType: string;          // e.g. 'HTTP_5XX_SURGE', 'LATENCY_DEGRADATION', 'PAYMENT_401'
  timestamp: string;
  safeTraceId: string;
  message: string;
  recommendedAction: string;
  resolutionStatus: 'OPEN' | 'INVESTIGATING' | 'RESOLVED';
  resolvedAt?: string;
}
```

### Separate R2 Storage 5-Point Verification Matrix

| Checkpoint ID | Verification Step | Expected Authoritative Result | Missing Permission / Error Handling |
|:---|:---|:---|:---|
| `r2_cfg` | Configuration Audit | Valid endpoint, bucket name, Account ID, Access Key ID | Reports `BLOCKED_OWNER/PRIMARY` if missing |
| `r2_upl` | Disposable Synthetic Upload | Writes test object `_probe/synthetic_probe.json` | Returns `BLOCKED` with sanitized error code; never fake PASS |
| `r2_read`| Authoritative Read-Back | Fetches uploaded probe object and verifies byte equality | Flags `FAILED` if byte mismatch or timeout |
| `r2_del` | Object Deletion & Tombstone | Deletes synthetic probe object and verifies 404 on re-fetch | Ensures zero orphan test objects in production bucket |
| `r2_sign`| Signed HTTPS URL Fetch | Generates pre-signed URL and tests unauthenticated curl access | Validates short-lived expiration and HTTPS accessibility |

---

## 5. Implementation Steps & Sub-Tasks

### Step 1: Preflight Verification & Feature Branch Isolation
- Verify latest GitHub `main` commit matches `8409287262d84e9621daf971e1cd30c88884ea3b`.
- Confirm known Primary Builder baseline CI failure (Run #42371169324) and isolate without modifying Primary's code.
- Create and switch to dedicated feature branch `feature/secondary-hero-cache-sync`.
- Ensure zero unapproved changes exist in working tree.

### Step 2: Hero Banner Carousel Upgrade (`src/views/HomeView.tsx`)
- Change automatic carousel rotation interval from `6000ms` to strictly `8000ms`.
- Add touch handlers (`onTouchStart`, `onTouchMove`, `onTouchEnd`) and pointer drag support with a 40px delta threshold.
- Implement directional navigation: Swipe Left $\to$ Next Banner, Swipe Right $\to$ Previous Banner (with circular wrap).
- Reset the 8-second timer upon any manual swipe, drag, or pagination dot click.
- Implement pause triggers: Fullscreen video modal open, video playback active, or `document.visibilityState === 'hidden'`.
- Prevent swipe gestures when interacting with CTA buttons, links, or video controls (`e.stopPropagation()`).
- Preserve existing 1:1 square crop on desktop/mobile and uncropped native aspect ratio (`object-contain`) in Fullscreen Modal.
- Ensure removing a banner via Admin does not delete or deactivate its linked gallery template.

### Step 3: Persistent IndexedDB Media Cache (`src/services/media/mediaCacheStorage.ts`)
- Implement `MediaCacheStorage` service using native browser IndexedDB.
- Features:
  - Cache initialization with schema version control (`lumina_media_cache`).
  - Read entry by URL with automatic `lastAccessedAt` timestamp update.
  - Write entry with `Blob`, MIME type, ETag, and byte size tracking.
  - LRU Eviction: When cache exceeds 100MB or `navigator.storage.estimate()` indicates $>80\%$ quota utilization, evict least-recently-accessed entries.
  - Stale-while-revalidate: Check remote `ETag` / `Last-Modified` via lightweight `HEAD` request when cached asset age exceeds threshold.
  - Telemetry counters: hits, misses, evictions, total bytes stored.
  - Safe Object URL registry: register and revoke object URLs on component unmount to prevent memory leaks.
  - Corrupt-entry recovery and storage-full fallback.

### Step 4: Upgraded HD Download Queue (`src/services/media/hdDownloadQueue.ts`)
- Wire `MediaCacheStorage` directly into `hdDownloadQueueManager`.
- Loading Priority Hierarchy:
  1. High: User-clicked template HD asset (modal open).
  2. Medium: Near-viewport visible template preview video/poster.
  3. Low: Idle background prefetch for remaining gallery cards.
- Network Awareness: Halt low/medium background prefetches when `navigator.connection.saveData === true` or effective connection is `2g`/`3g`.
- Concurrency Control: Strictly limit active network downloads to max 2 simultaneous requests.
- In-flight deduplication: Re-use existing `Promise` for concurrent requests to the same URL.

### Step 5: In-Place Template Detail Modal HD Upgrade (`src/components/TemplateDetailModal.tsx` & `TemplateCard.tsx`)
- In `TemplateCard.tsx`, ensure clicking enqueues the actual configured HD field (`hdDisplayUrl` || `hdVideoUrl` || `hdMedia`), not just candidate preview media.
- In `TemplateDetailModal.tsx`, consume the cached HD URL from `queueHdDownload(configuredHdUrl, 'high')`.
- Upgrade the `<video>` player in place:
  - Record `prevTime = videoEl.currentTime`, `wasPaused = videoEl.paused`, `wasMuted = videoEl.muted`.
  - Update `src` to cached Blob URL.
  - On `loadeddata`, restore `currentTime = prevTime`, `muted = wasMuted`, and resume play if not paused.
  - If HD download fails, retain Preview cleanly with visual notice ("Preview Mode · HD Unavailable"). Never fake an HD upgrade.

### Step 6: Truthful Diagnostics, History Persistence & Separate Storage Health (`server.ts` & `src/components/DiagnosticsModal.tsx`)
- In `server.ts`:
  - Eliminate hardcoded fallback hash `'349bbfa6'`; return real `COMMIT_SHA` from environment or `'UNKNOWN'`.
  - Return actual build time, Cloud Run revision, and database mode.
  - Persist diagnostic history snapshots in Firestore `diagnostics_history` and retrieve on startup.
  - Implement full Diagnostic Result Schema across all modules.
  - Separate Firestore DB health vs. R2 Storage health (5-point matrix: config, upload, read, delete, signed URL).
  - Add synthetic bidirectional cross-builder sync probe: Writes disposable test record `_sync_probe_secondary`, verifies Firestore read-back, verifies tombstone deletion, tests re-creation, and executes complete cleanup.
  - Ensure zero production side effects: no live payments, AutoPay mandates, paid AI generation, wallet modifications, webhook writes, or customer account deletions.
- In `DiagnosticsModal.tsx`:
  - Display truthful Git HEAD SHA, Feature Branch name, Build Time, and Cloud Run Revision.
  - Render persistent cache statistics (Total Cached Bytes, Hit Rate, Quota Used %, Pending Queue Items).
  - Render Google Cloud Monitoring status indicators with non-destructive PASS/FAIL/BLOCKED ratings.
  - Prevent false "READY" status when required tests are blocked or failing.

### Step 7: Google Cloud Monitoring & Privacy-Safe Event Bus
- Implement read-only server probe for Google Cloud Run health on project `gen-lang-client-0525281130`, service `ai-prime-studio-photo-video`.
- Integrate Cloud Logging, Cloud Monitoring metrics, and Error Reporting status via server-side probe reusing Cloud Run runtime credentials.
- Add privacy-safe event emission for 9 operational failure vectors:
  1. Payment 401/503.
  2. Credit Ledger expected/actual mismatch.
  3. Gemini 402 / `RESOURCE_EXHAUSTED`.
  4. Google Veo video generation failures.
  5. Firestore connection/read/write drops.
  6. R2 storage upload/download/signing errors.
  7. Template production count/catalog mismatch.
  8. Customer account deletion partial failures.
  9. Admin/Auth authorization rejections.
- Implement authenticated Live Alerts in Admin Diagnostics with deduplication and resolved alert history.
- Missing IAM permissions report `BLOCKED_OWNER/PRIMARY`; never fake PASS. No IAM expansions without Owner approval.

### Step 8: Strict Server-Side Admin RBAC & Security Boundary
- Verify server-side authorization on every `/api/admin/**` endpoint for both approved Admin emails:
  - `backupvideoemail@gmail.com`
  - `ai.prime.studio.pro@gmail.com`
- Return strict HTTP 403 Forbidden for unauthenticated users, guests, and non-admin customers.
- Hide Admin Drawer entries from non-admins.
- Provide function-level before/after diffs in `server.ts` proving protected payment and subscription routes remain untouched.

### Step 9: Handoff Tracking for Primary-Owned Tasks
- Preserve and record all Primary-owned tasks in the shared trackers without implementing or altering their logic:
  - A. Payment reconciliation & AutoPay mandate authorization.
  - B. Credit Ledger invariant verification & synthetic webhook isolation.
  - C. Idempotent customer account deletion pipeline.
  - D. Central diagnostics quality & sensitive auth auditing.
  - E. Admin security server-verification.
  - F. Production Firestore authoritative sync & local DB migration safeguards.
  - G. Secrets & Cloud Run revision incident correlation.
  - H. Real AI provider integration & media isolation.
  - I. Mobile Admin, verified phone handling, Logo/Header art protection, and TWA Play Console signing.

### Step 10: Master Contract A–P, Prompts & Filter Preservation
- Preserve all 8 prompt branches (Photo, Video, Source-preserving video, Motion Transfer, Video Edit, Image-to-Video, Couple Photo, Couple Video).
- Enforce Prompt Standard v1.1 and Operating Standard v1.2: assemble final prompt exactly once without duplicating global rules or truncating Admin Scene Recipes.
- Enforce Couple rules: explicitly require Person A and Person B slots; never infer couple from image count.
- Preserve multi-category filtering: OR between selected categories, AND with Photo/Video/search/aspect filters on both Home and Templates.

### Step 11: Canonical Documentation Synchronization
Update all six canonical tracking files:
1. `public/master_requirement_ledger.md`
2. `public/remaining_delta_plan.md`
3. `public/owner_status_tracker.md`
4. `docs/operations/PRODUCTION_INCIDENT_MASTER_TRACKER.md`
5. `docs/operations/BUILDER_HANDOFF_LOG.md`
6. `docs/operations/CONFIGURATION_AUDIT.md`

### Step 12: Verification, Testing & Handover Delivery
- Run full test suite:
  - `npm run lint` (`tsc --noEmit`): 0 errors.
  - `npm test` (`scripts/verify_system_fixes.ts`): Execute and record actual test results (no hardcoded target).
  - `npm run build` (`vite build`): Verify production client bundle generation.
  - Four Protected Payment Adapter Hashes: Verify 100% match.
- Record cold vs. warm cache performance, bytes stored, and mobile touch/swipe behavior.
- Generate fresh `lumina-latest-source.zip` matching the feature branch commit.
- Present final unified diff and handover report to Primary Builder and Owner.
- STOP for Primary integration review and Owner approval before any merge or release.
