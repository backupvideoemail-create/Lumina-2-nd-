import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Plus,
  Sparkles,
  Check,
  AlertCircle,
  Play,
  Pause,
  ArrowRight,
  Image as ImageIcon,
  Camera,
  Layers,
  ChevronRight,
  ShieldCheck,
  RefreshCw,
  Wallet
} from 'lucide-react';
import { Template, TemplateInputDef } from '../types';
import { useApp } from '../context/AppContext';

export const TemplateDetailModal: React.FC = () => {
  const {
    selectedTemplate,
    setSelectedTemplate,
    templates,
    wallet,
    user,
    triggerHighIntentAction,
    createGeneration,
    setInsufficientCreditsModal
  } = useApp();

  // Multi-input slot state: maps slot ID -> base64/URL data
  const [inputSlots, setInputSlots] = useState<Record<string, string>>({});
  const [activePickingSlot, setActivePickingSlot] = useState<TemplateInputDef | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPlayingVideo, setIsPlayingVideo] = useState(true);

  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const videoPlayerRef = useRef<HTMLVideoElement>(null);

  // Reset inputs when selected template changes
  useEffect(() => {
    setInputSlots({});
    setUploadError(null);
    setIsPickerOpen(false);
    setActivePickingSlot(null);
    setIsPlayingVideo(true);
  }, [selectedTemplate?.id]);

  if (!selectedTemplate) return null;

  const tpl = selectedTemplate;
  const userBalance = wallet?.balance ?? 0;
  const hasCredits = userBalance >= tpl.creditCost;

  const isVideo = Boolean(
    tpl.mediaType === 'video' ||
    (tpl.mediaType === undefined && (
      tpl.type === 'video' ||
      tpl.cover?.endsWith('.mp4') ||
      tpl.cover?.endsWith('.webm') ||
      tpl.cover?.startsWith('data:video/') ||
      (tpl.preview && (tpl.preview.endsWith('.mp4') || tpl.preview.startsWith('data:video/')))
    ))
  );

  // Derive required upload slots from template data
  const requiredSlots: TemplateInputDef[] = (tpl.requiredInputs && tpl.requiredInputs.length > 0)
    ? tpl.requiredInputs
    : [
        {
          id: 'slot_1',
          label: tpl.type === 'video' ? 'Upload Video' : 'Upload Photo',
          type: tpl.type === 'video' ? 'video' : 'image',
          description: tpl.type === 'video' ? 'Clear walking or portrait video' : 'Clear front-facing portrait photo'
        }
      ];

  const totalSlots = requiredSlots.length;
  const filledSlotsCount = Object.keys(inputSlots).filter((k) => Boolean(inputSlots[k])).length;
  const isAllInputsReady = filledSlotsCount >= totalSlots;

  // Media picker handlers
  const handleOpenPicker = (slot: TemplateInputDef) => {
    setActivePickingSlot(slot);
    setUploadError(null);
    setIsPickerOpen(true);
  };

  const handleSelectGallery = () => {
    setIsPickerOpen(false);
    if (galleryInputRef.current) {
      galleryInputRef.current.value = '';
      galleryInputRef.current.click();
    }
  };

  const handleSelectCamera = () => {
    setIsPickerOpen(false);
    if (cameraInputRef.current) {
      cameraInputRef.current.value = '';
      cameraInputRef.current.click();
    }
  };

  const handleFileProcess = (file: File) => {
    if (!activePickingSlot) return;

    setUploadError(null);
    const MAX_SIZE = 40 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setUploadError('File size exceeds 40MB limit. Please upload a smaller file.');
      return;
    }

    const isVideoFile = file.type.startsWith('video');
    if (activePickingSlot.type === 'image' && isVideoFile) {
      setUploadError('This slot requires a photo (JPG, PNG, WEBP).');
      return;
    }
    if (activePickingSlot.type === 'video' && !isVideoFile) {
      setUploadError('This slot requires a video (MP4, MOV).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setInputSlots((prev) => ({
        ...prev,
        [activePickingSlot.id]: result
      }));
    };
    reader.onerror = () => {
      setUploadError('Failed to read file. Please try again.');
    };
    reader.readAsDataURL(file);
  };

  const handleGenerateClick = async () => {
    if (!isAllInputsReady) {
      setUploadError(`Please add all required inputs (${filledSlotsCount}/${totalSlots} added).`);
      return;
    }

    // Pack media: if single slot, send as is. If multiple slots, pack with delimiter '|||'
    const slotValues = requiredSlots.map((s) => inputSlots[s.id]).filter(Boolean);
    const combinedPayload = slotValues.join('|||');

    if (!user) {
      triggerHighIntentAction({
        type: 'generate',
        templateId: tpl.id,
        inputMediaUrl: combinedPayload
      });
      return;
    }

    if (!hasCredits) {
      setInsufficientCreditsModal({
        open: true,
        requiredCredits: tpl.creditCost,
        availableCredits: userBalance
      });
      return;
    }

    setIsGenerating(true);
    const res = await createGeneration(tpl.id, combinedPayload);
    setIsGenerating(false);

    if (res.success) {
      setSelectedTemplate(null);
    } else if (res.error) {
      setUploadError(res.error);
    }
  };

  // Toggle video play / pause in preview
  const togglePlayPause = () => {
    if (!videoPlayerRef.current) return;
    if (videoPlayerRef.current.paused) {
      videoPlayerRef.current.play().catch(() => {});
      setIsPlayingVideo(true);
    } else {
      videoPlayerRef.current.pause();
      setIsPlayingVideo(false);
    }
  };

  // Related Templates logic: same category or same media type
  const relatedTemplates = templates
    .filter(
      (t) =>
        t.id !== tpl.id &&
        t.isActive !== false &&
        (t.category === tpl.category || t.type === tpl.type)
    )
    .slice(0, 8);

  const displayResult = tpl.sampleResult || tpl.preview || tpl.cover;
  const sampleBeforeThumb = tpl.sampleBefore || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80';

  return (
    <div
      className="fixed inset-0 z-50 bg-[#070609] overflow-y-auto no-scrollbar flex flex-col select-none protected-media"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* 1. TOP IMMERSIVE APP BAR */}
      <header className="sticky top-0 z-40 flex items-center justify-between px-4 py-3 bg-[#070609]/90 backdrop-blur-2xl border-b border-white/10">
        {/* Close Button */}
        <button
          onClick={() => setSelectedTemplate(null)}
          className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 flex items-center justify-center text-white transition-all cursor-pointer"
          aria-label="Close"
        >
          <X className="w-5 h-5 stroke-[2.5]" />
        </button>

        {/* Template Title */}
        <div className="flex flex-col items-center max-w-[220px] sm:max-w-xs text-center truncate">
          <h2 className="text-sm sm:text-base font-extrabold text-white truncate leading-tight">
            {tpl.title}
          </h2>
          <span className="text-[10px] text-amber-300 font-bold uppercase tracking-wider">
            {tpl.category} · {isVideo ? 'Video' : 'Photo'}
          </span>
        </div>

        {/* Video Play/Pause or Credits */}
        <div className="flex items-center gap-2">
          {isVideo && (
            <button
              onClick={togglePlayPause}
              className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 flex items-center justify-center text-white transition-all cursor-pointer"
              title={isPlayingVideo ? 'Pause' : 'Play'}
            >
              {isPlayingVideo ? (
                <Pause className="w-4 h-4 fill-white" />
              ) : (
                <Play className="w-4 h-4 fill-white ml-0.5" />
              )}
            </button>
          )}

          <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#1e170d] border border-amber-500/40 text-[11px] font-black text-amber-300">
            <Sparkles className="w-3 h-3 fill-amber-400 text-amber-400" />
            <span>{tpl.creditCost}</span>
          </div>
        </div>
      </header>

      {/* Hidden File Inputs for Media Selection */}
      <input
        ref={galleryInputRef}
        type="file"
        accept={activePickingSlot?.type === 'video' ? 'video/mp4,video/quicktime,video/webm' : 'image/jpeg,image/png,image/webp'}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileProcess(file);
        }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept={activePickingSlot?.type === 'video' ? 'video/*' : 'image/*'}
        capture="user"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileProcess(file);
        }}
      />

      {/* 2. MAIN SCROLL CONTAINER */}
      <main className="max-w-lg w-full mx-auto px-4 py-3 space-y-4 pb-36 flex-1">
        {/* LARGE SAMPLE PREVIEW CANVAS (Hero Model) */}
        <section className="relative rounded-3xl overflow-hidden bg-black border border-white/15 shadow-[0_20px_50px_rgba(0,0,0,0.9)] aspect-[9/16] max-h-[620px] w-full flex items-center justify-center">
          {/* Main Media Preview */}
          {isVideo ? (
            <video
              ref={videoPlayerRef}
              src={displayResult}
              autoPlay
              loop
              muted
              playsInline
              preload="auto"
              draggable={false}
              onContextMenu={(e) => e.preventDefault()}
              className="w-full h-full object-cover pointer-events-none select-none"
            />
          ) : (
            <img
              src={displayResult}
              alt={tpl.title}
              draggable={false}
              onContextMenu={(e) => e.preventDefault()}
              className="w-full h-full object-cover pointer-events-none select-none"
            />
          )}

          {/* Anti-screenshot Watermark Shield */}
          <div className="absolute inset-0 z-10 pointer-events-none" aria-hidden="true" />

          {/* Subtle Top & Bottom Gradient Scrims */}
          <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/80 via-black/20 to-transparent pointer-events-none z-10" />
          <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-black/95 via-black/40 to-transparent pointer-events-none z-10" />

          {/* FLOATING "BEFORE" SAMPLE THUMBNAIL WITH TRANSFORMATION ARROW */}
          <div className="absolute bottom-4 right-4 z-20 flex items-center gap-2 p-1.5 rounded-2xl bg-black/80 backdrop-blur-xl border border-white/20 shadow-2xl">
            <div className="flex flex-col items-center">
              <span className="text-[8px] uppercase font-black text-amber-300 tracking-wider mb-0.5">
                Before
              </span>
              <img
                src={sampleBeforeThumb}
                alt="Sample input before transformation"
                draggable={false}
                className="w-12 h-14 rounded-xl object-cover border border-white/25 shadow-md pointer-events-none select-none"
              />
            </div>
            <div className="text-amber-400 flex flex-col items-center justify-center pr-1">
              <ArrowRight className="w-4 h-4 stroke-[3]" />
              <span className="text-[7.5px] uppercase font-black text-amber-300 tracking-tighter">
                Transform
              </span>
            </div>
          </div>

          {/* Bottom Title & Specs inside preview */}
          <div className="absolute bottom-4 left-4 z-20 max-w-[200px] pointer-events-none">
            <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-[9px] font-black text-amber-300 uppercase tracking-wider mb-1 inline-block">
              {tpl.badge || 'PRO TEMPLATE'}
            </span>
            <h3 className="text-lg font-black text-white leading-tight drop-shadow-md">
              {tpl.title}
            </h3>
          </div>
        </section>

        {/* 3. MULTI-INPUT SLOTS / SELECTION AREA */}
        <section className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black uppercase tracking-wider text-white">
                {tpl.type === 'video' ? 'Select Video' : 'Add Photos'}
              </span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white/10 text-amber-300 border border-white/10">
                {filledSlotsCount}/{totalSlots} {totalSlots === 1 ? 'photo' : 'photos'} added
              </span>
            </div>

            <span className="text-[10px] text-stone-400 font-medium">
              {tpl.aspectRatio} Portrait
            </span>
          </div>

          {/* DYNAMIC UPLOAD SLOTS GENERATED FROM requiredInputs */}
          <div className={`grid gap-2.5 ${totalSlots > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {requiredSlots.map((slot, index) => {
              const uploadedData = inputSlots[slot.id];
              const isFilled = Boolean(uploadedData);

              return (
                <div
                  key={slot.id}
                  onClick={() => handleOpenPicker(slot)}
                  className={`relative p-3 rounded-2xl border-2 transition-all cursor-pointer flex items-center gap-3 ${
                    isFilled
                      ? 'bg-[#15131b] border-amber-500/50 shadow-md'
                      : 'bg-[#100f16] border-dashed border-white/20 hover:border-amber-500/50 hover:bg-[#15131e]'
                  }`}
                >
                  {isFilled ? (
                    <>
                      {/* Uploaded Thumbnail */}
                      <div className="relative w-12 h-12 rounded-xl overflow-hidden shrink-0 border border-amber-400/50 bg-black">
                        {slot.type === 'video' ? (
                          <video
                            src={uploadedData}
                            muted
                            playsInline
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <img
                            src={uploadedData}
                            alt="Uploaded"
                            className="w-full h-full object-cover"
                          />
                        )}
                        <span className="absolute bottom-0 right-0 p-0.5 rounded-tl-md bg-emerald-500 text-black">
                          <Check className="w-2.5 h-2.5 stroke-[3]" />
                        </span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-bold text-white block truncate">
                          {slot.label || `Photo ${index + 1}`}
                        </span>
                        <span className="text-[10px] text-emerald-400 font-semibold block flex items-center gap-1">
                          <Check className="w-3 h-3 stroke-[3]" /> Ready
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenPicker(slot);
                        }}
                        className="p-1 rounded-lg bg-white/5 hover:bg-white/10 text-stone-300 text-[10px] font-bold"
                      >
                        Change
                      </button>
                    </>
                  ) : (
                    <>
                      {/* Plus icon placeholder */}
                      <div className="w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shrink-0 text-amber-300">
                        <Plus className="w-5 h-5 stroke-[2.5]" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-bold text-white block truncate">
                          {slot.label || `Add Photo ${index + 1}`}
                        </span>
                        <span className="text-[10px] text-stone-400 block truncate">
                          Tap to select
                        </span>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {/* Error Message */}
          {uploadError && (
            <div className="p-3 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center gap-2 text-rose-300 text-xs font-semibold">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{uploadError}</span>
            </div>
          )}
        </section>

        {/* 4. RELATED TEMPLATES SECTION */}
        {relatedTemplates.length > 0 && (
          <section className="pt-3 space-y-2.5 border-t border-white/10">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-white">
                Related Templates
              </h3>
              <span className="text-[11px] text-amber-300 font-semibold">
                Tap to switch
              </span>
            </div>

            <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1 -mx-4 px-4">
              {relatedTemplates.map((rel) => (
                <div
                  key={rel.id}
                  onClick={() => setSelectedTemplate(rel)}
                  className="w-28 sm:w-32 shrink-0 rounded-2xl overflow-hidden bg-black border border-white/15 p-1 cursor-pointer hover:border-amber-500/50 transition-all active:scale-95 group"
                >
                  <div className="relative aspect-[3/4] rounded-xl overflow-hidden bg-stone-900">
                    <img
                      src={rel.cover}
                      alt={rel.title}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                    <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded-md bg-black/75 backdrop-blur-md text-[8px] font-bold text-amber-300">
                      {rel.creditCost} ✦
                    </div>
                  </div>
                  <h4 className="text-[10px] font-bold text-white truncate mt-1 px-0.5">
                    {rel.title}
                  </h4>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* 5. STICKY BOTTOM GENERATION CTA */}
      <footer className="fixed bottom-0 inset-x-0 z-40 p-3.5 bg-gradient-to-t from-[#070609] via-[#070609]/95 to-transparent backdrop-blur-xl border-t border-white/10">
        <div className="max-w-md mx-auto space-y-1.5">
          <button
            onClick={handleGenerateClick}
            disabled={isGenerating || !isAllInputsReady}
            className={`w-full py-3.5 sm:py-4 px-6 rounded-2xl text-base font-black flex items-center justify-between shadow-2xl transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              isAllInputsReady
                ? 'gold-button shadow-[0_10px_30px_rgba(212,175,55,0.35)]'
                : 'bg-stone-800 text-stone-400 border border-white/10'
            }`}
          >
            <div className="flex items-center gap-2">
              {isGenerating ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  <span>Generating AI Result...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5 fill-current" />
                  <span>
                    {isAllInputsReady
                      ? 'Generate Now'
                      : `Add ${totalSlots - filledSlotsCount} More ${tpl.type === 'video' ? 'Video' : 'Photo'}`}
                  </span>
                </>
              )}
            </div>

            <div className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-black/40 text-xs font-black text-white">
              <span>{tpl.creditCost} Credits</span>
            </div>
          </button>

          <p className="text-[10.5px] text-center text-stone-400">
            {!hasCredits
              ? `Requires ${tpl.creditCost} credits (Your Balance: ${userBalance})`
              : 'Server-guaranteed generation with 100% exact refund on failure'}
          </p>
        </div>
      </footer>

      {/* 6. MOBILE BOTTOM SHEET MEDIA PICKER */}
      <AnimatePresence>
        {isPickerOpen && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-md">
            {/* Backdrop click to dismiss */}
            <div
              className="absolute inset-0"
              onClick={() => setIsPickerOpen(false)}
            />

            <motion.div
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative w-full max-w-md bg-[#12111a] border-t sm:border border-white/15 rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl z-10 space-y-4"
            >
              {/* Sheet Drag Handle */}
              <div className="w-10 h-1 rounded-full bg-white/20 mx-auto" />

              {/* Header */}
              <div className="text-center space-y-0.5">
                <h3 className="text-base font-extrabold text-white">
                  {activePickingSlot?.type === 'video' ? 'Add Video' : 'Add Photo'}
                </h3>
                <p className="text-xs text-stone-400">
                  Choose how you'd like to add your {activePickingSlot?.type === 'video' ? 'video' : 'photo'}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2.5 pt-1">
                {/* Option 1: Gallery */}
                <button
                  type="button"
                  onClick={handleSelectGallery}
                  className="w-full p-3.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-between text-left transition-all active:scale-98 cursor-pointer group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300">
                      <ImageIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-sm font-bold text-white block">
                        {activePickingSlot?.type === 'video' ? 'Video Gallery' : 'Photo Gallery'}
                      </span>
                      <span className="text-[11px] text-stone-400 block">
                        Pick from your device library
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-stone-400 group-hover:text-amber-300 transition-colors" />
                </button>

                {/* Option 2: Camera */}
                <button
                  type="button"
                  onClick={handleSelectCamera}
                  className="w-full p-3.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-between text-left transition-all active:scale-98 cursor-pointer group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-orange-500/20 border border-orange-500/40 flex items-center justify-center text-orange-300">
                      <Camera className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-sm font-bold text-white block">
                        {activePickingSlot?.type === 'video' ? 'Record Video' : 'Take Photo'}
                      </span>
                      <span className="text-[11px] text-stone-400 block">
                        Use your camera right now
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-stone-400 group-hover:text-amber-300 transition-colors" />
                </button>
              </div>

              {/* Cancel Button */}
              <button
                type="button"
                onClick={() => setIsPickerOpen(false)}
                className="w-full py-3 rounded-2xl bg-white/5 hover:bg-white/10 text-xs font-bold text-stone-300 text-center transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
