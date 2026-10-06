import React, { useState, useRef } from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  X,
  Upload,
  Sparkles,
  Check,
  AlertCircle,
  Play,
  ArrowRight,
  Layers,
  Music,
  SlidersHorizontal,
  Wallet
} from 'lucide-react';
import { Template } from '../types';
import { useApp } from '../context/AppContext';

export const TemplateDetailModal: React.FC = () => {
  const {
    selectedTemplate,
    setSelectedTemplate,
    wallet,
    user,
    triggerHighIntentAction,
    createGeneration,
    setInsufficientCreditsModal
  } = useApp();

  const [uploadedMedia, setUploadedMedia] = useState<string | null>(null);
  const [customInstructions, setCustomInstructions] = useState<string>('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!selectedTemplate) return null;

  const tpl = selectedTemplate;
  const userBalance = wallet?.balance ?? 0;
  const hasCredits = userBalance >= tpl.creditCost;

  const isVideoMedia = (media: string | null | undefined): boolean => {
    if (!media) return false;
    if (media.startsWith('data:video/')) return true;
    const clean = media.split('?')[0].toLowerCase();
    return clean.endsWith('.mp4') || clean.endsWith('.mov') || clean.endsWith('.webm') || clean.endsWith('.m4v');
  };

  const allowedInputType = tpl.inputType || (tpl.type === 'video' ? 'IMAGE_OR_VIDEO' : 'IMAGE_ONLY');

  // Validate and handle file upload
  const processFile = (file: File) => {
    setUploadError(null);

    const MAX_SIZE = 35 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setUploadError('File size exceeds 35MB limit. Please upload a smaller file.');
      return;
    }

    const isVideoFile = file.type.startsWith('video');

    if (allowedInputType === 'IMAGE_ONLY' && isVideoFile) {
      setUploadError('यह टेम्पलेट केवल फोटो स्वीकार करता है। कृपया एक फोटो (JPG, PNG) अपलोड करें। / This template accepts photos only.');
      return;
    }

    if (allowedInputType === 'VIDEO_ONLY' && !isVideoFile) {
      setUploadError('यह टेम्पलेट केवल वीडियो स्वीकार करता है। कृपया एक वीडियो (MP4) अपलोड करें। / This template accepts videos only.');
      return;
    }

    const validMimes = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime'];
    if (!validMimes.includes(file.type)) {
      setUploadError('Unsupported format. Please upload JPG, PNG, WEBP or MP4.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setUploadedMedia(result);
    };
    reader.onerror = () => {
      setUploadError('Failed to read file. Please try again.');
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleGenerate = async () => {
    if (!uploadedMedia) {
      setUploadError('Please upload your photo or video first to create this template.');
      return;
    }

    if (!user) {
      triggerHighIntentAction({
        type: 'generate',
        templateId: tpl.id,
        inputMediaUrl: uploadedMedia,
        customPrompt: customInstructions
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
    const res = await createGeneration(tpl.id, uploadedMedia, customInstructions);
    setIsGenerating(false);

    if (res.success) {
      setSelectedTemplate(null);
    } else if (res.error) {
      setUploadError(res.error);
    }
  };

  const displayResultMedia = tpl.sampleResult || tpl.preview;
  const displaySourceThumb = tpl.preview;

  return (
    <div className="fixed inset-0 z-50 bg-[#08080a] overflow-y-auto no-scrollbar flex flex-col">
      {/* Top Floating App Bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between px-4 py-3 bg-[#08080a]/90 backdrop-blur-xl border-b border-white/5">
        <button
          onClick={() => setSelectedTemplate(null)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-stone-300 hover:text-white transition-colors cursor-pointer text-xs font-semibold"
          aria-label="Back"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        {/* Template Title Pill */}
        <div className="px-3.5 py-1 rounded-full bg-stone-900 border border-white/10 text-xs font-semibold text-white max-w-[200px] sm:max-w-xs truncate">
          {tpl.title}
        </div>

        {/* Available credits indicator */}
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#1b1914] border border-[#d4af37]/40 text-xs font-bold text-[#f5d77f]">
          <Sparkles className="w-3.5 h-3.5 fill-[#d4af37]" />
          <span>{userBalance} ✦</span>
        </div>
      </header>

      {/* Main Scroll Content */}
      <main className="max-w-2xl w-full mx-auto px-4 py-4 space-y-5 pb-36 flex-1">
        {/* Visual Model: Dominant AI Generated Result + Source Inset & Arrow */}
        <section className="relative rounded-3xl overflow-hidden bg-stone-950 border border-white/10 shadow-2xl">
          {/* Main Dominant Result Container */}
          <div
            className={`relative w-full bg-black flex items-center justify-center overflow-hidden ${
              tpl.aspectRatio === '9:16'
                ? 'aspect-[9/16] max-h-[580px]'
                : tpl.aspectRatio === '4:5'
                ? 'aspect-[4/5] max-h-[520px]'
                : tpl.aspectRatio === '1:1'
                ? 'aspect-square max-h-[460px]'
                : 'aspect-video max-h-[400px]'
            }`}
          >
            {/* Dominant AI Result Preview (Supports MP4 Video & Photo) */}
            {isVideoMedia(displayResultMedia) ? (
              <video
                src={displayResultMedia}
                autoPlay
                loop
                muted
                playsInline
                className="w-full h-full object-cover"
              />
            ) : (
              <img
                src={displayResultMedia}
                alt={tpl.title}
                className="w-full h-full object-cover"
              />
            )}

            {/* Gradient Scrim */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-black/30 pointer-events-none" />

            {/* Top Badges: AI Generated Result + Credits */}
            <div className="absolute top-3.5 inset-x-3.5 flex items-center justify-between z-20">
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/75 backdrop-blur-md border border-[#ff9f00]/50 text-[10px] font-bold text-[#ffb703] shadow-md uppercase tracking-wider">
                <Sparkles className="w-3 h-3 fill-current" />
                <span>AI Generated Result</span>
              </span>

              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/75 backdrop-blur-md border border-[#d4af37]/50 text-xs font-bold text-[#f5d77f] shadow-lg">
                <Sparkles className="w-3 h-3 fill-[#d4af37]" />
                <span>{tpl.creditCost} Credits</span>
              </div>
            </div>

            {/* Source Photo Inset & Arrow Flow (Lower-Right Corner) */}
            <div className="absolute bottom-16 right-3.5 z-20 flex items-center gap-2 p-2 rounded-2xl bg-black/80 backdrop-blur-xl border border-white/20 shadow-2xl">
              {/* Source Thumbnail */}
              <div className="relative">
                <img
                  src={uploadedMedia || displaySourceThumb}
                  alt="Original input"
                  className="w-12 h-14 sm:w-14 sm:h-16 rounded-xl object-cover border border-white/20"
                />
                <span className="absolute -bottom-1 -left-1 px-1 py-0.2 rounded bg-black/80 text-[8px] font-bold text-stone-300 border border-white/10 uppercase">
                  Source
                </span>
              </div>

              {/* Source -> Result Arrow */}
              <div className="flex flex-col items-center justify-center px-1 text-amber-300">
                <ArrowRight className="w-4 h-4 stroke-[3]" />
                <span className="text-[8px] font-black uppercase tracking-wider mt-0.5">Transform</span>
              </div>

              {/* Inset Result Micro Thumbnail */}
              <div className="relative">
                <img
                  src={displayResultMedia}
                  alt="Transformed result"
                  className="w-12 h-14 sm:w-14 sm:h-16 rounded-xl object-cover border border-amber-400/80 shadow-[0_0_12px_rgba(255,159,0,0.5)]"
                />
                <span className="absolute -bottom-1 -right-1 px-1 py-0.2 rounded bg-[#ff9f00] text-[8px] font-black text-black shadow uppercase">
                  AI
                </span>
              </div>
            </div>

            {/* Bottom Title Overlay inside media */}
            <div className="absolute bottom-3.5 left-4 z-20 max-w-[220px] sm:max-w-xs pointer-events-none">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#ffb703] uppercase tracking-wider mb-0.5">
                <span>{tpl.category}</span>
                <span>·</span>
                <span>{tpl.type === 'video' ? 'Video Reel' : 'Photo Studio'}</span>
                <span>·</span>
                <span>{tpl.resolutionLabel || '1080p'}</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black font-display text-white drop-shadow-md leading-tight">
                {tpl.title}
              </h1>
            </div>
          </div>
        </section>

        {/* Generation Pre-Check Card (Required Credits vs User Balance) */}
        <section className="p-3.5 rounded-2xl bg-[#121118] border border-white/10 grid grid-cols-2 gap-3 shadow-md">
          <div className="p-3 rounded-xl bg-white/5 border border-white/5 flex items-center justify-between">
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-stone-400 block">
                Required Credits
              </span>
              <span className="text-lg font-black text-white mt-0.5 block">
                {tpl.creditCost} ✦
              </span>
            </div>
            <div className="w-8 h-8 rounded-full bg-amber-500/15 flex items-center justify-center text-[#ffb703]">
              <Sparkles className="w-4 h-4 fill-current" />
            </div>
          </div>

          <div className={`p-3 rounded-xl border flex items-center justify-between ${
            hasCredits
              ? 'bg-emerald-500/10 border-emerald-500/25'
              : 'bg-rose-500/10 border-rose-500/25'
          }`}>
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-stone-400 block">
                Your Balance
              </span>
              <span className={`text-lg font-black mt-0.5 block ${hasCredits ? 'text-emerald-300' : 'text-rose-300'}`}>
                {userBalance} ✦
              </span>
            </div>
            <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-stone-300">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
        </section>

        {/* Step 1: Upload Your Photo / Video (Enforced by Template Input Type) */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-wider text-stone-200 flex items-center gap-1.5">
              <span className="w-4.5 h-4.5 rounded-full bg-[#ff9f00] text-black flex items-center justify-center text-[10px] font-black">1</span>
              <span>
                {allowedInputType === 'IMAGE_ONLY'
                  ? 'Upload Your Photo'
                  : allowedInputType === 'VIDEO_ONLY'
                  ? 'Upload Your Video'
                  : 'Upload Photo or Video'}
              </span>
            </label>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/10 text-amber-300">
                {allowedInputType === 'IMAGE_ONLY'
                  ? '📸 Photo Only'
                  : allowedInputType === 'VIDEO_ONLY'
                  ? '🎬 Video Only'
                  : '✨ Photo or Video'}
              </span>
              {uploadedMedia && (
                <button
                  onClick={() => setUploadedMedia(null)}
                  className="text-xs text-amber-300 hover:underline cursor-pointer"
                >
                  Change
                </button>
              )}
            </div>
          </div>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept={
              allowedInputType === 'IMAGE_ONLY'
                ? 'image/jpeg,image/png,image/webp'
                : allowedInputType === 'VIDEO_ONLY'
                ? 'video/mp4,video/quicktime,video/webm'
                : 'image/jpeg,image/png,image/webp,video/mp4,video/quicktime'
            }
            className="hidden"
          />

          {!uploadedMedia ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`p-6 sm:p-7 rounded-2xl border-2 border-dashed cursor-pointer text-center transition-all ${
                isDragging
                  ? 'border-[#ff9f00] bg-[#ff9f00]/10'
                  : 'border-white/15 bg-stone-900/60 hover:bg-stone-900 hover:border-amber-500/40'
              }`}
            >
              <div className="w-11 h-11 mx-auto rounded-full bg-white/5 flex items-center justify-center mb-2.5 text-stone-300">
                <Upload className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-white">
                {allowedInputType === 'IMAGE_ONLY'
                  ? 'Tap to upload portrait photo'
                  : allowedInputType === 'VIDEO_ONLY'
                  ? 'Tap to upload source video'
                  : 'Tap to upload photo or video'}
              </h3>
              <p className="text-[11px] text-stone-400 mt-1 max-w-xs mx-auto">
                {allowedInputType === 'IMAGE_ONLY'
                  ? 'JPG, PNG, WEBP · Max 35MB'
                  : allowedInputType === 'VIDEO_ONLY'
                  ? 'MP4, MOV · Max 35MB'
                  : 'JPG, PNG, WEBP or MP4 · Max 35MB'}
              </p>
            </div>
          ) : (
            <div className="relative rounded-2xl overflow-hidden bg-stone-900 border border-amber-500/40 p-3 flex items-center gap-3.5 shadow-md">
              {isVideoMedia(uploadedMedia) ? (
                <video
                  src={uploadedMedia}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-14 h-14 rounded-xl object-cover border border-white/10 shrink-0 bg-black"
                />
              ) : (
                <img
                  src={uploadedMedia}
                  alt="Uploaded media"
                  className="w-14 h-14 rounded-xl object-cover border border-white/10 shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>{isVideoMedia(uploadedMedia) ? 'Video Ready' : 'Photo Ready'}</span>
                </div>
                <p className="text-[11px] text-stone-400 mt-0.5 truncate">
                  Ready for AI synthesis with {tpl.title}
                </p>
              </div>
              <button
                onClick={() => setUploadedMedia(null)}
                className="p-1.5 text-stone-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                aria-label="Remove uploaded media"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {uploadError && (
            <div className="p-3 rounded-xl bg-red-950/60 border border-red-800/60 flex items-start gap-2.5 text-xs text-red-200">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
              <span>{uploadError}</span>
            </div>
          )}
        </section>

        {/* Step 2: Custom Instructions (Optional - Hindi, English, Hinglish) */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-wider text-stone-200 flex items-center gap-1.5">
              <span className="w-4.5 h-4.5 rounded-full bg-white/10 text-stone-300 flex items-center justify-center text-[10px] font-black">2</span>
              <span>Custom Instructions (Optional)</span>
            </label>
            <span className="text-[10px] text-stone-400">Hindi · English · Hinglish</span>
          </div>

          <div className="relative rounded-2xl bg-[#121118] border border-white/10 p-2.5 focus-within:border-[#ff9f00] transition-colors">
            <textarea
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
              placeholder="Apni extra instructions yahan likhein... (e.g. golden hour sunlight, retro film grain, neon reflections, cinematic slow motion)"
              rows={2}
              maxLength={300}
              className="w-full bg-transparent text-xs text-white placeholder-stone-500 focus:outline-none resize-none leading-relaxed"
            />
            <div className="flex items-center justify-between text-[10px] text-stone-500 pt-1 border-t border-white/5">
              <span>Template base prompt preserved</span>
              <span>{customInstructions.length}/300</span>
            </div>
          </div>
        </section>

        {/* Template Engine & Specs Bar */}
        <section className="p-3.5 rounded-2xl bg-[#121118]/80 border border-white/5 flex flex-wrap items-center justify-between gap-2 text-xs text-stone-400">
          <div className="flex items-center gap-2">
            <Layers className="w-3.5 h-3.5 text-[#ffb703]" />
            <span>Engine: {tpl.engine === 'AI_GENERATION' ? 'Google Generative Diffusion' : 'Smart Motion Canvas'}</span>
          </div>

          {tpl.musicTrack && (
            <div className="flex items-center gap-1.5 text-amber-200/90 font-medium">
              <Music className="w-3 h-3 text-[#ffb703]" />
              <span>{tpl.musicTrack.name}</span>
            </div>
          )}
        </section>
      </main>

      {/* Sticky Bottom Generate Bar */}
      <footer className="fixed bottom-0 inset-x-0 z-40 p-4 bg-gradient-to-t from-[#08080a] via-[#08080a]/95 to-transparent backdrop-blur-md border-t border-white/5">
        <div className="max-w-md mx-auto space-y-2">
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className={`w-full py-4 px-6 rounded-2xl text-base font-black flex items-center justify-between shadow-2xl transition-all ${
              uploadedMedia
                ? 'gold-button cursor-pointer'
                : 'bg-stone-800 text-stone-400 border border-white/10 cursor-pointer hover:bg-stone-700'
            }`}
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 fill-current" />
              <span>{isGenerating ? 'Synthesizing AI Reel...' : 'Generate Now'}</span>
            </div>

            <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-black/30 text-xs font-bold text-stone-950">
              <span>{tpl.creditCost} Credits</span>
            </div>
          </button>

          <p className="text-[11px] text-center text-stone-400">
            {!hasCredits
              ? `You need ${tpl.creditCost} credits (Balance: ${userBalance}) · Tap to get credits`
              : 'Server-guaranteed generation with automatic 100% refund on failure'}
          </p>
        </div>
      </footer>
    </div>
  );
};
