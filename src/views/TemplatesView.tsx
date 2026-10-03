import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Search, Filter, Sparkles, Film, Image as ImageIcon, SlidersHorizontal } from 'lucide-react';
import { TemplateCard } from '../components/TemplateCard';
import { useApp } from '../context/AppContext';
import { CATEGORIES } from '../data/templatesData';
import { AspectRatio } from '../types';

export const TemplatesView: React.FC = () => {
  const {
    templates,
    loadingTemplates,
    selectedCategory,
    setSelectedCategory,
    searchQuery,
    setSearchQuery,
    filterType,
    setFilterType,
    faceSwapScenes,
    setSelectedFaceSwapScene,
    setFaceSwapModalOpen
  } = useApp();

  const [aspectFilter, setAspectFilter] = useState<'all' | AspectRatio>('all');
  const [sortBy, setSortBy] = useState<'trending' | 'cost_asc' | 'cost_desc'>('trending');

  // Filter templates
  let displayList = templates.filter((tpl) => {
    if (aspectFilter !== 'all' && tpl.aspectRatio !== aspectFilter) return false;
    return true;
  });

  // Sort templates
  if (sortBy === 'cost_asc') {
    displayList = [...displayList].sort((a, b) => a.creditCost - b.creditCost);
  } else if (sortBy === 'cost_desc') {
    displayList = [...displayList].sort((a, b) => b.creditCost - a.creditCost);
  } else {
    displayList = [...displayList].sort((a, b) => (b.likesCount || 0) - (a.likesCount || 0));
  }

  return (
    <div className="min-h-screen bg-[#08080a] pb-28 text-stone-100">
      {/* Top Header */}
      <div className="sticky top-0 z-30 bg-[#08080a]/85 backdrop-blur-xl border-b border-white/5 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold font-display text-white">Template Gallery</h2>
            <p className="text-xs text-stone-400">
              {displayList.length} AI Photo & Video Templates
            </p>
          </div>

          {/* Quick Segmented Control for Photo / Video */}
          <div className="flex items-center p-1 rounded-xl bg-stone-900 border border-white/10">
            <button
              onClick={() => setFilterType('all')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                filterType === 'all'
                  ? 'bg-gradient-to-r from-[#d4af37] to-amber-500 text-stone-950 shadow'
                  : 'text-stone-400 hover:text-white'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilterType('photo')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                filterType === 'photo'
                  ? 'bg-gradient-to-r from-[#d4af37] to-amber-500 text-stone-950 shadow'
                  : 'text-stone-400 hover:text-white'
              }`}
            >
              Photos
            </button>
            <button
              onClick={() => setFilterType('video')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                filterType === 'video'
                  ? 'bg-gradient-to-r from-[#d4af37] to-amber-500 text-stone-950 shadow'
                  : 'text-stone-400 hover:text-white'
              }`}
            >
              Videos
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="max-w-4xl mx-auto mt-3">
          <div className="relative flex items-center rounded-xl bg-stone-900/90 border border-white/10 p-1">
            <Search className="w-4 h-4 text-stone-400 ml-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by aesthetic, tag, or title..."
              className="w-full bg-transparent px-2.5 py-1.5 text-xs text-white placeholder-stone-500 focus:outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="px-2 text-xs text-stone-400 hover:text-white"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Horizontally scrollable Category Chips */}
        <div className="max-w-4xl mx-auto flex items-center gap-2 overflow-x-auto no-scrollbar pt-3">
          {CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-gradient-to-r from-amber-400 to-[#d4af37] text-stone-950 font-bold shadow-[0_0_15px_rgba(212,175,55,0.4)]'
                    : 'bg-white/5 text-stone-300 hover:bg-white/10 hover:text-white border border-white/5'
                }`}
              >
                {cat === 'Dance' && <Sparkles className="w-3 h-3 text-amber-400 shrink-0" />}
                <span>{cat}</span>
                {cat === 'Dance' && (
                  <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 border border-amber-400/30">
                    HOT
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Grid Content */}
      <div className="max-w-4xl mx-auto px-4 pt-4">
        {/* Spotlight Banner when Dance Category is Selected */}
        {selectedCategory === 'Dance' && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-5 p-4 rounded-3xl laser-light-border bg-gradient-to-r from-amber-950/40 via-[#141217]/90 to-amber-950/20 backdrop-blur-2xl border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-[0_16px_36px_rgba(0,0,0,0.6)]"
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-400 text-stone-950 uppercase tracking-wider">
                  HOT INSTAGRAM TREND
                </span>
                <span className="text-xs font-semibold text-amber-200">Face Swap & Photo-to-Dance</span>
              </div>
              <p className="text-xs text-stone-300 max-w-lg leading-relaxed">
                Upload your portrait photo to map your face onto viral dance choreography sequences, or animate any standing snapshot into a fluid 60FPS Reels dance.
              </p>
            </div>
            <button
              onClick={() => {
                const danceScene = faceSwapScenes.find((s) => s.id === 'fsv_trending_dance_stage') || faceSwapScenes[0];
                setSelectedFaceSwapScene(danceScene);
                setFaceSwapModalOpen(true);
              }}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-[#d4af37] text-stone-950 font-bold text-xs shrink-0 flex items-center justify-center gap-1.5 shadow-[0_4px_16px_rgba(212,175,55,0.4)] hover:brightness-105 active:scale-95 transition-all"
            >
              <Sparkles className="w-3.5 h-3.5 fill-stone-950" />
              <span>Face Swap Dance (45 ✦)</span>
            </button>
          </motion.div>
        )}
        {/* Secondary Aspect Ratio & Sort Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-4 text-xs text-stone-400">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] uppercase font-semibold text-stone-500">Ratio:</span>
            {(['all', '9:16', '4:5', '1:1', '16:9'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setAspectFilter(r)}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                  aspectFilter === r
                    ? 'bg-[#d4af37]/20 text-[#f5d77f] border border-[#d4af37]/40'
                    : 'text-stone-400 hover:text-white'
                }`}
              >
                {r === 'all' ? 'All' : r}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] uppercase font-semibold text-stone-500">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-stone-900 border border-white/10 rounded-lg px-2 py-1 text-xs text-stone-300 focus:outline-none"
            >
              <option value="trending">Trending (Popular)</option>
              <option value="cost_asc">Cost: Low to High</option>
              <option value="cost_desc">Cost: High to Low</option>
            </select>
          </div>
        </div>

        {/* Cards Grid */}
        {displayList.length === 0 ? (
          <div className="py-20 text-center space-y-3">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-white/5 flex items-center justify-center">
              <Search className="w-6 h-6 text-stone-500" />
            </div>
            <h4 className="text-base font-bold text-white">No templates found</h4>
            <p className="text-xs text-stone-400 max-w-xs mx-auto">
              Try adjusting your search query, clearing filters, or switching categories.
            </p>
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('Trending');
                setFilterType('all');
                setAspectFilter('all');
              }}
              className="px-4 py-2 rounded-xl bg-white/10 text-xs font-semibold text-white hover:bg-white/15"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {displayList.map((tpl) => (
              <TemplateCard key={tpl.id} template={tpl} size="standard" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
