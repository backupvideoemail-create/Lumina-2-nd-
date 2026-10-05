import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Sparkles, Wand2, ArrowRight, Video, UserCheck, Flame, Pause, Eye } from 'lucide-react';
import { useApp } from '../context/AppContext';

export const FaceSwapFeaturedCard: React.FC = () => {
  const { faceSwapScenes, setSelectedFaceSwapScene, setFaceSwapModalOpen } = useApp();
  const [previewMode, setPreviewMode] = useState<'demo' | 'after' | 'before'>('after');
  const [isPlayingDemo, setIsPlayingDemo] = useState(false);

  const topScene = faceSwapScenes[0]; // Trending Dance & Viral
  const [liveDemoVideoUrl, setLiveDemoVideoUrl] = useState<string>(topScene.demoVideoUrl || '');

  // Fetch live admin-managed demo video from server
  React.useEffect(() => {
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

  const handleOpenFaceSwap = () => {
    setSelectedFaceSwapScene(topScene);
    setFaceSwapModalOpen(true);
  };

  return (
    <div className="relative w-full max-w-5xl mx-auto px-2 sm:px-4 mt-3">
      {/* Liquid-Glass Outer Frame with Gold Ambient Glow - Sleek, wider & vertically compact */}
      <motion.div
        whileHover={{ y: -2 }}
        transition={{ type: 'spring', stiffness: 350, damping: 25 }}
        className="relative rounded-[24px] overflow-hidden bg-gradient-to-b from-[#181613] via-[#101015] to-[#0a0a0e] border border-[#d4af37]/40 shadow-[0_12px_32px_rgba(0,0,0,0.85),0_0_24px_rgba(212,175,55,0.15)] group"
      >
        {/* Subtle top reflection sweep */}
        <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-[#f5d77f]/60 to-transparent pointer-events-none z-20" />

        {/* Top Badges & Priority Ribbon */}
        <div className="relative z-20 px-3.5 py-2 sm:px-5 sm:py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#d4af37] text-stone-950 text-[10px] sm:text-xs font-black tracking-wider uppercase shadow-[0_0_12px_rgba(212,175,55,0.5)]">
              <Flame className="w-3 h-3 fill-stone-950" />
              <span>TOP FEATURE · AI VIDEO</span>
            </span>

            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/10 backdrop-blur-md text-stone-300 text-[11px] font-semibold border border-white/10">
              <Video className="w-3 h-3 text-[#d4af37]" />
              <span>9:16 Vertical Reel</span>
            </span>
          </div>

          {/* Credit Badge */}
          <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-black/60 backdrop-blur-md border border-[#d4af37]/50 text-xs font-bold text-[#f5d77f]">
            <Sparkles className="w-3 h-3 fill-[#d4af37]" />
            <span>{topScene.creditCost} Credits</span>
          </div>
        </div>

        {/* Center Visual: Dedicated Demo Video Slot & Before/After Interactive Preview */}
        <div className="relative px-3 sm:px-5">
          <div className="relative rounded-xl overflow-hidden aspect-[21/9] sm:aspect-[24/9] w-full bg-stone-950 border border-white/10 shadow-xl">
            {previewMode === 'demo' && (liveDemoVideoUrl || topScene.demoVideoUrl) ? (
              <video
                src={liveDemoVideoUrl || topScene.demoVideoUrl}
                autoPlay
                playsInline
                loop
                muted
                className="w-full h-full object-cover"
              />
            ) : (
              <img
                src={previewMode === 'after' ? topScene.resultVideoPreview : topScene.sourceVideoPreview}
                alt="Face Swap Cinematic Preview"
                className="w-full h-full object-cover transition-all duration-700 ease-out group-hover:scale-102"
              />
            )}

            {/* Cinematic Scrim */}
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/25 to-transparent pointer-events-none" />

            {/* Dedicated Mode Switcher: Demo Video vs Your Face Swapped vs Actor */}
            <div className="absolute top-2.5 left-2.5 z-20 flex items-center p-0.5 rounded-full bg-black/75 backdrop-blur-xl border border-white/15 shadow-lg">
              <button
                type="button"
                onClick={() => setPreviewMode('demo')}
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold transition-all flex items-center gap-1 ${
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
                onClick={() => setPreviewMode('after')}
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold transition-all flex items-center gap-1 ${
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
                onClick={() => setPreviewMode('before')}
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold transition-all ${
                  previewMode === 'before'
                    ? 'bg-stone-800 text-white shadow'
                    : 'text-stone-400 hover:text-white'
                }`}
              >
                Original
              </button>
            </div>

            {/* Face Inset Thumbnail (Source Face Preview) */}
            <div className="absolute bottom-2.5 right-2.5 z-20 flex items-center gap-2 p-1 rounded-lg bg-black/75 backdrop-blur-md border border-white/15">
              <img
                src={topScene.sampleFace}
                alt="Source Face"
                className="w-7 h-7 rounded-md object-cover border border-[#d4af37]/60"
              />
              <div className="text-left pr-1 hidden xs:block">
                <span className="text-[8.5px] uppercase font-bold text-[#d4af37] block leading-tight">Your Face</span>
                <span className="text-[9.5px] text-stone-300 font-semibold leading-tight">Seamless Blend</span>
              </div>
            </div>

            {/* Scene Label inside media */}
            <div className="absolute bottom-2.5 left-2.5 z-10 max-w-xs">
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-[#f5d77f] drop-shadow">
                {topScene.title}
              </span>
            </div>
          </div>
        </div>

        {/* Bottom Headline, Subtitle and Action CTA - Tightly spaced */}
        <div className="px-3.5 py-2.5 sm:px-5 sm:py-3 space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-lg sm:text-xl font-black font-display text-white tracking-tight leading-snug">
                FACE SWAP VIDEO
              </h2>
              <p className="text-[11px] sm:text-xs text-stone-300 mt-0.5 max-w-md">
                Create a cinematic video with your face. Star in viral dance sequences, supercars, and red carpet epics.
              </p>
            </div>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.96 }}
              onClick={handleOpenFaceSwap}
              className="py-2 px-5 gold-button rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-[0_0_18px_rgba(212,175,55,0.35)] cursor-pointer shrink-0"
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
            {faceSwapScenes.map((scene) => (
              <button
                key={scene.id}
                onClick={() => {
                  setSelectedFaceSwapScene(scene);
                  setFaceSwapModalOpen(true);
                }}
                className="px-2 py-0.5 rounded-md bg-white/5 hover:bg-white/10 border border-white/5 text-[10px] text-stone-300 hover:text-white whitespace-nowrap transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Video className="w-2.5 h-2.5 text-[#d4af37]" />
                <span>{scene.title}</span>
              </button>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
};
