import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Menu,
  Sparkles,
  Search,
  SlidersHorizontal,
  ChevronRight,
  Flame,
  Camera,
  Play,
  Heart,
  MessageCircle,
  Share2,
  Cake,
  HeartHandshake,
  Music2,
  Crown,
  X,
  Pause,
  Volume2,
  VolumeX,
  ArrowLeft
} from 'lucide-react';
import { Logo } from '../components/Logo';
import { TemplateCard } from '../components/TemplateCard';
import { FaceSwapFeaturedCard } from '../components/FaceSwapFeaturedCard';
import { FaceSwapSceneGallery } from '../components/FaceSwapSceneGallery';
import { useApp } from '../context/AppContext';
import {
  HOME_HERO_BANNERS,
  QUICK_CATEGORY_ICONS,
  QUICK_PILL_TAGS,
  HomeBannerItem
} from '../config/homeBannersConfig';
import { Template } from '../types';
import { queueHdDownload } from '../services/media/hdDownloadQueue';

export const HomeView: React.FC = () => {
  const {
    templates,
    wallet,
    setDrawerOpen,
    setPlansModalOpen,
    selectedCategory,
    setSelectedCategory,
    selectedCategories,
    setSelectedCategories,
    searchQuery,
    setSearchQuery,
    filterType,
    setFilterType,
    setSelectedTemplate,
    setActiveTab
  } = useApp();

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Auto-rotating Hero Carousel State (6.0s timer with reset on interaction)
  const [banners, setBanners] = useState<HomeBannerItem[]>(HOME_HERO_BANNERS);
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [timerResetKey, setTimerResetKey] = useState(0);

  // Fullscreen / Responsive Video Player for Hero Banner Videos
  const [fullVideoBanner, setFullVideoBanner] = useState<HomeBannerItem | null>(null);
  const [isPlayingFullVideo, setIsPlayingFullVideo] = useState(true);
  const [isFullVideoMuted, setIsFullVideoMuted] = useState(true);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const fullVideoRef = useRef<HTMLVideoElement>(null);

  const resetTimer = () => {
    setTimerResetKey((k) => k + 1);
  };

  const closeFullVideoPlayer = () => {
    setFullVideoBanner(null);
    setIsPaused(false);
    resetTimer();
  };

  // Fetch live admin-managed banners dynamically
  useEffect(() => {
    let isMounted = true;
    fetch('/api/banners')
      .then((res) => res.json())
      .then((data) => {
        if (isMounted && data.banners && Array.isArray(data.banners) && data.banners.length > 0) {
          const active = data.banners.filter((b: any) => b.isActive !== false);
          if (active.length > 0) setBanners(active);
        }
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (isPaused || banners.length === 0) return;
    const interval = setInterval(() => {
      setCurrentBannerIndex((prev) => (prev + 1) % banners.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [isPaused, banners.length, timerResetKey]);

  const [bannerHdUrls, setBannerHdUrls] = useState<Record<string, string>>({});

  // HD video prefetch for hero banners
  useEffect(() => {
    if (!banners || banners.length === 0) return;
    const current = banners[currentBannerIndex];
    if (current?.videoUrl) {
      queueHdDownload(current.videoUrl, 'high')
        .then((hdUrl) => {
          if (hdUrl && hdUrl !== current.videoUrl) {
            setBannerHdUrls((prev) => ({ ...prev, [current.id]: hdUrl }));
          }
        })
        .catch(() => {});
    }
    const nextIndex = (currentBannerIndex + 1) % banners.length;
    const next = banners[nextIndex];
    if (next?.videoUrl) {
      queueHdDownload(next.videoUrl, 'medium')
        .then((hdUrl) => {
          if (hdUrl && hdUrl !== next.videoUrl) {
            setBannerHdUrls((prev) => ({ ...prev, [next.id]: hdUrl }));
          }
        })
        .catch(() => {});
    }
  }, [currentBannerIndex, banners]);

  const activeBanner: HomeBannerItem = banners[currentBannerIndex] || banners[0] || HOME_HERO_BANNERS[0];

  const handleBannerClick = (banner: HomeBannerItem) => {
    setFullVideoBanner(banner);
    setIsPlayingFullVideo(true);
    setIsFullVideoMuted(true);
    setIsPaused(true);
  };

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // Dynamic Data-Driven Category Rails - Filtered by active status AND filterType
  const activeTemplates = templates.filter((t) => {
    if (t.isActive === false) return false;
    if (filterType !== 'all' && t.type !== filterType) return false;
    return true;
  });

  const preferredCategoryOrder = [
    'Trending',
    'Devotional',
    'Retro 80s',
    'Royal Swag',
    'Couple',
    'Daily Status',
    'Birthday',
    'Dance',
    'Luxury',
    'Cinematic',
    'Fashion',
    'Portrait',
    'Travel',
    'Festival',
    'Creative',
    'Professional'
  ];

  // Discover all distinct active categories from templates
  const activeCategories = Array.from(
    new Set(activeTemplates.map((t) => t.category || 'Trending'))
  );

  // Sort categories according to preferred order, keeping any custom admin categories right next
  const sortedCategories = activeCategories.sort((a, b) => {
    const idxA = preferredCategoryOrder.indexOf(a);
    const idxB = preferredCategoryOrder.indexOf(b);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.localeCompare(b);
  });

  const searchResults = searchQuery.trim()
    ? activeTemplates.filter(
        (t) =>
          t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (t.tags && t.tags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase())))
      )
    : [];

  // Helper icon renderer for Quick Category Circles
  const renderQuickIcon = (type: string) => {
    switch (type) {
      case 'birthday':
        return <Cake className="w-6 h-6 text-amber-300" />;
      case 'wedding':
        return <HeartHandshake className="w-6 h-6 text-orange-300" />;
      case 'dance':
        return <Music2 className="w-6 h-6 text-yellow-300" />;
      case 'horse':
        return <Crown className="w-6 h-6 text-amber-300" />;
      default:
        return <Sparkles className="w-6 h-6 text-amber-300" />;
    }
  };

  return (
    <div className="min-h-screen bg-[#070609] pb-28 text-stone-100 overflow-x-hidden">
      {/* 1. TOP APP BAR */}
      <header className="sticky top-0 z-40 flex items-center justify-between px-4 py-3 bg-[#070609]/90 backdrop-blur-2xl border-b border-white/5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setDrawerOpen(true)}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-stone-300 hover:text-white transition-colors cursor-pointer"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <Logo size="sm" />
        </div>

        {/* Pro / Credits Entry Button */}
        <button
          onClick={() => setPlansModalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-[#2a1d0d] via-[#1b140f] to-[#25170c] border border-[#ff9f00]/50 shadow-[0_0_15px_rgba(255,159,0,0.25)] hover:border-[#ff9f00] transition-all cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5 text-[#ffb703] fill-[#ffb703]" />
          <span className="text-xs font-black text-[#ffb703]">
            {wallet && wallet.balance > 0 ? `${wallet.balance} Credits` : 'Get Pro'}
          </span>
          <span className="text-[10px] font-bold text-amber-300/80 pl-1 border-l border-white/10 uppercase">
            ✦
          </span>
        </button>
      </header>

      {/* 2. ROTATING HERO CAROUSEL BANNER (Auto-cycles every 6.0 seconds) */}
      <section
        className="px-3.5 pt-2 pb-2 relative flex justify-center"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        <div className="relative rounded-3xl overflow-hidden shadow-[0_15px_45px_rgba(0,0,0,0.85)] border border-white/10 aspect-square w-full max-w-[460px] bg-black group">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeBanner.id}
              initial={{ opacity: 0, scale: 1.05 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              onClick={() => handleBannerClick(activeBanner)}
              className="absolute inset-0 cursor-pointer"
            >
              {/* Media Container: 1:1 Square Theater Frame on Clean Black Canvas with Zero Blurred Duplicate Video */}
              {(() => {
                const linkedTpl = (activeBanner.type === 'LINKED_TEMPLATE' && activeBanner.targetTemplateId)
                  ? templates.find((t) => t.id === activeBanner.targetTemplateId)
                  : null;
                const effectiveVideoUrl = activeBanner.videoUrl || linkedTpl?.coverVideo || (linkedTpl?.cover?.endsWith('.mp4') ? linkedTpl.cover : undefined);
                const effectiveImage = activeBanner.image || linkedTpl?.coverImage || (!linkedTpl?.cover?.endsWith('.mp4') ? linkedTpl?.cover : undefined) || linkedTpl?.preview || '';
                const effectivePoster = activeBanner.coverMedia || linkedTpl?.coverImage || (!linkedTpl?.cover?.endsWith('.mp4') ? linkedTpl?.cover : undefined) || '';

                const cropStyle: React.CSSProperties = activeBanner.crop ? {
                  transform: `scale(${activeBanner.crop.zoom || 1}) translate(${activeBanner.crop.positionX || 0}%, ${activeBanner.crop.positionY || 0}%)`,
                  transformOrigin: 'center center'
                } : {};

                const isVideoBanner = Boolean(
                  activeBanner.mediaType === 'video' ||
                  effectiveVideoUrl ||
                  effectiveImage?.endsWith('.mp4') ||
                  effectiveImage?.endsWith('.webm') ||
                  effectiveImage?.startsWith('data:video/')
                );

                const heroVideoSrc = bannerHdUrls[activeBanner.id] || effectiveVideoUrl || effectiveImage;

                return isVideoBanner ? (
                  <div className="relative w-full h-full overflow-hidden flex items-center justify-center bg-black">
                    <video
                      key={`hero_fg_${activeBanner.id}`}
                      src={heroVideoSrc}
                      poster={effectivePoster || (effectiveImage?.endsWith('.mp4') ? undefined : effectiveImage)}
                      autoPlay
                      muted
                      loop
                      playsInline
                      style={cropStyle}
                      className="relative z-10 w-full h-full object-cover object-center"
                    />
                  </div>
                ) : (
                  <div className="relative w-full h-full overflow-hidden flex items-center justify-center bg-black">
                    <img
                      src={effectiveImage}
                      alt={activeBanner.title}
                      style={cropStyle}
                      className="relative z-10 w-full h-full object-cover object-center"
                    />
                  </div>
                );
              })()}

              {/* Multi-layer Cinematic Scrims */}
              <div
                className={`absolute inset-0 z-15 bg-gradient-to-r ${activeBanner.gradientOverlay || 'from-black/60 via-black/20 to-transparent'}`}
              />
              <div className="absolute inset-0 z-15 bg-gradient-to-t from-black/70 via-transparent to-black/15" />

              {/* Floating PRO Badge with Video Play Icon (Top Right) */}
              <div className="absolute top-4 right-4 z-20 flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-[#ff9f00] to-[#ea580c] text-black text-xs font-black shadow-[0_0_20px_rgba(255,159,0,0.5)]">
                <Play className="w-3 h-3 fill-black text-black" />
                <span>{activeBanner.badge}</span>
              </div>

              {/* Banner Text Overlays (Title, Highlight, Subtitle) */}
              <div className="absolute bottom-5 inset-x-5 z-20 max-w-[280px] sm:max-w-md space-y-1">
                <h2 className="text-2xl sm:text-3xl font-black text-white leading-tight font-display tracking-tight drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]">
                  <span className="text-[#ffb703]">{activeBanner.title}</span>
                  <br />
                  <span className="text-white text-xl sm:text-2xl font-extrabold">
                    {activeBanner.highlightText}
                  </span>
                </h2>

                <p className="text-[11px] sm:text-xs text-stone-300 font-medium line-clamp-1 drop-shadow opacity-90">
                  {activeBanner.subtitle}
                </p>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Carousel Pagination Dots (Center Bottom) */}
          <div className="absolute bottom-2.5 inset-x-0 z-30 flex items-center justify-center gap-1.5">
            {banners.map((banner, idx) => (
              <button
                key={banner.id || idx}
                onClick={(e) => {
                  e.stopPropagation();
                  setCurrentBannerIndex(idx);
                  resetTimer();
                }}
                className={`transition-all duration-300 rounded-full cursor-pointer ${
                  currentBannerIndex === idx
                    ? 'w-6 h-1.5 bg-[#ff9f00] shadow-[0_0_8px_rgba(255,159,0,0.8)]'
                    : 'w-1.5 h-1.5 bg-white/40 hover:bg-white/70'
                }`}
                aria-label={`Go to slide ${idx + 1}`}
              />
            ))}
          </div>
        </div>
      </section>

      {/* 3. QUICK CATEGORY ICONS ROW (Compact, Space-Saving) */}
      <section className="px-3.5 pt-1.5 pb-1 max-w-4xl mx-auto">
        <div className="grid grid-cols-4 gap-2">
          {QUICK_CATEGORY_ICONS.map((cat) => (
            <button
              key={cat.id}
              onClick={() => {
                setSelectedCategory(cat.categoryFilter);
                setActiveTab('templates');
              }}
              className="flex flex-col items-center gap-1 p-1.5 rounded-xl bg-[#121118]/80 hover:bg-[#191722] border border-amber-500/20 hover:border-amber-500/40 shadow-sm transition-all active:scale-95 cursor-pointer group"
            >
              {/* Compact Rounded Square Amber Glow Icon Container */}
              <div
                className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-b ${cat.glowColor} flex items-center justify-center shadow-[0_2px_10px_rgba(245,158,11,0.2)] group-hover:scale-105 transition-transform relative`}
              >
                {renderQuickIcon(cat.iconType)}
                {cat.badge && (
                  <span className="absolute -top-1 -right-1 px-1 py-0.2 rounded-md bg-[#ff9f00] text-black text-[7.5px] font-black uppercase shadow">
                    {cat.badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] sm:text-[11px] font-bold text-stone-200 text-center leading-tight line-clamp-1">
                {cat.name}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* 4. OVERLAPPING SEARCH BAR WITH SLIDER FILTER (Matching Reference Screenshot) */}
      <section className="px-3.5 pt-2 pb-1 max-w-4xl mx-auto">
        <div className="relative flex items-center rounded-2xl bg-[#121118] border border-white/15 shadow-[0_8px_25px_rgba(0,0,0,0.6)] p-1.5 transition-all focus-within:border-[#ff9f00] focus-within:shadow-[0_0_20px_rgba(255,159,0,0.25)]">
          {/* Amber Magnifying Glass */}
          <div className="w-8 h-8 rounded-xl bg-gradient-to-r from-[#ff9f00] to-[#ea580c] flex items-center justify-center ml-1 text-black shadow-md shrink-0">
            <Search className="w-4 h-4 stroke-[3]" />
          </div>

          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search templates, effects..."
            className="w-full bg-transparent px-3 py-2 text-xs sm:text-sm text-white placeholder-stone-400 focus:outline-none"
          />

          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="px-2 text-stone-400 hover:text-white text-xs cursor-pointer"
            >
              Clear
            </button>
          )}

          {/* Sliders Filter Button */}
          <button
            type="button"
            onClick={() => {
              setFilterType(
                filterType === 'all'
                  ? 'video'
                  : filterType === 'video'
                  ? 'photo'
                  : 'all'
              );
            }}
            className="p-2 rounded-xl text-stone-300 hover:text-[#ff9f00] hover:bg-white/5 transition-colors cursor-pointer mr-1"
            title="Toggle Filter Mode"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
        </div>
      </section>

      {/* 5. QUICK PILL TAGS UNDER SEARCH BAR (Only Active Categories) */}
      <section className="px-3.5 pt-1.5 pb-2 max-w-4xl mx-auto">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
          {sortedCategories.map((cat) => {
            const isSelected = cat === 'All' ? selectedCategories.length === 0 : selectedCategories.includes(cat);
            return (
              <button
                key={cat}
                onClick={() => {
                  if (cat === 'All') {
                    setSelectedCategory('All');
                    setSelectedCategories([]);
                  } else {
                    const exists = selectedCategories.includes(cat);
                    const updated = exists
                      ? selectedCategories.filter((c) => c !== cat)
                      : [...selectedCategories, cat];
                    setSelectedCategories(updated);
                    setSelectedCategory(
                      updated.length === 1 ? updated[0] : (updated.length === 0 ? 'All' : updated.join(', '))
                    );
                  }
                }}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all shrink-0 cursor-pointer ${
                  isSelected
                    ? 'bg-gradient-to-r from-[#ff9f00] to-[#ea580c] text-black font-bold shadow-[0_0_12px_rgba(255,159,0,0.35)]'
                    : 'bg-[#14131c] text-stone-300 hover:bg-[#1d1b29] hover:text-white border border-white/10'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </section>

      {/* PRIORITY 1: TOP FEATURED FACE SWAP VIDEO */}
      <div className="px-3.5 pt-1">
        <FaceSwapFeaturedCard />
      </div>

      {/* PRIORITY 1.5: DYNAMIC FACE SWAP SCENE GALLERY */}
      <div className="px-3.5 pt-3">
        <FaceSwapSceneGallery />
      </div>

      {/* 6. DENSE TEMPLATE SECTIONS & HORIZONTAL RAILS (Dynamic Data-Driven System) */}
      <div className="max-w-4xl mx-auto px-3.5 space-y-6 mt-4">
        {searchQuery.trim() ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-white">
                Search Results ({searchResults.length})
              </h3>
            </div>
            {searchResults.length === 0 ? (
              <div className="text-center py-12 text-stone-400 text-sm">
                No templates found matching "{searchQuery}". Try another keyword or browse categories below.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {searchResults.map((tpl) => (
                  <TemplateCard key={tpl.id} template={tpl} size="compact" />
                ))}
              </div>
            )}
          </div>
        ) : (
          sortedCategories
            .filter((category) => selectedCategories.length === 0 || selectedCategories.includes(category))
            .map((category) => {
              const catTemplates = activeTemplates.filter(
                (t) => (t.category || 'Trending') === category
              );
              if (catTemplates.length === 0) return null;

            return (
              <div key={category} className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-0.5 text-[#10b981] font-mono text-sm font-black tracking-tighter">
                      <span className="w-1 h-3.5 rounded-full bg-[#10b981]" />
                      <span className="w-1 h-3.5 rounded-full bg-[#10b981]" />
                    </span>
                    <h3 className="text-base sm:text-lg font-extrabold font-display text-white tracking-tight">
                      {category}
                    </h3>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedCategory(category);
                      setActiveTab('templates');
                    }}
                    className="text-xs font-bold text-[#ff9f00] hover:text-[#fbbf24] transition-colors flex items-center gap-0.5 cursor-pointer"
                  >
                    <span>View All</span>
                    <ChevronRight className="w-3.5 h-3.5 stroke-[2.5]" />
                  </button>
                </div>

                <div className="flex gap-2.5 sm:gap-3 overflow-x-auto no-scrollbar pb-2 pt-0.5 -mx-3.5 px-3.5">
                  {catTemplates.slice(0, 8).map((tpl) => (
                    <TemplateCard key={tpl.id} template={tpl} size="compact" />
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* FULLSCREEN / RESPONSIVE HERO BANNER VIDEO MODAL */}
      <AnimatePresence>
        {fullVideoBanner && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/95 backdrop-blur-2xl flex flex-col justify-between"
            onClick={closeFullVideoPlayer}
          >
            {/* Header Bar */}
            <div
              className="flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/80 to-transparent z-20 shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={closeFullVideoPlayer}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-all cursor-pointer"
                aria-label="Back to carousel"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>

              <div className="flex flex-col items-center max-w-[200px] truncate text-center">
                <span className="text-xs font-bold text-white truncate">{fullVideoBanner.title}</span>
                <span className="text-[10px] text-amber-300 font-semibold">{fullVideoBanner.badge || 'PRO REEL'}</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (fullVideoRef.current) {
                      fullVideoRef.current.muted = !isFullVideoMuted;
                      setIsFullVideoMuted(!isFullVideoMuted);
                    }
                  }}
                  className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer"
                  title={isFullVideoMuted ? 'Unmute' : 'Mute'}
                >
                  {isFullVideoMuted ? <VolumeX className="w-4 h-4 text-amber-300" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
                </button>
                <button
                  type="button"
                  onClick={closeFullVideoPlayer}
                  className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Main Media Viewport (Full original native aspect ratio without any crop) */}
            <div
              className="relative flex-1 flex items-center justify-center overflow-hidden p-2"
              onClick={(e) => e.stopPropagation()}
            >
              {Boolean(
                fullVideoBanner.mediaType === 'video' ||
                fullVideoBanner.videoUrl ||
                fullVideoBanner.image?.endsWith('.mp4') ||
                fullVideoBanner.image?.endsWith('.webm') ||
                fullVideoBanner.image?.startsWith('data:video/')
              ) ? (
                <>
                  <video
                    ref={fullVideoRef}
                    src={fullVideoBanner.videoUrl || fullVideoBanner.image}
                    poster={fullVideoBanner.coverMedia}
                    autoPlay
                    playsInline
                    loop
                    muted={isFullVideoMuted}
                    onTimeUpdate={() => {
                      if (fullVideoRef.current) {
                        setVideoCurrentTime(fullVideoRef.current.currentTime);
                        setVideoDuration(fullVideoRef.current.duration || 0);
                      }
                    }}
                    onLoadedMetadata={() => {
                      if (fullVideoRef.current) {
                        setVideoDuration(fullVideoRef.current.duration || 0);
                      }
                    }}
                    onClick={() => {
                      if (!fullVideoRef.current) return;
                      if (fullVideoRef.current.paused) {
                        fullVideoRef.current.play().catch(() => {});
                        setIsPlayingFullVideo(true);
                      } else {
                        fullVideoRef.current.pause();
                        setIsPlayingFullVideo(false);
                      }
                    }}
                    className="max-h-full max-w-full object-contain rounded-2xl shadow-2xl cursor-pointer"
                  />

                  {/* Center Play/Pause Overlay Indicator when paused */}
                  {!isPlayingFullVideo && (
                    <div
                      onClick={() => {
                        if (fullVideoRef.current) {
                          fullVideoRef.current.play().catch(() => {});
                          setIsPlayingFullVideo(true);
                        }
                      }}
                      className="absolute inset-0 flex items-center justify-center bg-black/40 cursor-pointer"
                    >
                      <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white border border-white/30 shadow-2xl">
                        <Play className="w-8 h-8 fill-white ml-1" />
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <img
                  src={fullVideoBanner.image}
                  alt={fullVideoBanner.title}
                  className="max-h-full max-w-full object-contain rounded-2xl shadow-2xl"
                />
              )}
            </div>

            {/* Bottom Controls Bar (Play/Pause, Scrubber, Time, CTA) */}
            <div
              className="p-4 bg-gradient-to-t from-black via-black/90 to-transparent z-20 space-y-3 shrink-0 max-w-lg mx-auto w-full"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Scrubber & Time (Only for Videos) */}
              {Boolean(
                fullVideoBanner.mediaType === 'video' ||
                fullVideoBanner.videoUrl ||
                fullVideoBanner.image?.endsWith('.mp4') ||
                fullVideoBanner.image?.endsWith('.webm') ||
                fullVideoBanner.image?.startsWith('data:video/')
              ) && (
                <div className="space-y-1">
                  <input
                    type="range"
                    min={0}
                    max={videoDuration || 100}
                    step={0.1}
                    value={videoCurrentTime}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setVideoCurrentTime(val);
                      if (fullVideoRef.current) {
                        fullVideoRef.current.currentTime = val;
                      }
                    }}
                    className="w-full accent-[#ff9f00] cursor-pointer h-1.5 bg-white/20 rounded-lg"
                  />
                  <div className="flex items-center justify-between text-[11px] text-stone-400 font-mono">
                    <span>{formatTime(videoCurrentTime)}</span>
                    <span className="text-[10px] text-stone-500 font-sans">{isFullVideoMuted ? 'Muted Preview' : 'Audio On'}</span>
                    <span>{formatTime(videoDuration)}</span>
                  </div>
                </div>
              )}

              {/* Control Actions */}
              <div className="flex items-center justify-between gap-3">
                {Boolean(
                  fullVideoBanner.mediaType === 'video' ||
                  fullVideoBanner.videoUrl ||
                  fullVideoBanner.image?.endsWith('.mp4') ||
                  fullVideoBanner.image?.endsWith('.webm') ||
                  fullVideoBanner.image?.startsWith('data:video/')
                ) && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (!fullVideoRef.current) return;
                        if (fullVideoRef.current.paused) {
                          fullVideoRef.current.play().catch(() => {});
                          setIsPlayingFullVideo(true);
                        } else {
                          fullVideoRef.current.pause();
                          setIsPlayingFullVideo(false);
                        }
                      }}
                      className="p-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer"
                      title={isPlayingFullVideo ? 'Pause' : 'Play'}
                    >
                      {isPlayingFullVideo ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white ml-0.5" />}
                    </button>
                  </div>
                )}

                {/* Conditional CTA: SHOWCASE_ONLY vs LINKED_TEMPLATE */}
                {(() => {
                  const isShowcaseOnly = fullVideoBanner.type === 'SHOWCASE_ONLY';
                  const targetId = fullVideoBanner.linkedTemplateId || fullVideoBanner.targetTemplateId;
                  const targetTpl = targetId ? templates.find((t) => t.id === targetId) : null;

                  if (isShowcaseOnly || !targetTpl) {
                    return (
                      <div className="flex-1 py-3 px-4 rounded-2xl bg-white/5 border border-white/10 text-stone-300 text-xs font-bold text-center flex items-center justify-center gap-2">
                        <Sparkles className="w-4 h-4 text-amber-400" />
                        <span>Showcase Media • High-Fidelity AI Showcase</span>
                      </div>
                    );
                  }

                  return (
                    <button
                      type="button"
                      onClick={() => {
                        closeFullVideoPlayer();
                        setSelectedTemplate(targetTpl);
                      }}
                      className="flex-1 py-3 px-5 rounded-2xl bg-gradient-to-r from-[#ff9f00] to-[#ea580c] text-black text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-amber-500/25 hover:brightness-110 active:scale-95 transition-all cursor-pointer"
                    >
                      <Sparkles className="w-4 h-4 fill-black" />
                      <span>Use This Template</span>
                    </button>
                  );
                })()}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
