import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Plus,
  Upload,
  Image as ImageIcon,
  Video as VideoIcon,
  Trash2,
  Check,
  Sparkles,
  Edit2,
  Eye,
  EyeOff,
  Star
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Template } from '../types';

interface TemplateManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TemplateManagerModal: React.FC<TemplateManagerModalProps> = ({
  isOpen,
  onClose
}) => {
  const { templates, refreshGenerations } = useApp();

  const [activeTab, setActiveTab] = useState<'list' | 'add'>('list');
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);

  // Form states for creating a new template
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Trending');
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '4:5' | '1:1' | '16:9'>('9:16');
  const [isFeatured, setIsFeatured] = useState(true);
  const [tagsInput, setTagsInput] = useState('Viral, AI, Instagram Reels');
  const [providerCostUsd, setProviderCostUsd] = useState<number>(0.25);

  // Media upload state
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string>('');
  const [detectedType, setDetectedType] = useState<'photo' | 'video'>('video');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setMediaFile(file);
    const isVideo = file.type.startsWith('video');
    setDetectedType(isVideo ? 'video' : 'photo');

    // Generate preview
    const reader = new FileReader();
    reader.onload = () => {
      setMediaPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setStatusMessage('Please enter a template title.');
      return;
    }
    if (!mediaPreview) {
      setStatusMessage('Please choose a photo or video from your device gallery.');
      return;
    }

    setIsSubmitting(true);
    setStatusMessage('Uploading asset and publishing template...');

    try {
      const tags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const res = await fetch('/api/admin/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description: description || `Trending ${category} AI template`,
          category,
          aspectRatio,
          isFeatured,
          tags,
          mediaBase64: mediaPreview,
          type: detectedType,
          providerCostUsd: Number(providerCostUsd) || 0.25
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setStatusMessage('Template published successfully to live catalog!');
        // Reset form
        setTitle('');
        setDescription('');
        setMediaFile(null);
        setMediaPreview('');
        setTimeout(() => {
          setActiveTab('list');
          setStatusMessage('');
          window.location.reload(); // Refresh catalog seamlessly
        }, 1200);
      } else {
        setStatusMessage(data.error || 'Failed to create template');
      }
    } catch (err: any) {
      setStatusMessage(err.message || 'Error publishing template');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    if (!confirm('Are you sure you want to remove this template from catalog?')) return;
    try {
      const res = await fetch(`/api/admin/templates/${templateId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        window.location.reload();
      }
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md overflow-hidden">
      <div className="absolute inset-0" onClick={onClose} />

      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="relative w-full max-w-2xl bg-[#0f0e14] border border-white/15 rounded-3xl shadow-2xl z-10 overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="p-5 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#ff9f00]/20 border border-[#ff9f00]/40 flex items-center justify-center text-[#ff9f00]">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white font-display">
                Self-Service Template Manager
              </h3>
              <p className="text-xs text-stone-400">
                Upload from phone gallery · Auto ID & Mime detection · 40% Markup Rule
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-stone-400 hover:text-white hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-white/10 px-5 pt-3 gap-4">
          <button
            onClick={() => setActiveTab('list')}
            className={`pb-3 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${
              activeTab === 'list'
                ? 'border-[#ff9f00] text-[#ff9f00]'
                : 'border-transparent text-stone-400 hover:text-white'
            }`}
          >
            Catalog Templates ({templates.length})
          </button>
          <button
            onClick={() => setActiveTab('add')}
            className={`pb-3 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 flex items-center gap-1.5 ${
              activeTab === 'add'
                ? 'border-[#ff9f00] text-[#ff9f00]'
                : 'border-transparent text-stone-400 hover:text-white'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add New Template</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 flex-1 overflow-y-auto no-scrollbar">
          {activeTab === 'add' ? (
            <form onSubmit={handleCreateTemplate} className="space-y-4">
              {/* Device Gallery File Upload Area */}
              <div>
                <label className="block text-xs font-semibold text-stone-300 mb-1.5">
                  Select Media from Gallery (Photo or Video Reel)
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />

                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-white/20 hover:border-[#ff9f00]/70 rounded-2xl p-6 text-center cursor-pointer transition-colors bg-white/5 flex flex-col items-center justify-center gap-2"
                >
                  {mediaPreview ? (
                    <div className="relative w-36 h-48 rounded-xl overflow-hidden shadow-lg border border-white/20">
                      {detectedType === 'video' ? (
                        <video
                          src={mediaPreview}
                          className="w-full h-full object-cover"
                          autoPlay
                          loop
                          muted
                          playsInline
                        />
                      ) : (
                        <img
                          src={mediaPreview}
                          alt="Uploaded template"
                          className="w-full h-full object-cover"
                        />
                      )}
                      <div className="absolute top-1.5 right-1.5 px-2 py-0.5 rounded-md bg-black/75 text-[10px] text-amber-300 font-bold uppercase">
                        {detectedType}
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-[#ff9f00]">
                        <Upload className="w-6 h-6" />
                      </div>
                      <span className="text-sm font-semibold text-white">
                        Tap to Choose from Phone Gallery
                      </span>
                      <span className="text-xs text-stone-400">
                        Supports MP4, MOV, JPG, PNG, WEBP (Max 50MB)
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Template Title & Category */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-300 mb-1">
                    Template Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Royal Bollywood Slow-Mo"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-[#ff9f00]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-300 mb-1">
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-stone-900 border border-white/10 text-white text-xs focus:outline-none focus:border-[#ff9f00]"
                  >
                    <option value="Dance">Dance</option>
                    <option value="Trending">Trending</option>
                    <option value="Cinematic">Cinematic</option>
                    <option value="Fashion">Fashion</option>
                    <option value="Portrait">Portrait</option>
                    <option value="Luxury">Luxury</option>
                    <option value="Travel">Travel</option>
                  </select>
                </div>
              </div>

              {/* Aspect Ratio & Provider Cost in USD */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-300 mb-1">
                    Aspect Ratio
                  </label>
                  <select
                    value={aspectRatio}
                    onChange={(e) => setAspectRatio(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-stone-900 border border-white/10 text-white text-xs focus:outline-none focus:border-[#ff9f00]"
                  >
                    <option value="9:16">9:16 (Instagram Reels / Stories)</option>
                    <option value="4:5">4:5 (Portrait Feed)</option>
                    <option value="1:1">1:1 (Square)</option>
                    <option value="16:9">16:9 (Landscape / YouTube)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-300 mb-1">
                    API Cost (USD) → Auto 40% Markup
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={providerCostUsd}
                    onChange={(e) => setProviderCostUsd(parseFloat(e.target.value) || 0.1)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-[#ff9f00]"
                  />
                  <span className="text-[10px] text-amber-300 block mt-1">
                    ≈ {Math.round(providerCostUsd * 96.3 * 1.4)} credits customer cost
                  </span>
                </div>
              </div>

              {/* Tags */}
              <div>
                <label className="block text-xs font-semibold text-stone-300 mb-1">
                  Tags (Comma-separated)
                </label>
                <input
                  type="text"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="Dance, Viral, Reels, 4K"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-[#ff9f00]"
                />
              </div>

              {statusMessage && (
                <div className="p-3 rounded-xl bg-amber-400/10 border border-amber-400/30 text-amber-300 text-xs">
                  {statusMessage}
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3.5 rounded-xl bg-[#ff9f00] hover:bg-[#e68f00] text-black font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg cursor-pointer disabled:opacity-60"
              >
                {isSubmitting ? (
                  <span>Publishing to Catalog...</span>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    <span>Publish Template to Live Studio</span>
                  </>
                )}
              </button>
            </form>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-stone-400 pb-2 border-b border-white/10">
                <span>Manage active studio templates</span>
                <button
                  onClick={() => setActiveTab('add')}
                  className="px-3 py-1 rounded-lg bg-[#ff9f00]/20 text-[#ff9f00] font-bold flex items-center gap-1 hover:bg-[#ff9f00]/30"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Template</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {templates.map((tpl) => (
                  <div
                    key={tpl.id}
                    className="p-3 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src={tpl.cover}
                        alt={tpl.title}
                        className="w-12 h-16 rounded-lg object-cover shrink-0 border border-white/10"
                      />
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-white truncate">{tpl.title}</h4>
                        <div className="flex items-center gap-1 text-[10px] text-stone-400 mt-0.5">
                          <span className="capitalize">{tpl.type}</span>
                          <span>·</span>
                          <span>{tpl.aspectRatio}</span>
                          <span>·</span>
                          <span className="text-amber-400 font-bold">{tpl.creditCost} ✦</span>
                        </div>
                        <span className="inline-block px-1.5 py-0.2 rounded bg-white/10 text-[9px] text-stone-300 mt-1">
                          {tpl.category}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleDeleteTemplate(tpl.id)}
                      className="p-2 rounded-xl text-stone-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="Delete template"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};
