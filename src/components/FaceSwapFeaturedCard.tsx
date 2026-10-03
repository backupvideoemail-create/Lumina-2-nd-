import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Sparkles, Wand2, ArrowRight, Video, UserCheck, Flame } from 'lucide-react';
import { useApp } from '../context/AppContext';

export const FaceSwapFeaturedCard: React.FC = () => {
  const { faceSwapScenes, setSelectedFaceSwapScene, setFaceSwapModalOpen } = useApp();
  const [activeTab, setActiveTab] = useState<'after' | 'before'>('after');

  const topScene = faceSwapScenes[0]; // Monaco GP Supercar Driver

  const handleOpenFaceSwap = () => {
    setSelectedFaceSwapScene(topScene);
    setFaceSwapModalOpen(true);
  };

  return (
    <div className="relative w-full max-w-4xl mx-auto px-4 mt-6">
      {/* Liquid-Glass Outer Frame with Gold Ambient Glow */}
      <motion.div
        whileHover={{ y: -3 }}
        transition={{ type: 'spring', stiffness: 350, damping: 25 }}
        className="relative rounded-[28px] overflow-hidden bg-gradient-to-b from-[#181613] via-[#101015] to-[#0a0a0e] border border-[#d4af37]/40 shadow-[0_16px_40px_rgba(0,0,0,0.85),0_0_28px_rgba(212,175,55,0.15)] group"
      >
        {/* Subtle top reflection sweep */}
        <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-[#f5d77f]/60 to-transparent pointer-events-none z-20" />

        {/* Top Badges & Priority Ribbon */}
        <div className="relative z-20 p-4 sm:p-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#d4af37] text-stone-950 text-[10px] sm:text-xs font-black tracking-wider uppercase shadow-[0_0_15px_rgba(212,175,55,0.5)]">
              <Flame className="w-3 h-3 fill-stone-950" />
              <span>TOP FEATURE · AI VIDEO</span>
            </span>

            <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/10 backdrop-blur-md text-stone-300 text-[11px] font-semibold border border-white/10">
              <Video className="w-3 h-3 text-[#d4af37]" />
              <span>9:16 Vertical Reel</span>
            </span>
          </div>

          {/* Credit Badge */}
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/60 backdrop-blur-md border border-[#d4af37]/50 text-xs font-bold text-[#f5d77f]">
            <Sparkles className="w-3.5 h-3.5 fill-[#d4af37]" />
            <span>{topScene.creditCost} Credits</span>
          </div>
        </div>

        {/* Center Visual: Before & After Interactive Preview */}
        <div className="relative px-4 sm:px-6">
          <div className="relative rounded-2xl overflow-hidden aspect-[16/9] sm:aspect-[21/9] w-full bg-stone-950 border border-white/10 shadow-2xl">
            {/* Visual Image */}
            <img
              src={activeTab === 'after' ? topScene.resultVideoPreview : topScene.sourceVideoPreview}
              alt="Face Swap Cinematic Preview"
              className="w-full h-full object-cover transition-all duration-700 ease-out group-hover:scale-105"
            />

            {/* Cinematic Scrim */}
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />

            {/* Before / After Floating Interactive Pill Switcher */}
            <div className="absolute top-3 left-3 z-20 flex items-center p-0.5 rounded-full bg-black/70 backdrop-blur-xl border border-white/15 shadow-lg">
              <button
                type="button"
                onClick={() => setActiveTab('before')}
                className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-all ${
                  activeTab === 'before'
                    ? 'bg-stone-800 text-white shadow'
                    : 'text-stone-400 hover:text-white'
                }`}
              >
                Actor Video
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('after')}
                className={`px-3 py-1 rounded-full text-[10px] font-bold transition-all flex items-center gap-1 ${
                  activeTab === 'after'
                    ? 'bg-gradient-to-r from-[#d4af37] to-amber-500 text-stone-950 shadow-[0_0_12px_rgba(212,175,55,0.4)]'
                    : 'text-stone-400 hover:text-white'
                }`}
              >
                <Sparkles className="w-2.5 h-2.5 fill-current" />
                <span>Your Face Swapped</span>
              </button>
            </div>

            {/* Face Inset Thumbnail (Showing Face Input source) */}
            <div className="absolute bottom-3 right-3 z-20 flex items-center gap-2 p-1.5 rounded-xl bg-black/70 backdrop-blur-md border border-white/15">
              <img
                src={topScene.sampleFace}
                alt="Source Face"
                className="w-8 h-8 rounded-lg object-cover border border-[#d4af37]/60"
              />
              <div className="text-left pr-1.5 hidden xs:block">
                <span className="text-[9px] uppercase font-bold text-[#d4af37] block">Your Face</span>
                <span className="text-[10px] text-stone-300 font-semibold">Seamless Blend</span>
              </div>
            </div>

            {/* Bottom Title inside media */}
            <div className="absolute bottom-3 left-3 z-10 max-w-xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#f5d77f] drop-shadow">
                {topScene.title}
              </span>
            </div>
          </div>
        </div>

        {/* Bottom Headline, Subtitle and Strong CTA (Overlapping Depth UI) */}
        <div className="p-4 sm:p-6 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-xl sm:text-2xl font-black font-display text-white tracking-tight leading-snug">
                FACE SWAP VIDEO
              </h2>
              <p className="text-xs sm:text-sm text-stone-300 mt-0.5 max-w-md">
                Create a cinematic video with your face. Star in high-speed Monaco GP supercars, Cannes red carpets, and cyber neon epics.
              </p>
            </div>

            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.96 }}
              onClick={handleOpenFaceSwap}
              className="py-3 px-6 gold-button rounded-2xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-[0_0_24px_rgba(212,175,55,0.4)] cursor-pointer shrink-0"
            >
              <Wand2 className="w-4 h-4" />
              <span>Try Face Swap</span>
              <ArrowRight className="w-4 h-4" />
            </motion.button>
          </div>

          {/* Quick Scene Chips */}
          <div className="pt-2 border-t border-white/5 flex items-center gap-2 overflow-x-auto no-scrollbar">
            <span className="text-[10px] uppercase font-bold text-stone-500 whitespace-nowrap">
              Scenes:
            </span>
            {faceSwapScenes.map((scene) => (
              <button
                key={scene.id}
                onClick={() => {
                  setSelectedFaceSwapScene(scene);
                  setFaceSwapModalOpen(true);
                }}
                className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 text-[11px] text-stone-300 hover:text-white whitespace-nowrap transition-colors flex items-center gap-1.5"
              >
                <Video className="w-3 h-3 text-[#d4af37]" />
                <span>{scene.title}</span>
              </button>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
};
