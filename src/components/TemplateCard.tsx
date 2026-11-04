import React, { useRef, useEffect, memo } from 'react';
import { motion } from 'motion/react';
import { Play, Sparkles, Image as ImageIcon, UserCheck, ArrowUpRight, ShieldCheck } from 'lucide-react';
import { Template } from '../types';
import { useApp } from '../context/AppContext';
import { isVideoMedia } from '../utils/mediaUtils';
import { queueHdDownload } from '../services/media/hdDownloadQueue';

interface TemplateCardProps {
  template: Template;
  size?: 'compact' | 'standard' | 'large';
}

export const TemplateCard: React.FC<TemplateCardProps> = memo(({
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

  // Determine candidate media and whether it is a real playable video stream
  const matchingScene = template.isFaceSwap
    ? (faceSwapScenes.find((s) => s.id === (template.faceSwapSceneId || template.id)) || faceSwapScenes[0])
    : (template.faceSwapSceneId ? faceSwapScenes.find((s) => s.id === template.faceSwapSceneId) : null);

  const candidateMedia = matchingScene
    ? (matchingScene.resultVideoPreview || matchingScene.sourceVideoPreview || template.preview || template.cover)
    : (template.preview || template.cover);

  const sampleFace = matchingScene?.sampleFace || template.sampleFaceThumbnail;

  const isVideo = Boolean(
    template.type === 'video' ||
    template.mediaType === 'video' ||
    template.isFaceSwap ||
    isVideoMedia(candidateMedia)
  );

  const [isMediaLoaded, setIsMediaLoaded] = React.useState(false);
  const [hasVideoError, setHasVideoError] = React.useState(false);
  const [isNearViewport, setIsNearViewport] = React.useState(false);
  const [hdVideoSrc, setHdVideoSrc] = React.useState<string | null>(null);

  // Reliable Poster extraction: Ordered fallback candidates; Never use stock portraits
  const isCoverVideo = isVideoMedia(template.cover);
  const isPreviewVideo = isVideoMedia(template.preview);
  const posterCandidates = React.useMemo(() => {
    return [
      template.coverImage,
      !isCoverVideo && template.cover ? template.cover : undefined,
      template.sampleResult,
      template.sampleAfter,
      !isPreviewVideo && template.preview ? template.preview : undefined,
      template.sampleFaceThumbnail
    ].filter((url): url is string => Boolean(url && typeof url === 'string' && !isVideoMedia(url)));
  }, [template, isCoverVideo, isPreviewVideo]);

  const [posterIndex, setPosterIndex] = React.useState(0);
  const [allPostersFailed, setAllPostersFailed] = React.useState(false);
  const resolvedPoster = posterCandidates[posterIndex] || '';

  // True Lazy Loading: Only attach video src when card is within 150px of viewport
  useEffect(() => {
    const cardEl = cardRef.current;
    if (!cardEl || !isVideo) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsNearViewport(true);
            const videoEl = videoRef.current;
            if (videoEl && entry.intersectionRatio >= 0.35) {
              videoEl.play().catch(() => {});
            }
          } else {
            const videoEl = videoRef.current;
            if (videoEl) videoEl.pause();
          }
        });
      },
      { threshold: [0.05, 0.35, 0.7], rootMargin: '150px' }
    );

    observer.observe(cardEl);
    return () => {
      observer.disconnect();
    };
  }, [isVideo]);

  // HD download upgrade when card is near viewport
  useEffect(() => {
    if (isNearViewport && isVideo && candidateMedia) {
      queueHdDownload(candidateMedia, 'medium')
        .then((hdUrl) => {
          if (hdUrl && hdUrl !== candidateMedia) {
            setHdVideoSrc(hdUrl);
          }
        })
        .catch(() => {});
    }
  }, [isNearViewport, isVideo, candidateMedia]);

  const heightClasses = {
    compact: 'h-[360px] sm:h-[390px] w-[58vw] max-w-[240px] min-w-[200px] shrink-0',
    standard: 'h-[390px] sm:h-[430px] w-full',
    large: 'h-[440px] sm:h-[480px] w-full'
  };

  const handleCardClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isVideo && candidateMedia) {
      queueHdDownload(candidateMedia, 'high').catch(() => {});
    }
    // Preview-First Flow: Always show template transformation preview first
    if (template.isFaceSwap) {
      const scene =
        faceSwapScenes.find((s) => s.id === (template.faceSwapSceneId || 'fsv_trending_dance_stage')) ||
        faceSwapScenes[0];
      if (scene) {
        setSelectedFaceSwapScene(scene);
      }
    }
    setSelectedTemplate(template);
  };

  return (
    <motion.div
      ref={cardRef}
      whileHover={{ y: -4, scale: 1.015 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      onClick={handleCardClick}
      onContextMenu={(e) => e.preventDefault()}
      className={`group relative rounded-[24px] p-[1.5px] cursor-pointer transition-all duration-300 laser-light-border shadow-[0_16px_36px_-10px_rgba(0,0,0,0.85)] hover:shadow-[0_22px_45px_-8px_rgba(0,0,0,0.95),0_0_20px_rgba(212,175,55,0.25)] select-none protected-media gpu-accelerated ${heightClasses[size]}`}
    >
      {/* Full-Frame Card Chassis */}
      <div className="relative w-full h-full rounded-[22.5px] overflow-hidden bg-black flex flex-col justify-between">
        
        {/* Loading Media Skeleton / Spinner - Only while loading, removed as soon as loaded */}
        {!isMediaLoaded && !allPostersFailed && (
          <div className="absolute inset-0 z-[5] bg-stone-900/95 flex flex-col items-center justify-center gap-2.5 pointer-events-none animate-pulse">
            <div className="w-7 h-7 border-2 border-amber-400/20 border-t-amber-400 rounded-full animate-spin" />
            <span className="text-[11px] tracking-wide text-amber-200/80 font-medium">Loading media…</span>
          </div>
        )}

        {/* Media Loading Error Fallback - Only if all poster candidates failed AND (video failed or non-video) */}
        {allPostersFailed && (hasVideoError || !isVideo) && (
          <div className="absolute inset-0 z-[5] bg-stone-950 flex flex-col items-center justify-center p-4 text-center pointer-events-none">
            <Sparkles className="w-7 h-7 text-stone-600 mb-1.5" />
            <span className="text-[11px] text-stone-400 font-medium">Preview unavailable</span>
          </div>
        )}

        {/* Guaranteed Underlying Poster Image: Advances across poster candidates on error */}
        {resolvedPoster && (
          <img
            key={resolvedPoster}
            src={resolvedPoster}
            alt={template.title}
            loading="lazy"
            draggable={false}
            onLoad={() => setIsMediaLoaded(true)}
            onError={() => {
              if (posterIndex < posterCandidates.length - 1) {
                setPosterIndex((idx) => idx + 1);
              } else {
                setAllPostersFailed(true);
                setIsMediaLoaded(true);
              }
            }}
            onContextMenu={(e) => e.preventDefault()}
            className="absolute inset-0 w-full h-full object-cover transition-all duration-500 ease-out group-hover:scale-[1.04] pointer-events-none select-none z-[1]"
          />
        )}

        {/* Viewport-Aware Video Layer: Attached only when near viewport with preload="none" */}
        {isVideo && isNearViewport && (
          <video
            ref={videoRef}
            src={hdVideoSrc || candidateMedia}
            poster={resolvedPoster}
            loop
            muted
            playsInline
            preload="none"
            draggable={false}
            onLoadedData={() => setIsMediaLoaded(true)}
            onError={() => {
              setHasVideoError(true);
            }}
            onContextMenu={(e) => e.preventDefault()}
            className={`absolute inset-0 w-full h-full object-cover transition-all duration-500 ease-out group-hover:scale-[1.04] pointer-events-none select-none z-[2] ${
              isMediaLoaded && !hasVideoError ? 'opacity-100' : 'opacity-0'
            }`}
          />
        )}

        {/* Anti-Screenshot Protective Shield Overlay */}
        <div 
          className="absolute inset-0 z-10 pointer-events-none" 
          aria-hidden="true"
        />

        {/* Minimal Bottom Shadow Scrim */}
        <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-black/95 via-black/45 to-transparent pointer-events-none z-10" />

        {/* Top Floating Glass Badges */}
        <div className="relative z-20 p-2.5 flex items-center justify-between pointer-events-none">
          {/* Format / Type Pill */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/65 backdrop-blur-xl border border-white/15 text-[10px] font-semibold text-stone-200 shadow-md">
            {template.isFaceSwap ? (
              <>
                <UserCheck className="w-3 h-3 text-amber-400" />
                <span className="text-amber-200 font-bold">Face Swap</span>
              </>
            ) : isVideo ? (
              <>
                <Play className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />
                <span className="font-bold text-amber-200">Video</span>
              </>
            ) : (
              <>
                <ImageIcon className="w-2.5 h-2.5 text-stone-300" />
                <span className="font-bold text-stone-200">Photo</span>
              </>
            )}
          </div>

          {/* Credit Cost Pill */}
          <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/65 backdrop-blur-xl border border-amber-500/40 text-[10px] font-bold text-amber-300 shadow-[0_2px_12px_rgba(212,175,55,0.3)]">
            <Sparkles className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
            <span>{template.creditCost} ✦</span>
          </div>
        </div>

        {/* Sample Face Inset for Face Swap Templates (Small thumbnail that does not block the card) */}
        {template.isFaceSwap && sampleFace && (
          <div className="absolute top-12 left-2.5 z-20 pointer-events-none flex items-center gap-1.5 p-1 rounded-xl bg-black/75 backdrop-blur-md border border-purple-400/40 shadow-lg">
            <img
              src={sampleFace}
              alt="Face Reference"
              className="w-7 h-9 rounded-lg object-cover border border-purple-400/30"
            />
            <span className="text-[8px] font-black text-purple-300 pr-1 uppercase tracking-tighter">
              Sample
            </span>
          </div>
        )}

        {/* Video / Play Indicator Overlay for quick glance */}
        {isVideo && (
          <div className="absolute top-2.5 right-2.5 z-20 pointer-events-none opacity-80 group-hover:opacity-100 transition-opacity">
            {/* Kept quiet and clean */}
          </div>
        )}

        {/* Hover Center Play Button */}
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-300 transform scale-90 group-hover:scale-100">
          <div className="w-12 h-12 rounded-full bg-black/60 backdrop-blur-xl border border-amber-400/50 flex items-center justify-center shadow-[0_8px_24px_rgba(0,0,0,0.7)]">
            {template.isFaceSwap ? (
              <UserCheck className="w-5 h-5 text-amber-300" />
            ) : (
              <Play className="w-5 h-5 text-white fill-white ml-0.5" />
            )}
          </div>
        </div>

        {/* iPhone-Style Floating Liquid-Glass Overlapping Bottom Dock */}
        <div className="relative z-20 mx-2 mb-2 p-2.5 rounded-2xl bg-black/60 backdrop-blur-xl border border-white/15 shadow-[0_8px_24px_rgba(0,0,0,0.5)] flex flex-col gap-1">
          {/* Top micro metadata row */}
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-wider text-amber-300/90 truncate">
              <span>{template.category}</span>
              <span className="text-stone-500">·</span>
              <span className="text-stone-300 font-mono text-[9px] bg-white/10 px-1 py-0.2 rounded border border-white/10">
                {template.resolutionLabel || '1080p'}
              </span>
            </div>

            {template.badge ? (
              <span className="px-1.5 py-0.5 rounded-full text-[8.5px] font-bold bg-amber-500/25 text-amber-300 border border-amber-500/40 shrink-0">
                {template.badge}
              </span>
            ) : template.isFeatured && (
              <span className="px-1.5 py-0.5 rounded-full text-[8.5px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/35 shrink-0">
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
});

TemplateCard.displayName = 'TemplateCard';
