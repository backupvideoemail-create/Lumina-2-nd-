import React from 'react';
import { motion } from 'motion/react';
import { Sparkles, Video, Wand2, Eye, Play, Flame } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { FaceSwapScene } from '../types';
import { isVideoMedia } from '../utils/mediaUtils';

export const FaceSwapSceneGallery: React.FC = () => {
  const {
    faceSwapScenes,
    selectedFaceSwapScene,
    setSelectedFaceSwapScene,
    setFaceSwapModalOpen
  } = useApp();

  // Filter only active & published scenes (Draft or Inactive are kept strictly in admin)
  const publishedScenes = faceSwapScenes.filter(
    (s) => s.isActive !== false && s.status !== 'draft'
  );

  if (publishedScenes.length === 0) return null;

  const handlePreviewScene = (scene: FaceSwapScene) => {
    setSelectedFaceSwapScene(scene);
    const cardEl = document.getElementById('face-swap-featured-card');
    if (cardEl) {
      cardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  const handleUseScene = (scene: FaceSwapScene) => {
    setSelectedFaceSwapScene(scene);
    setFaceSwapModalOpen(true);
  };

  return (
    <div className="relative w-full max-w-5xl mx-auto px-2 sm:px-4">
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
          const isSelected = selectedFaceSwapScene?.id === scene.id;
          const previewMedia = scene.resultVideoPreview || scene.sourceVideoPreview;
          const isVideo = isVideoMedia(previewMedia);

          return (
            <motion.div
              key={scene.id}
              whileHover={{ y: -3 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              className={`flex-shrink-0 w-[210px] sm:w-auto rounded-2xl overflow-hidden bg-gradient-to-b from-[#16141a] to-[#0c0b10] border transition-all shadow-lg flex flex-col justify-between ${
                isSelected
                  ? 'border-[#d4af37] shadow-[0_0_16px_rgba(212,175,55,0.35)] ring-1 ring-[#d4af37]/60'
                  : 'border-white/10 hover:border-white/20'
              }`}
            >
              {/* Media Card Preview */}
              <div
                onClick={() => handlePreviewScene(scene)}
                className="relative aspect-[9/13] w-full bg-stone-950 overflow-hidden cursor-pointer group"
              >
                {isVideo ? (
                  <video
                    src={previewMedia}
                    muted
                    loop
                    playsInline
                    autoPlay
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 pointer-events-none"
                  />
                ) : (
                  <img
                    src={previewMedia}
                    alt={scene.title}
                    loading="lazy"
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 pointer-events-none"
                  />
                )}

                {/* Scrim Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/25 to-transparent pointer-events-none" />

                {/* Top Badges */}
                <div className="absolute top-2 inset-x-2 flex items-center justify-between pointer-events-none">
                  <span className="px-2 py-0.5 rounded-full bg-black/75 backdrop-blur-md border border-white/15 text-[9.5px] font-bold text-stone-300">
                    {scene.category || 'Reel Scene'}
                  </span>

                  <span className="px-2 py-0.5 rounded-full bg-black/80 backdrop-blur-md border border-amber-500/40 text-[9.5px] font-extrabold text-amber-300">
                    {scene.creditCost || 45} ✦
                  </span>
                </div>

                {/* Video Duration Indicator */}
                <div className="absolute bottom-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/70 backdrop-blur-md text-[9px] font-semibold text-stone-300 border border-white/10 pointer-events-none">
                  <Video className="w-2.5 h-2.5 text-amber-400" />
                  <span>{scene.durationSeconds || 8}s</span>
                </div>

                {/* Inset Sample Face Portrait */}
                {scene.sampleFace && (
                  <div className="absolute bottom-2 right-2 flex items-center gap-1 p-0.5 rounded-lg bg-black/80 backdrop-blur-md border border-white/20 pointer-events-none">
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
