import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { Sparkles, Video, Wand2, Eye } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { FaceSwapScene, Template } from '../types';
import { isVideoMedia } from '../utils/mediaUtils';
import {
  captureFirstFramePoster,
  getNetworkPlaybackProfile,
  mediaPlaybackCoordinator,
  reportMediaPlaybackIssue,
  selectMediaRendition,
  subscribeNetworkProfileChange
} from '../services/media/mediaPlaybackManager';

export const FaceSwapSceneGallery: React.FC = () => {
  const [visibleScenes, setVisibleScenes] = useState<Record<string, boolean>>({});
  const [readyVideos, setReadyVideos] = useState<Record<string, boolean>>({});
  const [failedVideos, setFailedVideos] = useState<Record<string, boolean>>({});
  const [scenePosters, setScenePosters] = useState<Record<string, string>>({});
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const [networkProfile, setNetworkProfile] = useState(() => getNetworkPlaybackProfile());

  useEffect(() => subscribeNetworkProfileChange(setNetworkProfile), []);

  const {
    faceSwapScenes,
    templates,
    selectedTemplate,
    setSelectedTemplate,
    selectedFaceSwapScene,
    setSelectedFaceSwapScene,
    setFaceSwapModalOpen
  } = useApp();

  // Filter only active & published scenes (Draft or Inactive are kept strictly in admin)
  const publishedScenes = faceSwapScenes.filter(
    (s) => s.isActive !== false && s.status !== 'draft'
  );

  // Automatic concurrent autoplay for ALL visible FaceSwap video scenes as user scrolls (no max-1 / click-to-play gate)
  useEffect(() => {
    if (publishedScenes.length === 0) return;

    const cleanups: Array<() => void> = [];
    const observers: IntersectionObserver[] = [];

    publishedScenes.forEach((scene) => {
      const previewMedia =
        scene.coverSource === 'original'
          ? scene.sourceVideoPreview
          : (scene.resultVideoPreview || scene.sourceVideoPreview);
      if (!isVideoMedia(previewMedia)) return;

      const el = cardRefs.current[scene.id];
      const coordId = `faceswap_gallery_${scene.id}`;

      const startPlayback = () => {
        setVisibleScenes((prev) => (prev[scene.id] ? prev : { ...prev, [scene.id]: true }));
        const vid = videoRefs.current[scene.id];
        if (vid) {
          vid.muted = true;
          vid.play().catch(() => {});
        }
      };

      const unreg = mediaPlaybackCoordinator.register(
        coordId,
        () => {
          const vid = videoRefs.current[scene.id];
          if (vid && !vid.paused) {
            vid.pause();
          }
        },
        {
          priority: 4,
          screen: 'home',
          play: startPlayback
        }
      );
      cleanups.push(unreg);

      if (!el || typeof IntersectionObserver === 'undefined') {
        setVisibleScenes((prev) => ({ ...prev, [scene.id]: true }));
        mediaPlaybackCoordinator.updateVisibility(coordId, 1, startPlayback);
        return;
      }

      const obs = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              setVisibleScenes((prev) => (prev[scene.id] ? prev : { ...prev, [scene.id]: true }));
              mediaPlaybackCoordinator.updateVisibility(
                coordId,
                Math.max(0.25, entry.intersectionRatio),
                startPlayback
              );
            } else {
              const vid = videoRefs.current[scene.id];
              if (vid && !vid.paused) {
                vid.pause();
              }
              mediaPlaybackCoordinator.updateVisibility(coordId, 0);
              mediaPlaybackCoordinator.releasePlay(coordId);
            }
          });
        },
        { threshold: [0, 0.05, 0.25], rootMargin: '220px' }
      );
      obs.observe(el);
      observers.push(obs);
    });

    return () => {
      observers.forEach((o) => o.disconnect());
      cleanups.forEach((fn) => fn());
    };
  }, [publishedScenes.map((s) => s.id).join('|')]);

  if (publishedScenes.length === 0) return null;

  const handlePreviewScene = (scene: FaceSwapScene) => {
    const existingTemplate = templates.find((t) => t.faceSwapSceneId === scene.id || t.id === scene.id);
    if (existingTemplate) {
      setSelectedTemplate(existingTemplate);
    } else {
      const sceneCover =
        scene.coverSource === 'original'
          ? scene.sourceVideoPreview
          : (scene.resultVideoPreview || scene.sourceVideoPreview);

      const sceneTemplate: Template = {
        id: scene.id,
        title: scene.title,
        type: 'video',
        category: 'Trending',
        cover: sceneCover,
        preview: sceneCover,
        sampleFaceThumbnail: scene.sampleFace,
        sampleBefore: scene.sourceVideoPreview,
        sampleResult: scene.resultVideoPreview,
        sampleAfter: scene.resultVideoPreview,
        description: scene.description,
        aspectRatio: scene.aspectRatio || '9:16',
        inputType: 'IMAGE_OR_VIDEO',
        requiredInputs: [
          {
            id: 'user_face',
            label: 'Upload Your Photo',
            type: 'image',
            description: 'Clear front-facing portrait photo'
          }
        ],
        creditCost: scene.creditCost || 45,
        engine: 'AI_GENERATION',
        model: 'gemini-omni-1.1-flash',
        workflow: 'viral-reels',
        sortOrder: 1,
        isFeatured: false,
        isActive: true,
        tags: scene.tags || ['Face Swap', 'Viral'],
        isFaceSwap: true,
        faceSwapSceneId: scene.id
      };
      setSelectedTemplate(sceneTemplate);
    }
  };

  const handleUseScene = (scene: FaceSwapScene) => {
    setSelectedFaceSwapScene(scene);
    setFaceSwapModalOpen(true);
  };

  return (
    <div id="face-swap-scene-gallery" className="relative w-full max-w-5xl mx-auto px-2 sm:px-4">
      {/* Section Header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-400 to-[#d4af37] flex items-center justify-center text-stone-950 shadow-md">
            <Sparkles className="w-4 h-4 fill-stone-950" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-extrabold text-white tracking-tight flex items-center gap-1.5">
              <span>Face Swap Trending Scenes</span>
              <span className="px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold border border-amber-500/30">
                AI Genjutsu
              </span>
            </h3>
            <p className="text-[11px] text-stone-400">
              Tap any scene to preview the transformation or swap your face directly
            </p>
          </div>
        </div>

        <div className="text-right">
          <span className="text-[11px] font-bold text-stone-400 bg-white/5 px-2.5 py-1 rounded-full border border-white/10">
            {publishedScenes.length} Scenes Available
          </span>
        </div>
      </div>

      {/* Horizontal Scroll / Responsive Grid Collection */}
      <div className="flex gap-3 overflow-x-auto pb-3 pt-1 no-scrollbar sm:grid sm:grid-cols-3 md:grid-cols-4 sm:overflow-visible">
        {publishedScenes.map((scene) => {
          const isSelected =
            selectedTemplate?.faceSwapSceneId === scene.id ||
            selectedTemplate?.id === scene.id ||
            selectedFaceSwapScene?.id === scene.id;
          const rawPreviewMedia =
            scene.coverSource === 'original'
              ? scene.sourceVideoPreview
              : (scene.resultVideoPreview || scene.sourceVideoPreview);
          const rendition = selectMediaRendition({
            previewUrl: rawPreviewMedia,
            hdUrl: (scene as any).hdVideoUrl || null,
            network: networkProfile
          });
          const previewMedia = rendition.selectedUrl || rawPreviewMedia;
          const isVideo = isVideoMedia(previewMedia);
          const explicitPoster =
            !isVideoMedia(scene.resultVideoPreview) && scene.resultVideoPreview
              ? scene.resultVideoPreview
              : (!isVideoMedia(scene.sourceVideoPreview) && scene.sourceVideoPreview ? scene.sourceVideoPreview : undefined);
          const videoPoster = explicitPoster || scenePosters[scene.id];
          const isCardVisible = Boolean(visibleScenes[scene.id]);
          const isVideoReady = Boolean(readyVideos[scene.id]);
          const hasFailed = Boolean(failedVideos[scene.id]);

          return (
            <motion.div
              key={scene.id}
              ref={(node) => {
                cardRefs.current[scene.id] = node;
              }}
              whileHover={{ y: -3 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              className={`flex-shrink-0 w-[210px] sm:w-auto rounded-2xl overflow-hidden bg-gradient-to-b from-[#16141a] to-[#0c0b10] border transition-all shadow-lg flex flex-col justify-between ${
                isSelected
                  ? 'border-[#d4af37] shadow-[0_0_16px_rgba(212,175,55,0.35)] ring-1 ring-[#d4af37]/60'
                  : 'border-white/10 hover:border-white/20'
              }`}
            >
              {/* Media Card Preview: Automatic muted inline loop for all visible FaceSwap scenes + guaranteed poster/frame fallback */}
              <div
                onClick={() => handlePreviewScene(scene)}
                className="relative aspect-[9/13] w-full bg-[#16141d] overflow-hidden cursor-pointer group"
              >
                {isVideo ? (
                  <>
                    {/* Non-black loading shimmer while fetching poster/first frame */}
                    {!isVideoReady && !videoPoster && (
                      <div className="absolute inset-0 z-[1] bg-gradient-to-br from-[#231e31] via-[#181523] to-[#12101a] animate-pulse flex flex-col items-center justify-center gap-2 pointer-events-none">
                        <div className="w-6 h-6 border-2 border-amber-400/25 border-t-amber-400 rounded-full animate-spin" />
                        <span className="text-[10px] text-amber-200/80 font-medium">Loading preview…</span>
                      </div>
                    )}

                    {/* Underlying Real Poster or Captured First Frame (always prevents black screen on weak network) */}
                    {videoPoster && (
                      <img
                        src={videoPoster}
                        alt={scene.title}
                        loading="lazy"
                        className="absolute inset-0 z-[1] w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 pointer-events-none"
                      />
                    )}

                    {/* Autoplaying Muted Inline Video Layer (fades in only once first frame is decoded) */}
                    {isCardVisible && !hasFailed && (
                      <video
                        ref={(el) => {
                          videoRefs.current[scene.id] = el;
                        }}
                        src={previewMedia}
                        poster={videoPoster}
                        muted
                        loop
                        playsInline
                        autoPlay
                        preload={networkProfile.maxPreload}
                        onLoadedData={(e) => {
                          setReadyVideos((prev) => (prev[scene.id] ? prev : { ...prev, [scene.id]: true }));
                          if (!videoPoster) {
                            const frame = captureFirstFramePoster(e.currentTarget);
                            if (frame) setScenePosters((prev) => ({ ...prev, [scene.id]: frame }));
                          }
                          if (mediaPlaybackCoordinator.requestPlay(`faceswap_gallery_${scene.id}`)) {
                            e.currentTarget.muted = true;
                            e.currentTarget.play().catch(() => {});
                          }
                        }}
                        onCanPlay={(e) => {
                          setReadyVideos((prev) => (prev[scene.id] ? prev : { ...prev, [scene.id]: true }));
                          if (!videoPoster) {
                            const frame = captureFirstFramePoster(e.currentTarget);
                            if (frame) setScenePosters((prev) => ({ ...prev, [scene.id]: frame }));
                          }
                          if (e.currentTarget.paused && mediaPlaybackCoordinator.requestPlay(`faceswap_gallery_${scene.id}`)) {
                            e.currentTarget.muted = true;
                            e.currentTarget.play().catch(() => {});
                          }
                        }}
                        onPlaying={() => {
                          setReadyVideos((prev) => (prev[scene.id] ? prev : { ...prev, [scene.id]: true }));
                        }}
                        onError={() => {
                          setFailedVideos((prev) => ({ ...prev, [scene.id]: true }));
                          setReadyVideos((prev) => ({ ...prev, [scene.id]: false }));
                          reportMediaPlaybackIssue({
                            vector: 'MEDIA_PLAYBACK_FAILURE',
                            message: `FaceSwap scene preview failed (${scene.id})`,
                            templateId: scene.id,
                            errorStage: 'faceswap_gallery_preview',
                            endpoint: previewMedia
                          });
                        }}
                        className={`relative z-[2] w-full h-full object-cover transition-opacity duration-300 group-hover:scale-105 pointer-events-none ${
                          isVideoReady ? 'opacity-100' : 'opacity-0'
                        }`}
                      />
                    )}
                  </>
                ) : (
                  <img
                    src={previewMedia}
                    alt={scene.title}
                    loading="lazy"
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 pointer-events-none"
                  />
                )}

                {/* Scrim Overlay */}
                <div className="absolute inset-0 z-[3] bg-gradient-to-t from-black via-black/25 to-transparent pointer-events-none" />

                {/* Top Badges */}
                <div className="absolute top-2 inset-x-2 z-[4] flex items-center justify-between pointer-events-none">
                  <span className="px-2 py-0.5 rounded-full bg-black/75 backdrop-blur-md border border-white/15 text-[9.5px] font-bold text-stone-300">
                    {scene.category || 'Reel Scene'}
                  </span>
                </div>

                {/* Video Duration Indicator */}
                <div className="absolute bottom-2 left-2 z-[4] flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/70 backdrop-blur-md text-[9px] font-semibold text-stone-300 border border-white/10 pointer-events-none">
                  <Video className="w-2.5 h-2.5 text-amber-400" />
                  <span>{scene.durationSeconds || 8}s</span>
                </div>

                {/* Inset Sample Face Portrait */}
                {scene.sampleFace && (
                  <div className="absolute bottom-2 right-2 z-[4] flex items-center gap-1 p-0.5 rounded-lg bg-black/80 backdrop-blur-md border border-white/20 pointer-events-none">
                    <img
                      src={scene.sampleFace}
                      alt="Sample Face"
                      className="w-6 h-6 rounded-md object-cover border border-[#d4af37]/60"
                    />
                  </div>
                )}
              </div>

              {/* Card Meta & Controls */}
              <div className="p-2.5 space-y-2 flex-1 flex flex-col justify-between">
                <div>
                  <h4 className="text-xs font-bold text-white line-clamp-1 leading-snug">
                    {scene.title}
                  </h4>
                  <p className="text-[10px] text-stone-400 line-clamp-1 mt-0.5">
                    {scene.description || 'Seamless Face Swap Scene'}
                  </p>
                </div>

                {/* Two Distinct Actions: Preview vs Direct Face Swap */}
                <div className="grid grid-cols-2 gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => handlePreviewScene(scene)}
                    className="py-1.5 px-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-stone-200 hover:text-white text-[10px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                  >
                    <Eye className="w-3 h-3 text-cyan-400" />
                    <span>Preview</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleUseScene(scene)}
                    className="py-1.5 px-2 rounded-xl bg-gradient-to-r from-amber-400 to-[#d4af37] text-stone-950 text-[10px] font-black flex items-center justify-center gap-1 shadow-sm hover:brightness-110 active:scale-95 transition-all cursor-pointer"
                  >
                    <Wand2 className="w-3 h-3 fill-stone-950" />
                    <span>Swap Face</span>
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};
