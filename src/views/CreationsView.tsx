import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Clapperboard,
  Sparkles,
  Download,
  Share2,
  Trash2,
  AlertCircle,
  ExternalLink,
  Clock,
  RotateCw
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Generation, GenerationState } from '../types';

export const CreationsView: React.FC = () => {
  const {
    generations,
    loadingGenerations,
    setActiveGeneration,
    deleteGeneration,
    setActiveTab,
    refreshGenerations
  } = useApp();

  const [statusFilter, setStatusFilter] = useState<'all' | 'processing' | 'completed' | 'failed'>('all');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const filteredGenerations = generations.filter((g) => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'processing') {
      return g.status === 'processing' || g.status === 'preparing' || g.status === 'uploading' || g.status === 'finalizing';
    }
    return g.status === statusFilter;
  });

  const handleShare = async (e: React.MouseEvent, gen: Generation) => {
    e.stopPropagation();
    const shareData = {
      title: `${gen.templateTitle} · Lumina Studio`,
      text: `Created with ${gen.templateTitle} on Lumina AI Studio`,
      url: window.location.href
    };
    if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        console.log('Share dismissed');
      }
    } else {
      navigator.clipboard.writeText(window.location.href);
      alert('Link copied to clipboard');
    }
  };

  const handleDownload = (e: React.MouseEvent, gen: Generation) => {
    e.stopPropagation();
    const url = gen.resultMediaUrl || gen.inputMediaUrl;
    const a = document.createElement('a');
    a.href = url;
    a.download = `lumina_${gen.templateTitle.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await deleteGeneration(id);
    setDeleteConfirmId(null);
  };

  return (
    <div className="min-h-screen bg-[#08080a] pb-28 text-stone-100">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-[#08080a]/85 backdrop-blur-xl border-b border-white/5 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold font-display text-white">My Creations</h2>
            <p className="text-xs text-stone-400">
              {generations.length} items rendered
            </p>
          </div>

          <button
            onClick={() => refreshGenerations()}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-stone-400 hover:text-white transition-colors"
            title="Refresh history"
          >
            <RotateCw className="w-4 h-4" />
          </button>
        </div>

        {/* Filter Tabs */}
        <div className="max-w-4xl mx-auto flex items-center p-1 rounded-xl bg-stone-900 border border-white/5 mt-3">
          {(['all', 'processing', 'completed', 'failed'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg capitalize transition-all ${
                statusFilter === tab
                  ? 'bg-gradient-to-r from-[#d4af37] to-amber-500 text-stone-950 shadow'
                  : 'text-stone-400 hover:text-white'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* List Container */}
      <div className="max-w-4xl mx-auto px-4 pt-4">
        {filteredGenerations.length === 0 ? (
          <div className="py-20 text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-3xl bg-stone-900 border border-white/10 flex items-center justify-center">
              <Clapperboard className="w-8 h-8 text-stone-500" />
            </div>
            <div>
              <h4 className="text-base font-bold text-white">No creations found</h4>
              <p className="text-xs text-stone-400 mt-1 max-w-xs mx-auto">
                {statusFilter !== 'all'
                  ? `No creations with status "${statusFilter}".`
                  : 'You have not created any templates yet. Explore our curated gallery to start!'}
              </p>
            </div>
            <button
              onClick={() => setActiveTab('templates')}
              className="py-2.5 px-5 gold-button rounded-xl text-xs font-bold inline-flex items-center gap-2 cursor-pointer"
            >
              <Sparkles className="w-4 h-4 fill-current" />
              <span>Browse Templates</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {filteredGenerations.map((gen) => {
              const isProcessing =
                gen.status === 'processing' ||
                gen.status === 'preparing' ||
                gen.status === 'uploading' ||
                gen.status === 'finalizing';

              return (
                <div
                  key={gen.id}
                  onClick={() => setActiveGeneration(gen)}
                  className="group relative rounded-2xl overflow-hidden bg-stone-900/90 border border-white/10 shadow-lg cursor-pointer transition-all hover:border-[#d4af37]/50"
                >
                  {/* Thumbnail */}
                  <div className="relative aspect-[4/5] w-full bg-black overflow-hidden">
                    <img
                      src={gen.resultMediaUrl || gen.inputMediaUrl}
                      alt={gen.templateTitle}
                      className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 ${
                        isProcessing ? 'filter blur-sm brightness-50' : ''
                      }`}
                    />

                    {/* Gradient Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />

                    {/* Status Badge */}
                    <div className="absolute top-3 left-3 z-10">
                      {isProcessing ? (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#1c1912]/90 border border-[#d4af37]/60 text-[10px] font-bold text-[#f5d77f] shadow-lg">
                          <span className="w-2 h-2 rounded-full bg-[#d4af37] animate-ping" />
                          <span>Synthesizing...</span>
                        </div>
                      ) : gen.status === 'completed' ? (
                        <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-[10px] font-bold text-emerald-300">
                          <span>Completed</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-red-950/80 border border-red-500/40 text-[10px] font-bold text-red-300">
                          <AlertCircle className="w-3 h-3" />
                          <span>Failed (Refunded)</span>
                        </div>
                      )}
                    </div>

                    {/* Aspect Ratio Badge */}
                    <div className="absolute top-3 right-3 z-10 px-2 py-0.5 rounded-full bg-black/60 border border-white/15 text-[10px] font-semibold text-stone-300">
                      {gen.aspectRatio}
                    </div>

                    {/* Center Processing Spinner if active */}
                    {isProcessing && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none p-4 text-center">
                        <div className="w-10 h-10 rounded-full border-2 border-dashed border-[#d4af37] animate-spin mb-2" />
                        <span className="text-xs font-semibold text-white drop-shadow">
                          Neural Rendering
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Card Content & Quick Action Bar */}
                  <div className="p-3.5 space-y-2">
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <h4 className="text-sm font-bold text-white truncate group-hover:text-amber-200 transition-colors">
                          {gen.templateTitle}
                        </h4>
                        <div className="flex items-center gap-1.5 text-[10px] text-stone-400 mt-0.5">
                          <Clock className="w-3 h-3 text-stone-500" />
                          <span>
                            {new Date(gen.createdAt).toLocaleDateString([], {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        </div>
                      </div>

                      {/* Delete action button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirmId(gen.id);
                        }}
                        className="p-1.5 text-stone-400 hover:text-red-400 rounded-lg hover:bg-white/5"
                        title="Delete creation"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Actions if completed */}
                    {gen.status === 'completed' && (
                      <div className="pt-2 border-t border-white/5 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={(e) => handleDownload(e, gen)}
                          className="flex-1 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-stone-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Save</span>
                        </button>

                        <button
                          type="button"
                          onClick={(e) => handleShare(e, gen)}
                          className="flex-1 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-stone-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                          <span>Share</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#121217] border border-white/10 rounded-2xl p-5 max-w-xs w-full text-center space-y-3 shadow-2xl">
            <h4 className="text-sm font-bold text-white">Delete this creation?</h4>
            <p className="text-xs text-stone-400">
              This will permanently remove the synthesized media record from your account.
            </p>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="flex-1 py-2 rounded-xl bg-white/5 text-xs font-semibold text-stone-300"
              >
                Cancel
              </button>
              <button
                onClick={(e) => handleDelete(e, deleteConfirmId)}
                className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-xs font-bold text-white"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
