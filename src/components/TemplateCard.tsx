import React, { useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { Play, Sparkles, Image as ImageIcon, UserCheck, ArrowUpRight } from 'lucide-react';
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

  const cardRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const isVideo = Boolean(
    template.cover?.endsWith('.mp4') ||
    template.cover?.endsWith('.webm') ||
    template.cover?.startsWith('data:video/') ||
    (template.preview && (template.preview.endsWith('.mp4') || template.preview.startsWith('data:video/')))
  );

  // Viewport-aware video playback: play ONLY when in viewport, pause when off-screen
  useEffect(() => {
    const cardEl = cardRef.current;
    const videoEl = videoRef.current;
    if (!cardEl || !videoEl || !isVideo) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            videoEl.play().catch(() => {});
          } else {
            videoEl.pause();
          }
        });
      },
      { threshold: 0.25 }
    );

    observer.observe(cardEl);
    return () => {
      observer.disconnect();
    };
  }, [isVideo]);

  const heightClasses = {
    compact: 'h-[370px] sm:h-[400px] w-[68vw] max-w-[260px] min-w-[220px] shrink-0',
    standard: 'h-[400px] sm:h-[440px] w-full',
    large: 'h-[450px] sm:h-[490px] w-full'
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
      ref={cardRef}
      whileHover={{ y: -5, scale: 1.015 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      onClick={handleCardClick}
      className={`group relative rounded-[24px] p-[1.5px] cursor-pointer transition-all duration-300 laser-light-border shadow-[0_16px_36px_-10px_rgba(0,0,0,0.85)] hover:shadow-[0_22px_45px_-8px_rgba(0,0,0,0.95),0_0_20px_rgba(212,175,55,0.25)] ${heightClasses[size]}`}
    >
      {/* Full-Frame Card Chassis */}
      <div className="relative w-full h-full rounded-[22.5px] overflow-hidden bg-black flex flex-col justify-between">
        
        {/* Full-Bleed Media Canvas - Crystal clear, zero top/center darkening */}
        {isVideo ? (
          <video
            ref={videoRef}
            src={template.preview || template.cover}
            loop
            muted
            playsInline
            preload="metadata"
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
          />
        ) : (
          <img
            src={template.cover}
            alt={template.title}
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
          />
        )}

        {/* Minimal Bottom Shadow Scrim - Only at lower 40%, leaves 60%+ fully bright & clear */}
        <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none z-10" />

        {/* Top Floating Glass Badges */}
        <div className="relative z-20 p-2.5 flex items-center justify-between">
          {/* Format / Type Pill */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-xl border border-white/15 text-[10px] font-semibold text-stone-200 shadow-md">
            {template.isFaceSwap ? (
              <>
                <UserCheck className="w-3 h-3 text-amber-400" />
                <span className="text-amber-200">Face Swap</span>
              </>
            ) : template.inputType === 'IMAGE_OR_VIDEO' ? (
              <>
                <Sparkles className="w-2.5 h-2.5 text-amber-400" />
                <span>Photo / Video</span>
              </>
            ) : template.inputType === 'IMAGE_ONLY' || template.type === 'photo' ? (
              <>
                <ImageIcon className="w-2.5 h-2.5 text-stone-300" />
                <span>Photo {template.aspectRatio}</span>
              </>
            ) : (
              <>
                <Play className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />
                <span>Video {template.aspectRatio}</span>
              </>
            )}
          </div>

          {/* Credit Cost Pill */}
          <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/65 backdrop-blur-xl border border-amber-500/40 text-[10px] font-bold text-amber-300 shadow-[0_2px_12px_rgba(212,175,55,0.3)]">
            <Sparkles className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
            <span>{template.creditCost} ✦</span>
          </div>
        </div>

        {/* Hover Center Play Button */}
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-300 transform scale-90 group-hover:scale-100">
          <div className="w-12 h-12 rounded-full bg-black/55 backdrop-blur-xl border border-amber-400/50 flex items-center justify-center shadow-[0_8px_24px_rgba(0,0,0,0.7)]">
            {template.isFaceSwap ? (
              <UserCheck className="w-5 h-5 text-amber-300" />
            ) : (
              <Play className="w-5 h-5 text-white fill-white ml-0.5" />
            )}
          </div>
        </div>

        {/* iPhone-Style Floating Liquid-Glass Overlapping Bottom Dock */}
        <div className="relative z-20 mx-2 mb-2 p-2.5 rounded-2xl bg-black/55 backdrop-blur-xl border border-white/12 shadow-[0_8px_24px_rgba(0,0,0,0.5)] flex flex-col gap-1">
          {/* Top micro metadata row */}
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-wider text-amber-300/90">
              <span>{template.category}</span>
              <span className="text-stone-500">·</span>
              <span className="text-stone-300 font-mono text-[9px] bg-white/10 px-1 py-0.2 rounded border border-white/10">
                {template.resolutionLabel || '1080p'}
              </span>
            </div>

            {template.isFeatured && (
              <span className="px-1.5 py-0.5 rounded-full text-[8.5px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/35">
                Trending
              </span>
            )}
          </div>

          {/* Title */}
          <h4 className="text-xs sm:text-sm font-bold text-white truncate group-hover:text-amber-200 transition-colors drop-shadow-sm leading-tight">
            {template.title}
          </h4>

          {/* Action & Uses micro row */}
          <div className="pt-1 border-t border-white/10 flex items-center justify-between text-[10px]">
            <span className="text-stone-400 font-medium">
              {template.likesCount ? `${(template.likesCount / 1000).toFixed(1)}k uses` : 'Viral'}
            </span>

            <span className="inline-flex items-center gap-0.5 font-bold text-[#f5d77f] group-hover:text-amber-200 transition-colors">
              <span>{template.isFaceSwap ? 'Swap Face' : 'Create'}</span>
              <ArrowUpRight className="w-3 h-3 transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </span>
          </div>
        </div>

      </div>
    </motion.div>
  );
};
