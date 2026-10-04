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
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(() => {
      setCurrentBannerIndex((prev) => (prev + 1) % HOME_HERO_BANNERS.length);
    }, 4500);
    return () => clearInterval(interval);
  }, [isPaused]);

  const activeBanner: HomeBannerItem = HOME_HERO_BANNERS[currentBannerIndex];

  const handleBannerClick = (banner: HomeBannerItem) => {
    const targetTpl = templates.find((t) => t.id === banner.targetTemplateId);
    if (targetTpl) {
      setSelectedTemplate(targetTpl);
    } else {
      setSelectedCategory(banner.category);
    }
  };

  // Filtered lists for rich rails matching user's reference
  const trendingTemplates = templates.filter(
    (t) =>
      t.category === 'Trending' ||
      t.isFeatured ||
      t.id.includes('swag') ||
      t.id.includes('cartoon')
  );

  const retro80sTemplates = templates.filter(
    (t) =>
      t.category === 'Retro 80s' ||
      t.tags.some((tag) => tag.toLowerCase().includes('retro') || tag.toLowerCase().includes('80s')) ||
      t.id.includes('1980') ||
      t.id.includes('zindagi') ||
      t.id.includes('vintage')
  );

  const danceTemplates = templates.filter(
    (t) =>
      t.category === 'Dance' ||
      t.tags.some((tag) => tag.toLowerCase().includes('dance'))
  );

  const weddingAndLuxuryTemplates = templates.filter(
    (t) =>
      t.category === 'Luxury' ||
      t.category === 'Fashion' ||
      t.tags.some((tag) =>
        tag.toLowerCase().includes('wedding') ||
        tag.toLowerCase().includes('royal') ||
        tag.toLowerCase().includes('gold')
      )
  );

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
            {wallet?.balance ?? 0} Credits
          </span>
          <span className="text-[10px] font-bold text-amber-300/80 pl-1 border-l border-white/10 uppercase">
            Pro
          </span>
        </button>
      </header>

      {/* 2. ROTATING HERO CAROUSEL BANNER (Auto-cycles every 4.5 seconds) */}
      <section
        className="px-3.5 pt-2.5 pb-2 relative"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        <div className="relative rounded-3xl overflow-hidden shadow-[0_15px_45px_rgba(0,0,0,0.85)] border border-white/10 h-72 sm:h-80 w-full group">
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
              {/* Background Image */}
              <img
                src={activeBanner.image}
                alt={activeBanner.title}
                className="w-full h-full object-cover object-center"
              />

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

              {/* Instagram Reel Side Interaction Counters */}
              <div className="absolute right-4 bottom-14 z-20 flex flex-col items-center gap-3 text-stone-200">
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-black/60 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-md">
                    <Heart className="w-4 h-4 text-rose-400 fill-rose-400" />
                  </div>
                  <span className="text-[10px] font-bold text-white mt-0.5">
                    {activeBanner.likesCount}
                  </span>
                </div>

                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-black/60 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-md">
                    <MessageCircle className="w-4 h-4 text-cyan-300" />
                  </div>
                  <span className="text-[10px] font-bold text-white mt-0.5">
                    {activeBanner.commentsCount}
                  </span>
                </div>

                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-black/60 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-md">
                    <Share2 className="w-4 h-4 text-emerald-300" />
                  </div>
                  <span className="text-[10px] font-bold text-white mt-0.5">
                    {activeBanner.sharesCount}
                  </span>
                </div>
              </div>

              {/* Banner Text Overlays (Title, Highlight, Subtitle) */}
              <div className="absolute bottom-5 inset-x-5 z-20 max-w-[260px] sm:max-w-md space-y-1">
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

      {/* 3. QUICK CATEGORY ICONS ROW (4 Rounded Amber Squares - Exactly matching reference) */}
      <section className="px-3.5 pt-2 pb-1.5 max-w-4xl mx-auto">
        <div className="grid grid-cols-4 gap-2.5">
          {QUICK_CATEGORY_ICONS.map((cat) => (
            <button
              key={cat.id}
              onClick={() => {
                setSelectedCategory(cat.categoryFilter);
                setActiveTab('templates');
              }}
              className="flex flex-col items-center gap-1.5 p-2 rounded-2xl bg-[#121118]/80 hover:bg-[#191722] border border-amber-500/20 hover:border-amber-500/40 shadow-sm transition-all active:scale-95 cursor-pointer group"
            >
              {/* Rounded Square Amber Glow Icon Container */}
              <div
                className={`w-13 h-13 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-b ${cat.glowColor} flex items-center justify-center shadow-[0_4px_16px_rgba(245,158,11,0.2)] group-hover:scale-105 transition-transform relative`}
              >
                {renderQuickIcon(cat.iconType)}
                {cat.badge && (
                  <span className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-md bg-[#ff9f00] text-black text-[8px] font-black uppercase shadow">
                    {cat.badge}
                  </span>
                )}
              </div>
              <span className="text-[11px] font-bold text-stone-200 text-center leading-tight line-clamp-1">
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

      {/* 6. DENSE TEMPLATE SECTIONS & HORIZONTAL RAILS (Matching Screenshot Layout) */}
      <div className="max-w-4xl mx-auto px-3.5 space-y-6 mt-4">
        {/* Section 1: || Trending (Full Swag, Full Swag 2, Real Me Cartoon) */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[#10b981] font-mono text-base font-black tracking-tighter">
                []
              </span>
              <h3 className="text-base sm:text-lg font-extrabold font-display text-white tracking-tight">
                Trending
              </h3>
            </div>
            <button
              onClick={() => {
                setSelectedCategory('Trending');
                setActiveTab('templates');
              }}
              className="text-xs font-bold text-[#ff9f00] hover:text-[#fbbf24] transition-colors flex items-center gap-0.5 cursor-pointer"
            >
              <span>View All</span>
              <ChevronRight className="w-3.5 h-3.5 stroke-[2.5]" />
            </button>
          </div>

          <div className="flex gap-2.5 sm:gap-3 overflow-x-auto no-scrollbar pb-2 pt-0.5 -mx-3.5 px-3.5">
            {trendingTemplates.slice(0, 6).map((tpl) => (
              <TemplateCard key={tpl.id} template={tpl} size="compact" />
            ))}
          </div>
        </div>

        {/* Section 2: || Retro 80's (1980 Model, Zindagi Ek Safar, Nostalgia) */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[#10b981] font-mono text-base font-black tracking-tighter">
                []
              </span>
              <h3 className="text-base sm:text-lg font-extrabold font-display text-white tracking-tight">
                Retro 80's
              </h3>
            </div>
            <button
              onClick={() => {
                setSelectedCategory('Retro 80s');
                setActiveTab('templates');
              }}
              className="text-xs font-bold text-[#ff9f00] hover:text-[#fbbf24] transition-colors flex items-center gap-0.5 cursor-pointer"
            >
              <span>View All</span>
              <ChevronRight className="w-3.5 h-3.5 stroke-[2.5]" />
            </button>
          </div>

          <div className="flex gap-2.5 sm:gap-3 overflow-x-auto no-scrollbar pb-2 pt-0.5 -mx-3.5 px-3.5">
            {retro80sTemplates.slice(0, 6).map((tpl) => (
              <TemplateCard key={tpl.id} template={tpl} size="compact" />
            ))}
          </div>
        </div>

        {/* Section 3: || Dance Video & Viral Hooksteps */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[#10b981] font-mono text-base font-black tracking-tighter">
                []
              </span>
              <h3 className="text-base sm:text-lg font-extrabold font-display text-white tracking-tight">
                Dance Reels & Beats
              </h3>
            </div>
            <button
              onClick={() => {
                setSelectedCategory('Dance');
                setActiveTab('templates');
              }}
              className="text-xs font-bold text-[#ff9f00] hover:text-[#fbbf24] transition-colors flex items-center gap-0.5 cursor-pointer"
            >
              <span>View All</span>
              <ChevronRight className="w-3.5 h-3.5 stroke-[2.5]" />
            </button>
          </div>

          <div className="flex gap-2.5 sm:gap-3 overflow-x-auto no-scrollbar pb-2 pt-0.5 -mx-3.5 px-3.5">
            {danceTemplates.slice(0, 6).map((tpl) => (
              <TemplateCard key={tpl.id} template={tpl} size="compact" />
            ))}
          </div>
        </div>

        {/* Section 4: || Proposal & Wedding Luxury */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[#10b981] font-mono text-base font-black tracking-tighter">
                []
              </span>
              <h3 className="text-base sm:text-lg font-extrabold font-display text-white tracking-tight">
                Proposal & Royal Wedding
              </h3>
            </div>
            <button
              onClick={() => {
                setSelectedCategory('Luxury');
                setActiveTab('templates');
              }}
              className="text-xs font-bold text-[#ff9f00] hover:text-[#fbbf24] transition-colors flex items-center gap-0.5 cursor-pointer"
            >
              <span>View All</span>
              <ChevronRight className="w-3.5 h-3.5 stroke-[2.5]" />
            </button>
          </div>

          <div className="flex gap-2.5 sm:gap-3 overflow-x-auto no-scrollbar pb-2 pt-0.5 -mx-3.5 px-3.5">
            {weddingAndLuxuryTemplates.slice(0, 6).map((tpl) => (
              <TemplateCard key={tpl.id} template={tpl} size="compact" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
