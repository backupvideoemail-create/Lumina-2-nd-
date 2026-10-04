import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft,
  X,
  Upload,
  Sparkles,
  Camera,
  Image as ImageIcon,
  Check,
  AlertCircle,
  Play,
  RotateCw,
  Layers,
  Music,
  Share2
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
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [previewMode, setPreviewMode] = useState<'template' | 'sample'>('template');
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!selectedTemplate) return null;

  const tpl = selectedTemplate;
  const hasCredits = (wallet?.balance ?? 0) >= tpl.creditCost;

  // Validate and handle file upload
  const processFile = (file: File) => {
    setUploadError(null);

    // Validate size (< 25MB)
    const MAX_SIZE = 25 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setUploadError('File size exceeds 25MB limit. Please upload a smaller file.');
      return;
    }

    // Validate MIME type
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
        inputMediaUrl: uploadedMedia
      });
      return;
    }

    if (!hasCredits) {
      setInsufficientCreditsModal({
        open: true,
        requiredCredits: tpl.creditCost,
        availableCredits: wallet?.balance ?? 0
      });
      return;
    }

    setIsGenerating(true);
    const res = await createGeneration(tpl.id, uploadedMedia);
    setIsGenerating(false);

    if (res.success) {
      // Close template modal so result/generation screen becomes active
      setSelectedTemplate(null);
    } else if (res.error) {
      setUploadError(res.error);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#08080a] overflow-y-auto no-scrollbar flex flex-col justify-between">
      {/* Top Floating App Bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between px-4 py-3 bg-[#08080a]/80 backdrop-blur-md border-b border-white/5">
        <button
          onClick={() => setSelectedTemplate(null)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-stone-300 hover:text-white transition-colors"
          aria-label="Back"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-xs font-medium">Back</span>
        </button>

        {/* Template Title Pill */}
        <div className="px-3.5 py-1 rounded-full bg-stone-900 border border-white/10 text-xs font-semibold text-white max-w-[200px] sm:max-w-xs truncate">
          {tpl.title}
        </div>

        {/* Available credits indicator */}
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#1b1914] border border-[#d4af37]/30 text-xs font-semibold text-[#f5d77f]">
          <Sparkles className="w-3.5 h-3.5 fill-[#d4af37]" />
          <span>{wallet?.balance ?? 0}</span>
        </div>
      </div>

      {/* Main Scroll Content */}
      <div className="max-w-2xl w-full mx-auto px-4 py-4 space-y-6 pb-32">
        {/* Full Cinematic Preview Card */}
        <div className="relative rounded-3xl overflow-hidden bg-stone-950 border border-white/10 shadow-2xl">
          {/* Media Preview Box */}
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
            <img
              src={previewMode === 'sample' && tpl.sampleResult ? tpl.sampleResult : tpl.preview}
              alt={tpl.title}
              className="w-full h-full object-cover"
            />

            {/* Gradient Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 pointer-events-none" />

            {/* Switch between Style Template & AI Sample */}
            {tpl.sampleResult && (
              <div className="absolute top-4 left-4 z-10 flex items-center p-1 rounded-full bg-black/60 backdrop-blur-md border border-white/10">
                <button
                  type="button"
                  onClick={() => setPreviewMode('template')}
                  className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                    previewMode === 'template' ? 'bg-[#d4af37] text-black' : 'text-stone-300 hover:text-white'
                  }`}
                >
                  Template Style
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewMode('sample')}
                  className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                    previewMode === 'sample' ? 'bg-[#d4af37] text-black' : 'text-stone-300 hover:text-white'
                  }`}
                >
                  AI Generated Result
                </button>
              </div>
            )}

            {/* Floating Credit Requirement Badge */}
            <div className="absolute top-4 right-4 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/75 backdrop-blur-md border border-[#d4af37]/50 text-xs font-bold text-[#f5d77f] shadow-lg">
              <Sparkles className="w-3.5 h-3.5 fill-[#d4af37]" />
              <span>{tpl.creditCost} Credits</span>
            </div>

            {/* Overlay Title on Media */}
            <div className="absolute bottom-4 inset-x-4 pointer-events-none">
              <div className="flex items-center gap-2 text-[11px] font-semibold text-[#e0cf9b] uppercase tracking-wider mb-1">
                <span>{tpl.category}</span>
                <span aria-hidden="true" className="text-stone-500">·</span>
                <span>{tpl.type === 'video' ? 'Video Reel' : 'Photo Studio'}</span>
                <span aria-hidden="true" className="text-stone-500">·</span>
                <span>{tpl.resolutionLabel || 'Ultra HD'}</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold font-display text-white drop-shadow-md">
                {tpl.title}
              </h2>
            </div>
          </div>
        </div>

        {/* Template Description & Spec Bar */}
        <div className="p-4 rounded-2xl bg-[#111116] border border-white/10 space-y-3">
          <p className="text-sm text-stone-300 leading-relaxed">
            {tpl.description}
          </p>

          <div className="pt-2 border-t border-white/5 flex flex-wrap items-center justify-between gap-y-2 text-xs text-stone-400">
            <div className="flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-[#d4af37]" />
              <span>Engine: {tpl.engine === 'AI_GENERATION' ? 'Generative Neural Studio' : 'Smart Motion Canvas'}</span>
            </div>

            {tpl.musicTrack && (
              <div className="flex items-center gap-2 text-amber-200/80">
                <Music className="w-3.5 h-3.5" />
                <span>Audio: {tpl.musicTrack.name}</span>
              </div>
            )}
          </div>
        </div>

        {/* Upload Media Card (Drag & Drop + Mobile Native) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wider text-stone-300 flex items-center gap-2">
              <span>Your Input Media</span>
              <span className="text-stone-500 normal-case font-normal">(Required)</span>
            </label>
            {uploadedMedia && (
              <button
                onClick={() => setUploadedMedia(null)}
                className="text-xs text-stone-400 hover:text-white transition-colors"
              >
                Change photo
              </button>
            )}
          </div>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/jpeg,image/png,image/webp,video/mp4"
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
              className={`p-6 sm:p-8 rounded-2xl border-2 border-dashed cursor-pointer text-center transition-all ${
                isDragging
                  ? 'border-[#d4af37] bg-[#d4af37]/10'
                  : 'border-white/15 bg-stone-900/60 hover:bg-stone-900 hover:border-white/30'
              }`}
            >
              <div className="w-12 h-12 mx-auto rounded-full bg-white/5 flex items-center justify-center mb-3">
                <Upload className="w-6 h-6 text-stone-300" />
              </div>
              <h4 className="text-sm font-semibold text-white">
                Upload your {tpl.type === 'video' ? 'photo or video' : 'photo'}
              </h4>
              <p className="text-xs text-stone-400 mt-1 max-w-xs mx-auto">
                Drag and drop here, or tap to choose from gallery or camera
              </p>
              <div className="flex items-center justify-center gap-3 mt-4 text-[11px] text-stone-500">
                <span>JPG, PNG, WEBP</span>
                <span aria-hidden="true">·</span>
                <span>Max 25MB</span>
              </div>
            </div>
          ) : (
            /* Uploaded Preview Card */
            <div className="relative rounded-2xl overflow-hidden bg-stone-900 border border-[#d4af37]/40 p-3 flex items-center gap-3.5">
              <img
                src={uploadedMedia}
                alt="Uploaded input"
                className="w-16 h-16 rounded-xl object-cover border border-white/10 shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                  <Check className="w-3.5 h-3.5" />
                  <span>Media uploaded & verified</span>
                </div>
                <p className="text-xs text-stone-400 mt-0.5 truncate">
                  Ready for AI template rendering
                </p>
              </div>
              <button
                onClick={() => setUploadedMedia(null)}
                className="p-2 text-stone-400 hover:text-white rounded-lg hover:bg-white/5"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Upload Error Alert */}
          {uploadError && (
            <div className="p-3 rounded-xl bg-red-950/60 border border-red-800/60 flex items-start gap-2.5 text-xs text-red-200">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
              <span>{uploadError}</span>
            </div>
          )}
        </div>
      </div>

      {/* Sticky Bottom Generate Bar (Overlapping UI) */}
      <div className="fixed bottom-0 inset-x-0 z-40 p-4 bg-gradient-to-t from-[#08080a] via-[#08080a]/95 to-transparent backdrop-blur-md">
        <div className="max-w-md mx-auto space-y-2">
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className={`w-full py-4 px-6 rounded-2xl text-base font-bold flex items-center justify-between shadow-2xl transition-all ${
              uploadedMedia
                ? 'gold-button cursor-pointer'
                : 'bg-stone-800 text-stone-400 border border-white/10 cursor-pointer hover:bg-stone-700'
            }`}
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 fill-current" />
              <span>{isGenerating ? 'Synthesizing...' : 'Generate Now'}</span>
            </div>

            <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-black/25 text-xs font-semibold">
              <span>{tpl.creditCost} Credits</span>
            </div>
          </button>

          <p className="text-[11px] text-center text-stone-400">
            {!hasCredits
              ? `You have ${wallet?.balance ?? 0} credits · Tap to top up or unlock Pro Pass`
              : 'Server-guaranteed generation with automatic refund if processing fails'}
          </p>
        </div>
      </div>
    </div>
  );
};
