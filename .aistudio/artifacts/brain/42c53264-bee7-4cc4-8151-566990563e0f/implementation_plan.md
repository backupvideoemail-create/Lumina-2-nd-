# AI Prime Studio Lumina — CI Workflow Fix & Face Swap / Home Banner Upgrade

Revised engineering plan integrating the strict two-phase execution requested: **Phase A (CI Workflow Root-Cause Fix & Validation Independence)** followed by **Phase B (Higgsfield Genjutsu Light Face Swap, Single-Source Workflow, and 1:1 Square Home Hero Banner)**.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The following requirements and constraints are locked into this plan:
> - **Strict Phase A Isolation**: First ensure a clean GitHub Actions runner completes `npm run lint`, `npm test`, and `npm run build` with 100% independence from secret-generated Firebase files.
> - **Mandatory Post-Secret Firebase Verification**: Real validation of `com.aiprimestudio.app` and `com.aiprimestudio.app.debug` must remain strictly enforced in CI immediately following secret restoration (no `|| true`, no silent skip, fail closed on missing/invalid secrets).
> - **Higgsfield API Key Reuse**: Inspect and reuse existing `HIGGSFIELD_API_KEY` in environment secrets; do not request new keys unless verified unusable.
> - **Higgsfield Genjutsu Light Primary**: Primary provider for Face Swap. No automatic fallback to Google Omni for Face Swap unless equivalent identity and motion capabilities are proven through real tests.
> - **Single-Source Video Workflow**: Admin needs only ONE source driving video; After Demo and Sample Face are optional with automatic first-frame capture.
> - **1:1 Square Home Hero Banner**: Pure 1:1 square ratio (`aspect-square`), full width on mobile, centered with dark margins on desktop, `object-fit: contain` on clean `#000000` background, no blurred duplicate background layer.
> - **Strict Preservation**: Zero modification to existing templates, pricing, ₹1 intro offer, credits, payment webhooks, or existing working features.

---

## 1. Overview & Phased Strategy

### Phase A: CI Workflow & Test Independence (Immediate Scope)
- **Problem**: In GitHub Actions Run #44, `npm test` runs `scripts/verify_system_fixes.ts` before `android/app/google-services.json` is restored from the repository secret, throwing `ENOENT: no such file or directory`.
- **Solution**:
  1. Make `scripts/verify_system_fixes.ts` use pure, self-contained test fixtures to test Firebase client package validation logic so `npm test` runs cleanly in any fresh repository checkout without secrets.
  2. Keep actual disk-based validation in `.github/workflows/android-build.yml` right after the "Recreate google-services.json from secret" step.
  3. Verify both package IDs (`com.aiprimestudio.app` and `com.aiprimestudio.app.debug`) and exit 1 if either is missing or invalid.

### Phase B: Face Swap & Home Hero Banner Enhancements
- **Face Swap Priority**: Higgsfield Genjutsu Light as primary motion transfer engine, preserving `HIGGSFIELD_BASE_IDENTITY_PROMPT`, scene recipe, and customer instructions.
- **Single Source Video**: Update schema, validation, admin manager, and customer modal so only the original source video is required.
- **1:1 Square Banner**: Convert Home carousel from 16:9 to 1:1 square, eliminate background blurred video, and ensure clean `object-fit: contain` presentation across all 5 slides.

---

## 2. Technical Architecture & Component Flow

```
┌────────────────────────────────────────────────────────────────────────┐
│               PHASE A: CI / CD PIPELINE EXECUTION                      │
├────────────────────────────────────────────────────────────────────────┤
│ 1. actions/checkout@v4                                                 │
│ 2. npm install && npm run lint && npm test && npm run build            │
│    (Independent of gitignored secrets; tests use safe fixtures)       │
│ 3. Recreate google-services.json from secret                           │
│ 4. Verify Firebase Configuration (Strict check for both packages)      │
│    -> com.aiprimestudio.app                                           │
│    -> com.aiprimestudio.app.debug                                     │
│ 5. Ensure Canonical Debug Keystore & assembleDebug                     │
│ 6. Set up Release Keystore & bundleRelease                             │
│ 7. Verify Release AAB Signing Fingerprint                              │
└────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│               PHASE B: APPLICATION RUNTIME ARCHITECTURE                │
├───────────────────────────────────┬────────────────────────────────────┤
│  HomeView: 1:1 Square Banner      │  FaceSwap: Single Source Video     │
│  - aspect-square container        │  - Admin: 1 Driving Video (MP4)    │
│  - object-contain / pure black    │  - Optional: Demo & Sample Face    │
│  - Zero blurred duplicate video   │  - Customer: Uploads Face only     │
└─────────────────┬─────────────────┴──────────────────┬─────────────────┘
                  │                                    │
                  ▼                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                         SERVER & PROVIDER LAYER                        │
│  - FaceSwap Route: POST /api/faceswap/generate                         │
│  - Authoritative Scene Lookup from Firestore                           │
│  - Primary Provider: Higgsfield Genjutsu Light                         │
│  - Credit Ledger: Exact reservation & 100% refund on failure           │
│  - Secondary: Google Omni 1.1 Flash (isolated for general video)       │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Step-by-Step Execution Plan

### Step 1: Finalize & Validate Phase A (CI Fix)
- Verify `scripts/verify_system_fixes.ts` suite 21.2 uses `validateGoogleServicesPackages` with fixture JSON and does not require local `google-services.json`.
- Verify `.github/workflows/android-build.yml` steps 41-86 and 87-112 enforce strict validation on the restored file for `com.aiprimestudio.app` and `com.aiprimestudio.app.debug`.
- Execute local simulation of fresh runner (`npm run lint`, `npm test`, `npm run build`) with `android/app/google-services.json` temporarily removed.

### Step 2: Implement Phase B (Higgsfield Genjutsu Light Primary)
- Inspect existing `HIGGSFIELD_API_KEY` configuration in `.env` / runtime.
- Update `src/services/ai/faceSwapAdapter.ts` to support Genjutsu Light model parameters, maintaining server-side security and 100% credit refund protection.
- Ensure Google Omni remains preserved as general video candidate without automatic face swap hijacking.

### Step 3: Implement Single Source Video Workflow
- Update `src/types/index.ts` to make `resultVideoPreview` and `sampleFace` optional on `FaceSwapScene`.
- Update `src/components/TemplateManagerModal.tsx` to require only `sourceVideoPreview`, with first-frame extraction for poster.
- Update `src/components/FaceSwapModal.tsx` to cleanly handle templates with or without demo videos.

### Step 4: Implement 1:1 Square Home Hero Banner
- Update `src/views/HomeView.tsx` Hero Carousel container from `aspect-[16/9] max-h-[380px]` to `aspect-square w-full max-w-[500px] mx-auto` (responsive mobile/desktop).
- Remove the blurred ambient background `<video>` tag completely.
- Set container background to neutral black (`bg-black`).
- Ensure main video has `object-contain` without cropping or stretching across all 5 slides.

### Step 5: Verification & Quality Assurance
- Run full automated test suite (`npm test`).
- Run TypeScript type checks (`npm run lint`).
- Run production bundle build (`npm run build`).
- Verify applet compilation (`compile_applet`).
- Generate Requirement Ledger table with status of every item.
