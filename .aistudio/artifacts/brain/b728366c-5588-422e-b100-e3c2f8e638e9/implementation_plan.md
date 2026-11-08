# AI Prime Studio — Master Implementation Plan 17 (Approved with Test Addendum)

**Repository:** `backupvideoemail-create/Lumina-2-nd-`  
**Latest Verified Main Baseline:** `6c2761dadef4e80a73066aaed01453b0dce9b1a8`  
**Feature Branch:** `feature/secondary-media-preview-hd`  
**Builder Responsibility:** Secondary Builder (Frontend & Media Engineering Specialist)  
**Primary Builder Files Strictly Untouched:** `server.ts`, `database.ts`, `LegalModal.tsx`, `razorpayAdapter.ts`, `cashfreeAdapter.ts`, `googlePlayService.ts`, `pricingAndConfig.ts`, Native Android, Cloud Run IAM  

---

## User Review & Critical Decisions

> [!IMPORTANT]
> **Approved Plan 17 Architecture & Final Acceptance Directives:**
> 1. **Single Authoritative HD Download Trigger**: `TemplateDetailModal.tsx` is the sole owner of HD downloads upon user template selection. `TemplateCard.tsx` only handles card selection and lightweight preview playback, completely eliminating duplicate HD download triggers and unneeded background network requests.
> 2. **Preview-First 200ms Viewport Debounce**: Card must pause in viewport for $\ge 200\text{ms}$ before attaching/playing lightweight preview. Fast scrolling never starts video decoding. Only a single muted gallery preview plays at any time.
> 3. **Stale-While-Revalidate with Cooldown & Dedup**: Background HEAD requests run with in-flight deduplication and a 5-minute cooldown per URL to prevent network hammering on React re-renders. Active playback Object URLs are protected from abrupt revocation.
> 4. **Truthful Resolution Labeling**: "HD 1080p" badge is displayed only when genuine 1080p metadata is verified; otherwise displays "HD Ready", "HD Preparing", or verified native resolution. Preview is never labeled as HD.
> 5. **Hero System Preservation**: 8,000ms rotation, swipe timer reset, tab-visibility pause, and 1:1 home crop preserved 100%.

---

## 1. Overview & Core Concept

### What It Does
Implements a strict, lightweight media hierarchy:
$$\text{Static Poster} \longrightarrow \text{Lightweight Preview (after 200ms pause, max 1 active)} \longrightarrow \text{Explicit Selection HD (Detail Modal)}$$

- **Near-Zero Gallery Data Consumption**: Fast scrolling consumes only static poster bytes. Video decoders and network streams are never spun up during rapid flings.
- **Single Owner for HD Download**: When a user taps a template, `TemplateCard.tsx` opens `TemplateDetailModal.tsx`. The modal initiates the single, prioritized HD download via `hdDownloadQueue.ts` at `priority: 'high'`.
- **Instant Playback via IndexedDB (`lumina_media_cache`)**: Stored assets play instantly from cache, while a decoupled background HEAD check verifies ETags without blocking playback.
- **Active Playback Protection**: Videos currently playing in the detail modal or hero carousel are registered in `protectedUrls`, preventing LRU eviction from revoking their active Blob URLs.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Gallery Browsing Flow (Fast Scroll vs Focused Pause)**:
   - User rapidly scrolls through the gallery: Only static web-optimized posters render.
   - User slows down and stops on a card: After 200ms of continuous viewport presence, the card's lightweight preview video element attaches and begins muted playback.
   - If another card enters and pauses, previously playing gallery preview videos pause to conserve mobile CPU/battery (single active preview discipline).
   - If the card scrolls out of the viewport, the 200ms timer is cancelled immediately, and video playback pauses.
2. **Template Detail & In-Place HD Upgrade Flow**:
   - User taps a template card: `TemplateDetailModal.tsx` opens instantly with the lightweight preview video playing.
   - `TemplateDetailModal` triggers the sole HD download at `priority: 'high'`.
   - Badge shows `"HD Preparing"` or `"HD 1080p · Optimizing..."`.
   - Upon download completion, if verified genuine Blob (`isCachedBlobUrl`), the video element updates in-place, preserving `currentTime`, `paused`, and `muted` state via a one-time `loadeddata` listener without DOM remount or black flicker.
   - Badge updates to `"HD 1080p · Cached"` (or verified resolution).
   - If HD download fails, preview video continues playing seamlessly with `"Preview Mode · HD Unavailable"`.

---

## 3. Key Product Decisions & Trade-Offs

### Decision 1: Single Owner for HD Downloads (`TemplateDetailModal.tsx`)
- **Chosen Approach**: Remove HD download calls from `TemplateCard.tsx`. Only `TemplateDetailModal.tsx` calls `queueHdDownload(configuredHdAsset, 'high')` when the user opens the detail view.
- **Why**: Eliminates race conditions, duplicate player state updates, and wasted downloads when users tap cards quickly.

### Decision 2: 200ms Viewport Debounce & Single Active Preview
- **Chosen Approach**: An `IntersectionObserver` with a 200ms timer attached to each card. If `isIntersecting` becomes false before 200ms, the timer clears. A shared gallery playback coordinator ensures only 1 preview video plays at a time.
- **Why**: Drastically reduces mobile memory usage and hardware video decoder limits on Android Chrome.

### Decision 3: SWR Background HEAD Check with Cooldown
- **Chosen Approach**: Return cached IndexedDB object URL immediately. In the background, if $> 5\text{ minutes}$ since last check and no in-flight HEAD request exists for this URL, dispatch `fetch(url, { method: 'HEAD' })`. If ETag/Last-Modified differs, fetch updated Blob and update IndexedDB.
- **Why**: Guarantees zero latency on playback while keeping public catalog assets synchronized when admins update them.

