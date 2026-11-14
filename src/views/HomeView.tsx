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
import { queueHdDownload, protectMediaUrl, unprotectMediaUrl } from '../services/media/hdDownloadQueue';
import { mediaCacheStorage } from '../services/media/mediaCacheStorage';
import { isVideoMedia } from '../utils/mediaUtils';

const HERO_POSTERS_CACHE_KEY = 'lumina_hero_posters_v1';

const resolveBannerMedia = (banner: HomeBannerItem, templatesList: Template[]) => {
  const linkedTpl =
    banner.type === 'LINKED_TEMPLATE' && banner.targetTemplateId
      ? templatesList.find((t) => t.id === banner.targetTemplateId)
      : null;

  const effectiveVideoUrl =
    banner.videoUrl ||
    (isVideoMedia(banner.image) ? banner.image : undefined) ||
    linkedTpl?.coverVideo ||
    (isVideoMedia(linkedTpl?.cover) ? linkedTpl?.cover : undefined);

  const effectiveImage =
    (!isVideoMedia(banner.image) && banner.image ? banner.image : '') ||
    linkedTpl?.coverImage ||
    (!isVideoMedia(linkedTpl?.cover) ? linkedTpl?.cover : '') ||
    (!isVideoMedia(linkedTpl?.preview) ? linkedTpl?.preview : '') ||
    '';

  const rawPoster =
    (banner.coverMedia && !isVideoMedia(banner.coverMedia) ? banner.coverMedia : '') ||
    effectiveImage ||
    '';

  const isVideoBanner = Boolean(
    banner.mediaType === 'video' ||
      effectiveVideoUrl ||
      isVideoMedia(banner.image)
  );

  const primaryMediaUrl = isVideoBanner
    ? (effectiveVideoUrl || banner.image || '')
    : effectiveImage;

  return {
    linkedTpl,
    effectiveVideoUrl,
    effectiveImage,
    rawPoster,
    isVideoBanner,
    primaryMediaUrl
  };
};

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

  // Auto-rotating Hero Carousel State (8.0s timer with reset on interaction & swipe gestures)
  // Cache-first: Load last verified real admin banners from localStorage to eliminate dummy banner flash
  const [banners, setBanners] = useState<HomeBannerItem[]>(() => {
    try {
      const cached = localStorage.getItem('lumina_admin_banners_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [];
  });
  const [bannersLoading, setBannersLoading] = useState<boolean>(() => {
    try {
      const cached = localStorage.getItem('lumina_admin_banners_cache');
      return !cached;
    } catch {
      return true;
    }
  });
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [timerResetKey, setTimerResetKey] = useState(0);

  // Swipe Gesture Coordinates
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const pointerStartXRef = useRef<number | null>(null);
  const isSwipingRef = useRef(false);

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

  const nextBanner = () => {
    if (banners.length <= 1) return;
    setCurrentBannerIndex((prev) => (prev + 1) % banners.length);
    resetTimer();
  };

  const prevBanner = () => {
    if (banners.length <= 1) return;
    setCurrentBannerIndex((prev) => (prev - 1 + banners.length) % banners.length);
    resetTimer();
  };

  // Gesture Deduplication and Lock
  const lastGestureTimestampRef = useRef<number>(0);

  // Pause carousel when browser tab loses visibility
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        setIsPaused(true);
      } else if (!fullVideoBanner) {
        setIsPaused(false);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [fullVideoBanner]);

  // Touch Swipe Handlers (40px threshold, circular boundary wrapping, control element guard)
  const handleTouchStart = (e: React.TouchEvent) => {
    const target = e.target as HTMLElement | null;
    if (target && target.closest('button, a, video, [role="button"], input, select, textarea')) {
      touchStartXRef.current = null;
      touchStartYRef.current = null;
      return;
    }
    if (e.touches.length === 1) {
      touchStartXRef.current = e.touches[0].clientX;
      touchStartYRef.current = e.touches[0].clientY;
      isSwipingRef.current = false;
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null) return;
    const now = Date.now();
    if (now - lastGestureTimestampRef.current < 450) {
      touchStartXRef.current = null;
      touchStartYRef.current = null;
      return;
    }

    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    const diffX = touchEndX - touchStartXRef.current;
    const diffY = touchStartYRef.current !== null ? touchEndY - touchStartYRef.current : 0;

    // Vertical safeguard: If vertical movement is greater or equal to horizontal movement, ignore as page scroll
    if (Math.abs(diffX) >= 40 && Math.abs(diffX) > Math.abs(diffY)) {
      lastGestureTimestampRef.current = now;
      isSwipingRef.current = true;
      if (diffX < 0) {
        nextBanner();
      } else {
        prevBanner();
      }
    }
    touchStartXRef.current = null;
    touchStartYRef.current = null;
  };

  const handleTouchCancel = () => {
    touchStartXRef.current = null;
    touchStartYRef.current = null;
    isSwipingRef.current = false;
  };

  // Pointer Drag Handlers (Mouse / Stylus only; bypasses touch to prevent double navigation)
  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return; // Handled by touch events natively
    const target = e.target as HTMLElement | null;
    if (target && target.closest('button, a, video, [role="button"], input, select, textarea')) {
      pointerStartXRef.current = null;
      return;
    }
    if (e.button === 0) {
      pointerStartXRef.current = e.clientX;
      isSwipingRef.current = false;
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch' || pointerStartXRef.current === null) return;
    const now = Date.now();
    if (now - lastGestureTimestampRef.current < 450) {
      pointerStartXRef.current = null;
      return;
    }

    const diffX = e.clientX - pointerStartXRef.current;
    if (Math.abs(diffX) >= 40) {
      lastGestureTimestampRef.current = now;
      isSwipingRef.current = true;
      if (diffX < 0) {
        nextBanner();
      } else {
        prevBanner();
      }
    }
    pointerStartXRef.current = null;
  };

  const handlePointerCancel = () => {
    pointerStartXRef.current = null;
    isSwipingRef.current = false;
  };

  // Fetch live admin-managed banners dynamically
  useEffect(() => {
    let isMounted = true;
    fetch('/api/banners')
      .then((res) => res.json())
      .then((data) => {
        if (isMounted) {
          if (data.banners && Array.isArray(data.banners) && data.banners.length > 0) {
            const active = data.banners.filter((b: any) => b.isActive !== false);
            if (active.length > 0) {
              setBanners(active);
              try {
                localStorage.setItem('lumina_admin_banners_cache', JSON.stringify(active));
              } catch {}
            }
          }
          setBannersLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) setBannersLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  // 8.0-second auto-cycle rotation timer
  useEffect(() => {
    if (isPaused || fullVideoBanner !== null || banners.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentBannerIndex((prev) => (prev + 1) % banners.length);
    }, 8000);
    return () => clearInterval(interval);
  }, [isPaused, fullVideoBanner, banners.length, timerResetKey]);

  const [bannerHdUrls, setBannerHdUrls] = useState<Record<string, string>>({});
  const [heroPosters, setHeroPosters] = useState<Record<string, string>>(() => {
    try {
      const raw = localStorage.getItem(HERO_POSTERS_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch {}
    return {};
  });
  const [readyHeroIds, setReadyHeroIds] = useState<Record<string, boolean>>({});
  const heroVideoRef = useRef<HTMLVideoElement>(null);

  const captureHeroFramePoster = (bannerId: string, videoEl: HTMLVideoElement) => {
    if (!bannerId || !videoEl || heroPosters[bannerId]) return;
    try {
      const vw = videoEl.videoWidth;
      const vh = videoEl.videoHeight;
      if (!vw || !vh) return;
      const targetWidth = Math.min(360, vw);
      const targetHeight = Math.round((vh / vw) * targetWidth);
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(videoEl, 0, 0, targetWidth, targetHeight);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.65);
      if (dataUrl && dataUrl.startsWith('data:image/')) {
        setHeroPosters((prev) => {
          if (prev[bannerId]) return prev;
          const next = { ...prev, [bannerId]: dataUrl };
          const keys = Object.keys(next);
          if (keys.length > 8) {
            delete next[keys[0]];
          }
          try {
            localStorage.setItem(HERO_POSTERS_CACHE_KEY, JSON.stringify(next));
          } catch {}
          return next;
        });
      }
    } catch {
      // Canvas may be tainted on strict third-party CORS; ignore safely
    }
  };

  // Immediate IndexedDB Hydration + Top-First Progressive Hero Banner Caching (no re-download on refresh)
  useEffect(() => {
    if (!banners || banners.length === 0) return;
    let cancelled = false;

    const hydrateAndPrefetch = async () => {
      // Step 1: Resolve any already-cached IndexedDB Blob URLs immediately (0 bytes downloaded)
      await Promise.all(
        banners.map(async (b) => {
          const { primaryMediaUrl, rawPoster } = resolveBannerMedia(b, templates);
          if (primaryMediaUrl) {
            const cachedPrimary = await mediaCacheStorage.get(primaryMediaUrl).catch(() => null);
            if (!cancelled && cachedPrimary?.objectUrl) {
              setBannerHdUrls((prev) =>
                prev[b.id] === cachedPrimary.objectUrl ? prev : { ...prev, [b.id]: cachedPrimary.objectUrl }
              );
            }
          }
          if (rawPoster && rawPoster !== primaryMediaUrl) {
            const cachedPoster = await mediaCacheStorage.get(rawPoster).catch(() => null);
            if (!cancelled && cachedPoster?.objectUrl) {
              setHeroPosters((prev) => (prev[b.id] ? prev : { ...prev, [b.id]: cachedPoster.objectUrl }));
            }
          }
        })
      );

      // Step 2: Top Hero Banners download first: Active banner ('high'), then remaining banners ('medium')
      const current = banners[currentBannerIndex];
      const ordered = current
        ? [current, ...banners.filter((b) => b.id !== current.id)]
        : banners;

      for (let i = 0; i < ordered.length; i++) {
        if (cancelled) break;
        const banner = ordered[i];
        const { primaryMediaUrl, rawPoster } = resolveBannerMedia(banner, templates);
        const priority = i === 0 ? 'high' : 'medium';

        if (rawPoster && rawPoster !== primaryMediaUrl && mediaCacheStorage.isCacheablePublicMedia(rawPoster)) {
          queueHdDownload(rawPoster, priority)
            .then((cachedPosterUrl) => {
              if (!cancelled && cachedPosterUrl && cachedPosterUrl.startsWith('blob:')) {
                setHeroPosters((prev) => ({ ...prev, [banner.id]: cachedPosterUrl }));
              }
            })
            .catch(() => {});
        }

        if (primaryMediaUrl && mediaCacheStorage.isCacheablePublicMedia(primaryMediaUrl)) {
          queueHdDownload(primaryMediaUrl, priority)
            .then((hdUrl) => {
              if (cancelled || !hdUrl || hdUrl === primaryMediaUrl) return;
              if (i === 0 && heroVideoRef.current) {
                const videoEl = heroVideoRef.current;
                const prevTime = videoEl.currentTime;
                const wasPaused = videoEl.paused;
                const wasMuted = videoEl.muted;
                setBannerHdUrls((prev) => ({ ...prev, [banner.id]: hdUrl }));
                const restoreState = () => {
                  try {
                    videoEl.currentTime = prevTime;
                    videoEl.muted = wasMuted;
                    if (!wasPaused) {
                      videoEl.play().catch(() => {});
                    }
                  } catch {}
                  videoEl.removeEventListener('loadeddata', restoreState);
                };
                videoEl.addEventListener('loadeddata', restoreState);
              } else {
                setBannerHdUrls((prev) => ({ ...prev, [banner.id]: hdUrl }));
              }
            })
            .catch(() => {});
        }
      }
    };

    hydrateAndPrefetch();

    const active = banners[currentBannerIndex];
    const activeUrl = active ? resolveBannerMedia(active, templates).primaryMediaUrl : '';
    if (activeUrl) protectMediaUrl(activeUrl);

    return () => {
      cancelled = true;
      if (activeUrl) unprotectMediaUrl(activeUrl);
    };
  }, [currentBannerIndex, banners, templates]);

  const activeBanner: HomeBannerItem | null = (banners.length > 0 ? (banners[currentBannerIndex] || banners[0]) : null);

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

      {/* 2. ROTATING HERO CAROUSEL BANNER (Auto-cycles every 8.0 seconds) */}
      <section
        className="px-3.5 pt-2 pb-2 relative flex justify-center"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        {bannersLoading && banners.length === 0 ? (
          <div className="relative rounded-3xl overflow-hidden shadow-[0_15px_45px_rgba(0,0,0,0.85)] border border-white/10 aspect-square w-full max-w-[460px] bg-[#121118] flex flex-col justify-end p-6 animate-pulse">
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
            <div className="relative z-10 space-y-3">
              <div className="h-6 w-3/4 rounded-xl bg-white/10" />
              <div className="h-4 w-1/2 rounded-lg bg-white/5" />
              <div className="h-9 w-32 rounded-xl bg-[#ff9f00]/20" />
            </div>
          </div>
        ) : banners.length === 0 ? (
          <div className="relative rounded-3xl overflow-hidden shadow-[0_15px_45px_rgba(0,0,0,0.85)] border border-amber-500/20 aspect-square w-full max-w-[460px] bg-gradient-to-b from-[#1a141e] via-[#0d0c14] to-[#070609] flex flex-col justify-between p-6">
            <div className="flex items-center justify-between z-10">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black tracking-wide uppercase bg-gradient-to-r from-[#ff9f00]/20 to-[#ea580c]/20 text-[#ffb703] border border-[#ff9f00]/30 shadow-sm">
                <Sparkles className="w-3.5 h-3.5 text-[#ffb703] fill-[#ffb703]" /> AI Prime Studio
              </span>
              <span className="text-[11px] font-semibold text-stone-400">Featured Showcase</span>
            </div>

            <div className="relative z-10 space-y-3 my-auto text-center py-4">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-[#ff9f00]/20 to-orange-600/10 border border-amber-500/30 flex items-center justify-center text-[#ffb703] shadow-[0_0_25px_rgba(255,159,0,0.2)]">
                <Sparkles className="w-8 h-8" />
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Create Viral AI Magic
              </h2>
              <p className="text-xs text-stone-300 max-w-[280px] mx-auto leading-relaxed">
                Transform any photo into cinematic videos, vintage portraits & royal avatars with 1-click AI templates.
              </p>
            </div>

            <div className="z-10 pt-3 border-t border-white/5 flex items-center justify-between text-xs text-stone-400">
              <span className="text-[11px] text-amber-300/80 font-medium">✦ Select a template below to start</span>
              <button
                onClick={() => setPlansModalOpen(true)}
                className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-[#ff9f00] to-[#ea580c] text-black text-xs font-black hover:brightness-110 transition shadow-[0_0_15px_rgba(255,159,0,0.4)] cursor-pointer"
              >
                Get Pro
              </button>
            </div>
          </div>
        ) : activeBanner ? (
          <div
            className="relative rounded-3xl overflow-hidden shadow-[0_15px_45px_rgba(0,0,0,0.85)] border border-white/10 aspect-square w-full max-w-[460px] bg-[#16141d] group select-none touch-pan-y"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchCancel}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
          >
          <AnimatePresence mode="wait">
            <motion.div
              key={activeBanner.id}
              initial={{ opacity: 0.9, scale: 1.02 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0.9, scale: 0.99 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
              onClick={() => {
                if (isSwipingRef.current) {
                  isSwipingRef.current = false;
                  return;
                }
                handleBannerClick(activeBanner);
              }}
              className="absolute inset-0 cursor-pointer"
            >
              {/* Media Container: Clean 1:1 Square Frame with Instant Still Preview & Zero Dark Scrim Shadow Overlays */}
              {(() => {
                const {
                  effectiveImage,
                  rawPoster,
                  isVideoBanner,
                  primaryMediaUrl
                } = resolveBannerMedia(activeBanner, templates);

                const cropStyle: React.CSSProperties = activeBanner.crop ? {
                  transform: `scale(${activeBanner.crop.zoom || 1}) translate(${activeBanner.crop.positionX || 0}%, ${activeBanner.crop.positionY || 0}%)`,
                  transformOrigin: 'center center'
                } : {};

                const instantPoster = heroPosters[activeBanner.id] || rawPoster || '';
                const heroVideoSrc = bannerHdUrls[activeBanner.id] || primaryMediaUrl;
                const heroImageSrc = bannerHdUrls[activeBanner.id] || effectiveImage;
                const isReady = Boolean(readyHeroIds[activeBanner.id]);

                return isVideoBanner ? (
                  <div className="relative w-full h-full overflow-hidden flex items-center justify-center bg-[#181522]">
                    {instantPoster ? (
                      <img
                        src={instantPoster}
                        alt={activeBanner.title}
                        style={cropStyle}
                        className="absolute inset-0 z-[2] w-full h-full object-cover object-center"
                      />
                    ) : !isReady ? (
                      <div className="absolute inset-0 z-[2] bg-gradient-to-br from-[#231e31] via-[#191624] to-[#13111c] animate-pulse flex flex-col items-center justify-center gap-2 pointer-events-none">
                        <div className="w-8 h-8 border-2 border-amber-400/25 border-t-amber-400 rounded-full animate-spin" />
                        <span className="text-[11px] font-semibold text-amber-200/80 tracking-wide">Loading preview…</span>
                      </div>
                    ) : null}

                    <video
                      ref={heroVideoRef}
                      key={`hero_fg_${activeBanner.id}`}
                      src={heroVideoSrc}
                      poster={instantPoster || undefined}
                      autoPlay
                      muted
                      loop
                      playsInline
                      preload="auto"
                      crossOrigin="anonymous"
                      onLoadedData={(e) => {
                        setReadyHeroIds((prev) => ({ ...prev, [activeBanner.id]: true }));
                        captureHeroFramePoster(activeBanner.id, e.currentTarget);
                      }}
                      style={cropStyle}
                      className="relative z-10 w-full h-full object-cover object-center"
                    />
                  </div>
                ) : (
                  <div className="relative w-full h-full overflow-hidden flex items-center justify-center bg-[#181522]">
                    {!isReady && (
                      <div className="absolute inset-0 z-[2] bg-gradient-to-br from-[#231e31] via-[#191624] to-[#13111c] animate-pulse flex flex-col items-center justify-center gap-2 pointer-events-none">
                        <div className="w-8 h-8 border-2 border-amber-400/25 border-t-amber-400 rounded-full animate-spin" />
                        <span className="text-[11px] font-semibold text-amber-200/80 tracking-wide">Loading preview…</span>
                      </div>
                    )}
                    <img
                      src={heroImageSrc}
                      alt={activeBanner.title}
                      style={cropStyle}
                      onLoad={() => {
                        setReadyHeroIds((prev) => ({ ...prev, [activeBanner.id]: true }));
                      }}
                      className="relative z-10 w-full h-full object-cover object-center"
                    />
                  </div>
                );
              })()}

              {/* Floating PRO Badge with Video Play Icon (Top Right) */}
              <div className="absolute top-4 right-4 z-20 flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-[#ff9f00] to-[#ea580c] text-black text-xs font-black shadow-[0_0_20px_rgba(255,159,0,0.5)]">
                <Play className="w-3 h-3 fill-black text-black" />
                <span>{activeBanner.badge}</span>
              </div>

              {/* Banner Text Overlays (Clean text shadow only — zero dark background shadow over Hero Banner media) */}
              <div className="absolute bottom-5 inset-x-5 z-20 max-w-[280px] sm:max-w-md space-y-1">
                <h2 className="text-2xl sm:text-3xl font-black text-white leading-tight font-display tracking-tight drop-shadow-[0_2px_10px_rgba(0,0,0,0.92)]">
                  <span className="text-[#ffb703]">{activeBanner.title}</span>
                  <br />
                  <span className="text-white text-xl sm:text-2xl font-extrabold">
                    {activeBanner.highlightText}
                  </span>
                </h2>

                <p className="text-[11px] sm:text-xs text-stone-100 font-medium line-clamp-1 drop-shadow-[0_1px_6px_rgba(0,0,0,0.92)]">
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
        ) : null}
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
                    src={bannerHdUrls[fullVideoBanner.id] || fullVideoBanner.videoUrl || fullVideoBanner.image}
                    poster={heroPosters[fullVideoBanner.id] || (!isVideoMedia(fullVideoBanner.coverMedia) ? fullVideoBanner.coverMedia : undefined)}
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
                  src={bannerHdUrls[fullVideoBanner.id] || fullVideoBanner.image}
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
