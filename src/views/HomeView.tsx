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
  Crown
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

export const HomeView: React.FC = () => {
  const {
    templates,
    wallet,
    setDrawerOpen,
    setPlansModalOpen,
    selectedCategory,
    setSelectedCategory,
    searchQuery,
    setSearchQuery,
    filterType,
    setFilterType,
    setSelectedTemplate,
    setActiveTab
  } = useApp();

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Auto-rotating Hero Carousel State (4.5s timer)
  const [banners, setBanners] = useState<HomeBannerItem[]>(HOME_HERO_BANNERS);
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

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
    }, 4500);
    return () => clearInterval(interval);
  }, [isPaused, banners.length]);

  const activeBanner: HomeBannerItem = banners[currentBannerIndex] || banners[0] || HOME_HERO_BANNERS[0];

  const handleBannerClick = (banner: HomeBannerItem) => {
    const targetTpl = templates.find((t) => t.id === banner.targetTemplateId);
    if (targetTpl) {
      setSelectedTemplate(targetTpl);
    } else {
      setSelectedCategory(banner.category);
    }
  };

  // Dynamic Data-Driven Category Rails
  const activeTemplates = templates.filter((t) => t.isActive !== false);

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

      {/* 2. ROTATING HERO CAROUSEL BANNER (Auto-cycles every 4.5 seconds) */}
      <section
        className="px-3.5 pt-2 pb-2 relative"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        <div className="relative rounded-3xl overflow-hidden shadow-[0_15px_45px_rgba(0,0,0,0.85)] border border-white/10 h-64 sm:h-72 w-full group">
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
              {/* Background Media: Supports both Video and Image */}
              {Boolean(
                activeBanner.mediaType === 'video' ||
                activeBanner.videoUrl ||
                activeBanner.image?.endsWith('.mp4') ||
                activeBanner.image?.endsWith('.webm') ||
                activeBanner.image?.startsWith('data:video/')
              ) ? (
                <video
                  src={activeBanner.videoUrl || activeBanner.image}
                  poster={activeBanner.coverMedia || activeBanner.image?.endsWith('.mp4') ? undefined : activeBanner.image}
                  autoPlay
                  muted
                  loop
                  playsInline
                  className="w-full h-full object-cover object-center"
                />
              ) : (
                <img
                  src={activeBanner.image}
                  alt={activeBanner.title}
                  className="w-full h-full object-cover object-center"
                />
              )}

              {/* Multi-layer Cinematic Scrims */}
              <div
                className={`absolute inset-0 bg-gradient-to-r ${activeBanner.gradientOverlay || 'from-black/85 via-black/40 to-transparent'}`}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#070609] via-transparent to-black/30" />

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
            {HOME_HERO_BANNERS.map((banner, idx) => (
              <button
                key={banner.id}
                onClick={(e) => {
                  e.stopPropagation();
                  setCurrentBannerIndex(idx);
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

      {/* 5. QUICK PILL TAGS UNDER SEARCH BAR (Matching Reference Screenshot) */}
      <section className="px-3.5 pt-1.5 pb-2 max-w-4xl mx-auto">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
          {QUICK_PILL_TAGS.map((tag, idx) => {
            const isSelected = selectedCategory === tag.filter;
            return (
              <button
                key={idx}
                onClick={() => {
                  setSelectedCategory(tag.filter);
                }}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all shrink-0 cursor-pointer ${
                  isSelected
                    ? 'bg-gradient-to-r from-[#ff9f00] to-[#ea580c] text-black font-bold shadow-[0_0_12px_rgba(255,159,0,0.35)]'
                    : 'bg-[#14131c] text-stone-300 hover:bg-[#1d1b29] hover:text-white border border-white/10'
                }`}
              >
                {tag.label}
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
          sortedCategories.map((category) => {
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
    </div>
  );
};
