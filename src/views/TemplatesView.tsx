import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Search, Sparkles, Plus, RefreshCw } from 'lucide-react';
import { TemplateCard } from '../components/TemplateCard';
import { useApp } from '../context/AppContext';
import { CATEGORIES } from '../data/templatesData';
import { AspectRatio, Template } from '../types';
import { queueHdDownload, isDataSaverActive } from '../services/media/hdDownloadQueue';
import { mediaCacheStorage } from '../services/media/mediaCacheStorage';
import { isVideoMedia } from '../utils/mediaUtils';

const PREFERRED_RATIO_ORDER: AspectRatio[] = ['9:16', '4:5', '1:1', '16:9'];

const isVideoTemplate = (tpl: Template): boolean =>
  Boolean(
    tpl.type === 'video' ||
    tpl.mediaType === 'video' ||
    tpl.isFaceSwap ||
    tpl.coverVideo ||
    isVideoMedia(tpl.cover) ||
    isVideoMedia(tpl.preview)
  );

export const TemplatesView: React.FC = () => {
  const {
    templates,
    loadingTemplates,
    catalogueStatus,
    refreshTemplates,
    selectedCategory,
    setSelectedCategory,
    selectedCategories,
    setSelectedCategories,
    searchQuery,
    setSearchQuery,
    filterType,
    setFilterType,
    faceSwapScenes,
    setSelectedFaceSwapScene,
    setFaceSwapModalOpen,
    setTemplateManagerOpen,
    isAdmin,
    serverAdminVerified
  } = useApp();

  const [aspectFilter, setAspectFilter] = useState<'all' | AspectRatio>('all');
  const [sortBy, setSortBy] = useState<'trending' | 'cost_asc' | 'cost_desc'>('trending');

  // 1. Active templates & actual format availability counts
  const activeTemplates = React.useMemo(
    () => templates.filter((t) => t.isActive !== false),
    [templates]
  );

  const photoCount = React.useMemo(
    () => activeTemplates.filter((t) => !isVideoTemplate(t)).length,
    [activeTemplates]
  );
  const videoCount = React.useMemo(
    () => activeTemplates.filter((t) => isVideoTemplate(t)).length,
    [activeTemplates]
  );
  const hasMultipleFormats = photoCount > 0 && videoCount > 0;

  // Guard: If current filterType has 0 matching active templates (data not ready), reset to 'all'
  React.useEffect(() => {
    if (activeTemplates.length === 0) return;
    if (filterType === 'video' && videoCount === 0) {
      setFilterType('all');
    } else if (filterType === 'photo' && photoCount === 0) {
      setFilterType('all');
    }
  }, [activeTemplates.length, filterType, photoCount, videoCount, setFilterType]);

  const templatesByType = React.useMemo(() => {
    return activeTemplates.filter((tpl) => {
      if (filterType === 'video') return isVideoTemplate(tpl);
      if (filterType === 'photo') return !isVideoTemplate(tpl);
      return true;
    });
  }, [activeTemplates, filterType]);

  // 2. Discover only usable Categories that actually exist for the chosen type
  const activeCategories = React.useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const cat of CATEGORIES) {
      if (templatesByType.some((t) => (t.category || 'Trending') === cat)) {
        seen.add(cat);
        result.push(cat);
      }
    }
    for (const t of templatesByType) {
      const cat = t.category || 'Trending';
      if (cat && !seen.has(cat)) {
        seen.add(cat);
        result.push(cat);
      }
    }
    return result;
  }, [templatesByType]);

  const handleToggleCategory = (cat: string) => {
    if (cat === 'All') {
      setSelectedCategories([]);
      return;
    }
    const exists = selectedCategories.includes(cat);
    if (exists) {
      const next = selectedCategories.filter((c) => c !== cat);
      setSelectedCategories(next);
    } else {
      setSelectedCategories([...selectedCategories, cat]);
    }
  };

  // Only keep selected categories that actually exist in activeCategories when filtering by type
  const effectiveSelectedCategories = React.useMemo(() => {
    if (selectedCategories.length === 0) return [];
    return selectedCategories.filter((cat) => activeCategories.includes(cat));
  }, [selectedCategories, activeCategories]);

  // 3. Apply category & search before aspect ratio so availableRatios only shows usable ratios
  const templatesBeforeAspect = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return templatesByType.filter((tpl) => {
      const tplCategory = tpl.category || 'Trending';
      if (effectiveSelectedCategories.length > 0 && !effectiveSelectedCategories.includes(tplCategory)) {
        return false;
      }
      if (q) {
        const matchTitle = (tpl.title || '').toLowerCase().includes(q);
        const matchCat = tplCategory.toLowerCase().includes(q);
        const matchDesc = (tpl.description || '').toLowerCase().includes(q);
        const matchTag = Array.isArray(tpl.tags) && tpl.tags.some((t) => t.toLowerCase().includes(q));
        if (!matchTitle && !matchCat && !matchDesc && !matchTag) return false;
      }
      return true;
    });
  }, [templatesByType, effectiveSelectedCategories, searchQuery]);

  // Discover only usable Aspect Ratios present in current filtered templates
  const availableRatios = React.useMemo(() => {
    const present = new Set<AspectRatio>();
    templatesBeforeAspect.forEach((t) => {
      if (t.aspectRatio) present.add(t.aspectRatio);
    });
    const ordered: AspectRatio[] = [];
    for (const r of PREFERRED_RATIO_ORDER) {
      if (present.has(r)) ordered.push(r);
    }
    present.forEach((r) => {
      if (!ordered.includes(r)) ordered.push(r);
    });
    return ordered;
  }, [templatesBeforeAspect]);

  // Guard: If switching type/category/search leaves an unavailable ratio selected, reset aspectFilter to 'all'
  React.useEffect(() => {
    if (aspectFilter !== 'all' && !availableRatios.includes(aspectFilter)) {
      setAspectFilter('all');
    }
  }, [aspectFilter, availableRatios]);

  // 4. Final display list with aspect filter & sort
  const displayList = React.useMemo(() => {
    const filtered = templatesBeforeAspect.filter((tpl) => {
      if (aspectFilter !== 'all' && tpl.aspectRatio !== aspectFilter) {
        return false;
      }
      return true;
    });

    if (sortBy === 'cost_asc') {
      return [...filtered].sort((a, b) => (a.creditCost || 0) - (b.creditCost || 0));
    }
    if (sortBy === 'cost_desc') {
      return [...filtered].sort((a, b) => (b.creditCost || 0) - (a.creditCost || 0));
    }
    return [...filtered].sort(
      (a, b) =>
        (b.likesCount || 0) - (a.likesCount || 0) ||
        (a.sortOrder ?? 999) - (b.sortOrder ?? 999)
    );
  }, [templatesBeforeAspect, aspectFilter, sortBy]);

  const hasDistinctCosts = React.useMemo(() => {
    const costs = new Set(displayList.map((t) => t.creditCost || 0));
    return costs.size > 1;
  }, [displayList]);

  React.useEffect(() => {
    if (!hasDistinctCosts && (sortBy === 'cost_asc' || sortBy === 'cost_desc')) {
      setSortBy('trending');
    }
  }, [hasDistinctCosts, sortBy]);

  const hasActiveFilters = Boolean(
    filterType !== 'all' ||
    effectiveSelectedCategories.length > 0 ||
    aspectFilter !== 'all' ||
    searchQuery.trim() !== ''
  );

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedCategory('All');
    setSelectedCategories([]);
    setFilterType('all');
    setAspectFilter('all');
    setSortBy('trending');
  };

  // Gentle idle background cache ONLY for up to 2 lightweight image thumbnails (never auto-download videos or Full HD until user clicks)
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isDataSaverActive()) return;

    let idleId: number | null = null;
    let timerId: any = null;

    const performPrefetch = () => {
      const candidateTemplates = displayList.slice(0, 2);
      candidateTemplates.forEach((tpl) => {
        const hdAsset = (tpl as any).hdDisplayUrl || (tpl as any).hdVideoUrl || (tpl as any).hdMedia;
        const previewImgUrl = tpl.coverImage || tpl.sampleResult || tpl.sampleAfter || tpl.preview || (!/\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(tpl.cover || '') ? tpl.cover : '');
        if (
          previewImgUrl &&
          previewImgUrl !== hdAsset &&
          !/\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(previewImgUrl) &&
          mediaCacheStorage.isCacheablePublicMedia(previewImgUrl)
        ) {
          queueHdDownload(previewImgUrl, 'low').catch(() => {});
        }
      });
    };

    if ('requestIdleCallback' in window) {
      idleId = (window as any).requestIdleCallback(performPrefetch, { timeout: 3500 });
    } else {
      timerId = setTimeout(performPrefetch, 2500);
    }

    return () => {
      if (idleId !== null && 'cancelIdleCallback' in window) {
        (window as any).cancelIdleCallback(idleId);
      }
      if (timerId !== null) {
        clearTimeout(timerId);
      }
    };
  }, [displayList]);

  const countLabel = loadingTemplates && templates.length === 0
    ? 'Loading AI Templates...'
    : filterType === 'photo' || (filterType === 'all' && photoCount > 0 && videoCount === 0)
    ? `${displayList.length} AI Photo ${displayList.length === 1 ? 'Template' : 'Templates'}`
    : filterType === 'video' || (filterType === 'all' && videoCount > 0 && photoCount === 0)
    ? `${displayList.length} AI Video ${displayList.length === 1 ? 'Template' : 'Templates'}`
    : `${displayList.length} AI Photo & Video ${displayList.length === 1 ? 'Template' : 'Templates'}`;

  return (
    <div className="min-h-screen bg-[#08080a] pb-28 text-stone-100">
      {/* Top Header */}
      <div className="sticky top-0 z-30 bg-[#08080a]/85 backdrop-blur-xl border-b border-white/5 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold font-display text-white">Template Gallery</h2>
            <p className="text-xs text-stone-400">{countLabel}</p>
          </div>

          <div className="flex items-center gap-2">
            {Boolean(serverAdminVerified && isAdmin) && (
              <button
                onClick={() => setTemplateManagerOpen(true)}
                className="px-2.5 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 shadow-sm"
                title="Add or Manage Templates from Phone"
              >
                <Plus className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">New Template</span>
              </button>
            )}

            {/* Quick Segmented Control for All / Photos / Videos (Only shown when both photo & video templates exist) */}
            {hasMultipleFormats && (
              <div className="flex items-center p-1 rounded-xl bg-stone-900 border border-white/10">
                <button
                  onClick={() => setFilterType('all')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    filterType === 'all'
                      ? 'bg-gradient-to-r from-[#d4af37] to-amber-500 text-stone-950 shadow'
                      : 'text-stone-400 hover:text-white'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setFilterType('photo')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    filterType === 'photo'
                      ? 'bg-gradient-to-r from-[#d4af37] to-amber-500 text-stone-950 shadow'
                      : 'text-stone-400 hover:text-white'
                  }`}
                >
                  Photos
                </button>
                <button
                  onClick={() => setFilterType('video')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    filterType === 'video'
                      ? 'bg-gradient-to-r from-[#d4af37] to-amber-500 text-stone-950 shadow'
                      : 'text-stone-400 hover:text-white'
                  }`}
                >
                  Videos
                </button>
              </div>
            )}
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
                className="px-2 text-xs text-stone-400 hover:text-white cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Horizontally scrollable Category Chips (Only shown when 2+ usable categories exist) */}
        {activeCategories.length > 1 && (
          <div className="max-w-4xl mx-auto flex items-center gap-2 overflow-x-auto no-scrollbar pt-3">
            <button
              onClick={() => handleToggleCategory('All')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                effectiveSelectedCategories.length === 0
                  ? 'bg-gradient-to-r from-amber-400 to-[#d4af37] text-stone-950 font-bold shadow-[0_0_15px_rgba(212,175,55,0.4)]'
                  : 'bg-white/5 text-stone-300 hover:bg-white/10 hover:text-white border border-white/5'
              }`}
            >
              <span>All Categories</span>
            </button>

            {activeCategories.map((cat) => {
              const isSelected = effectiveSelectedCategories.includes(cat);
              return (
                <button
                  key={cat}
                  onClick={() => handleToggleCategory(cat)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                    isSelected
                      ? 'bg-gradient-to-r from-amber-400 to-[#d4af37] text-stone-950 font-bold shadow-[0_0_15px_rgba(212,175,55,0.4)]'
                      : 'bg-white/5 text-stone-300 hover:bg-white/10 hover:text-white border border-white/5'
                  }`}
                >
                  {cat === 'Dance' && <Sparkles className="w-3 h-3 text-amber-400 shrink-0" />}
                  <span>{cat}</span>
                  {isSelected && (
                    <span className="text-[9px] w-3.5 h-3.5 rounded-full bg-stone-950/30 text-stone-950 font-black flex items-center justify-center">
                      ✓
                    </span>
                  )}
                  {cat === 'Dance' && !isSelected && (
                    <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 border border-amber-400/30">
                      HOT
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Main Grid Content */}
      <div className="max-w-4xl mx-auto px-4 pt-4">
        {/* Spotlight Banner when Dance Category is Selected */}
        {(effectiveSelectedCategories.includes('Dance') || selectedCategory === 'Dance') && (
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
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-[#d4af37] text-stone-950 font-bold text-xs shrink-0 flex items-center justify-center gap-1.5 shadow-[0_4px_16px_rgba(212,175,55,0.4)] hover:brightness-105 active:scale-95 transition-all cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 fill-stone-950" />
              <span>Face Swap Dance (45 ✦)</span>
            </button>
          </motion.div>
        )}

        {/* Secondary Aspect Ratio & Sort Controls (Only usable Ratios/Sorts present in active data) */}
        {(availableRatios.length > 1 || displayList.length > 1) && (
          <div className="flex flex-wrap items-center justify-between gap-2 pb-4 text-xs text-stone-400">
            {availableRatios.length > 1 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] uppercase font-semibold text-stone-500">Ratio:</span>
                {(['all', ...availableRatios] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setAspectFilter(r)}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                      aspectFilter === r
                        ? 'bg-[#d4af37]/20 text-[#f5d77f] border border-[#d4af37]/40'
                        : 'text-stone-400 hover:text-white'
                    }`}
                  >
                    {r === 'all' ? 'All' : r}
                  </button>
                ))}
              </div>
            )}

            {displayList.length > 1 && (
              <div className="flex items-center gap-1.5 ml-auto">
                <span className="text-[11px] uppercase font-semibold text-stone-500">Sort:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="bg-stone-900 border border-white/10 rounded-lg px-2 py-1 text-xs text-stone-300 focus:outline-none cursor-pointer"
                >
                  <option value="trending">Trending (Popular)</option>
                  {hasDistinctCosts && <option value="cost_asc">Cost: Low to High</option>}
                  {hasDistinctCosts && <option value="cost_desc">Cost: High to Low</option>}
                </select>
              </div>
            )}
          </div>
        )}

        {/* Cards Grid / Loading / Offline / Empty States */}
        {loadingTemplates && templates.length === 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 gap-2.5 sm:gap-3.5">
            {[0, 1, 2, 3].map((idx) => (
              <div
                key={idx}
                className="h-[390px] sm:h-[430px] rounded-[24px] bg-[#16141d] border border-white/10 animate-pulse flex flex-col justify-end p-4"
              >
                <div className="h-4 w-24 rounded bg-white/10 mb-2" />
                <div className="h-5 w-3/4 rounded bg-white/10" />
              </div>
            ))}
          </div>
        ) : catalogueStatus === 'offline_error' && templates.length === 0 ? (
          <div className="py-20 text-center space-y-3">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <RefreshCw className="w-6 h-6 text-amber-400" />
            </div>
            <h4 className="text-base font-bold text-white">Unable to reach template server</h4>
            <p className="text-xs text-stone-400 max-w-xs mx-auto">
              Check your internet connection and tap retry to load published templates.
            </p>
            <button
              onClick={() => refreshTemplates()}
              className="px-4 py-2 rounded-xl bg-amber-500/20 border border-amber-500/30 text-xs font-semibold text-amber-200 hover:bg-amber-500/30 cursor-pointer"
            >
              Retry Loading
            </button>
          </div>
        ) : displayList.length === 0 ? (
          <div className="py-20 text-center space-y-3">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-white/5 flex items-center justify-center">
              <Search className="w-6 h-6 text-stone-500" />
            </div>
            <h4 className="text-base font-bold text-white">
              {filterType === 'video' && activeTemplates.length > 0 && !templatesByType.length
                ? 'No video templates available yet'
                : filterType === 'photo' && activeTemplates.length > 0 && !templatesByType.length
                ? 'No photo templates available yet'
                : 'No templates found'}
            </h4>
            <p className="text-xs text-stone-400 max-w-xs mx-auto">
              {hasActiveFilters
                ? 'Try adjusting your search query, clearing filters, or switching categories.'
                : 'Published templates will appear here once added in Content Studio.'}
            </p>
            {hasActiveFilters && (
              <button
                onClick={handleResetFilters}
                className="px-4 py-2 rounded-xl bg-white/10 text-xs font-semibold text-white hover:bg-white/15 cursor-pointer"
              >
                Reset Filters
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 gap-2.5 sm:gap-3.5">
            {displayList.map((tpl) => (
              <TemplateCard key={tpl.id} template={tpl} size="standard" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
