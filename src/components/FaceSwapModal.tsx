import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Sparkles,
  Upload,
  ArrowRight,
  ArrowLeft,
  Check,
  Video,
  User,
  Wand2,
  AlertCircle,
  Play,
  RotateCw
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { FaceSwapScene } from '../types';

export const FaceSwapModal: React.FC = () => {
  const {
    faceSwapModalOpen,
    setFaceSwapModalOpen,
    faceSwapScenes,
    selectedFaceSwapScene,
    setSelectedFaceSwapScene,
    generateFaceSwapVideo,
    wallet,
    setInsufficientCreditsModal
  } = useApp();

  const activeScene = selectedFaceSwapScene || faceSwapScenes[0];
  const [facePhoto, setFacePhoto] = useState<string | null>(activeScene?.sampleFace || null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!faceSwapModalOpen) return null;

  const hasCredits = (wallet?.balance ?? 0) >= activeScene.creditCost;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 25 * 1024 * 1024) {
      setUploadError('File size exceeds 25MB limit.');
      return;
    }

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setUploadError('Please upload a clear JPG, PNG or WEBP portrait photo.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      setFacePhoto(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleGenerate = async () => {
    if (!facePhoto) {
      setUploadError('Please select or upload your face photo first.');
      return;
    }

    if (!hasCredits) {
      setInsufficientCreditsModal({
        open: true,
        requiredCredits: activeScene.creditCost,
        availableCredits: wallet?.balance ?? 0
      });
      return;
    }

    setIsGenerating(true);
    const res = await generateFaceSwapVideo(activeScene.id, facePhoto);
    setIsGenerating(false);

    if (res.success) {
      setFaceSwapModalOpen(false);
    } else if (res.error) {
      setUploadError(res.error);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#08080a] flex flex-col justify-between overflow-y-auto no-scrollbar">
      {/* Top Header */}
      <div className="sticky top-0 z-30 flex items-center justify-between px-4 py-3 bg-[#08080a]/85 backdrop-blur-xl border-b border-white/5">
        <button
          onClick={() => setFaceSwapModalOpen(false)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-stone-300 hover:text-white transition-colors text-xs font-semibold"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-[#d4af37] animate-pulse" />
          <span className="text-xs font-bold text-white uppercase tracking-wider">
            Face Swap Video Studio
          </span>
        </div>

        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#1c1912] border border-[#d4af37]/40 text-xs font-bold text-[#f5d77f]">
          <Sparkles className="w-3.5 h-3.5 fill-[#d4af37]" />
          <span>{wallet?.balance ?? 0}</span>
        </div>
      </div>

      {/* Main Flow Content */}
      <div className="max-w-xl w-full mx-auto px-4 py-4 space-y-6 pb-32">
        {/* Step 1: Select Video Scene */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-wider text-stone-300 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-[#d4af37] text-stone-950 flex items-center justify-center text-[10px] font-black">1</span>
              <span>Select Video Scene</span>
            </label>
            <span className="text-[11px] text-[#f5d77f] font-semibold">
              {faceSwapScenes.length} 9:16 Scenes
            </span>
          </div>

          {/* Horizontal Scene Selector */}
          <div className="flex gap-3 overflow-x-auto no-scrollbar py-1 -mx-4 px-4">
            {faceSwapScenes.map((scene) => {
              const isSelected = activeScene.id === scene.id;
              return (
                <div
                  key={scene.id}
                  onClick={() => setSelectedFaceSwapScene(scene)}
                  className={`relative shrink-0 w-36 sm:w-40 rounded-2xl overflow-hidden cursor-pointer border-2 transition-all ${
                    isSelected
                      ? 'border-[#d4af37] scale-105 shadow-[0_0_20px_rgba(212,175,55,0.4)]'
                      : 'border-white/10 opacity-70 hover:opacity-100'
                  }`}
                >
                  <div className="aspect-[9/14] w-full bg-black relative">
                    <img
                      src={scene.resultVideoPreview}
                      alt={scene.title}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/30" />
                    {isSelected && (
                      <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[#d4af37] flex items-center justify-center">
                        <Check className="w-3 h-3 text-black stroke-[3]" />
                      </div>
                    )}
                    <div className="absolute bottom-2 inset-x-2">
                      <span className="text-[11px] font-bold text-white line-clamp-1 leading-tight">
                        {scene.title}
                      </span>
                      <span className="text-[9px] text-[#e0cf9b] block">
                        {scene.durationSeconds}s · {scene.creditCost} ✦
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Step 2: Add Face Photo */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-wider text-stone-300 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-[#d4af37] text-stone-950 flex items-center justify-center text-[10px] font-black">2</span>
              <span>Add Face Photo</span>
            </label>
            <span className="text-[11px] text-stone-400">Clear frontal face</span>
          </div>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
          />

          {/* Quick Preset Faces or Custom Upload */}
          <div className="p-4 rounded-2xl bg-[#121217] border border-white/10 space-y-3">
            <div className="flex items-center gap-3">
              {facePhoto ? (
                <div className="relative">
                  <img
                    src={facePhoto}
                    alt="Selected Face"
                    className="w-16 h-16 rounded-2xl object-cover border-2 border-[#d4af37] shadow-lg shrink-0"
                  />
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center border border-black">
                    <Check className="w-3 h-3 text-black stroke-[3]" />
                  </div>
                </div>
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-stone-900 border border-white/15 flex items-center justify-center shrink-0">
                  <User className="w-8 h-8 text-stone-500" />
                </div>
              )}

              <div className="flex-1 min-w-0">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="py-2 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload My Photo</span>
                </button>
                <p className="text-[11px] text-stone-400 mt-1">
                  Choose from your phone's camera, gallery, or one of the models below.
                </p>
              </div>
            </div>

            {/* Quick 1-Tap Sample Models */}
            <div className="pt-2 border-t border-white/5 space-y-1.5">
              <span className="text-[10px] uppercase font-bold text-stone-500 block">
                Or 1-Tap Test Model:
              </span>
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                {faceSwapScenes.map((s, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setFacePhoto(s.sampleFace)}
                    className={`relative w-10 h-10 rounded-xl overflow-hidden border transition-all shrink-0 ${
                      facePhoto === s.sampleFace ? 'border-[#d4af37] scale-105' : 'border-transparent opacity-60'
                    }`}
                  >
                    <img src={s.sampleFace} alt="Preset Face" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {uploadError && (
            <div className="p-3 rounded-xl bg-red-950/60 border border-red-800/60 flex items-center gap-2 text-xs text-red-200">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{uploadError}</span>
            </div>
          )}
        </div>

        {/* Step 3: Live Preview of Selected Match */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-stone-300 flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-[#d4af37] text-stone-950 flex items-center justify-center text-[10px] font-black">3</span>
            <span>Video Scene Preview</span>
          </label>

          <div className="relative rounded-3xl overflow-hidden bg-black border border-white/10 shadow-2xl aspect-[9/14] max-h-[460px] mx-auto w-full flex items-center justify-center">
            <img
              src={activeScene.resultVideoPreview}
              alt={activeScene.title}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/30" />

            {/* Inset of target face */}
            {facePhoto && (
              <div className="absolute top-4 left-4 z-20 flex items-center gap-2 p-1.5 rounded-2xl bg-black/75 backdrop-blur-xl border border-[#d4af37]/50 shadow-xl">
                <img
                  src={facePhoto}
                  alt="Source face"
                  className="w-10 h-10 rounded-xl object-cover border border-[#d4af37]"
                />
                <div className="pr-2 text-left">
                  <span className="text-[9px] uppercase font-bold text-[#f5d77f] block">Target Face</span>
                  <span className="text-[11px] font-semibold text-white">Active Portrait</span>
                </div>
              </div>
            )}

            {/* Credit Cost Badge */}
            <div className="absolute top-4 right-4 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/75 backdrop-blur-md border border-[#d4af37]/50 text-xs font-bold text-[#f5d77f]">
              <Sparkles className="w-3.5 h-3.5 fill-[#d4af37]" />
              <span>{activeScene.creditCost} Credits</span>
            </div>

            {/* Bottom Scene Title Overlay */}
            <div className="absolute bottom-4 inset-x-4 z-20">
              <span className="text-[11px] font-bold text-[#d4af37] uppercase tracking-wider">
                {activeScene.category}
              </span>
              <h3 className="text-xl font-bold font-display text-white mt-0.5">
                {activeScene.title}
              </h3>
              <p className="text-xs text-stone-300 mt-1 line-clamp-2">
                {activeScene.description}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky Bottom Generate Button (Overlapping UI) */}
      <div className="fixed bottom-0 inset-x-0 z-40 p-4 bg-gradient-to-t from-[#08080a] via-[#08080a]/95 to-transparent backdrop-blur-xl">
        <div className="max-w-md mx-auto space-y-2">
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={handleGenerate}
            disabled={isGenerating}
            className={`w-full py-4 px-6 rounded-2xl text-base font-bold flex items-center justify-between shadow-2xl transition-all cursor-pointer ${
              facePhoto
                ? 'gold-button'
                : 'bg-stone-800 text-stone-400 border border-white/10'
            }`}
          >
            <div className="flex items-center gap-2">
              <Wand2 className="w-5 h-5" />
              <span>{isGenerating ? 'Synthesizing Face Swap...' : 'Generate Face Swap Video'}</span>
            </div>

            <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-black/25 text-xs font-semibold">
              <span>{activeScene.creditCost} Credits</span>
            </div>
          </motion.button>

          <p className="text-[11px] text-center text-stone-400">
            {!hasCredits
              ? `You have ${wallet?.balance ?? 0} credits · Tap to top up or unlock Pro Pass (₹1)`
              : 'Automatic credit refund guarantee if video rendering fails'}
          </p>
        </div>
      </div>
    </div>
  );
};
