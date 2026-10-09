import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Play,
  Pause,
  Sparkles,
  Wand2,
  ArrowRight,
  Video,
  Flame,
  Volume2,
  VolumeX,
  Eye,
  CheckCircle2
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { isVideoMedia } from '../utils/mediaUtils';

export const FaceSwapFeaturedCard: React.FC = () => {
  const {
    faceSwapScenes,
    selectedFaceSwapScene,
    setSelectedFaceSwapScene,
    setFaceSwapModalOpen
  } = useApp();

  // Mode: 'demo' (Marketing demo video), 'after' (Swapped Face Result), 'before' (Original Driving Video)
  const [previewMode, setPreviewMode] = useState<'demo' | 'after' | 'before'>('demo');
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [soundInteracted, setSoundInteracted] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Active scene: selected scene if available, otherwise first scene
  const activeScene = selectedFaceSwapScene || faceSwapScenes[0] || {
    id: 'fsv_trending_dance_stage',
    title: 'Viral Instagram Reels Sequence',
    description: 'Electrifying neon stage choreography with fluid hip-hop footwork.',
    sourceVideoPreview: 'https://images.unsplash.com/photo-1547153760-18fc86324498?auto=format&fit=crop&w=900&q=80',
    resultVideoPreview: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?auto=format&fit=crop&w=900&q=80',
    sampleFace: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
    creditCost: 45,
    durationSeconds: 9,
    aspectRatio: '9:16' as const,
    category: 'Dance & Viral',
    tags: ['Face Swap', 'Dance', 'Instagram Reels'],
    demoVideoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-girl-dancing-happy-in-a-party-with-lights-40915-large.mp4'
  };

  const [liveDemoVideoUrl, setLiveDemoVideoUrl] = useState<string>(activeScene.demoVideoUrl || '');

  // Fetch live admin-managed global demo video from server
  useEffect(() => {
    let isMounted = true;
    fetch('/api/faceswap/config')
      .then((res) => res.json())
      .then((data) => {
        if (isMounted && data.demoVideoUrl) {
          setLiveDemoVideoUrl(data.demoVideoUrl);
        }
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, []);

  // Determine current media source and whether it is a video
  const currentMediaUrl =
    previewMode === 'demo'
      ? liveDemoVideoUrl || activeScene.demoVideoUrl || 'https://assets.mixkit.co/videos/preview/mixkit-girl-dancing-happy-in-a-party-with-lights-40915-large.mp4'
      : previewMode === 'after'
      ? activeScene.resultVideoPreview
      : activeScene.sourceVideoPreview;

  const isCurrentVideo = previewMode === 'demo' || isVideoMedia(currentMediaUrl);

  // Maintain seamless video playback and muted status across mode/scene transitions
  useEffect(() => {
    if (isCurrentVideo && videoRef.current) {
      videoRef.current.muted = isMuted;
      videoRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch(() => {
        // Autoplay may wait for user gesture if unmuted; fallback to muted
        if (!isMuted && videoRef.current) {
          videoRef.current.muted = true;
          setIsMuted(true);
          videoRef.current.play().catch(() => {});
        }
      });
    }
  }, [previewMode, currentMediaUrl, isCurrentVideo]);

  // Real, functioning audio toggle (respects browser autoplay restrictions)
  const handleToggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!videoRef.current) return;
    const nextMuted = !isMuted;
    videoRef.current.muted = nextMuted;
    setIsMuted(nextMuted);
    setSoundInteracted(true);
    if (!nextMuted) {
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  // Real, functioning play/pause toggle
  const handleTogglePlay = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch(() => {});
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const handleOpenFaceSwap = () => {
    setSelectedFaceSwapScene(activeScene);
    setFaceSwapModalOpen(true);
  };

  return (
    <div id="face-swap-featured-card" className="relative w-full max-w-5xl mx-auto px-2 sm:px-4 mt-3">
      {/* Liquid-Glass Outer Frame with Gold Ambient Glow */}
      <motion.div
        whileHover={{ y: -2 }}
        transition={{ type: 'spring', stiffness: 350, damping: 25 }}
        className="relative rounded-[24px] overflow-hidden bg-gradient-to-b from-[#181613] via-[#101015] to-[#0a0a0e] border border-[#d4af37]/40 shadow-[0_12px_32px_rgba(0,0,0,0.85),0_0_24px_rgba(212,175,55,0.15)] group"
      >
        {/* Top reflection sweep */}
        <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-[#f5d77f]/60 to-transparent pointer-events-none z-20" />

        {/* Top Badges & Priority Ribbon */}
        <div className="relative z-20 px-3.5 py-2.5 sm:px-5 sm:py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#d4af37] text-stone-950 text-[10px] sm:text-xs font-black tracking-wider uppercase shadow-[0_0_12px_rgba(212,175,55,0.5)]">
              <Flame className="w-3 h-3 fill-stone-950" />
              <span>TOP FEATURE · AI VIDEO</span>
            </span>

            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white/10 backdrop-blur-md text-stone-200 text-[11px] font-semibold border border-white/10">
              <Video className="w-3 h-3 text-[#d4af37]" />
              <span>{activeScene.category || 'Viral Reels'}</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] sm:text-[11px] font-bold text-amber-300/90 hidden xs:inline uppercase tracking-wider">
              {previewMode === 'demo' ? 'Live Demo' : previewMode === 'after' ? 'Swapped Face' : 'Original Video'}
            </span>
          </div>
        </div>

        {/* Center Visual: Dedicated Video/Image Slot & Interactive Mode Switcher */}
        <div className="relative px-3 sm:px-5">
          <div
            onClick={isCurrentVideo ? () => handleTogglePlay() : undefined}
            className={`relative rounded-2xl overflow-hidden aspect-[16/9] sm:aspect-[18/9] w-full bg-black border border-white/10 shadow-2xl flex items-center justify-center ${
              isCurrentVideo ? 'cursor-pointer' : ''
            }`}
          >
            {isCurrentVideo ? (
              <div className="relative w-full h-full flex items-center justify-center bg-black overflow-hidden">
                {/* Ambient dynamic background blur for full frame theater experience */}
                <video
                  src={currentMediaUrl}
                  autoPlay
                  playsInline
                  loop
                  muted
                  aria-hidden="true"
                  className="absolute inset-0 w-full h-full object-cover filter blur-2xl opacity-30 scale-110 pointer-events-none select-none"
                />
                <video
                  ref={videoRef}
                  key={`${previewMode}_${currentMediaUrl}`}
                  src={currentMediaUrl}
                  autoPlay
                  playsInline
                  loop
                  muted={isMuted}
                  onContextMenu={(e) => e.preventDefault()}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  className="relative z-10 max-h-full max-w-full w-full h-full object-contain select-none"
                />
              </div>
            ) : (
              <div className="relative w-full h-full flex items-center justify-center bg-black overflow-hidden">
                <img
                  src={currentMediaUrl}
                  alt={activeScene.title}
                  aria-hidden="true"
                  className="absolute inset-0 w-full h-full object-cover filter blur-2xl opacity-30 scale-110 pointer-events-none select-none"
                />
                <img
                  src={currentMediaUrl}
                  alt={activeScene.title}
                  onContextMenu={(e) => e.preventDefault()}
                  draggable={false}
                  className="relative z-10 max-h-full max-w-full w-full h-full object-contain select-none"
                />
              </div>
            )}

            {/* Subtle Top & Bottom Cinematic Edge Gradients */}
            <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/60 to-transparent pointer-events-none z-10" />
            <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/60 to-transparent pointer-events-none z-10" />

            {/* Three Dedicated Preview Modes: Demo Video vs Swapped Face vs Original */}
            <div className="absolute top-2.5 left-2.5 z-20 flex items-center p-0.5 rounded-full bg-black/80 backdrop-blur-xl border border-white/15 shadow-lg">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPreviewMode('demo');
                }}
                className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-all flex items-center gap-1 cursor-pointer ${
                  previewMode === 'demo'
                    ? 'bg-gradient-to-r from-amber-400 to-[#d4af37] text-stone-950 shadow-[0_0_10px_rgba(212,175,55,0.4)]'
                    : 'text-stone-300 hover:text-white'
                }`}
              >
                <Play className="w-2.5 h-2.5 fill-current" />
                <span>Demo Video</span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPreviewMode('after');
                }}
                className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-all flex items-center gap-1 cursor-pointer ${
                  previewMode === 'after'
                    ? 'bg-gradient-to-r from-[#d4af37] to-amber-500 text-stone-950 shadow-[0_0_10px_rgba(212,175,55,0.4)]'
                    : 'text-stone-300 hover:text-white'
                }`}
              >
                <Sparkles className="w-2.5 h-2.5 fill-current" />
                <span>Swapped Face</span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPreviewMode('before');
                }}
                className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-all cursor-pointer ${
                  previewMode === 'before'
                    ? 'bg-stone-700 text-white shadow'
                    : 'text-stone-400 hover:text-white'
                }`}
              >
                Original
              </button>
            </div>

            {/* Top Right: Real Audio & Play/Pause Controls for Video */}
            {isCurrentVideo && (
              <div className="absolute top-2.5 right-2.5 z-20 flex items-center gap-1.5">
                {/* Audio Speaker Mute/Unmute Button */}
                <button
                  type="button"
                  onClick={handleToggleMute}
                  title={isMuted ? 'Tap to unmute sound' : 'Sound active · Tap to mute'}
                  className={`px-2 py-1 rounded-full text-[10px] font-bold flex items-center gap-1 backdrop-blur-md border transition-all cursor-pointer ${
                    isMuted
                      ? 'bg-black/75 border-white/20 text-stone-300 hover:text-white hover:bg-black/90'
                      : 'bg-[#d4af37] border-[#d4af37] text-stone-950 shadow-[0_0_12px_rgba(212,175,55,0.5)]'
                  }`}
                >
                  {isMuted ? (
                    <>
                      <VolumeX className="w-3 h-3 text-amber-400" />
                      <span className="hidden xs:inline">Muted</span>
                    </>
                  ) : (
                    <>
                      <Volume2 className="w-3 h-3 text-stone-950 fill-current" />
                      <span className="hidden xs:inline">Sound ON</span>
                    </>
                  )}
                </button>

                {/* Play/Pause Button */}
                <button
                  type="button"
                  onClick={handleTogglePlay}
                  title={isPlaying ? 'Pause' : 'Play'}
                  className="w-7 h-7 rounded-full bg-black/75 backdrop-blur-md border border-white/20 text-stone-200 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
                >
                  {isPlaying ? (
                    <Pause className="w-3 h-3" />
                  ) : (
                    <Play className="w-3 h-3 fill-current ml-0.5 text-amber-400" />
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Headline, Subtitle and Action CTA */}
        <div className="px-3.5 py-3 sm:px-5 space-y-2.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              {/* Scene Title Tagline (Cleanly positioned outside the video frame) */}
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-[11px] sm:text-xs font-black uppercase tracking-wider text-[#f5d77f] flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-[#d4af37]" />
                  <span>
                    {previewMode === 'demo'
                      ? 'VIRAL INSTAGRAM REELS SEQUENCE'
                      : (activeScene.title || 'VIRAL INSTAGRAM REELS SEQUENCE').toUpperCase()}
                  </span>
                </span>
                {previewMode === 'after' && (
                  <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold">
                    Swapped Face Active
                  </span>
                )}
                {previewMode === 'before' && (
                  <span className="px-2 py-0.5 rounded-md bg-stone-700 text-stone-300 text-[10px] font-bold">
                    Original Video
                  </span>
                )}
              </div>
              <h2 className="text-lg sm:text-xl font-black font-display text-white tracking-tight leading-snug">
                FACE SWAP VIDEO
              </h2>
              <p className="text-[11px] sm:text-xs text-stone-300 mt-0.5 max-w-md">
                Create a cinematic video with your face. Star in viral reels sequences, supercars, and red carpet epics.
              </p>
            </div>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.96 }}
              onClick={handleOpenFaceSwap}
              className="py-2.5 px-5 gold-button rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-[0_0_18px_rgba(212,175,55,0.35)] cursor-pointer shrink-0"
            >
              <Wand2 className="w-3.5 h-3.5" />
              <span>Try Face Swap</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </motion.button>
          </div>

          {/* Quick Scene Chips */}
          <div className="pt-1.5 border-t border-white/5 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            <span className="text-[9px] uppercase font-bold text-stone-500 whitespace-nowrap">
              Scenes:
            </span>
            {faceSwapScenes
              .filter((s) => s.isActive !== false && s.status !== 'draft')
              .map((scene) => {
                const isSelected = activeScene.id === scene.id;
                return (
                  <button
                    key={scene.id}
                    onClick={() => {
                      setSelectedFaceSwapScene(scene);
                      setPreviewMode('after');
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[10px] whitespace-nowrap transition-all flex items-center gap-1 cursor-pointer ${
                      isSelected
                        ? 'bg-gradient-to-r from-amber-400/20 to-[#d4af37]/20 border border-[#d4af37] text-amber-200 font-bold shadow-[0_0_8px_rgba(212,175,55,0.25)]'
                        : 'bg-white/5 hover:bg-white/10 border border-white/5 text-stone-300 hover:text-white'
                    }`}
                  >
                    <Video className="w-2.5 h-2.5 text-[#d4af37]" />
                    <span>{scene.title}</span>
                  </button>
                );
              })}
          </div>
        </div>
      </motion.div>
    </div>
  );
};
