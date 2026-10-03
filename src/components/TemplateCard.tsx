import React from 'react';
import { motion } from 'motion/react';
import { Play, Sparkles, Image as ImageIcon, UserCheck, Music2, ArrowUpRight } from 'lucide-react';
import { Template } from '../types';
import { useApp } from '../context/AppContext';

interface TemplateCardProps {
  template: Template;
  size?: 'compact' | 'standard' | 'large';
}

export const TemplateCard: React.FC<TemplateCardProps> = ({
  template,
  size = 'standard'
}) => {
  const {
    setSelectedTemplate,
    setSelectedFaceSwapScene,
    setFaceSwapModalOpen,
    faceSwapScenes
  } = useApp();

  const heightClasses = {
    compact: 'h-72 sm:h-80 w-52 sm:w-56 shrink-0',
    standard: 'h-[370px] sm:h-[420px] w-full',
    large: 'h-[420px] sm:h-[460px] w-full'
  };

  const handleCardClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (template.isFaceSwap) {
      const scene =
        faceSwapScenes.find((s) => s.id === (template.faceSwapSceneId || 'fsv_trending_dance_stage')) ||
        faceSwapScenes[0];
      setSelectedFaceSwapScene(scene);
      setFaceSwapModalOpen(true);
    } else {
      setSelectedTemplate(template);
    }
  };

  return (
    <motion.div
      whileHover={{ y: -6, scale: 1.018 }}
      whileTap={{ scale: 0.965 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      onClick={handleCardClick}
      className={`group relative rounded-[26px] p-[1.5px] cursor-pointer transition-all duration-300 laser-light-border shadow-[0_20px_45px_-12px_rgba(0,0,0,0.85),0_0_1px_1px_rgba(255,255,255,0.08)] hover:shadow-[0_26px_55px_-10px_rgba(0,0,0,0.95),0_0_24px_rgba(212,175,55,0.22)] ${heightClasses[size]}`}
    >
      {/* Inner Frosted Glass Chassis */}
      <div className="w-full h-full rounded-[24.5px] bg-[#0c0c12]/85 backdrop-blur-2xl p-2 sm:p-2.5 flex flex-col relative overflow-hidden">
        
        {/* Subtle Sweeping Reflection Sheen */}
        <div className="subtle-reflection-sheen" />

        {/* Elevated Floating Media Plate */}
        <div className="relative w-full flex-1 rounded-[20px] overflow-hidden bg-black/60 shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)] border border-white/10 group-hover:border-white/20 transition-all">
          <img
            src={template.cover}
            alt={template.title}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
          />

          {/* Deep Cinematic Vignette */}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/25 to-black/10 opacity-90 group-hover:opacity-95 transition-opacity" />

          {/* Floating Badges (Partially Overlapping Top of Media) */}
          <div className="absolute top-2.5 inset-x-2.5 flex items-center justify-between z-10">
            {/* Format / Type Pill */}
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/65 backdrop-blur-xl border border-white/15 text-[11px] font-semibold text-stone-200 shadow-md">
              {template.isFaceSwap ? (
                <>
                  <UserCheck className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-amber-200">Face Swap</span>
                </>
              ) : template.type === 'video' ? (
                <>
                  <Play className="w-3 h-3 text-amber-400 fill-amber-400" />
                  <span>Video {template.aspectRatio}</span>
                </>
              ) : (
                <>
                  <ImageIcon className="w-3 h-3 text-stone-300" />
                  <span>Photo {template.aspectRatio}</span>
                </>
              )}
            </div>

            {/* Credit Cost Badge */}
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#1b170e]/90 backdrop-blur-xl border border-amber-500/40 text-[11px] font-bold text-amber-300 shadow-[0_4px_16px_rgba(212,175,55,0.3)]">
              <Sparkles className="w-3 h-3 fill-amber-400 text-amber-400" />
              <span>{template.creditCost} ✦</span>
            </div>
          </div>

          {/* Center Play/Action Indicator on Hover */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-300 transform scale-95 group-hover:scale-100">
            <div className="w-13 h-13 rounded-full bg-black/50 backdrop-blur-xl border border-amber-400/50 flex items-center justify-center shadow-[0_8px_24px_rgba(0,0,0,0.6)]">
              {template.isFaceSwap ? (
                <UserCheck className="w-6 h-6 text-amber-300" />
              ) : (
                <Play className="w-6 h-6 text-white fill-white ml-0.5" />
              )}
            </div>
          </div>

          {/* Audio Badge Overlap if Track Available */}
          {template.musicTrack && (
            <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 text-[10px] text-stone-300 z-10">
              <Music2 className="w-3 h-3 text-amber-400 shrink-0" />
              <span className="truncate font-medium">{template.musicTrack.name}</span>
            </div>
          )}
        </div>

        {/* Floating Glass Metadata Dock (Overlapping Lower Card Rim) */}
        <div className="mt-2.5 px-2.5 pb-2 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-200/80">
              <span>{template.category}</span>
              <span className="text-stone-600">·</span>
              <span className="text-stone-400 font-normal">{template.resolutionLabel || '1080p'}</span>
            </div>
            {template.isFeatured && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                Trending
              </span>
            )}
          </div>

          <h4 className="text-sm sm:text-base font-bold text-white line-clamp-1 group-hover:text-amber-200 transition-colors">
            {template.title}
          </h4>

          <p className="text-[11px] text-stone-400 line-clamp-1 mt-0.5 leading-snug">
            {template.description}
          </p>

          {/* Interactive CTA Bar */}
          <div className="mt-2.5 pt-2 border-t border-white/8 flex items-center justify-between">
            <span className="text-[11px] text-stone-400">
              {template.likesCount ? `${(template.likesCount / 1000).toFixed(1)}k uses` : 'Viral Studio'}
            </span>

            <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-300 group-hover:text-amber-200 transition-colors">
              <span>{template.isFaceSwap ? 'Swap Face' : 'Create'}</span>
              <ArrowUpRight className="w-3.5 h-3.5 transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </span>
          </div>
        </div>

      </div>
    </motion.div>
  );
};
