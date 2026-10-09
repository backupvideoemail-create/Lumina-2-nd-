import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Sparkles,
  Upload,
  ArrowRight,
  ArrowLeft,
  Check,
  Video as VideoIcon,
  User,
  Wand2,
  AlertCircle,
  Play,
  RotateCw,
  Clock,
  Layers,
  Info,
  ShieldCheck,
  Plus,
  Trash2
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
    setInsufficientCreditsModal,
    setPlansModalOpen,
    setTopUpModalOpen,
    hasActivePlan
  } = useApp();

  const activeScene = selectedFaceSwapScene || faceSwapScenes[0];

  // 1. Source Video State
  const [videoSourceMode, setVideoSourceMode] = useState<'upload' | 'preset'>('upload');
  const [sourceVideoFile, setSourceVideoFile] = useState<File | null>(null);
  const [sourceVideoBase64, setSourceVideoBase64] = useState<string | null>(null);
  const [selectedPresetVideo, setSelectedPresetVideo] = useState<string>(
    activeScene?.sourceVideoPreview || activeScene?.resultVideoPreview || ''
  );

  useEffect(() => {
    if (activeScene) {
      setSelectedPresetVideo(activeScene.sourceVideoPreview || activeScene.resultVideoPreview || '');
    }
  }, [activeScene]);

  // 2. Video Duration Trimmer (Clamped between 4 and 15 seconds)
  const [durationSeconds, setDurationSeconds] = useState<number>(5);
  const [detectedVideoDuration, setDetectedVideoDuration] = useState<number | null>(null);

  // 3. Face Reference Images (1 to 8 photos, recommended 4-5, starts strictly with 0 customer references)
  const [referenceImages, setReferenceImages] = useState<string[]>([]);

  // 4. Custom Instructions (Optional, Hindi/English/Hinglish)
  const [customInstructions, setCustomInstructions] = useState<string>('');

  // 5. Dynamic Credit Calculation
  const [calculatedCredits, setCalculatedCredits] = useState<number>(214); // 5s default
  const [costUsd, setCostUsd] = useState<number>(1.59);
  const [isCalculating, setIsCalculating] = useState<boolean>(false);

  // 6. UI & Generation States
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const videoInputRef = useRef<HTMLInputElement>(null);
  const imagesInputRef = useRef<HTMLInputElement>(null);

  // Dynamic cost calculation when duration changes
  useEffect(() => {
    let isMounted = true;
    const fetchCost = async () => {
      setIsCalculating(true);
      try {
        const res = await fetch('/api/faceswap/calculate-cost', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ durationSeconds })
        });
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setCalculatedCredits(data.credits);
            setCostUsd(data.costUsd);
          }
        }
      } catch {
        // Fallback formula: duration * $0.318 * 96.3 * 1.40
        const usd = durationSeconds * 0.318;
        const creds = Math.ceil(usd * 96.3 * 1.4);
        if (isMounted) {
          setCalculatedCredits(creds);
          setCostUsd(Number(usd.toFixed(2)));
        }
      } finally {
        if (isMounted) setIsCalculating(false);
      }
    };

    fetchCost();
    return () => {
      isMounted = false;
    };
  }, [durationSeconds]);

  if (!faceSwapModalOpen) return null;

  const userBalance = wallet?.balance ?? 0;
  const hasCredits = userBalance >= calculatedCredits;

  // Handle Video Upload
  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMessage(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 80 * 1024 * 1024) {
      setErrorMessage('Video exceeds 80MB limit. Please upload a smaller video.');
      return;
    }

    // Client-side duration detection via temporary HTMLVideoElement
    const tempVideoUrl = URL.createObjectURL(file);
    const tempVideo = document.createElement('video');
    tempVideo.preload = 'metadata';
    tempVideo.onloadedmetadata = () => {
      URL.revokeObjectURL(tempVideoUrl);
      const dur = tempVideo.duration;
      if (dur < 3.8) {
        setErrorMessage(`Video is too short (${dur.toFixed(1)}s). Minimum 4 seconds required for Face Swap.`);
        setSourceVideoFile(null);
        setSourceVideoBase64(null);
        setDetectedVideoDuration(null);
        return;
      }
      setDetectedVideoDuration(Math.round(dur));
      const targetSec = Math.max(4, Math.min(15, Math.round(dur)));
      setDurationSeconds(targetSec);
    };
    tempVideo.src = tempVideoUrl;

    setSourceVideoFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setSourceVideoBase64(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Handle Multiple Face Reference Images Upload (1 to 8 images)
  const handleImagesUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMessage(null);
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const remainingSlots = 8 - referenceImages.length;
    if (remainingSlots <= 0) {
      setErrorMessage('Maximum 8 reference images already selected.');
      return;
    }

    const filesToProcess = files.slice(0, remainingSlots);

    filesToProcess.forEach((file) => {
      if (file.size > 20 * 1024 * 1024) {
        setErrorMessage('One or more images exceed 20MB limit.');
        return;
      }

      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) {
          setReferenceImages((prev) => {
            if (prev.length >= 8) return prev;
            return [...prev, ev.target!.result as string];
          });
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const removeReferenceImage = (index: number) => {
    setReferenceImages((prev) => prev.filter((_, i) => i !== index));
  };

  // Execute Generation
  const handleGenerate = async () => {
    setErrorMessage(null);

    // Validate Source Video
    const videoUrl = videoSourceMode === 'upload' ? sourceVideoBase64 : selectedPresetVideo;
    if (!videoUrl) {
      setErrorMessage('Please upload a source video or select a preset scene.');
      return;
    }

    // Validate Face References
    if (referenceImages.length === 0) {
      setErrorMessage('Please upload at least 1 face reference image (4-5 recommended).');
      return;
    }

    // Validate Credits
    if (!hasCredits) {
      setInsufficientCreditsModal({
        open: true,
        requiredCredits: calculatedCredits,
        availableCredits: userBalance
      });
      return;
    }

    setIsGenerating(true);

    const payload = {
      sourceVideoUrl: videoSourceMode === 'preset' ? selectedPresetVideo : undefined,
      sourceVideoBase64: videoSourceMode === 'upload' ? sourceVideoBase64! : undefined,
      durationSeconds,
      faceReferenceBase64List: referenceImages,
      customInstructions: customInstructions.trim() || undefined
    };

    const res = await generateFaceSwapVideo(payload as any);
    setIsGenerating(false);

    if (res.success) {
      setFaceSwapModalOpen(false);
    } else if (res.error) {
      setErrorMessage(res.error);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#08080a] flex flex-col justify-between overflow-y-auto no-scrollbar">
      {/* Top Header */}
      <header className="sticky top-0 z-30 flex items-center justify-between px-4 py-3 bg-[#08080a]/90 backdrop-blur-xl border-b border-white/5">
        <button
          onClick={() => setFaceSwapModalOpen(false)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-stone-300 hover:text-white transition-colors text-xs font-semibold cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <h1 className="text-xs sm:text-sm font-bold text-white font-display tracking-wider uppercase">
            Face & Character Video (Genjutsu v1.0)
          </h1>
        </div>

        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#1b1914] border border-[#d4af37]/40 text-xs font-bold text-[#f5d77f]">
          <Sparkles className="w-3.5 h-3.5 fill-[#d4af37]" />
          <span>{userBalance} ✦</span>
        </div>
      </header>

      {/* Main Form Body */}
      <main className="max-w-2xl w-full mx-auto px-4 py-5 space-y-6 pb-36 flex-1">
        {/* Architecture & Specs Banner */}
        <section className="p-4 rounded-3xl bg-gradient-to-r from-amber-950/30 via-[#18161f] to-stone-900 border border-[#d4af37]/30 shadow-lg space-y-2">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#d4af37] text-black text-[10px] font-black uppercase tracking-wider">
              Higgsfield Genjutsu
            </span>
            <span className="text-[10px] text-amber-200/90 font-mono font-bold">
              480p High-Speed Transfer · $0.318/sec
            </span>
          </div>
          <h2 className="text-base sm:text-lg font-bold text-white leading-snug">
            Motion Transfer Face & Character Synthesis
          </h2>
          <p className="text-xs text-stone-300 leading-relaxed">
            Replaces the character in your video with the identity from your uploaded reference photos.
            Original motion, camera timing, and lighting are faithfully preserved.
          </p>
        </section>

        {/* STEP 1: Source Video Selection & Trimming */}
        <section className="space-y-3 p-4 rounded-3xl bg-[#111116] border border-white/10 shadow-md">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-wider text-stone-200 flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-[#ff9f00] text-black flex items-center justify-center text-[10px] font-black">1</span>
              <span>Select or Upload Source Video</span>
            </label>
            <div className="flex items-center p-0.5 rounded-full bg-black/60 border border-white/10 text-[10px] font-bold">
              <button
                type="button"
                onClick={() => setVideoSourceMode('upload')}
                className={`px-2.5 py-1 rounded-full transition-all cursor-pointer ${
                  videoSourceMode === 'upload' ? 'bg-[#d4af37] text-black shadow' : 'text-stone-400 hover:text-white'
                }`}
              >
                Upload Video
              </button>
              <button
                type="button"
                onClick={() => setVideoSourceMode('preset')}
                className={`px-2.5 py-1 rounded-full transition-all cursor-pointer ${
                  videoSourceMode === 'preset' ? 'bg-[#d4af37] text-black shadow' : 'text-stone-400 hover:text-white'
                }`}
              >
                Preset Scene
              </button>
            </div>
          </div>

          {videoSourceMode === 'upload' ? (
            <div>
              <input
                ref={videoInputRef}
                type="file"
                accept="video/mp4,video/quicktime,video/webm"
                className="hidden"
                onChange={handleVideoUpload}
              />
              {!sourceVideoBase64 ? (
                <div
                  onClick={() => videoInputRef.current?.click()}
                  className="p-6 rounded-2xl border-2 border-dashed border-white/15 hover:border-amber-500/40 bg-stone-900/60 hover:bg-stone-900 text-center cursor-pointer transition-all"
                >
                  <VideoIcon className="w-8 h-8 text-stone-400 mx-auto mb-2" />
                  <p className="text-xs font-bold text-white">Tap to upload your video (MP4 / MOV)</p>
                  <p className="text-[10px] text-stone-500 mt-1">Recommended: dance, walking, or reaction clips up to 80MB</p>
                </div>
              ) : (
                <div className="relative rounded-2xl overflow-hidden bg-black aspect-video max-h-56 flex items-center justify-center border border-amber-500/40">
                  <video src={sourceVideoBase64} controls playsInline className="w-full h-full object-contain" />
                  <button
                    type="button"
                    onClick={() => {
                      setSourceVideoBase64(null);
                      setSourceVideoFile(null);
                    }}
                    className="absolute top-2 right-2 p-1.5 rounded-full bg-black/80 hover:bg-rose-900/80 text-white transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
              {faceSwapScenes.map((scene) => (
                <div
                  key={scene.id}
                  onClick={() => {
                    setSelectedPresetVideo(scene.resultVideoPreview);
                    setSelectedFaceSwapScene(scene);
                  }}
                  className={`relative rounded-xl overflow-hidden aspect-[9/16] cursor-pointer border transition-all ${
                    selectedPresetVideo === scene.resultVideoPreview
                      ? 'border-[#d4af37] ring-2 ring-[#d4af37]/30 shadow-lg'
                      : 'border-white/10 opacity-70 hover:opacity-100'
                  }`}
                >
                  <img src={scene.resultVideoPreview} alt={scene.title} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                  <div className="absolute bottom-1.5 inset-x-1.5">
                    <p className="text-[10px] font-bold text-white truncate">{scene.title}</p>
                    <span className="text-[9px] text-[#f5d77f] font-medium">{scene.category}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* DURATION TRIMMER SLIDER (4 to 15 seconds) */}
          <div className="p-3.5 rounded-2xl bg-black/40 border border-white/5 space-y-2 mt-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-stone-300 font-semibold flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span>Trimmed Video Duration:</span>
              </span>
              <span className="font-mono font-bold text-amber-300 text-sm">
                {durationSeconds} Seconds
              </span>
            </div>

            <input
              type="range"
              min={4}
              max={15}
              step={1}
              value={durationSeconds}
              onChange={(e) => setDurationSeconds(Number(e.target.value))}
              className="w-full accent-amber-400 cursor-pointer"
            />

            <div className="flex justify-between text-[10px] text-stone-500 font-mono">
              <span>Min: 4s</span>
              <span>Recommended: 5s – 8s</span>
              <span>Max: 15s</span>
            </div>
          </div>
        </section>

        {/* STEP 2: 1 to 8 Face Reference Images (Recommended 4-5) */}
        <section className="space-y-3 p-4 rounded-3xl bg-[#111116] border border-white/10 shadow-md">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-wider text-stone-200 flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-[#ff9f00] text-black flex items-center justify-center text-[10px] font-black">2</span>
              <span>Upload Face Reference Photos ({referenceImages.length}/8)</span>
            </label>
            <span className="text-[10px] font-semibold text-amber-300/90">
              4–5 photos recommended
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-200 leading-relaxed flex items-start gap-2">
            <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span>
              <strong>Identity Tip:</strong> Upload 4 to 5 clear photos of the <em>same person</em> from different angles (front, side profiles, smiling) for best facial lock. All uploaded photos are sent to the model.
            </span>
          </div>

          <input
            ref={imagesInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleImagesUpload}
          />

          <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 pt-1">
            {referenceImages.map((imgUrl, idx) => (
              <div
                key={idx}
                className="relative rounded-xl overflow-hidden aspect-square border border-[#d4af37]/60 group shadow-md"
              >
                <img src={imgUrl} alt={`Ref ${idx + 1}`} className="w-full h-full object-cover" />
                <span className="absolute bottom-1 left-1 px-1 rounded bg-black/80 text-[8px] font-bold text-amber-300">
                  #{idx + 1}
                </span>
                <button
                  type="button"
                  onClick={() => removeReferenceImage(idx)}
                  className="absolute top-1 right-1 p-1 rounded-full bg-black/70 hover:bg-rose-900 text-white transition-colors cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}

            {referenceImages.length < 8 && (
              <button
                type="button"
                onClick={() => imagesInputRef.current?.click()}
                className="rounded-xl border-2 border-dashed border-white/20 hover:border-amber-400 aspect-square flex flex-col items-center justify-center text-stone-400 hover:text-white transition-colors cursor-pointer bg-white/[0.02]"
              >
                <Plus className="w-5 h-5 mb-0.5" />
                <span className="text-[9px] font-bold uppercase">Add</span>
              </button>
            )}
          </div>
        </section>

        {/* STEP 3: Custom Instructions (Optional) */}
        <section className="space-y-2 p-4 rounded-3xl bg-[#111116] border border-white/10 shadow-md">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-wider text-stone-200 flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-white/10 text-stone-300 flex items-center justify-center text-[10px] font-black">3</span>
              <span>Custom Instructions (Optional)</span>
            </label>
            <span className="text-[10px] text-stone-400">Hindi · English · Hinglish</span>
          </div>

          <div className="relative rounded-2xl bg-black/40 border border-white/10 p-2.5 focus-within:border-amber-400 transition-colors">
            <textarea
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
              placeholder="e.g. Keep natural skin tone, seamless edge blend, enhance cinematic lighting, maintain authentic expression..."
              rows={2}
              maxLength={300}
              className="w-full bg-transparent text-xs text-white placeholder-stone-500 focus:outline-none resize-none leading-relaxed"
            />
            <div className="flex items-center justify-between text-[10px] text-stone-500 pt-1 border-t border-white/5">
              <span>Server Identity Base Prompt strictly preserved</span>
              <span>{customInstructions.length}/300</span>
            </div>
          </div>
        </section>

        {/* STEP 4: Authoritative Real-Time Cost Calculation Card */}
        <section className="p-4 rounded-3xl bg-[#14121a] border border-[#d4af37]/30 shadow-xl space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-stone-300 font-bold uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>Authoritative Credit Cost</span>
            </span>
            <span className="text-[11px] font-mono text-stone-400">
              480p @ $0.318/s + 40% Markup
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="p-3 rounded-2xl bg-black/40 border border-white/10 flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-stone-400 block">Required</span>
                <span className="text-xl font-black text-amber-300 font-mono">
                  {calculatedCredits} ✦
                </span>
                <span className="text-[9px] text-stone-500 block font-mono">~${costUsd} USD</span>
              </div>
              <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400">
                <Sparkles className="w-4 h-4 fill-current" />
              </div>
            </div>

            <div className={`p-3 rounded-2xl border flex items-center justify-between ${
              hasCredits ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-rose-500/10 border-rose-500/30'
            }`}>
              <div>
                <span className="text-[10px] uppercase font-bold text-stone-400 block">Your Balance</span>
                <span className={`text-xl font-black font-mono ${hasCredits ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {userBalance} ✦
                </span>
                <span className="text-[9px] text-stone-500 block">
                  {hasCredits ? 'Eligible to run' : 'Top-up needed'}
                </span>
              </div>
              <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-stone-300">
                {hasCredits ? <Check className="w-4 h-4 text-emerald-400" /> : <AlertCircle className="w-4 h-4 text-rose-400" />}
              </div>
            </div>
          </div>

          {!hasCredits && (
            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  if (hasActivePlan) {
                    setTopUpModalOpen(true);
                  } else {
                    setPlansModalOpen(true);
                  }
                }}
                className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-amber-400 to-[#d4af37] text-black text-xs font-black flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
              >
                <span>{hasActivePlan ? 'Buy More Credits (Top-Up)' : 'Unlock Credits · Pro Pass (₹1)'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </section>

        {errorMessage && (
          <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-semibold flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}
      </main>

      {/* Sticky Bottom Generate Button */}
      <footer className="sticky bottom-0 inset-x-0 z-40 p-4 bg-gradient-to-t from-[#08080a] via-[#08080a]/95 to-transparent backdrop-blur-xl border-t border-white/5">
        <div className="max-w-md mx-auto space-y-2">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating || isCalculating}
            className={`w-full py-4 px-6 rounded-2xl text-base font-black flex items-center justify-between shadow-2xl transition-all cursor-pointer ${
              hasCredits
                ? 'gold-button'
                : 'bg-stone-800 text-stone-400 border border-white/10 hover:bg-stone-700'
            }`}
          >
            <div className="flex items-center gap-2">
              <Wand2 className="w-5 h-5 fill-current" />
              <span>
                {isGenerating
                  ? 'Synthesizing Genjutsu Video...'
                  : `Generate Face Video (${durationSeconds}s)`}
              </span>
            </div>

            <div className="flex items-center gap-1 px-3 py-1 rounded-xl bg-black/30 text-xs font-bold text-stone-950">
              <span>{calculatedCredits} Credits</span>
            </div>
          </button>

          <p className="text-[11px] text-center text-stone-400">
            {hasCredits
              ? 'Server-authoritative pipeline with 100% exact credit refund on any failure.'
              : `You need ${calculatedCredits} credits (Balance: ${userBalance}). Tap button above to get credits.`}
          </p>
        </div>
      </footer>
    </div>
  );
};