---

## 4. Technical Architecture & System Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                 AI PRIME STUDIO PROGRESSIVE MEDIA PIPELINE                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
            ┌──────────────────────────┴──────────────────────────┐
            ▼                                                     ▼
┌───────────────────────┐                             ┌───────────────────────┐
│     HomeView.tsx      │                             │   TemplatesView.tsx   │
│  - 8s Hero Rotation   │                             │  - Grid & Categories  │
│  - Swipe Reset        │                             │  - Idle SWR Check     │
│  - Visibility Pause   │                             │  - Gallery Coord      │
└───────────────────────┘                             └───────────────────────┘
                                                                  │
                                                                  ▼
                                                      ┌───────────────────────┐
                                                      │   TemplateCard.tsx    │
                                                      │  - Static Poster First│
                                                      │  - 200ms Viewport Tmr │
                                                      │  - Muted Preview Only │
                                                      │  - NO HD Download     │
                                                      └───────────────────────┘
                                                                  │ User Click
                                                                  ▼
                                                      ┌───────────────────────┐
                                                      │TemplateDetailModal.tsx│
                                                      │  * SOLE HD OWNER *    │
                                                      │  - In-Place Upgrade   │
                                                      │  - Loadeddata Restore │
                                                      │  - Priority High Queue│
                                                      └───────────────────────┘
                                                                  │
                                                                  ▼
                                                      ┌───────────────────────┐
                                                      │  hdDownloadQueue.ts   │
                                                      │  - Deduplication Map  │
                                                      │  - Concurrency Max 2  │
                                                      │  - Data Saver Check   │
                                                      └───────────────────────┘
                                                                  │
                                                                  ▼
                                                      ┌───────────────────────┐
                                                      │ mediaCacheStorage.ts  │
                                                      │  - IndexedDB Store    │
                                                      │  - 100MB LRU Cap      │
                                                      │  - SWR 5-min Cooldown │
                                                      │  - Active URL Protect │
                                                      └───────────────────────┘
```

---

## 5. Execution Steps & Scope Boundaries

### Step 1: Feature Branch & Pre-Flight Alignment
- Confirm baseline commit `6c2761dadef4e80a73066aaed01453b0dce9b1a8`.
- Set feature branch: `feature/secondary-media-preview-hd`.
- Verify zero modifications to Primary-owned files.

### Step 2: Refactor `src/components/TemplateCard.tsx`
- Remove all near-viewport `queueHdDownload` calls.
- Add 200ms debounce timer for viewport intersection before attaching preview video.
- Coordinate with gallery playback manager so only 1 preview video plays at a time.
- Ensure `handleCardClick` opens `TemplateDetailModal` without triggering secondary HD downloads.
- Cleanly maintain variable references required by behavioral tests.

### Step 3: Enhance `src/services/media/mediaCacheStorage.ts`
- Implement background `revalidateCacheEntry(url)` with ETag/Last-Modified comparison.
- Add in-flight Map and 5-minute cooldown timestamp to avoid redundant HEAD requests.
- Add strict origin/role guard: Cache only public template and hero media; never private customer uploads, generated media, or signed tokens.
- Ensure `protectUrl(url)` / `unprotectUrl(url)` prevents active playback revocation.

### Step 4: Validate `src/components/TemplateDetailModal.tsx` & Resolution Badge
- Verify `TemplateDetailModal` is the single owner of `queueHdDownload(configuredHdAsset, 'high')`.
- Ensure resolution badge reflects actual verified resolution (e.g., `"HD 1080p"` only if verified 1080p; otherwise `"HD Ready"` or `"Preview Mode"`).
- Verify in-place video element upgrade with `currentTime`, `paused`, and `muted` state restored.

### Step 5: Test Suite & Verification Script
- Run `npm run lint` (`tsc --noEmit`).
- Run `compile_applet` (`vite build`).
- Run `npm test` (`npx tsx scripts/verify_system_fixes.ts`).
- Update automated test assertions to match the clean single-owner architecture.
- Verify 4 protected financial adapter SHA-256 hashes match 100%.

---

## 6. 10-Point Acceptance Test & Evidence Protocol (Plan 17 Addendum)

1. **Zero HD Network Requests on Gallery Scroll**: Verify that scrolling through the template catalog generates strictly 0 requests for HD video assets.
2. **Cold vs Warm Cache Byte Accounting**: Measure and log initial cold-cache byte downloads vs warm-cache replay downloads (0 network bytes re-fetched on warm cache).
3. **200ms Preview Debounce & Single Active Preview**: Confirm that card must pause in viewport for 200ms before preview attaches; verify only 1 preview video plays concurrently in the gallery.
4. **Single HD Download on Customer Selection**: Confirm that clicking a card triggers exactly 1 HD download owned by `TemplateDetailModal.tsx`.
5. **ETag/Last-Modified Dynamic Revalidation**: Test cache response when server ETag changes (re-fetch triggered) vs unchanged (cached Blob served).
6. **HEAD/CORS Header Verification**: Check CORS exposed headers; fail safe without claiming false freshness if HEAD fails or is blocked.
7. **LRU Eviction & 100MB Cap**: Test eviction when storage exceeds 100MB or 80% quota, verifying currently playing media is never evicted.
8. **In-Place Playback State Preservation**: Confirm `currentTime`, `paused`, and `muted` are restored across HD video swaps.
9. **Hero Carousel Regression Suite**: Verify 8,000ms rotation, swipe gesture reset, tab-visibility pause, and 1:1 home crop geometry.
10. **Device Test Designation**: Mark Android Chrome physical device test as `DEVICE_TEST_PENDING (Owner Physical Verification Required)`.
