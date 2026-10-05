import React, { useState, useRef, useEffect } from 'react';
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
  Star,
  Sliders,
  Film,
  Layers,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  Flame,
  Zap,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Template } from '../types';
import { HomeBannerItem } from '../config/homeBannersConfig';

interface TemplateManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TemplateManagerModal: React.FC<TemplateManagerModalProps> = ({
  isOpen,
  onClose
}) => {
  const { templates, refreshGenerations } = useApp();

  const [activeTab, setActiveTab] = useState<'templates' | 'banners' | 'demo'>('templates');
  const [subTab, setSubTab] = useState<'list' | 'add' | 'edit'>('list');

  // TEMPLATES STATE
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [tplTitle, setTplTitle] = useState('');
  const [tplDescription, setTplDescription] = useState('');
  const [tplCategory, setTplCategory] = useState('Trending');
  const [tplAspectRatio, setTplAspectRatio] = useState<'9:16' | '4:5' | '1:1' | '16:9'>('9:16');
  const [tplIsFeatured, setTplIsFeatured] = useState(true);
  const [tplIsActive, setTplIsActive] = useState(true);
  const [tplBadge, setTplBadge] = useState<string>('HOT');
  const [tplTagsInput, setTplTagsInput] = useState('Viral, AI, Instagram Reels');
  const [tplCostUsd, setTplCostUsd] = useState<number>(0.25);
  const [tplMediaPreview, setTplMediaPreview] = useState<string>('');
  const [tplDetectedType, setTplDetectedType] = useState<'photo' | 'video'>('video');

  // BANNERS STATE
  const [banners, setBanners] = useState<HomeBannerItem[]>([]);
  const [bannerTitle, setBannerTitle] = useState('');
  const [bannerSubtitle, setBannerSubtitle] = useState('');
  const [bannerBadge, setBannerBadge] = useState('VIRAL NOW');
  const [bannerCategory, setBannerCategory] = useState('Trending');
  const [bannerTargetId, setBannerTargetId] = useState('');
  const [bannerMediaPreview, setBannerMediaPreview] = useState('');
  const [bannerIsActive, setBannerIsActive] = useState(true);
  const [editingBannerId, setEditingBannerId] = useState<string | null>(null);

  // DEMO VIDEO STATE
  const [currentDemoVideoUrl, setCurrentDemoVideoUrl] = useState('');
  const [demoVideoPreview, setDemoVideoPreview] = useState('');
  const [demoVideoFile, setDemoVideoFile] = useState<File | null>(null);

  // GLOBAL FEEDBACK
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const tplFileRef = useRef<HTMLInputElement>(null);
  const bannerFileRef = useRef<HTMLInputElement>(null);
  const demoFileRef = useRef<HTMLInputElement>(null);

  const getAdminHeaders = () => ({
    'Content-Type': 'application/json',
    'x-admin-key': localStorage.getItem('lumina_admin_key') || 'lumina_admin_secret_live_2026',
    'Authorization': `Bearer ${localStorage.getItem('lumina_session_token') || ''}`
  });

  // Load live banners and demo video
  useEffect(() => {
    if (!isOpen) return;
    fetch('/api/banners')
      .then((res) => res.json())
      .then((data) => {
        if (data.banners) setBanners(data.banners);
      })
      .catch(() => {});

    fetch('/api/faceswap/config')
      .then((res) => res.json())
      .then((data) => {
        if (data.demoVideoUrl) setCurrentDemoVideoUrl(data.demoVideoUrl);
      })
      .catch(() => {});
  }, [isOpen]);

  if (!isOpen) return null;

  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setFeedback({ message, type });
    setTimeout(() => setFeedback(null), 3000);
  };

  // --- TEMPLATE HANDLERS ---
  const handleTplFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isVideo = file.type.startsWith('video');
    setTplDetectedType(isVideo ? 'video' : 'photo');
    const reader = new FileReader();
    reader.onload = () => {
      setTplMediaPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const startEditTemplate = (tpl: Template) => {
    setEditingTemplate(tpl);
    setTplTitle(tpl.title);
    setTplDescription(tpl.description || '');
    setTplCategory(tpl.category);
    setTplAspectRatio(tpl.aspectRatio);
    setTplIsFeatured(Boolean(tpl.isFeatured));
    setTplIsActive(tpl.isActive !== false);
    setTplBadge(tpl.badge || '');
    setTplTagsInput(tpl.tags ? tpl.tags.join(', ') : '');
    setTplCostUsd(tpl.providerCostUsd || 0.25);
    setTplMediaPreview(tpl.preview || tpl.cover);
    setTplDetectedType(tpl.type);
    setSubTab('edit');
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tplTitle.trim()) {
      showNotification('Please enter a template title', 'error');
      return;
    }

    setIsSubmitting(true);
    const tags = tplTagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      if (editingTemplate) {
        // UPDATE existing
        const res = await fetch(`/api/admin/templates/${editingTemplate.id}`, {
          method: 'PUT',
          headers: getAdminHeaders(),
          body: JSON.stringify({
            title: tplTitle.trim(),
            description: tplDescription.trim(),
            category: tplCategory,
            aspectRatio: tplAspectRatio,
            isFeatured: tplIsFeatured,
            isActive: tplIsActive,
            badge: tplBadge || undefined,
            tags,
            type: tplDetectedType,
            mediaBase64: tplMediaPreview.startsWith('data:') ? tplMediaPreview : undefined,
            providerCostUsd: Number(tplCostUsd) || 0.25
          })
        });

        if (res.ok) {
          showNotification('Template updated successfully!');
          setSubTab('list');
          setEditingTemplate(null);
        } else {
          const err = await res.json();
          showNotification(err.error || 'Failed to update template', 'error');
        }
      } else {
        // CREATE new
        if (!tplMediaPreview) {
          showNotification('Please select a photo or video from gallery', 'error');
          setIsSubmitting(false);
          return;
        }

        const res = await fetch('/api/admin/templates', {
          method: 'POST',
          headers: getAdminHeaders(),
          body: JSON.stringify({
            title: tplTitle.trim(),
            description: tplDescription.trim() || `Trending ${tplCategory} AI Template`,
            category: tplCategory,
            aspectRatio: tplAspectRatio,
            isFeatured: tplIsFeatured,
            isActive: tplIsActive,
            badge: tplBadge || undefined,
            tags,
            type: tplDetectedType,
            mediaBase64: tplMediaPreview,
            providerCostUsd: Number(tplCostUsd) || 0.25
          })
        });

        if (res.ok) {
          showNotification('Template published live to catalog!');
          setSubTab('list');
          setTplTitle('');
          setTplMediaPreview('');
        } else {
          const err = await res.json();
          showNotification(err.error || 'Failed to create template', 'error');
        }
      }
    } catch (err: any) {
      showNotification(err.message || 'Network error', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm('Are you sure you want to permanently delete this template?')) return;
    try {
      const res = await fetch(`/api/admin/templates/${id}`, {
        method: 'DELETE',
        headers: getAdminHeaders()
      });
      if (res.ok) {
        showNotification('Template deleted permanently');
      } else {
        showNotification('Failed to delete template', 'error');
      }
    } catch (err: any) {
      showNotification(err.message, 'error');
    }
  };

  const handleToggleActive = async (tpl: Template) => {
    try {
      const newStatus = !tpl.isActive;
      await fetch(`/api/admin/templates/${tpl.id}`, {
        method: 'PUT',
        headers: getAdminHeaders(),
        body: JSON.stringify({ isActive: newStatus })
      });
      showNotification(`Template ${newStatus ? 'activated' : 'deactivated'}`);
    } catch (err: any) {
      showNotification(err.message, 'error');
    }
  };

  // --- BANNER HANDLERS ---
  const handleBannerFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setBannerMediaPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveBanner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bannerTitle.trim()) {
      showNotification('Banner title is required', 'error');
      return;
    }
    if (!bannerMediaPreview) {
      showNotification('Please upload an image or video for the banner', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Upload media if new base64
      let mediaUrl = bannerMediaPreview;
      if (bannerMediaPreview.startsWith('data:')) {
        const uploadRes = await fetch('/api/admin/upload-media', {
          method: 'POST',
          headers: getAdminHeaders(),
          body: JSON.stringify({ mediaBase64: bannerMediaPreview, filename: 'banner' })
        });
        const uploadData = await uploadRes.json();
        if (uploadData.url) mediaUrl = uploadData.url;
      }

      let updatedList = [...banners];
      if (editingBannerId) {
        updatedList = updatedList.map((b) =>
          b.id === editingBannerId
            ? {
                ...b,
                title: bannerTitle.trim(),
                subtitle: bannerSubtitle.trim(),
                badge: bannerBadge.trim(),
                category: bannerCategory,
                targetTemplateId: bannerTargetId.trim() || b.targetTemplateId || '',
                image: mediaUrl || b.image,
                coverMedia: mediaUrl || b.coverMedia,
                isActive: bannerIsActive
              }
            : b
        );
      } else {
        const newBanner: HomeBannerItem = {
          id: `banner_${Date.now()}`,
          title: bannerTitle.trim(),
          subtitle: bannerSubtitle.trim(),
          badge: bannerBadge.trim(),
          category: bannerCategory,
          targetTemplateId: bannerTargetId.trim() || '',
          image: mediaUrl,
          coverMedia: mediaUrl,
          mediaType: mediaUrl.endsWith('.mp4') ? 'video' : 'image',
          likesCount: '1.2K',
          commentsCount: '120',
          sharesCount: '300',
          isActive: bannerIsActive
        };
        updatedList.unshift(newBanner);
      }

      const res = await fetch('/api/admin/banners', {
        method: 'PUT',
        headers: getAdminHeaders(),
        body: JSON.stringify({ banners: updatedList })
      });

      if (res.ok) {
        setBanners(updatedList);
        showNotification('Home Banners published live!');
        setSubTab('list');
        setBannerTitle('');
        setBannerMediaPreview('');
        setEditingBannerId(null);
      } else {
        showNotification('Failed to update banners', 'error');
      }
    } catch (err: any) {
      showNotification(err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteBanner = async (id: string) => {
    if (!confirm('Delete this banner?')) return;
    const updatedList = banners.filter((b) => b.id !== id);
    try {
      const res = await fetch('/api/admin/banners', {
        method: 'PUT',
        headers: getAdminHeaders(),
        body: JSON.stringify({ banners: updatedList })
      });
      if (res.ok) {
        setBanners(updatedList);
        showNotification('Banner removed');
      }
    } catch (err: any) {
      showNotification(err.message, 'error');
    }
  };

  const handleMoveBanner = async (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= banners.length) return;
    const updated = [...banners];
    const temp = updated[index];
    updated[index] = updated[targetIdx];
    updated[targetIdx] = temp;
    setBanners(updated);

    await fetch('/api/admin/banners', {
      method: 'PUT',
      headers: getAdminHeaders(),
      body: JSON.stringify({ banners: updated })
    });
  };

  // --- DEMO VIDEO HANDLERS ---
  const handleDemoVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDemoVideoFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      setDemoVideoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveDemoVideo = async () => {
    if (!demoVideoPreview && !currentDemoVideoUrl) {
      showNotification('Please select a video from phone gallery', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      let finalVideoUrl = currentDemoVideoUrl;

      if (demoVideoPreview.startsWith('data:')) {
        const uploadRes = await fetch('/api/admin/upload-media', {
          method: 'POST',
          headers: getAdminHeaders(),
          body: JSON.stringify({ mediaBase64: demoVideoPreview, filename: 'demo_faceswap' })
        });
        const uploadData = await uploadRes.json();
        if (uploadData.url) finalVideoUrl = uploadData.url;
      }

      const res = await fetch('/api/admin/faceswap/config', {
        method: 'PUT',
        headers: getAdminHeaders(),
        body: JSON.stringify({ demoVideoUrl: finalVideoUrl })
      });

      if (res.ok) {
        setCurrentDemoVideoUrl(finalVideoUrl);
        setDemoVideoPreview('');
        showNotification('Face Swap Demo Video updated! Home is immediately live with this video.');
      } else {
        showNotification('Failed to update demo video', 'error');
      }
    } catch (err: any) {
      showNotification(err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/90 backdrop-blur-xl overflow-hidden">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="relative w-full max-w-2xl bg-[#0d0d12] border border-white/15 rounded-3xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden"
      >
        {/* Top Header */}
        <div className="p-4 sm:p-5 border-b border-white/10 flex items-center justify-between bg-stone-950/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#ff9f00]/20 border border-[#ff9f00]/30 flex items-center justify-center text-[#ff9f00]">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                Content Studio
                <span className="text-[10px] font-black tracking-wider uppercase px-2 py-0.5 rounded-full bg-[#ff9f00] text-black">
                  Mobile Admin
                </span>
              </h3>
              <p className="text-xs text-stone-400">Manage templates, hero banners & demo video from your phone</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-stone-400 hover:text-white rounded-xl hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Global Feedback Toast */}
        {feedback && (
          <div
            className={`mx-4 mt-3 p-3 rounded-xl flex items-center gap-2 text-xs font-semibold ${
              feedback.type === 'success'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'bg-red-500/20 text-red-300 border border-red-500/30'
            }`}
          >
            {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            <span>{feedback.message}</span>
          </div>
        )}

        {/* Studio Top Navigation Tabs */}
        <div className="flex border-b border-white/10 bg-stone-900/40 p-1.5 gap-1.5 px-4">
          <button
            onClick={() => {
              setActiveTab('templates');
              setSubTab('list');
            }}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${
              activeTab === 'templates'
                ? 'bg-white/10 text-white border border-white/10 shadow-sm'
                : 'text-stone-400 hover:text-white'
            }`}
          >
            <Layers className="w-4 h-4 text-[#ff9f00]" />
            <span>Templates ({templates.length})</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('banners');
              setSubTab('list');
            }}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${
              activeTab === 'banners'
                ? 'bg-white/10 text-white border border-white/10 shadow-sm'
                : 'text-stone-400 hover:text-white'
            }`}
          >
            <Film className="w-4 h-4 text-pink-400" />
            <span>Hero Banners</span>
          </button>

          <button
            onClick={() => setActiveTab('demo')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${
              activeTab === 'demo'
                ? 'bg-white/10 text-white border border-white/10 shadow-sm'
                : 'text-stone-400 hover:text-white'
            }`}
          >
            <VideoIcon className="w-4 h-4 text-emerald-400" />
            <span>Face Swap Demo</span>
          </button>
        </div>

        {/* TAB 1: TEMPLATES MANAGEMENT */}
        {activeTab === 'templates' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
            {subTab === 'list' ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-stone-400">Total Live Catalog: {templates.length}</span>
                  <button
                    onClick={() => {
                      setEditingTemplate(null);
                      setTplTitle('');
                      setTplMediaPreview('');
                      setSubTab('add');
                    }}
                    className="px-3.5 py-1.5 rounded-xl bg-[#ff9f00] text-black text-xs font-black flex items-center gap-1.5 shadow-md hover:brightness-110 active:scale-95 transition-all"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Upload Template</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {templates.map((tpl) => (
                    <div
                      key={tpl.id}
                      className="p-3 rounded-2xl bg-stone-900/60 border border-white/10 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={tpl.cover}
                          alt={tpl.title}
                          className="w-12 h-14 rounded-xl object-cover border border-white/10 bg-black flex-shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <h4 className="text-xs font-bold text-white truncate">{tpl.title}</h4>
                            {tpl.badge && (
                              <span className="text-[9px] font-black px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                {tpl.badge}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-stone-400">
                            <span>{tpl.category}</span>
                            <span>•</span>
                            <span>{tpl.type.toUpperCase()}</span>
                            <span>•</span>
                            <span className="text-[#ff9f00] font-semibold">{tpl.creditCost || 30} cr</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleToggleActive(tpl)}
                          title={tpl.isActive !== false ? 'Deactivate' : 'Activate'}
                          className={`p-2 rounded-xl border text-xs ${
                            tpl.isActive !== false
                              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                              : 'bg-stone-800 text-stone-500 border-stone-700'
                          }`}
                        >
                          {tpl.isActive !== false ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={() => startEditTemplate(tpl)}
                          className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-stone-300 border border-white/10 text-xs"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteTemplate(tpl.id)}
                          className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              // ADD / EDIT TEMPLATE FORM
              <form onSubmit={handleSaveTemplate} className="space-y-4">
                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                    {subTab === 'edit' ? 'Edit Template Details' : 'Upload New Template from Phone'}
                  </h4>
                  <button
                    type="button"
                    onClick={() => setSubTab('list')}
                    className="text-xs text-stone-400 hover:text-white"
                  >
                    Back to List
                  </button>
                </div>

                {/* Media Preview & Upload Button */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-stone-300">Media Cover / Video (From Device)</label>
                  <input
                    ref={tplFileRef}
                    type="file"
                    accept="image/*,video/*"
                    onChange={handleTplFileSelect}
                    className="hidden"
                  />
                  <div
                    onClick={() => tplFileRef.current?.click()}
                    className="relative w-full aspect-[16/9] rounded-2xl border-2 border-dashed border-white/20 hover:border-[#ff9f00] bg-black/40 flex flex-col items-center justify-center p-4 cursor-pointer overflow-hidden group"
                  >
                    {tplMediaPreview ? (
                      tplDetectedType === 'video' ? (
                        <video src={tplMediaPreview} autoPlay loop muted playsInline className="w-full h-full object-cover" />
                      ) : (
                        <img src={tplMediaPreview} alt="Preview" className="w-full h-full object-cover" />
                      )
                    ) : (
                      <div className="flex flex-col items-center text-center">
                        <Upload className="w-8 h-8 text-[#ff9f00] mb-2" />
                        <span className="text-xs font-bold text-white">Tap to Choose Photo or Video from Phone</span>
                        <span className="text-[10px] text-stone-400 mt-1">Supports MP4, JPG, PNG, WEBP</span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-xs font-bold text-white">
                      Tap to Replace File
                    </div>
                  </div>
                </div>

                {/* Title */}
                <div>
                  <label className="text-xs font-bold text-stone-300">Template Title *</label>
                  <input
                    type="text"
                    value={tplTitle}
                    onChange={(e) => setTplTitle(e.target.value)}
                    placeholder="e.g. Vintage 80s Cyberpunk Dance"
                    className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl bg-stone-900 border border-white/10 text-white text-xs focus:border-[#ff9f00] focus:outline-none"
                    required
                  />
                </div>

                {/* Category & Badge */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-stone-300">Category</label>
                    <select
                      value={tplCategory}
                      onChange={(e) => setTplCategory(e.target.value)}
                      className="w-full mt-1.5 px-3 py-2.5 rounded-xl bg-stone-900 border border-white/10 text-white text-xs focus:border-[#ff9f00] focus:outline-none"
                    >
                      <option value="Trending">Trending</option>
                      <option value="Retro 80s">Retro 80s</option>
                      <option value="Dance">Dance</option>
                      <option value="Luxury">Luxury</option>
                      <option value="Fashion">Fashion</option>
                      <option value="Birthday">Birthday</option>
                      <option value="Couples">Couples</option>
                      <option value="Festival">Festival</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-stone-300">Highlight Badge</label>
                    <select
                      value={tplBadge}
                      onChange={(e) => setTplBadge(e.target.value)}
                      className="w-full mt-1.5 px-3 py-2.5 rounded-xl bg-stone-900 border border-white/10 text-white text-xs focus:border-[#ff9f00] focus:outline-none"
                    >
                      <option value="">None</option>
                      <option value="HOT">HOT</option>
                      <option value="TRENDING">TRENDING</option>
                      <option value="VIRAL">VIRAL</option>
                      <option value="PRO">PRO</option>
                    </select>
                  </div>
                </div>

                {/* Cost Config & Aspect Ratio */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-stone-300">Provider Cost (USD)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={tplCostUsd}
                      onChange={(e) => setTplCostUsd(parseFloat(e.target.value) || 0.25)}
                      className="w-full mt-1.5 px-3 py-2.5 rounded-xl bg-stone-900 border border-white/10 text-white text-xs focus:border-[#ff9f00] focus:outline-none"
                    />
                    <span className="text-[10px] text-stone-500 mt-1 block">Dynamic +40% rule will apply</span>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-stone-300">Aspect Ratio</label>
                    <select
                      value={tplAspectRatio}
                      onChange={(e) => setTplAspectRatio(e.target.value as any)}
                      className="w-full mt-1.5 px-3 py-2.5 rounded-xl bg-stone-900 border border-white/10 text-white text-xs focus:border-[#ff9f00] focus:outline-none"
                    >
                      <option value="9:16">9:16 (Vertical Reel)</option>
                      <option value="1:1">1:1 (Square)</option>
                      <option value="4:5">4:5 (Portrait)</option>
                      <option value="16:9">16:9 (Landscape)</option>
                    </select>
                  </div>
                </div>

                {/* Switches: Featured & Active */}
                <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-stone-900/70 border border-white/10">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-white">
                    <input
                      type="checkbox"
                      checked={tplIsFeatured}
                      onChange={(e) => setTplIsFeatured(e.target.checked)}
                      className="rounded accent-[#ff9f00] w-4 h-4"
                    />
                    <span>Featured Rail</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-white">
                    <input
                      type="checkbox"
                      checked={tplIsActive}
                      onChange={(e) => setTplIsActive(e.target.checked)}
                      className="rounded accent-emerald-500 w-4 h-4"
                    />
                    <span>Active Live</span>
                  </label>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 rounded-xl bg-[#ff9f00] text-black font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 hover:brightness-110 active:scale-95 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  <span>{subTab === 'edit' ? 'Save Changes' : 'Publish Template to Live App'}</span>
                </button>
              </form>
            )}
          </div>
        )}

        {/* TAB 2: HERO BANNERS MANAGEMENT */}
        {activeTab === 'banners' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
            {subTab === 'list' ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-stone-400">Total Banners: {banners.length}</span>
                  <button
                    onClick={() => {
                      setEditingBannerId(null);
                      setBannerTitle('');
                      setBannerSubtitle('');
                      setBannerMediaPreview('');
                      setSubTab('add');
                    }}
                    className="px-3.5 py-1.5 rounded-xl bg-pink-500 text-white text-xs font-black flex items-center gap-1.5 shadow-md hover:brightness-110 active:scale-95 transition-all"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Upload Banner</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {banners.map((b, idx) => (
                    <div
                      key={b.id}
                      className="p-3 rounded-2xl bg-stone-900/60 border border-white/10 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {b.mediaType === 'video' ? (
                          <video src={b.coverMedia} className="w-16 h-10 rounded-xl object-cover border border-white/10 bg-black flex-shrink-0" muted loop autoPlay />
                        ) : (
                          <img src={b.coverMedia} alt={b.title} className="w-16 h-10 rounded-xl object-cover border border-white/10 bg-black flex-shrink-0" />
                        )}
                        <div className="min-w-0">
                          <h4 className="text-xs font-bold text-white truncate">{b.title}</h4>
                          <p className="text-[10px] text-stone-400 truncate">{b.subtitle}</p>
                          <span className="text-[9px] font-bold text-pink-400">{b.badge}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleMoveBanner(idx, 'up')}
                          disabled={idx === 0}
                          className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 text-stone-300"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleMoveBanner(idx, 'down')}
                          disabled={idx === banners.length - 1}
                          className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 text-stone-300"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteBanner(b.id)}
                          className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              // ADD / EDIT BANNER FORM
              <form onSubmit={handleSaveBanner} className="space-y-4">
                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                    Upload Hero Banner from Phone
                  </h4>
                  <button
                    type="button"
                    onClick={() => setSubTab('list')}
                    className="text-xs text-stone-400 hover:text-white"
                  >
                    Back to List
                  </button>
                </div>

                {/* Media Upload */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-stone-300">Banner Image or Video *</label>
                  <input
                    ref={bannerFileRef}
                    type="file"
                    accept="image/*,video/*"
                    onChange={handleBannerFileSelect}
                    className="hidden"
                  />
                  <div
                    onClick={() => bannerFileRef.current?.click()}
                    className="relative w-full aspect-[21/9] rounded-2xl border-2 border-dashed border-white/20 hover:border-pink-500 bg-black/40 flex flex-col items-center justify-center p-3 cursor-pointer overflow-hidden group"
                  >
                    {bannerMediaPreview ? (
                      bannerMediaPreview.includes('video') || bannerMediaPreview.endsWith('.mp4') ? (
                        <video src={bannerMediaPreview} autoPlay loop muted playsInline className="w-full h-full object-cover" />
                      ) : (
                        <img src={bannerMediaPreview} alt="Preview" className="w-full h-full object-cover" />
                      )
                    ) : (
                      <div className="flex flex-col items-center text-center">
                        <Upload className="w-6 h-6 text-pink-400 mb-1" />
                        <span className="text-xs font-bold text-white">Tap to Choose Banner Media from Phone</span>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-stone-300">Banner Title *</label>
                  <input
                    type="text"
                    value={bannerTitle}
                    onChange={(e) => setBannerTitle(e.target.value)}
                    placeholder="e.g. Retro 80s Bollywood"
                    className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl bg-stone-900 border border-white/10 text-white text-xs focus:border-pink-500 focus:outline-none"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-stone-300">Subtitle</label>
                    <input
                      type="text"
                      value={bannerSubtitle}
                      onChange={(e) => setBannerSubtitle(e.target.value)}
                      placeholder="e.g. Create 80s Disco Reels"
                      className="w-full mt-1.5 px-3 py-2.5 rounded-xl bg-stone-900 border border-white/10 text-white text-xs focus:border-pink-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-stone-300">Badge Text</label>
                    <input
                      type="text"
                      value={bannerBadge}
                      onChange={(e) => setBannerBadge(e.target.value)}
                      placeholder="e.g. VIRAL NOW"
                      className="w-full mt-1.5 px-3 py-2.5 rounded-xl bg-stone-900 border border-white/10 text-white text-xs focus:border-pink-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-stone-300">Target Template ID (Optional)</label>
                  <input
                    type="text"
                    value={bannerTargetId}
                    onChange={(e) => setBannerTargetId(e.target.value)}
                    placeholder="e.g. tpl_full_swag_1"
                    className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl bg-stone-900 border border-white/10 text-white text-xs focus:border-pink-500 focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 rounded-xl bg-pink-500 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 hover:brightness-110 active:scale-95 disabled:opacity-50"
                >
                  {isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  <span>Save & Publish Banner</span>
                </button>
              </form>
            )}
          </div>
        )}

        {/* TAB 3: FACE SWAP DEMO VIDEO */}
        {activeTab === 'demo' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">Live Face Swap Demo Video</h4>
              <p className="text-[11px] text-stone-400 mt-0.5">
                This video is shown on the Home screen featured card. Replace it anytime from your mobile gallery.
              </p>
            </div>

            {/* Current Active Demo Player */}
            <div className="relative rounded-2xl overflow-hidden aspect-[21/9] sm:aspect-[24/9] w-full bg-black border border-white/15 shadow-xl">
              <video
                src={demoVideoPreview || currentDemoVideoUrl}
                autoPlay
                playsInline
                loop
                muted
                className="w-full h-full object-cover"
              />
              <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md text-[10px] font-bold text-emerald-400 border border-emerald-500/30">
                LIVE DEMO PREVIEW
              </div>
            </div>

            {/* Upload Button */}
            <div className="space-y-3">
              <input
                ref={demoFileRef}
                type="file"
                accept="video/*"
                onChange={handleDemoVideoSelect}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => demoFileRef.current?.click()}
                className="w-full py-3.5 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/15 text-white font-bold text-xs flex items-center justify-center gap-2 active:scale-95 transition-all"
              >
                <Upload className="w-4 h-4 text-emerald-400" />
                <span>Choose New Demo Video from Phone</span>
              </button>

              <button
                type="button"
                onClick={handleSaveDemoVideo}
                disabled={isSubmitting || !demoVideoPreview}
                className="w-full py-3.5 rounded-2xl bg-emerald-500 text-black font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 hover:brightness-110 active:scale-95 disabled:opacity-40 transition-all shadow-lg"
              >
                {isSubmitting ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                <span>Publish Demo Video Live</span>
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};
