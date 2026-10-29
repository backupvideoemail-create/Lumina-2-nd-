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
  ChevronLeft,
  Volume2,
  VolumeX,
  Copy,
  ShieldCheck,
  RefreshCw,
  Wallet
} from 'lucide-react';
import { Template, TemplateInputDef } from '../types';
import { useApp } from '../context/AppContext';
import { isVideoMedia } from '../utils/mediaUtils';

export const TemplateDetailModal: React.FC = () => {
  const {
    selectedTemplate,
    setSelectedTemplate,
    templates,
    wallet,
    user,
    triggerHighIntentAction,
    createGeneration,
    setInsufficientCreditsModal,
    faceSwapScenes,
    setSelectedFaceSwapScene,
    setFaceSwapModalOpen
  } = useApp();

  // Multi-input slot state: maps slot ID -> base64/URL data
  const [inputSlots, setInputSlots] = useState<Record<string, string>>({});
  const [activePickingSlot, setActivePickingSlot] = useState<TemplateInputDef | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPlayingVideo, setIsPlayingVideo] = useState(true);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [needsUserSoundInteraction, setNeedsUserSoundInteraction] = useState(false);
  const [isVideoLoading, setIsVideoLoading] = useState(true);
  const [videoError, setVideoError] = useState(false);
  const [activeVideoTab, setActiveVideoTab] = useState<'before' | 'after'>('after');
  const [customPrompt, setCustomPrompt] = useState('');
  const [copiedError, setCopiedError] = useState(false);
  const [diagnosticDetails, setDiagnosticDetails] = useState<{
    httpStatus?: number;
    errorCode?: string;
    stage?: string;
    correlationId?: string;
    timestamp?: string;
    refunded?: boolean;
  } | null>(null);

  // Draggable BEFORE/AFTER comparison slider state (Photo templates)
  const [sliderPosition, setSliderPosition] = useState<number>(50);
  const [isDraggingSlider, setIsDraggingSlider] = useState<boolean>(false);
  const sliderContainerRef = useRef<HTMLDivElement>(null);

  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const videoPlayerRef = useRef<HTMLVideoElement>(null);

  // Reset inputs when selected template changes
  useEffect(() => {
    setInputSlots({});
    setUploadError(null);
    setDiagnosticDetails(null);
    setIsPickerOpen(false);
    setActivePickingSlot(null);
    setIsPlayingVideo(true);
    setIsVideoMuted(false);
    setNeedsUserSoundInteraction(false);
    setIsVideoLoading(true);
    setVideoError(false);
    setActiveVideoTab('after');
    setCustomPrompt('');
    setSliderPosition(50);
    setIsDraggingSlider(false);
    setCopiedError(false);
  }, [selectedTemplate?.id]);

  const pointerStartRef = useRef<{ x: number; y: number; isHorizontalDrag: boolean } | null>(null);

  const updateSliderFromPointer = (clientX: number) => {
    if (!sliderContainerRef.current) return;
    const rect = sliderContainerRef.current.getBoundingClientRect();
    const rawX = clientX - rect.left;
    const pct = Math.max(5, Math.min(95, (rawX / rect.width) * 100));
    setSliderPosition(pct);
  };

  const handleSliderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    pointerStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      isHorizontalDrag: e.pointerType === 'mouse'
    };
    if (e.pointerType === 'mouse') {
      setIsDraggingSlider(true);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {}
      updateSliderFromPointer(e.clientX);
    }
  };

  const handleSliderPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointerStartRef.current) return;

    if (!pointerStartRef.current.isHorizontalDrag) {
      const dx = Math.abs(e.clientX - pointerStartRef.current.x);
      const dy = Math.abs(e.clientY - pointerStartRef.current.y);

      // If vertical movement is dominant, release tracking so browser can scroll naturally
      if (dy > 8 && dy > dx) {
        pointerStartRef.current = null;
        setIsDraggingSlider(false);
        return;
      }

      // If horizontal movement is dominant, lock into slider comparison dragging
      if (dx > 8 && dx >= dy) {
        pointerStartRef.current = true ? { ...pointerStartRef.current, isHorizontalDrag: true } : null;
        setIsDraggingSlider(true);
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {}
      }
    }

    if (pointerStartRef.current?.isHorizontalDrag) {
      updateSliderFromPointer(e.clientX);
    }
  };

  const handleSliderPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    pointerStartRef.current = null;
    setIsDraggingSlider(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
  };

  const handleKnobPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    pointerStartRef.current = { x: e.clientX, y: e.clientY, isHorizontalDrag: true };
    setIsDraggingSlider(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
  };

  // Resolve matching scene for Face Swap templates
  const matchingScene = selectedTemplate?.isFaceSwap
    ? (faceSwapScenes.find((s) => s.id === (selectedTemplate.faceSwapSceneId || selectedTemplate.id)) || faceSwapScenes[0])
    : (selectedTemplate?.faceSwapSceneId ? faceSwapScenes.find((s) => s.id === selectedTemplate.faceSwapSceneId) : null);

  // Authoritative media resolution prioritizing AFTER sample result as main preview
  const displayResult = matchingScene
    ? (matchingScene.resultVideoPreview || matchingScene.sourceVideoPreview || selectedTemplate?.sampleResult || selectedTemplate?.sampleAfter || selectedTemplate?.preview || selectedTemplate?.cover || '')
    : (selectedTemplate?.sampleResult || selectedTemplate?.sampleAfter || selectedTemplate?.referenceImageUrl || selectedTemplate?.cover || selectedTemplate?.preview || '');

  const sampleBeforeThumb = matchingScene?.sourceVideoPreview || selectedTemplate?.sampleBefore || null;
  const drivingVideoCandidate = matchingScene?.sourceVideoPreview || selectedTemplate?.drivingVideoUrl || (sampleBeforeThumb && isVideoMedia(sampleBeforeThumb) ? sampleBeforeThumb : '');
  const videoBeforeSrc = drivingVideoCandidate || sampleBeforeThumb || '';
  const videoAfterSrc = displayResult;

  const isVideo = Boolean(
    selectedTemplate && (
      selectedTemplate.isFaceSwap ||
      Boolean(matchingScene) ||
      selectedTemplate.mediaType === 'video' ||
      selectedTemplate.type === 'video' ||
      isVideoMedia(videoAfterSrc) ||
      isVideoMedia(videoBeforeSrc) ||
      selectedTemplate.cover?.endsWith('.mp4') ||
      selectedTemplate.cover?.endsWith('.webm') ||
      selectedTemplate.cover?.startsWith('data:video/')
    )
  );

  const currentVideoSrc = activeVideoTab === 'before' && videoBeforeSrc ? videoBeforeSrc : videoAfterSrc;

  // Autoplay with sound detection & graceful recovery (Hook called unconditionally)
  useEffect(() => {
    if (selectedTemplate && isVideo && videoPlayerRef.current) {
      videoPlayerRef.current.muted = isVideoMuted;
      videoPlayerRef.current.play().catch(() => {
        if (videoPlayerRef.current && !isVideoMuted) {
          videoPlayerRef.current.muted = true;
          videoPlayerRef.current.play().catch(() => {});
          setNeedsUserSoundInteraction(true);
        }
      });
    }
  }, [currentVideoSrc, isVideo, selectedTemplate]);

  // ALL HOOKS FINISHED: Early return if modal is closed
  if (!selectedTemplate) return null;

  const tpl = selectedTemplate;
  const userBalance = wallet?.balance ?? 0;
  const hasCredits = userBalance >= tpl.creditCost;

  // Next / Previous Navigation
  const currentIndex = templates.findIndex((t) => t.id === tpl.id);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < templates.length - 1;
  const goToPrev = () => {
    if (hasPrev) setSelectedTemplate(templates[currentIndex - 1]);
  };
  const goToNext = () => {
    if (hasNext) setSelectedTemplate(templates[currentIndex + 1]);
  };

  const sampleFaceThumb = matchingScene?.sampleFace || tpl.sampleFaceThumbnail || null;
  const hasBothVideos = Boolean(videoBeforeSrc && videoAfterSrc && videoBeforeSrc !== videoAfterSrc);

  const handleEnableSound = () => {
    if (videoPlayerRef.current) {
      videoPlayerRef.current.muted = false;
      videoPlayerRef.current.play().catch(() => {});
    }
    setIsVideoMuted(false);
    setNeedsUserSoundInteraction(false);
  };

  // Derive required upload slots by prioritizing explicit requiredInputs first,
  // then configured inputType / recipe.inputType, avoiding defaulting to video slot solely because tpl.type === 'video'
  const requiredSlots: TemplateInputDef[] = (() => {
    if (tpl.requiredInputs && tpl.requiredInputs.length > 0) {
      return tpl.requiredInputs;
    }
    // Check configured inputType
    const configuredType = tpl.inputType || tpl.recipe?.inputType;
    if (configuredType === 'IMAGE_ONLY') {
      return [
        {
          id: 'slot_1',
          label: 'Upload User Face Photo',
          type: 'image',
          description: 'Clear front-facing User Face photo'
        }
      ];
    }
    if (configuredType === 'VIDEO_ONLY') {
      return [
        {
          id: 'slot_1',
          label: 'Upload Driving Video',
          type: 'video',
          description: 'Clear portrait driving video'
        }
      ];
    }
    if (configuredType === 'IMAGE_OR_VIDEO') {
      return [
        {
          id: 'slot_1',
          label: 'Upload Face Photo or Video',
          type: 'image',
          description: 'Clear front-facing portrait photo'
        }
      ];
    }
    // Default fallback: if template is face swap or photo, expect image
    if (tpl.isFaceSwap || tpl.type === 'photo') {
      return [
        {
          id: 'slot_1',
          label: 'Upload User Face Photo',
          type: 'image',
          description: 'Clear front-facing User Face photo'
        }
      ];
    }
    return [
      {
        id: 'slot_1',
        label: 'Upload Video',
        type: 'video',
        description: 'Clear walking or portrait video'
      }
    ];
  })();

  const hasVideoSlots = requiredSlots.some((s) => s.type === 'video');
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
        inputMediaUrl: combinedPayload,
        customPrompt: customPrompt.trim() || undefined
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
    setUploadError(null);
    setDiagnosticDetails(null);
    const res = await createGeneration(tpl.id, combinedPayload, customPrompt.trim() || undefined);
    setIsGenerating(false);

    if (res.success) {
      setSelectedTemplate(null);
    } else {
      setUploadError(res.error || 'Generation failed');
      setDiagnosticDetails({
        httpStatus: res.httpStatus || 400,
        errorCode: res.errorCode || 'GENERATION_FAILED',
        stage: res.stage || 'generation_request',
        correlationId: res.correlationId || `req_${Date.now()}`,
        timestamp: res.timestamp || new Date().toISOString(),
        refunded: res.refunded
      });
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

  const hasActualSample = Boolean(tpl.sampleResult || tpl.sampleAfter || matchingScene?.resultVideoPreview);
  const hasBeforeAfterComparison = Boolean(sampleBeforeThumb && displayResult && sampleBeforeThumb !== displayResult);

  return (
    <div
      className="fixed inset-0 z-50 bg-[#070609] overflow-y-auto no-scrollbar flex flex-col select-none protected-media"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* 1. TOP IMMERSIVE APP BAR WITH PREV/NEXT NAVIGATION */}
      <header className="sticky top-0 z-40 flex items-center justify-between px-3 sm:px-4 py-3 bg-[#070609]/90 backdrop-blur-2xl border-b border-white/10">
        <div className="flex items-center gap-1">
          {/* Close Button */}
          <button
            onClick={() => setSelectedTemplate(null)}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 flex items-center justify-center text-white transition-all cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5 stroke-[2.5]" />
          </button>

          {/* Prev / Next buttons */}
          <button
            onClick={goToPrev}
            disabled={!hasPrev}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 disabled:opacity-20 disabled:cursor-not-allowed flex items-center justify-center text-white transition-all cursor-pointer"
            title="Previous Template"
            aria-label="Previous Template"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={goToNext}
            disabled={!hasNext}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 disabled:opacity-20 disabled:cursor-not-allowed flex items-center justify-center text-white transition-all cursor-pointer"
            title="Next Template"
            aria-label="Next Template"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Template Title */}
        <div className="flex flex-col items-center max-w-[190px] sm:max-w-xs text-center truncate">
          <h2 className="text-sm sm:text-base font-extrabold text-white truncate leading-tight">
            {tpl.title}
          </h2>
          <span className="text-[10px] text-amber-300 font-bold uppercase tracking-wider">
            {tpl.category} · {isVideo ? 'Video' : 'Photo'}
          </span>
        </div>

        {/* Video Controls & Credits */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {isVideo && (
            <>
              <button
                onClick={() => setIsVideoMuted((prev) => !prev)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 flex items-center justify-center text-white transition-all cursor-pointer"
                title={isVideoMuted ? 'Unmute' : 'Mute'}
              >
                {isVideoMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <button
                onClick={togglePlayPause}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 flex items-center justify-center text-white transition-all cursor-pointer"
                title={isPlayingVideo ? 'Pause' : 'Play'}
              >
                {isPlayingVideo ? (
                  <Pause className="w-4 h-4 fill-white" />
                ) : (
                  <Play className="w-4 h-4 fill-white ml-0.5" />
                )}
              </button>
            </>
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
        {/* VIDEO TEMPLATE PREVIEW: NEAR FULL-SCREEN MOBILE HEIGHT WITH BEFORE/AFTER TABS */}
        {isVideo ? (
          <section className="space-y-2">
            {/* Tabs for Before vs After Video */}
            {hasBothVideos && (
              <div className="flex items-center justify-center p-1 rounded-2xl bg-[#14121b] border border-white/10 w-fit mx-auto">
                <button
                  type="button"
                  onClick={() => {
                    if (videoPlayerRef.current) {
                      videoPlayerRef.current.pause();
                    }
                    setActiveVideoTab('before');
                    setIsPlayingVideo(true);
                  }}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                    activeVideoTab === 'before'
                      ? 'bg-sky-500 text-white shadow-md'
                      : 'text-stone-400 hover:text-white'
                  }`}
                >
                  BEFORE — ORIGINAL
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (videoPlayerRef.current) {
                      videoPlayerRef.current.pause();
                    }
                    setActiveVideoTab('after');
                    setIsPlayingVideo(true);
                  }}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                    activeVideoTab === 'after'
                      ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-black shadow-md'
                      : 'text-stone-400 hover:text-white'
                  }`}
                >
                  AFTER — AI RESULT
                </button>
              </div>
            )}

            {/* Video Canvas Container (Responsive Near Full-screen Height) */}
            <div
              onClick={togglePlayPause}
              className="relative rounded-3xl overflow-hidden bg-black border border-white/15 shadow-[0_20px_50px_rgba(0,0,0,0.9)] aspect-[9/16] max-h-[75vh] sm:max-h-[82vh] w-full flex items-center justify-center select-none cursor-pointer group"
            >
              {videoError || !currentVideoSrc ? (
                <div className="flex flex-col items-center justify-center p-6 text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">Video Preview Unavailable</h4>
                    <p className="text-xs text-stone-400 mt-1 max-w-xs">
                      Media stream could not be loaded or is synchronizing with durable storage.
                    </p>
                  </div>
                  <span className="text-[10px] font-mono text-stone-500 bg-white/5 px-2 py-1 rounded">
                    ID: {tpl.id}
                  </span>
                </div>
              ) : (
                <video
                  ref={videoPlayerRef}
                  key={currentVideoSrc}
                  src={currentVideoSrc}
                  autoPlay
                  loop
                  muted={isVideoMuted}
                  playsInline
                  preload="auto"
                  draggable={false}
                  onLoadedData={() => {
                    setIsVideoLoading(false);
                    setVideoError(false);
                  }}
                  onError={() => {
                    setIsVideoLoading(false);
                    setVideoError(true);
                  }}
                  onContextMenu={(e) => e.preventDefault()}
                  className="w-full h-full object-contain bg-black"
                />
              )}

              {/* Scrims */}
              <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/80 via-black/20 to-transparent pointer-events-none z-10" />
              <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none z-10" />

              {/* Floating Top Badge */}
              <div className="absolute top-4 left-4 z-20 pointer-events-none">
                <span
                  className={`px-2.5 py-1 rounded-full border text-[10px] font-black uppercase tracking-wider backdrop-blur-md shadow-md ${
                    activeVideoTab === 'before'
                      ? 'bg-sky-500/30 border-sky-400/60 text-sky-100'
                      : 'bg-amber-500/30 border-amber-400/60 text-amber-200'
                  }`}
                >
                  {activeVideoTab === 'before' ? 'Original Driving Video' : 'AI Rendered Video Result'}
                </span>
              </div>

              {/* Autoplay Sound Prompt Overlay */}
              {needsUserSoundInteraction && !videoError && (
                <div className="absolute top-16 inset-x-0 mx-auto w-fit z-30 pointer-events-auto">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEnableSound();
                    }}
                    className="px-4 py-2 rounded-full bg-amber-500 text-black font-extrabold text-xs shadow-2xl flex items-center gap-2 hover:bg-amber-400 active:scale-95 transition-all cursor-pointer border border-amber-300"
                  >
                    <Volume2 className="w-4 h-4 fill-black" />
                    <span>🔊 Tap to Play with Sound</span>
                  </button>
                </div>
              )}

              {/* Mute/Sound and Play status indicator overlay */}
              <div className="absolute top-4 right-4 z-20 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isVideoMuted) {
                      handleEnableSound();
                    } else {
                      setIsVideoMuted(true);
                      if (videoPlayerRef.current) videoPlayerRef.current.muted = true;
                    }
                  }}
                  className="p-2 rounded-full bg-black/65 backdrop-blur-md border border-white/20 text-white hover:bg-black/85 transition-all cursor-pointer"
                  title={isVideoMuted ? 'Tap to unmute sound' : 'Tap to mute sound'}
                >
                  {isVideoMuted ? <VolumeX className="w-3.5 h-3.5 text-stone-400" /> : <Volume2 className="w-3.5 h-3.5 text-amber-300" />}
                </button>
              </div>

              {/* Face sample pill if present */}
              {sampleFaceThumb && (
                <div className="absolute bottom-4 right-4 z-20 flex items-center gap-2 p-1.5 rounded-2xl bg-black/85 backdrop-blur-xl border border-white/20 shadow-2xl pointer-events-none">
                  <img
                    src={sampleFaceThumb}
                    alt="Face sample"
                    draggable={false}
                    className="w-10 h-12 rounded-xl object-cover border border-purple-400/40 shadow-md"
                  />
                  <div className="flex flex-col text-left pr-1.5">
                    <span className="text-[8px] uppercase font-black text-purple-300 tracking-wider">
                      Face Sample
                    </span>
                    <span className="text-[7.5px] text-stone-400 leading-tight">
                      Display only · User Face<br />photo will be used
                    </span>
                  </div>
                </div>
              )}

              {/* Title & Badge */}
              <div className="absolute bottom-4 left-4 z-20 max-w-[200px] pointer-events-none">
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-[9px] font-black text-amber-300 uppercase tracking-wider mb-1 inline-block">
                  {tpl.badge || 'PRO VIDEO'}
                </span>
                <h3 className="text-base font-black text-white leading-tight drop-shadow-md">
                  {tpl.title}
                </h3>
              </div>
            </div>
          </section>
        ) : (
          /* PHOTO TEMPLATE: INTERACTIVE BEFORE/AFTER PREVIEW CANVAS WITH DRAGGABLE SLIDER */
          <section
            ref={sliderContainerRef}
            onPointerDown={hasBeforeAfterComparison ? handleSliderPointerDown : undefined}
            onPointerMove={hasBeforeAfterComparison ? handleSliderPointerMove : undefined}
            onPointerUp={hasBeforeAfterComparison ? handleSliderPointerUp : undefined}
            onPointerCancel={hasBeforeAfterComparison ? handleSliderPointerUp : undefined}
            className={`relative rounded-3xl overflow-hidden bg-black border border-white/15 shadow-[0_20px_50px_rgba(0,0,0,0.9)] aspect-[9/16] max-h-[620px] w-full flex items-center justify-center select-none touch-pan-y ${
              hasBeforeAfterComparison ? 'cursor-ew-resize' : ''
            }`}
          >
            {/* LAYER 1: Full-Frame BEFORE Reference (Base Layer on Left/Bottom) */}
            {hasBeforeAfterComparison && (
              <div className="absolute inset-0 w-full h-full overflow-hidden">
                <img
                  src={sampleBeforeThumb!}
                  alt="Original Before Reference"
                  draggable={false}
                  onContextMenu={(e) => e.preventDefault()}
                  className="w-full h-full object-cover pointer-events-none select-none"
                />
              </div>
            )}

            {/* LAYER 2: Transformed AFTER / Sample Result Image (Clipped Layer on Top) */}
            <div
              style={
                hasBeforeAfterComparison
                  ? {
                      clipPath: `polygon(${sliderPosition}% 0, 100% 0, 100% 100%, ${sliderPosition}% 100%)`
                    }
                  : undefined
              }
              className="absolute inset-0 w-full h-full overflow-hidden"
            >
              <img
                src={displayResult}
                alt={tpl.title}
                draggable={false}
                onContextMenu={(e) => e.preventDefault()}
                className="w-full h-full object-cover pointer-events-none select-none"
              />
            </div>

            {/* Anti-screenshot Watermark Shield */}
            <div className="absolute inset-0 z-10 pointer-events-none" aria-hidden="true" />

            {/* Subtle Top & Bottom Gradient Scrims */}
            <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/80 via-black/20 to-transparent pointer-events-none z-10" />
            <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-black/95 via-black/40 to-transparent pointer-events-none z-10" />

            {/* DRAGGABLE SLIDER DIVIDER & TACTILE HANDLE */}
            {hasBeforeAfterComparison && (
              <>
                {/* Vertical Divider Line */}
                <div
                  style={{ left: `${sliderPosition}%` }}
                  className="absolute top-0 bottom-0 w-[2.5px] bg-white shadow-[0_0_12px_rgba(255,255,255,0.9)] z-20 -translate-x-1/2 pointer-events-none"
                />

                {/* Tactile Circular Knob */}
                <div
                  style={{ left: `${sliderPosition}%` }}
                  onPointerDown={handleKnobPointerDown}
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-30 cursor-ew-resize touch-none p-3 select-none"
                >
                  <div
                    className={`w-9 h-9 rounded-full bg-white text-stone-900 shadow-2xl flex items-center justify-center border-2 border-stone-800 transition-transform ${
                      isDraggingSlider ? 'scale-110 shadow-[0_0_25px_rgba(255,255,255,0.7)]' : 'hover:scale-105'
                    }`}
                  >
                    <div className="flex items-center gap-0.5 font-bold text-[10px] text-stone-900 tracking-tighter">
                      <span>◄</span>
                      <span>►</span>
                    </div>
                  </div>
                </div>

                {/* High-contrast floating BEFORE & AFTER Labels */}
                <div className="absolute top-4 left-4 z-20 pointer-events-none">
                  <span className="px-2.5 py-1 rounded-full bg-sky-500/35 border border-sky-400/60 text-sky-100 text-[10px] font-black uppercase tracking-wider backdrop-blur-md shadow-md">
                    BEFORE (Original)
                  </span>
                </div>
                <div className="absolute top-4 right-4 z-20 pointer-events-none">
                  <span className="px-2.5 py-1 rounded-full bg-emerald-500/35 border border-emerald-400/60 text-emerald-100 text-[10px] font-black uppercase tracking-wider backdrop-blur-md shadow-md">
                    AFTER (AI Result)
                  </span>
                </div>

                {/* Center Drag Instruction Hint */}
                <div className="absolute bottom-4 inset-x-0 mx-auto w-fit z-20 pointer-events-none">
                  <div className="px-3 py-1 rounded-full bg-black/75 backdrop-blur-md border border-white/20 text-[10px] font-semibold text-stone-300 flex items-center gap-1.5 shadow-lg">
                    <span>◀ Slide to compare transformation ▶</span>
                  </div>
                </div>
              </>
            )}

            {/* STANDALONE BADGE IF NO BEFORE-AFTER COMPARISON */}
            {!hasBeforeAfterComparison && (
              <div className="absolute top-4 left-4 z-20 pointer-events-none">
                <span
                  className={`px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wider backdrop-blur-md shadow-md ${
                    hasActualSample
                      ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300'
                      : 'bg-stone-900/80 border-white/20 text-stone-300'
                  }`}
                >
                  {hasActualSample ? 'AI Sample Result' : 'Style Reference Preview'}
                </span>
              </div>
            )}

            {/* COMPACT FACE THUMBNAIL BADGE */}
            {sampleFaceThumb && (
              <div className="absolute bottom-4 right-4 z-20 flex items-center gap-2 p-1.5 rounded-2xl bg-black/85 backdrop-blur-xl border border-white/20 shadow-2xl">
                <img
                  src={sampleFaceThumb}
                  alt="Display-only face sample"
                  draggable={false}
                  className="w-11 h-13 rounded-xl object-cover border border-purple-400/40 shadow-md pointer-events-none select-none"
                />
                <div className="flex flex-col text-left pr-1.5">
                  <span className="text-[8px] uppercase font-black text-purple-300 tracking-wider">
                    Face Sample
                  </span>
                  <span className="text-[7.5px] text-stone-400 leading-tight">
                    Display only · User Face<br />photo will be used
                  </span>
                </div>
              </div>
            )}

            {/* Bottom Title & Specs inside preview */}
            <div className="absolute bottom-4 left-4 z-20 max-w-[190px] pointer-events-none">
              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-[9px] font-black text-amber-300 uppercase tracking-wider mb-1 inline-block">
                {tpl.badge || 'PRO TEMPLATE'}
              </span>
              <h3 className="text-base font-black text-white leading-tight drop-shadow-md">
                {tpl.title}
              </h3>
            </div>
          </section>
        )}

        {/* FACE SWAP STUDIO SHORTCUT IF APPLICABLE */}
        {tpl.isFaceSwap && (
          <button
            type="button"
            onClick={() => {
              const matchingScene = faceSwapScenes.find(
                (s) => s.id === tpl.id || s.title.toLowerCase() === tpl.title.toLowerCase()
              ) || faceSwapScenes[0];
              if (matchingScene) {
                setSelectedFaceSwapScene(matchingScene);
              }
              setSelectedTemplate(null);
              setFaceSwapModalOpen(true);
            }}
            className="w-full py-2.5 px-3.5 rounded-2xl bg-gradient-to-r from-purple-900/40 to-indigo-900/40 border border-purple-500/40 text-purple-200 hover:text-white hover:border-purple-400/70 text-xs font-bold flex items-center justify-between transition-all cursor-pointer shadow-md"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <span>Face Swap Studio: Customize angles & presets</span>
            </div>
            <ChevronRight className="w-4 h-4 text-purple-300" />
          </button>
        )}

        {/* 3. MULTI-INPUT SLOTS / SELECTION AREA */}
        <section className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black uppercase tracking-wider text-white">
                {hasVideoSlots ? 'Select Video' : 'Add User Face Photo'}
              </span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white/10 text-amber-300 border border-white/10">
                {filledSlotsCount}/{totalSlots} {hasVideoSlots ? (totalSlots === 1 ? 'video' : 'videos') : (totalSlots === 1 ? 'photo' : 'photos')} added
              </span>
            </div>

            <span className="text-[10px] text-stone-400 font-medium">
              {tpl.aspectRatio} Portrait
            </span>
          </div>

          {/* DYNAMIC UPLOAD SLOTS GENERATED FROM CONTRACT */}
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
                          {slot.label || (slot.type === 'video' ? `Add Video ${index + 1}` : `Add Photo ${index + 1}`)}
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

          {/* CUSTOM INSTRUCTIONS (OPTIONAL, MAX 300 CHARACTERS) */}
          <div className="space-y-1.5 p-3 rounded-2xl bg-[#121018] border border-white/10">
            <div className="flex items-center justify-between">
              <label htmlFor="custom-instructions-input" className="text-xs font-bold text-white flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Custom Instructions (Optional)</span>
              </label>
              <span
                className={`text-[10px] font-mono font-semibold ${
                  customPrompt.length >= 280 ? 'text-amber-400' : 'text-stone-400'
                }`}
              >
                {customPrompt.length}/300
              </span>
            </div>
            <textarea
              id="custom-instructions-input"
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value.slice(0, 300))}
              maxLength={300}
              rows={2}
              placeholder="E.g., warm golden hour lighting, cinematic film grain, formal navy suit..."
              className="w-full px-3 py-2 rounded-xl bg-black/60 border border-white/15 text-xs text-white placeholder-stone-500 focus:outline-none focus:border-amber-400 transition-colors resize-none"
            />
            <p className="text-[10px] text-stone-400 leading-tight">
              Tailor expressions, mood, or lighting without altering base identity.
            </p>
          </div>

          {/* SAFE DIAGNOSTIC ERROR DISPLAY WITH COPY DETAILS */}
          {uploadError && (
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 space-y-2.5">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-white">Generation / Upload Issue</p>
                  <p className="text-[11px] text-rose-200 mt-0.5 leading-relaxed">{uploadError}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const statusStr = diagnosticDetails?.httpStatus || 400;
                    const codeStr = diagnosticDetails?.errorCode || 'GENERATION_FAILED';
                    const stageStr = diagnosticDetails?.stage || 'validation';
                    const corrIdStr = diagnosticDetails?.correlationId || 'N/A';
                    const timeStr = diagnosticDetails?.timestamp || new Date().toISOString();
                    const refundStr = diagnosticDetails?.refunded
                      ? '100% Verified Refund Completed'
                      : (stageStr === 'validation' || statusStr === 400 || statusStr === 402 ? 'Credits Not Deducted' : 'Pending Server Verification');

                    const errorReport = `AI Prime Studio Diagnostic Report\nTemplate ID: ${tpl.id}\nTitle: ${tpl.title}\nCategory: ${tpl.category}\nHTTP Status: ${statusStr}\nError Code: ${codeStr}\nFailure Stage: ${stageStr}\nCorrelation ID: ${corrIdStr}\nSafe Message: ${uploadError}\nRefund Status: ${refundStr}\nTimestamp: ${timeStr}`;
                    navigator.clipboard.writeText(errorReport);
                    setCopiedError(true);
                    setTimeout(() => setCopiedError(false), 2000);
                  }}
                  className="p-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-[10px] font-semibold flex items-center gap-1 shrink-0 cursor-pointer transition-colors"
                  title="Copy safe error details"
                >
                  {copiedError ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedError ? 'Copied' : 'Copy Details'}</span>
                </button>
              </div>

              {/* Diagnostic Metadata Badges */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-rose-500/20 text-[9.5px] font-mono">
                <span className="px-2 py-0.5 rounded bg-black/50 border border-white/10 text-stone-300">
                  HTTP {diagnosticDetails?.httpStatus || 400}
                </span>
                <span className="px-2 py-0.5 rounded bg-black/50 border border-white/10 text-rose-300">
                  {diagnosticDetails?.errorCode || 'ERROR'}
                </span>
                <span className="px-2 py-0.5 rounded bg-black/50 border border-white/10 text-amber-300">
                  stage:{diagnosticDetails?.stage || 'validation'}
                </span>
                {diagnosticDetails?.correlationId && (
                  <span className="px-2 py-0.5 rounded bg-black/50 border border-white/10 text-sky-300 truncate max-w-[150px]">
                    id:{diagnosticDetails.correlationId}
                  </span>
                )}
                {diagnosticDetails?.refunded ? (
                  <span className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-bold">
                    ✓ Credits 100% Refunded
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded bg-sky-500/20 border border-sky-500/30 text-sky-300 font-bold">
                    Credits Preserved (0 Deducted)
                  </span>
                )}
              </div>
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
                      ? (tpl.isFaceSwap ? 'Swap Face Now' : (isVideo ? 'Create Video Now' : 'Create Photo Now'))
                      : (tpl.isFaceSwap ? 'Add Photo to Swap Face' : `Add ${totalSlots - filledSlotsCount} More ${hasVideoSlots ? 'Video' : 'Photo'}`)}
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
                  {activePickingSlot?.type === 'video' ? 'Add Video' : 'Add User Face Photo'}
                </h3>
                <p className="text-xs text-stone-400">
                  Choose how you'd like to add your {activePickingSlot?.type === 'video' ? 'video' : 'User Face photo'}
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
