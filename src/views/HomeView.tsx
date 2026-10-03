import React, { useRef } from 'react';
import { motion } from 'motion/react';
import {
  Menu,
  Sparkles,
  Search,
  SlidersHorizontal,
  ChevronRight,
  Flame,
  Film,
  Camera,
  Layers,
  Crown,
  Play
} from 'lucide-react';
import { Logo } from '../components/Logo';
import { TemplateCard } from '../components/TemplateCard';
import { FaceSwapFeaturedCard } from '../components/FaceSwapFeaturedCard';
import { useApp } from '../context/AppContext';
import { CATEGORIES } from '../data/templatesData';
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
    setActiveTab,
    setFaceSwapModalOpen
  } = useApp();

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Prioritized video-first lists
  const danceTemplates = templates.filter(t => t.category === 'Dance' || t.tags.includes('Dance'));
  const trendingVideoTemplates = templates.filter(t => t.type === 'video' && (t.isFeatured || t.category === 'Trending' || (t.likesCount && t.likesCount > 15000)));
  const cinematicVideoTemplates = templates.filter(t => t.type === 'video' || t.category === 'Cinematic');
  const luxuryVideoTemplates = templates.filter(t => t.category === 'Luxury' || t.category === 'Fashion');
  const allTrendingTemplates = templates.filter(t => t.isFeatured || t.category === 'Trending');

  const topHeroTemplate = templates.find(t => t.id === 'tpl_gold_noir') || templates[0];

  return (
    <div className="min-h-screen bg-[#08080a] pb-28 text-stone-100">
      {/* 1. TOP APP BAR */}
      <header className="sticky top-0 z-30 flex items-center justify-between px-4 py-3 bg-[#08080a]/85 backdrop-blur-xl border-b border-white/5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setDrawerOpen(true)}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-stone-300 hover:text-white transition-colors"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <Logo size="sm" />
        </div>

        {/* Pro / Credits Entry */}
        <button
          onClick={() => setPlansModalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-[#211e17] to-[#161512] border border-[#d4af37]/40 shadow-[0_0_12px_rgba(212,175,55,0.15)] hover:border-[#d4af37] transition-all"
        >
          <Sparkles className="w-3.5 h-3.5 text-[#f5d77f] fill-[#f5d77f]" />
          <span className="text-xs font-bold text-[#f5d77f]">
            {wallet?.balance ?? 0} Credits
          </span>
          <span className="text-[10px] font-semibold text-stone-400 pl-1 border-l border-white/10">
            Pro
          </span>
        </button>
      </header>

      {/* 2. HERO SECTION */}
      <section className="relative w-full overflow-hidden bg-gradient-to-b from-[#121217] via-[#0d0d12] to-[#08080a] pt-4 pb-12 px-4">
        {/* Ambient background glows */}
        <div className="absolute top-0 right-1/4 w-72 h-72 bg-[#d4af37]/10 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute -top-10 -left-10 w-60 h-60 bg-amber-900/10 rounded-full blur-[90px] pointer-events-none" />

        <div className="max-w-4xl mx-auto">
          {/* Hero Banner Card */}
          <div className="relative rounded-3xl overflow-hidden border border-white/10 shadow-2xl h-80 sm:h-96 w-full">
            <img
              src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=1400&q=80"
              alt="Lumina Hero"
              className="w-full h-full object-cover object-top scale-105"
            />
            {/* Dark glass cinematic scrim */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#08080a] via-[#08080a]/60 to-transparent" />
            <div className="absolute inset-0 bg-radial-gradient from-transparent to-[#08080a]/80" />

            {/* Hero Text Overlays */}
            <div className="absolute bottom-6 inset-x-6 sm:bottom-8 sm:inset-x-8 max-w-lg space-y-2">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-black/60 backdrop-blur-md border border-[#d4af37]/30 text-[11px] font-semibold text-[#f5d77f]">
                <Flame className="w-3 h-3 text-[#d4af37]" />
                <span>Trending 2026 Collection</span>
              </div>

              <h1 className="text-2xl sm:text-4xl font-extrabold font-display text-white tracking-tight leading-tight">
                Cinematic AI Photo & Video Studio
              </h1>

              <p className="text-xs sm:text-sm text-stone-300 line-clamp-2 leading-relaxed opacity-90">
                Transform any photo into luxury magazine covers, viral 9:16 reels, and studio portraits with neural precision.
              </p>

              <div className="pt-2 flex items-center gap-3">
                <button
                  onClick={() => setSelectedTemplate(topHeroTemplate)}
                  className="py-2.5 px-5 gold-button rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 group cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 fill-current" />
                  <span>Create Now</span>
                  <ChevronRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
                </button>

                <button
                  onClick={() => {
                    setFilterType('video');
                    setActiveTab('templates');
                  }}
                  className="py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs sm:text-sm font-semibold flex items-center gap-1.5 backdrop-blur-md transition-colors"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Explore Reels</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 3. OVERLAPPING SEARCH BAR (Partially overlapping lower edge of hero) */}
        <div className="max-w-md mx-auto -mt-6 relative z-20 px-2">
          <div className="relative flex items-center rounded-2xl bg-[#14141a]/95 backdrop-blur-xl border border-white/15 shadow-[0_12px_30px_rgba(0,0,0,0.7)] p-1.5 transition-all focus-within:border-[#d4af37] focus-within:shadow-[0_0_20px_rgba(212,175,55,0.25)]">
            <Search className="w-5 h-5 text-stone-400 ml-3 shrink-0" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search templates, effects, aesthetics..."
              className="w-full bg-transparent px-3 py-2 text-xs sm:text-sm text-white placeholder-stone-400 focus:outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="px-2 text-stone-400 hover:text-white text-xs"
              >
                Clear
              </button>
            )}

            {/* Quick Mode Toggle (All / Photo / Video) */}
            <div className="flex items-center gap-1 pr-1 border-l border-white/10 pl-2">
              <button
                type="button"
                onClick={() => setFilterType(filterType === 'all' ? 'video' : filterType === 'video' ? 'photo' : 'all')}
                className={`px-2.5 py-1 rounded-xl text-[11px] font-semibold transition-colors ${
                  filterType !== 'all' ? 'bg-[#d4af37] text-black' : 'bg-white/5 text-stone-300 hover:text-white'
                }`}
                title="Toggle Photo / Video filter"
              >
                {filterType === 'all' ? 'All' : filterType === 'video' ? 'Video' : 'Photo'}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 4. HORIZONTAL CATEGORY CHIPS (Zero-Pill Discipline: Segmented Interactive Tabs) */}
      <section className="px-4 py-3 max-w-4xl mx-auto">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
          {CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all shrink-0 ${
                  isSelected
                    ? 'bg-gradient-to-r from-[#d4af37] to-amber-500 text-stone-950 shadow-[0_0_12px_rgba(212,175,55,0.3)]'
                    : 'bg-stone-900/80 text-stone-300 hover:bg-stone-800 hover:text-white border border-white/5'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </section>

      {/* PRIORITY 1: TOP FEATURED FACE SWAP VIDEO */}
      <FaceSwapFeaturedCard />

      {/* 5. TEMPLATE SECTIONS & HORIZONTAL CAROUSELS */}
      <div className="max-w-4xl mx-auto px-4 space-y-8 mt-6">
        {/* Priority 2: Viral Dance Sequences & Photo-to-Dance */}
        <div className="space-y-3">
          <div className="flex items-end justify-between">
            <div>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-400 uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5 fill-amber-400" />
                <span>HOT INSTAGRAM TREND</span>
              </div>
              <h3 className="text-lg sm:text-xl font-bold font-display text-white">
                Dance Sequences & Face Swap
              </h3>
            </div>
            <button
              onClick={() => {
                setSelectedCategory('Dance');
                setActiveTab('templates');
              }}
              className="text-xs font-semibold text-stone-400 hover:text-amber-400 transition-colors flex items-center gap-1"
            >
              <span>View All</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Horizontal carousel */}
          <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2 pt-1 -mx-4 px-4">
            {danceTemplates.slice(0, 6).map((tpl) => (
              <TemplateCard key={tpl.id} template={tpl} size="compact" />
            ))}
          </div>
        </div>

        {/* Priority 3: Trending Video */}
        <div className="space-y-3">
          <div className="flex items-end justify-between">
            <div>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#d4af37] uppercase tracking-wider">
                <Flame className="w-3.5 h-3.5" />
                <span>Trending Video</span>
              </div>
              <h3 className="text-lg sm:text-xl font-bold font-display text-white">
                Trending Video & Reels
              </h3>
            </div>
            <button
              onClick={() => {
                setFilterType('video');
                setActiveTab('templates');
              }}
              className="text-xs font-semibold text-stone-400 hover:text-[#d4af37] transition-colors flex items-center gap-1"
            >
              <span>View All</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Horizontal carousel */}
          <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2 pt-1 -mx-4 px-4">
            {trendingVideoTemplates.slice(0, 6).map((tpl) => (
              <TemplateCard key={tpl.id} template={tpl} size="compact" />
            ))}
          </div>
        </div>

        {/* Priority 3: Cinematic Video */}
        <div className="space-y-3">
          <div className="flex items-end justify-between">
            <div>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#d4af37] uppercase tracking-wider">
                <Camera className="w-3.5 h-3.5" />
                <span>Cinematic Video</span>
              </div>
              <h3 className="text-lg sm:text-xl font-bold font-display text-white">
                Cinematic & 35mm Films
              </h3>
            </div>
            <button
              onClick={() => {
                setSelectedCategory('Cinematic');
                setActiveTab('templates');
              }}
              className="text-xs font-semibold text-stone-400 hover:text-[#d4af37] transition-colors flex items-center gap-1"
            >
              <span>View All</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2 pt-1 -mx-4 px-4">
            {cinematicVideoTemplates.slice(0, 6).map((tpl) => (
              <TemplateCard key={tpl.id} template={tpl} size="compact" />
            ))}
          </div>
        </div>

        {/* Priority 4: Luxury Video */}
        <div className="space-y-3">
          <div className="flex items-end justify-between">
            <div>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#d4af37] uppercase tracking-wider">
                <Crown className="w-3.5 h-3.5" />
                <span>Luxury Video</span>
              </div>
              <h3 className="text-lg sm:text-xl font-bold font-display text-white">
                Luxury & Fashion Editorial
              </h3>
            </div>
            <button
              onClick={() => {
                setSelectedCategory('Luxury');
                setActiveTab('templates');
              }}
              className="text-xs font-semibold text-stone-400 hover:text-[#d4af37] transition-colors flex items-center gap-1"
            >
              <span>View All</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2 pt-1 -mx-4 px-4">
            {luxuryVideoTemplates.slice(0, 6).map((tpl) => (
              <TemplateCard key={tpl.id} template={tpl} size="compact" />
            ))}
          </div>
        </div>

        {/* Priority 5: Other Video & Trending Templates */}
        <div className="space-y-3">
          <div className="flex items-end justify-between">
            <div>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#d4af37] uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Featured Showcase</span>
              </div>
              <h3 className="text-lg sm:text-xl font-bold font-display text-white">
                All Popular Templates
              </h3>
            </div>
            <button
              onClick={() => {
                setSelectedCategory('Trending');
                setActiveTab('templates');
              }}
              className="text-xs font-semibold text-stone-400 hover:text-[#d4af37] transition-colors flex items-center gap-1"
            >
              <span>View All</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2 pt-1 -mx-4 px-4">
            {allTrendingTemplates.slice(0, 6).map((tpl) => (
              <TemplateCard key={tpl.id} template={tpl} size="compact" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
