import React, { useState, useRef, useEffect, useCallback } from 'react';
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
  AlertCircle,
  Key,
  ShieldCheck,
  Lock,
  Wand2,
  AlertTriangle,
  HardDrive,
  Cloud,
  Info,
  UserCheck,
  CreditCard
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Template, TemplateInputType, TemplateExecutionRecipe, FaceSwapScene } from '../types';
import { HomeBannerItem } from '../config/homeBannersConfig';
import { isVideoMedia } from '../utils/mediaUtils';
import { DEFAULT_CATEGORY_PROMPTS } from '../config/categoryPromptsConfig';
import { CATEGORIES } from '../data/templatesData';

interface TemplateManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export interface BulkTemplateItem {
  id: string;
  file: File;
  previewUrl: string;
  title: string;
  status: 'pending' | 'uploading' | 'success' | 'failed';
  error?: string;
  createdTemplateId?: string;
}

export const CATEGORY_PROMPT_PRESETS: Record<string, string> = DEFAULT_CATEGORY_PROMPTS;

export const TemplateManagerModal: React.FC<TemplateManagerModalProps> = ({
  isOpen,
  onClose
}) => {
  const {
    user,
    setAuthModalOpen,
    templates,
    refreshGenerations,
    refreshTemplates,
    faceSwapScenes,
    refreshFaceSwapScenes
  } = useApp();

  const [activeTab, setActiveTab] = useState<'templates' | 'faceswap' | 'catalog' | 'banners' | 'pricing_banner' | 'demo'>('templates');
  const [subTab, setSubTab] = useState<'list' | 'add' | 'edit' | 'bulk'>('list');
  const [faceSwapSection, setFaceSwapSection] = useState<'scenes' | 'demo'>('scenes');
  const [faceSwapSubTab, setFaceSwapSubTab] = useState<'list' | 'add' | 'edit'>('list');

  // PRICING PAGE MULTI-BANNER ROTATION POOL ADMIN STATE
  const [pricingBannerPool, setPricingBannerPool] = useState<any[]>([]);
  const [newBannerPreview, setNewBannerPreview] = useState<string>('');
  const [newBannerType, setNewBannerType] = useState<'image' | 'video'>('image');
  const [newBannerPosterPreview, setNewBannerPosterPreview] = useState<string>('');
  const [newBannerAltText, setNewBannerAltText] = useState<string>('AI Prime Studio VIP Pass');
  const [testRotatedBanner, setTestRotatedBanner] = useState<any | null>(null);
  const [isLoadingPricingBanner, setIsLoadingPricingBanner] = useState<boolean>(false);
  const [isSavingPricingBanner, setIsSavingPricingBanner] = useState<boolean>(false);
  const [isTestingRefresh, setIsTestingRefresh] = useState<boolean>(false);

  // FACE SWAP SCENES ADMIN STATE
  const [adminFaceSwapScenes, setAdminFaceSwapScenes] = useState<FaceSwapScene[]>([]);
  const [editingScene, setEditingScene] = useState<FaceSwapScene | null>(null);
  const [sceneTitle, setSceneTitle] = useState('');
  const [sceneDescription, setSceneDescription] = useState('');
  const [sceneCategory, setSceneCategory] = useState('Viral & Trending');
  const [sceneTags, setSceneTags] = useState('Face Swap, Viral, Reels');
  const [sceneCreditCost, setSceneCreditCost] = useState<number>(45);
  const [sceneDurationSeconds, setSceneDurationSeconds] = useState<number>(8);
  const [sceneAspectRatio, setSceneAspectRatio] = useState<'9:16' | '16:9' | '1:1' | '4:5'>('9:16');
  const [sceneIsActive, setSceneIsActive] = useState<boolean>(true);
  const [sceneStatus, setSceneStatus] = useState<'published' | 'draft'>('published');
  const [sceneIsFeatured, setSceneIsFeatured] = useState<boolean>(false);
  const [sceneOrder, setSceneOrder] = useState<number>(0);

  // DEFAULT RECIPE PROMPTS (Standardized across Admin and Engine)
  const DEFAULT_MOTION_TRANSFER_RECIPE_PROMPT =
    "High aesthetic cinematic neural motion transfer. Seamlessly map target facial identity onto the main character in this driving sequence, preserving facial micro-expressions, skin tone, natural eye-gaze, lighting integration, hair structure, and fluid body choreography without distortion or artifacts.";
  const DEFAULT_PHOTO_RECIPE_PROMPT =
    "Hyper-realistic commercial studio portrait, 8k resolution, photorealistic skin textures, dramatic softbox lighting, perfect face identity mapping, authentic color grading.";
  const DEFAULT_VIDEO_RECIPE_PROMPT =
    "Cinematic slow-motion 60FPS video reel, hyperrealistic lighting, 8k resolution, fluid natural motion, color-graded aesthetic.";

  const [sceneMasterRecipePrompt, setSceneMasterRecipePrompt] = useState<string>(DEFAULT_MOTION_TRANSFER_RECIPE_PROMPT);

  // Asset 1: Sample Face Photo
  const [sceneSampleFace, setSceneSampleFace] = useState<string>('');
  const [sceneSampleFaceName, setSceneSampleFaceName] = useState<string>('');
  const sceneSampleFaceFileRef = useRef<HTMLInputElement>(null);

  // Asset 2: Original / Before Video
  const [sceneSourceVideo, setSceneSourceVideo] = useState<string>('');
  const [sceneSourceVideoName, setSceneSourceVideoName] = useState<string>('');
  const sceneSourceVideoFileRef = useRef<HTMLInputElement>(null);

  // Asset 3: Swapped Face / After Video
  const [sceneResultVideo, setSceneResultVideo] = useState<string>('');
  const [sceneResultVideoName, setSceneResultVideoName] = useState<string>('');
  const sceneResultVideoFileRef = useRef<HTMLInputElement>(null);

  // Asset File Metadata for diagnostics & validation
  const [sceneSampleFaceFile, setSceneSampleFaceFile] = useState<{ name: string; size: number; type: string } | null>(null);
  const [sceneSourceVideoFile, setSceneSourceVideoFile] = useState<{ name: string; size: number; type: string; duration?: number } | null>(null);
  const [sceneResultVideoFile, setSceneResultVideoFile] = useState<{ name: string; size: number; type: string; duration?: number } | null>(null);

  // Granular Diagnostic Error & Stage Reporting
  const [detailedError, setDetailedError] = useState<{
    stage: 'Photo Upload' | 'Original Video Upload' | 'Result Video Upload' | 'Save Scene' | 'Media Validation';
    stepNumber: string;
    httpStatus?: number;
    serverError?: string;
    errorCode?: string;
    fileName?: string;
    fileType?: string;
    fileSizeFormatted?: string;
    probableCause: string;
    nextStep: string;
  } | null>(null);

  const [uploadStageInfo, setUploadStageInfo] = useState<{
    step: string;
    message: string;
    provider?: string;
  } | null>(null);

  const [storageStatus, setStorageStatus] = useState<any>(null);
  const [showStorageDiagnostics, setShowStorageDiagnostics] = useState<boolean>(false);
  const [isTestingStorage, setIsTestingStorage] = useState<boolean>(false);

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
  const [tplCoverPreview, setTplCoverPreview] = useState<string>('');
  const [tplReferenceImagePreview, setTplReferenceImagePreview] = useState<string>('');
  const [tplSampleResultPreview, setTplSampleResultPreview] = useState<string>('');
  const [tplSampleFaceThumbnail, setTplSampleFaceThumbnail] = useState<string>('');
  const [tplSampleBefore, setTplSampleBefore] = useState<string>('');
  const [showCustomCoverOverride, setShowCustomCoverOverride] = useState<boolean>(false);
  const [tplDetectedType, setTplDetectedType] = useState<'photo' | 'video'>('video');

  // Input Type Enforcement: 'IMAGE_ONLY' | 'VIDEO_ONLY' | 'IMAGE_OR_VIDEO'
  const [tplInputType, setTplInputType] = useState<TemplateInputType>('IMAGE_OR_VIDEO');

  // BULK PHOTO IMPORT & CATEGORY-LEVEL PROMPTS STATE
  const [categoryPromptsMap, setCategoryPromptsMap] = useState<Record<string, string>>(DEFAULT_CATEGORY_PROMPTS);
  const [listCategoryFilter, setListCategoryFilter] = useState<string>('all');
  const [bulkItems, setBulkItems] = useState<BulkTemplateItem[]>([]);
  const [bulkCategory, setBulkCategory] = useState<string>('Devotional');
  const [bulkCategoryCustom, setBulkCategoryCustom] = useState<string>('');
  const [bulkMasterPrompt, setBulkMasterPrompt] = useState<string>(
    DEFAULT_CATEGORY_PROMPTS['Devotional']
  );
  const [bulkAspectRatio, setBulkAspectRatio] = useState<'9:16' | '4:5' | '1:1' | '16:9'>('9:16');
  const [bulkTags, setBulkTags] = useState<string>('Devotional, Bhakti, AI Photo, Spiritual');
  const [bulkCostUsd, setBulkCostUsd] = useState<number>(0.08);
  const [bulkIsActive, setBulkIsActive] = useState<boolean>(true);
  const [bulkIsFeatured, setBulkIsFeatured] = useState<boolean>(true);
  const [isBulkUploading, setIsBulkUploading] = useState<boolean>(false);
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number; successCount: number; failCount: number }>({ current: 0, total: 0, successCount: 0, failCount: 0 });
  const [bulkSummary, setBulkSummary] = useState<{ completed: boolean; total: number; successCount: number; failCount: number } | null>(null);
  const [isRecoveringR2, setIsRecoveringR2] = useState<boolean>(false);
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null);

  const [adminTemplates, setAdminTemplates] = useState<Template[]>([]);
  const [loadingAdminTemplates, setLoadingAdminTemplates] = useState<boolean>(false);

  const fetchAdminTemplates = useCallback(async (refresh: boolean = false) => {
    try {
      setLoadingAdminTemplates(true);
      const url = refresh ? '/api/admin/templates?refresh=true' : '/api/admin/templates';
      const res = await fetch(url, {
        headers: getAdminHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.templates)) {
          setAdminTemplates(data.templates);
          return;
        }
      }
    } catch (err: any) {
      console.warn('[TemplateManager] Failed to fetch admin templates:', err.message);
    } finally {
      setLoadingAdminTemplates(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchAdminTemplates();
    }
  }, [isOpen, fetchAdminTemplates]);

  const displayTemplates = adminTemplates.length > 0 ? adminTemplates : templates;

  // Unified list of all known categories (predefined + any custom categories in templates or prompt map)
  const allKnownCategories = Array.from(
    new Set([
      ...CATEGORIES,
      ...displayTemplates.map((t) => t.category).filter(Boolean),
      ...Object.keys(categoryPromptsMap)
    ])
  );

  // Execution Recipe (Separated from display preview MP4/Photo)
  const [recipePreset, setRecipePreset] = useState<'veo_video' | 'gemini_photo' | 'higgsfield_motion' | 'custom'>('veo_video');
  const [recipeProvider, setRecipeProvider] = useState<string>('google_veo');
  const [recipeModel, setRecipeModel] = useState<string>('gemini-omni-1.1-flash');
  const [recipeWorkflow, setRecipeWorkflow] = useState<string>('viral-reels');
  const [recipePrompt, setRecipePrompt] = useState<string>('Cinematic slow-motion 60FPS video reel, hyperrealistic lighting, 8k resolution, color-graded aesthetic.');
  const [recipeDrivingVideoUrl, setRecipeDrivingVideoUrl] = useState<string>('');
  const [recipeDrivingVideoPreview, setRecipeDrivingVideoPreview] = useState<string>('');

  // PROVIDER CATALOG STATE
  const [catalogItems, setCatalogItems] = useState<any[]>([]);
  const [catalogLoading, setCatalogLoading] = useState<boolean>(false);
  const [catalogSource, setCatalogSource] = useState<string>('');
  const [catalogFilter, setCatalogFilter] = useState<'all' | 'higgsfield' | 'google_veo' | 'gemini'>('all');
  const [catalogSearch, setCatalogSearch] = useState<string>('');
  const [importNotice, setImportNotice] = useState<string | null>(null);

  // RECIPE JSON UPLOAD & PASTE STATE
  const [showPasteJsonModal, setShowPasteJsonModal] = useState<boolean>(false);
  const [pasteJsonText, setPasteJsonText] = useState<string>('');
  const [pasteJsonError, setPasteJsonError] = useState<string | null>(null);

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

  // ADMIN SECURITY & AUTHORIZATION STATE
  const [adminKey, setAdminKey] = useState(() => {
    const stored = localStorage.getItem('lumina_admin_key') || '';
    if (stored === 'ai_prime_admin_secret_key_2026' || stored === 'lumina_admin_secret_key_2026') {
      localStorage.removeItem('lumina_admin_key');
      return '';
    }
    return stored;
  });
  const [adminKeyInput, setAdminKeyInput] = useState('');
  const [isAdminVerified, setIsAdminVerified] = useState<boolean | null>(null);
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [isVerifyingKey, setIsVerifyingKey] = useState(false);

  // GLOBAL FEEDBACK
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const tplFileRef = useRef<HTMLInputElement>(null);
  const coverFileRef = useRef<HTMLInputElement>(null);
  const referenceImageFileRef = useRef<HTMLInputElement>(null);
  const bulkFileInputRef = useRef<HTMLInputElement>(null);
  const sampleResultFileRef = useRef<HTMLInputElement>(null);
  const sampleFaceThumbnailFileRef = useRef<HTMLInputElement>(null);
  const sampleBeforeFileRef = useRef<HTMLInputElement>(null);
  const recipeJsonFileRef = useRef<HTMLInputElement>(null);
  const drivingFileRef = useRef<HTMLInputElement>(null);
  const bannerFileRef = useRef<HTMLInputElement>(null);
  const demoFileRef = useRef<HTMLInputElement>(null);

  const checkAdminAuth = async (candidateKey?: string): Promise<boolean> => {
    setIsVerifyingKey(true);
    try {
      const token = localStorage.getItem('lumina_session_token') || '';
      const keyToUse = candidateKey !== undefined ? candidateKey : (localStorage.getItem('lumina_admin_key') || adminKey || '');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (keyToUse) headers['x-admin-key'] = keyToUse;

      const res = await fetch('/api/admin/verify', { headers });
      if (res.ok) {
        setIsAdminVerified(true);
        if (keyToUse) {
          localStorage.setItem('lumina_admin_key', keyToUse);
          setAdminKey(keyToUse);
        }
        setShowKeyInput(false);
        return true;
      } else {
        setIsAdminVerified(false);
        return false;
      }
    } catch {
      setIsAdminVerified(false);
      return false;
    } finally {
      setIsVerifyingKey(false);
    }
  };

  const handleSaveAdminKey = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!adminKeyInput.trim()) {
      showNotification('Please enter your ADMIN_SECRET_KEY', 'error');
      return;
    }
    const success = await checkAdminAuth(adminKeyInput.trim());
    if (success) {
      showNotification('Admin Key verified! Full studio access unlocked.');
      setAdminKeyInput('');
    } else {
      showNotification('Invalid ADMIN_SECRET_KEY. Please verify your secret key.', 'error');
    }
  };

  const getAdminHeaders = () => {
    const token = localStorage.getItem('lumina_session_token') || '';
    const storedKey = localStorage.getItem('lumina_admin_key') || adminKey || '';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (storedKey) headers['x-admin-key'] = storedKey;
    return headers;
  };

  // Load live banners, demo video, and verify admin auth
  useEffect(() => {
    if (!isOpen) return;
    checkAdminAuth();

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

    fetch('/api/categories/prompts')
      .then((res) => res.json())
      .then((data) => {
        if (data.prompts) {
          setCategoryPromptsMap(data.prompts);
          if (data.prompts[bulkCategory]) {
            setBulkMasterPrompt(data.prompts[bulkCategory]);
          }
        }
      })
      .catch(() => {});
  }, [isOpen, user]);

  if (!isOpen) return null;

  const formatBytes = (bytes: number): string => {
    if (!bytes || isNaN(bytes)) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const fetchStorageStatus = async () => {
    setIsTestingStorage(true);
    try {
      const res = await fetch('/api/admin/storage/status', {
        headers: getAdminHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setStorageStatus(data);
      }
    } catch {
      // optional
    } finally {
      setIsTestingStorage(false);
    }
  };

  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setFeedback({ message, type });
    setTimeout(() => setFeedback(null), 3000);
  };

  // Preset Selection Helper
  const applyRecipePreset = (preset: 'veo_video' | 'gemini_photo' | 'higgsfield_motion' | 'custom') => {
    setRecipePreset(preset);
    if (preset === 'veo_video') {
      setRecipeProvider('google_veo');
      setRecipeModel('gemini-omni-1.1-flash');
      setRecipeWorkflow('viral-reels');
      setRecipePrompt('Cinematic slow-motion 60FPS video reel, hyperrealistic lighting, 8k resolution, color-graded aesthetic.');
      setTplCostUsd(0.25);
      setTplDetectedType('video');
      setTplInputType('IMAGE_OR_VIDEO');
    } else if (preset === 'gemini_photo') {
      setRecipeProvider('gemini');
      setRecipeModel('gemini-2.5-flash-image');
      setRecipeWorkflow('neural-portrait-studio');
      setRecipePrompt('Studio editorial magazine portrait, Hasselblad medium-format clarity, studio rim lights, magazine cover aesthetic.');
      setTplCostUsd(0.08);
      setTplDetectedType('photo');
      setTplInputType('IMAGE_ONLY');
    } else if (preset === 'higgsfield_motion') {
      setRecipeProvider('higgsfield');
      setRecipeModel('higgsfield/genjutsu/motion-transfer/v1.0');
      setRecipeWorkflow('motion-transfer');
      setRecipePrompt('Preserve face identity, transfer full body dance dynamics and camera angles smoothly, 480p motion transfer.');
      setTplCostUsd(1.59);
      setTplDetectedType('video');
      setTplInputType('IMAGE_ONLY');
    }
  };

  // --- PRICING PAGE MULTI-BANNER ROTATION POOL HANDLERS ---
  const fetchPricingBannerConfig = async () => {
    setIsLoadingPricingBanner(true);
    try {
      const res = await fetch('/api/admin/pricing-banners', {
        headers: getAdminHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        const items = Array.isArray(data.items) ? data.items : [];
        setPricingBannerPool(items);
        if (data.defaultBanner) {
          setTestRotatedBanner(data.defaultBanner);
        } else if (items.length > 0) {
          setTestRotatedBanner(items[0]);
        } else {
          setTestRotatedBanner(null);
        }
      } else {
        const pubRes = await fetch('/api/pricing-banner?t=' + Date.now());
        if (pubRes.ok) {
          const pubData = await pubRes.json();
          if (pubData.banner) {
            setTestRotatedBanner(pubData.banner);
          }
        }
      }
    } catch (err) {
      console.warn('[Admin] Failed to load pricing banners pool', err);
    } finally {
      setIsLoadingPricingBanner(false);
    }
  };

  const handleAddPricingBannerToPool = async () => {
    if (!newBannerPreview) {
      showNotification('कृपया पहले कोई फोटो या वीडियो चुनें!', 'error');
      return;
    }
    setIsSavingPricingBanner(true);
    try {
      const res = await fetch('/api/admin/pricing-banners', {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify({
          mediaBase64: newBannerPreview.startsWith('data:') ? newBannerPreview : undefined,
          mediaUrl: !newBannerPreview.startsWith('data:') ? newBannerPreview : undefined,
          mediaType: newBannerType,
          posterBase64: newBannerPosterPreview.startsWith('data:') ? newBannerPosterPreview : undefined,
          posterUrl: !newBannerPosterPreview.startsWith('data:') ? newBannerPosterPreview : undefined,
          altText: newBannerAltText || 'AI Prime Studio VIP Pass',
          isEnabled: true
        })
      });

      const resData = await res.json().catch(() => ({}));
      if (res.ok && resData.success) {
        showNotification('नया बैनर सफलतापूर्वक पूल में जोड़ा गया! ग्राहक के हर रिफ्रेश पर यह रोटेट होगा।');
        setNewBannerPreview('');
        setNewBannerPosterPreview('');
        if (Array.isArray(resData.pool)) {
          setPricingBannerPool(resData.pool);
          setTestRotatedBanner(resData.item);
        } else {
          fetchPricingBannerConfig();
        }
      } else {
        const errMsg = resData.error || (res.status === 403 ? 'Admin authorization failed. Please enter your ADMIN_SECRET_KEY.' : `Failed to add banner (HTTP ${res.status})`);
        showNotification(errMsg, 'error');
        if (res.status === 403) {
          setIsAdminVerified(false);
          setShowKeyInput(true);
        }
      }
    } catch (err: any) {
      showNotification(err.message || 'बैनर अपलोड करते समय नेटवर्क त्रुटि हुई', 'error');
    } finally {
      setIsSavingPricingBanner(false);
    }
  };

  const handleToggleBannerStatus = async (bannerId: string, currentStatus: boolean) => {
    try {
      const res = await fetch(`/api/admin/pricing-banners/${bannerId}/toggle`, {
        method: 'PUT',
        headers: getAdminHeaders(),
        body: JSON.stringify({ isEnabled: !currentStatus })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        showNotification(!currentStatus ? 'बैनर सक्रिय (Active) कर दिया गया है' : 'बैनर निष्क्रिय (Disabled) कर दिया गया है');
        if (Array.isArray(data.pool)) {
          setPricingBannerPool(data.pool);
        } else {
          fetchPricingBannerConfig();
        }
      } else {
        showNotification(data.error || 'स्थिति बदलने में विफल', 'error');
      }
    } catch (err: any) {
      showNotification(err.message || 'त्रुटि हुई', 'error');
    }
  };

  const handleDeleteBannerFromPool = async (bannerId: string) => {
    if (!window.confirm('क्या आप वाकई इस बैनर को पूल से हटाना चाहते हैं?')) return;
    try {
      const res = await fetch(`/api/admin/pricing-banners/${bannerId}`, {
        method: 'DELETE',
        headers: getAdminHeaders()
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        showNotification('बैनर को पूल से सफलतापूर्वक हटा दिया गया');
        if (Array.isArray(data.pool)) {
          setPricingBannerPool(data.pool);
          if (testRotatedBanner?.id === bannerId) {
            setTestRotatedBanner(data.pool[0] || null);
          }
        } else {
          fetchPricingBannerConfig();
        }
      } else {
        showNotification(data.error || 'बैनर हटाने में विफल', 'error');
      }
    } catch (err: any) {
      showNotification(err.message || 'त्रुटि हुई', 'error');
    }
  };

  const handleTestRandomRefresh = async () => {
    setIsTestingRefresh(true);
    try {
      const res = await fetch(`/api/pricing-banner?t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.banner) {
          setTestRotatedBanner(data.banner);
          showNotification('🎲 रिफ्रेश टेस्ट सफल: ग्राहक को यह बैनर दिखाई देगा!');
        }
      }
    } catch (err) {
      console.warn('[Admin] Test refresh failed', err);
    } finally {
      setIsTestingRefresh(false);
    }
  };

  // --- MEDIA FILE HANDLERS (Independent Cover, Preview, and Sample Result) ---
  const handleTplFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isVideo = file.type.startsWith('video');
    const detected = isVideo ? 'video' : 'photo';
    setTplDetectedType(detected);
    if (!editingTemplate) {
      if (!recipePrompt || recipePrompt === DEFAULT_PHOTO_RECIPE_PROMPT || recipePrompt === DEFAULT_VIDEO_RECIPE_PROMPT) {
        setRecipePrompt(detected === 'photo' ? DEFAULT_PHOTO_RECIPE_PROMPT : DEFAULT_VIDEO_RECIPE_PROMPT);
      }
    }
    const reader = new FileReader();
    reader.onload = () => {
      setTplMediaPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleCoverFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setTplCoverPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSampleFaceFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setTplSampleFaceThumbnail(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSampleBeforeFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setTplSampleBefore(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSampleResultFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setTplSampleResultPreview(dataUrl);
      // Auto-reuse AFTER sample as Cover Photo so Admin doesn't have to upload it twice!
      if (!showCustomCoverOverride) {
        setTplCoverPreview(dataUrl);
      }
      if (tplDetectedType === 'photo') {
        setTplMediaPreview(dataUrl);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDrivingFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setRecipeDrivingVideoPreview(reader.result as string);
      setRecipeDrivingVideoUrl(''); // clear raw url since uploading fresh file
    };
    reader.readAsDataURL(file);
  };

  // --- PROVIDER CATALOG HANDLERS ---
  const fetchProviderCatalog = async () => {
    setCatalogLoading(true);
    try {
      const res = await fetch('/api/admin/provider-catalog', {
        headers: getAdminHeaders()
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.items)) {
        setCatalogItems(data.items);
        setCatalogSource(data.source || 'official_higgsfield_api');
        showNotification(`Catalog refreshed: ${data.items.length} official models available`);
      } else {
        showNotification('Failed to load catalog: ' + (data.error || 'Unknown error'), 'error');
      }
    } catch (err: any) {
      showNotification('Network error loading catalog', 'error');
    } finally {
      setCatalogLoading(false);
    }
  };

  const handleImportCatalogItem = (item: any) => {
    setEditingTemplate(null);
    setTplTitle(item.name || item.model);
    setTplDescription(item.description || `Official ${item.provider} ${item.name}`);
    setTplCategory(item.category || 'Trending');
    setTplAspectRatio(item.aspectRatio || '9:16');
    setTplCostUsd(item.providerCostUsd || 0.25);
    setTplDetectedType(item.outputType === 'video' ? 'video' : 'photo');
    setTplInputType(item.inputType || 'IMAGE_OR_VIDEO');

    setRecipeProvider(item.provider);
    setRecipeModel(item.model);
    setRecipeWorkflow(item.recipe?.workflow || 'neural-cinematic');
    setRecipePrompt(
      item.recipe?.prompt ||
      `${item.name}. Official provider preset: ${item.model}. Preserve identity & high aesthetic production quality.`
    );
    setRecipePreset('custom');

    // Reset media assets for user review upload
    setTplCoverPreview('');
    setTplMediaPreview('');
    setTplSampleResultPreview('');

    if (item.manualRecipeRequired) {
      setImportNotice(
        '⚠️ Manual Recipe Required: The provider catalog did not supply complete executable prompts. Please review and customize the prompt and parameters below before publishing.'
      );
    } else {
      setImportNotice(null);
    }

    setActiveTab('templates');
    setSubTab('add');
    showNotification(`Imported ${item.name}! Add preview media & review before publishing live.`);
  };

  // --- RECIPE JSON UPLOAD & PASTE HANDLERS ---
  const applyRecipeJsonObject = (recipeObj: any) => {
    if (!recipeObj || typeof recipeObj !== 'object') {
      showNotification('Recipe must be a valid JSON object', 'error');
      return;
    }
    const r = recipeObj.recipe || recipeObj;
    if (r.provider) setRecipeProvider(r.provider);
    if (r.model) setRecipeModel(r.model);
    if (r.workflow) setRecipeWorkflow(r.workflow);
    if (r.prompt) setRecipePrompt(r.prompt);
    if (r.inputType) setTplInputType(r.inputType);
    if (r.drivingVideoUrl) setRecipeDrivingVideoUrl(r.drivingVideoUrl);
    if (recipeObj.title && !tplTitle) setTplTitle(recipeObj.title);
    if (recipeObj.description && !tplDescription) setTplDescription(recipeObj.description);
    if (recipeObj.category) setTplCategory(recipeObj.category);
    if (recipeObj.aspectRatio) setTplAspectRatio(recipeObj.aspectRatio);
    if (recipeObj.providerCostUsd) setTplCostUsd(Number(recipeObj.providerCostUsd));
    setRecipePreset('custom');
    showNotification('Recipe JSON validated and applied successfully!');
  };

  const handleUploadRecipeJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        applyRecipeJsonObject(parsed);
      } catch (err: any) {
        showNotification('Invalid Recipe JSON: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleApplyPastedJson = () => {
    setPasteJsonError(null);
    if (!pasteJsonText.trim()) {
      setPasteJsonError('Please paste JSON text');
      return;
    }
    try {
      const parsed = JSON.parse(pasteJsonText.trim());
      applyRecipeJsonObject(parsed);
      setShowPasteJsonModal(false);
      setPasteJsonText('');
    } catch (err: any) {
      setPasteJsonError('Invalid JSON format: ' + err.message);
    }
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
    setTplCoverPreview(tpl.sampleResult || tpl.sampleAfter || tpl.cover || '');
    setTplMediaPreview(tpl.preview || tpl.sampleResult || tpl.sampleAfter || tpl.cover || '');
    setTplSampleResultPreview(tpl.sampleResult || tpl.sampleAfter || '');
    setTplSampleFaceThumbnail(tpl.sampleFaceThumbnail || '');
    setTplSampleBefore(tpl.sampleBefore || '');
    setTplDetectedType(tpl.type);
    setTplInputType(tpl.inputType || (tpl.type === 'video' ? 'IMAGE_OR_VIDEO' : 'IMAGE_ONLY'));
    setImportNotice(null);

    if (tpl.recipe) {
      setRecipeProvider(tpl.recipe.provider || (tpl.type === 'video' ? 'google_veo' : 'gemini'));
      setRecipeModel(tpl.recipe.model || (tpl.type === 'video' ? 'gemini-omni-1.1-flash' : 'gemini-3.1-flash-image'));
      setRecipeWorkflow(tpl.recipe.workflow || tpl.workflow);
      setRecipePrompt(tpl.recipe.prompt || '');
      setRecipeDrivingVideoUrl(tpl.recipe.drivingVideoUrl || tpl.drivingVideoUrl || '');
    } else {
      setRecipeProvider(tpl.type === 'video' ? 'google_veo' : 'gemini');
      setRecipeModel(tpl.model || (tpl.type === 'video' ? 'gemini-omni-1.1-flash' : 'gemini-3.1-flash-image'));
      setRecipeWorkflow(tpl.workflow);
      setRecipePrompt(`${tpl.title}. Aesthetic workflow: ${tpl.workflow}.`);
      setRecipeDrivingVideoUrl(tpl.drivingVideoUrl || '');
    }

    setRecipeDrivingVideoPreview('');
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

    const recipePayload = {
      version: '1.0',
      inputType: tplInputType,
      provider: recipeProvider,
      model: recipeModel,
      engine: 'AI_GENERATION',
      prompt: recipePrompt.trim(),
      workflow: recipeWorkflow,
      aspectRatio: tplAspectRatio,
      duration: tplDetectedType === 'video' ? 5 : undefined,
      drivingVideoUrl: recipeDrivingVideoUrl.trim() || undefined,
      sampleFaceThumbnail: tplSampleFaceThumbnail || undefined,
      sampleBefore: tplSampleBefore || undefined,
      sampleResult: tplSampleResultPreview || undefined
    };

    try {
      if (editingTemplate) {
        // UPDATE existing
        const updateBody: any = {
          title: tplTitle.trim(),
          description: tplDescription.trim(),
          category: tplCategory,
          aspectRatio: tplAspectRatio,
          isFeatured: tplIsFeatured,
          isActive: tplIsActive,
          badge: tplBadge || undefined,
          tags,
          type: tplDetectedType,
          inputType: tplInputType,
          workflow: recipeWorkflow,
          model: recipeModel,
          engine: 'AI_GENERATION',
          recipe: recipePayload,
          providerCostUsd: Number(tplCostUsd) || 0.25
        };

        if (tplSampleFaceThumbnail.startsWith('data:')) {
          updateBody.sampleFaceThumbnailBase64 = tplSampleFaceThumbnail;
        } else if (tplSampleFaceThumbnail) {
          updateBody.sampleFaceThumbnail = tplSampleFaceThumbnail;
        }

        if (tplSampleBefore.startsWith('data:')) {
          updateBody.sampleBeforeBase64 = tplSampleBefore;
        } else if (tplSampleBefore) {
          updateBody.sampleBefore = tplSampleBefore;
        }

        const isNewAfterProvided = tplSampleResultPreview.startsWith('data:') || (editingTemplate && tplSampleResultPreview !== (editingTemplate.sampleResult || editingTemplate.sampleAfter));
        if (tplSampleResultPreview.startsWith('data:')) {
          updateBody.sampleResultBase64 = tplSampleResultPreview;
          // Unconditionally update Cover with newly uploaded AFTER photo
          updateBody.coverBase64 = tplSampleResultPreview;
        } else if (tplSampleResultPreview) {
          updateBody.sampleResult = tplSampleResultPreview;
          updateBody.sampleAfter = tplSampleResultPreview;
          if (isNewAfterProvided) {
            updateBody.cover = tplSampleResultPreview;
          }
        }

        if (!isNewAfterProvided) {
          if (tplCoverPreview.startsWith('data:')) {
            updateBody.coverBase64 = tplCoverPreview;
          } else if (tplCoverPreview) {
            updateBody.cover = tplCoverPreview;
          } else if (tplSampleResultPreview) {
            updateBody.cover = tplSampleResultPreview;
          }
        }

        if (tplMediaPreview.startsWith('data:')) {
          updateBody.mediaBase64 = tplMediaPreview;
        } else if (tplMediaPreview) {
          updateBody.preview = tplMediaPreview;
        }

        if (recipeDrivingVideoPreview.startsWith('data:')) {
          updateBody.drivingVideoBase64 = recipeDrivingVideoPreview;
        } else if (recipeDrivingVideoUrl.trim()) {
          updateBody.drivingVideoUrl = recipeDrivingVideoUrl.trim();
        }

        const res = await fetch(`/api/admin/templates/${editingTemplate.id}`, {
          method: 'PUT',
          headers: getAdminHeaders(),
          body: JSON.stringify(updateBody)
        });

        if (res.ok) {
          showNotification('Template updated successfully!');
          await Promise.all([fetchAdminTemplates(), refreshTemplates()]);
          setSubTab('list');
          setEditingTemplate(null);
        } else {
          const errData = await res.json().catch(() => null);
          const errMsg = errData?.error || (res.status === 403 ? 'Admin authorization failed. Please enter your ADMIN_SECRET_KEY.' : `Failed to update template (HTTP ${res.status})`);
          showNotification(errMsg, 'error');
          if (res.status === 403) {
            setIsAdminVerified(false);
            setShowKeyInput(true);
          }
        }
      } else {
        // CREATE new
        const effectiveCover = tplCoverPreview || tplSampleResultPreview || tplMediaPreview;
        if (!effectiveCover && !tplSampleResultPreview) {
          showNotification('Please upload an AFTER sample result or cover photo', 'error');
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
            inputType: tplInputType,
            mediaBase64: tplMediaPreview || effectiveCover,
            coverBase64: effectiveCover.startsWith('data:') ? effectiveCover : undefined,
            cover: !effectiveCover.startsWith('data:') && effectiveCover ? effectiveCover : undefined,
            sampleFaceThumbnailBase64: tplSampleFaceThumbnail.startsWith('data:') ? tplSampleFaceThumbnail : undefined,
            sampleFaceThumbnail: !tplSampleFaceThumbnail.startsWith('data:') && tplSampleFaceThumbnail ? tplSampleFaceThumbnail : undefined,
            sampleBeforeBase64: tplSampleBefore.startsWith('data:') ? tplSampleBefore : undefined,
            sampleBefore: !tplSampleBefore.startsWith('data:') && tplSampleBefore ? tplSampleBefore : undefined,
            sampleResultBase64: tplSampleResultPreview.startsWith('data:') ? tplSampleResultPreview : undefined,
            sampleResult: !tplSampleResultPreview.startsWith('data:') && tplSampleResultPreview ? tplSampleResultPreview : undefined,
            drivingVideoUrl: recipeDrivingVideoUrl.trim() || undefined,
            drivingVideoBase64: recipeDrivingVideoPreview.startsWith('data:') ? recipeDrivingVideoPreview : undefined,
            workflow: recipeWorkflow,
            model: recipeModel,
            engine: 'AI_GENERATION',
            recipe: recipePayload,
            providerCostUsd: Number(tplCostUsd) || 0.25
          })
        });

        if (res.ok) {
          showNotification('Template published live to catalog!');
          await Promise.all([fetchAdminTemplates(), refreshTemplates()]);
          setSubTab('list');
          setTplTitle('');
          setTplMediaPreview('');
          setTplCoverPreview('');
          setTplSampleResultPreview('');
          setTplSampleFaceThumbnail('');
          setTplSampleBefore('');
          setRecipeDrivingVideoPreview('');
          setRecipeDrivingVideoUrl('');
          setImportNotice(null);
        } else {
          const errData = await res.json().catch(() => null);
          const errMsg = errData?.error || (res.status === 403 ? 'Admin authorization failed. Please enter your ADMIN_SECRET_KEY.' : `Failed to create template (HTTP ${res.status})`);
          showNotification(errMsg, 'error');
          if (res.status === 403) {
            setIsAdminVerified(false);
            setShowKeyInput(true);
          }
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
        await Promise.all([fetchAdminTemplates(), refreshTemplates()]);
      } else {
        showNotification('Failed to delete template', 'error');
      }
    } catch (err: any) {
      showNotification(err.message, 'error');
    }
  };

  const handleScanAndRecoverR2 = async () => {
    setIsRecoveringR2(true);
    setRecoveryNotice(null);
    try {
      const res = await fetch('/api/admin/templates/recover-r2', {
        method: 'POST',
        headers: getAdminHeaders()
      });
      const data = await res.json();
      if (data.success) {
        if (data.recoveredCount > 0) {
          const msg = `🎉 Found ${data.scanned} R2 assets: Restored ${data.recoveredCount} missing templates back to catalog!`;
          setRecoveryNotice(msg);
          showNotification(msg, 'success');
        } else {
          const msg = `✅ R2 Audit Clean: Scanned ${data.scanned} assets. All catalog templates are 100% durable in Firestore.`;
          setRecoveryNotice(msg);
          showNotification(msg, 'success');
        }
        await Promise.all([fetchAdminTemplates(), refreshTemplates()]);
      } else {
        const errMsg = `R2 Scan failed: ${data.error || 'Unknown error'}`;
        setRecoveryNotice(errMsg);
        showNotification(errMsg, 'error');
      }
    } catch (err: any) {
      const errMsg = `Failed to contact recovery service: ${err.message}`;
      setRecoveryNotice(errMsg);
      showNotification(errMsg, 'error');
    } finally {
      setIsRecoveringR2(false);
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
      await Promise.all([fetchAdminTemplates(), refreshTemplates()]);
    } catch (err: any) {
      showNotification(err.message, 'error');
    }
  };

  // --- BULK PHOTO TEMPLATE HANDLERS ---
  const handleBulkCategoryChange = (cat: string) => {
    setBulkCategory(cat);
    const effectivePrompt = categoryPromptsMap[cat] || DEFAULT_CATEGORY_PROMPTS[cat] || DEFAULT_CATEGORY_PROMPTS['Trending'];
    setBulkMasterPrompt(effectivePrompt);

    if (cat === 'Devotional') setBulkTags('Devotional, Bhakti, AI Photo, Spiritual');
    else if (cat === 'Trending') setBulkTags('Trending, Viral, AI Photo, Portrait');
    else if (cat === 'Royal Swag') setBulkTags('Royal, Swag, Maharaja, AI Photo');
    else if (cat === 'Couple') setBulkTags('Couple, Romance, Photoshoot, AI Photo');
    else if (cat === 'Retro 80s') setBulkTags('Retro, 80s, Vintage, Bollywood, AI Photo');
    else setBulkTags(`${cat}, AI Photo, Style Reference`);
  };

  const handleSaveCategoryPrompt = async () => {
    const effectiveCat = (bulkCategory === 'Custom' ? bulkCategoryCustom.trim() : bulkCategory) || 'Devotional';
    if (!effectiveCat) {
      showNotification('Please specify a category', 'error');
      return;
    }
    if (!bulkMasterPrompt.trim()) {
      showNotification('Prompt cannot be empty', 'error');
      return;
    }
    try {
      const res = await fetch('/api/admin/categories/prompts', {
        method: 'PUT',
        headers: getAdminHeaders(),
        body: JSON.stringify({ category: effectiveCat, prompt: bulkMasterPrompt })
      });
      if (res.ok) {
        setCategoryPromptsMap((prev) => ({ ...prev, [effectiveCat]: bulkMasterPrompt.trim() }));
        showNotification(`Shared Front Message saved for category "${effectiveCat}"!`);
      } else {
        showNotification('Failed to update category prompt', 'error');
      }
    } catch (err: any) {
      showNotification(err.message || 'Failed to update category prompt', 'error');
    }
  };

  const handleBulkFilesSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const newItems: BulkTemplateItem[] = files
      .filter((f) => f.type.startsWith('image/'))
      .map((f, idx) => {
        const cleanName = f.name
          .replace(/\.[^/.]+$/, '')
          .replace(/[_-]+/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        const formattedTitle = cleanName
          ? cleanName.charAt(0).toUpperCase() + cleanName.slice(1)
          : `${bulkCategory} Style ${bulkItems.length + idx + 1}`;

        return {
          id: `bulk_${Date.now()}_${Math.random().toString(36).substr(2, 6)}_${idx}`,
          file: f,
          previewUrl: URL.createObjectURL(f),
          title: formattedTitle,
          status: 'pending'
        };
      });

    setBulkItems((prev) => [...prev, ...newItems]);
    setBulkSummary(null);
    e.target.value = '';
  };

  const handleUpdateBulkTitle = (id: string, newTitle: string) => {
    setBulkItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, title: newTitle } : item))
    );
  };

  const handleRemoveBulkItem = (id: string) => {
    setBulkItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleClearBulkItems = () => {
    setBulkItems([]);
    setBulkSummary(null);
  };

  const handleExecuteBulkUpload = async () => {
    const pendingItems = bulkItems.filter((i) => i.status !== 'success');
    if (pendingItems.length === 0) {
      showNotification('No pending templates to upload', 'error');
      return;
    }

    const effectiveCat = (bulkCategory === 'Custom' ? bulkCategoryCustom.trim() : bulkCategory) || 'Devotional';
    if (!effectiveCat) {
      showNotification('Please specify a category', 'error');
      return;
    }

    setIsBulkUploading(true);
    let successCount = bulkItems.filter((i) => i.status === 'success').length;
    let failCount = 0;
    const totalCount = bulkItems.length;

    setBulkProgress({
      current: successCount,
      total: totalCount,
      successCount,
      failCount: 0
    });

    const headers = getAdminHeaders();

    // 1. First persist the shared category prompt centrally on the server. Stop if it fails!
    try {
      const promptRes = await fetch('/api/admin/categories/prompts', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ category: effectiveCat, prompt: bulkMasterPrompt })
      });
      if (!promptRes.ok) {
        const errJson = await promptRes.json().catch(() => null);
        throw new Error(errJson?.error || `Server responded with HTTP ${promptRes.status}`);
      }
      setCategoryPromptsMap((prev) => ({ ...prev, [effectiveCat]: bulkMasterPrompt.trim() }));
    } catch (saveErr: any) {
      setIsBulkUploading(false);
      showNotification(`Category prompt failed to save: ${saveErr.message}. Bulk publication stopped.`, 'error');
      return;
    }

    // 2. Process each item sequentially (persisting media to storage & creating template record)
    for (let i = 0; i < bulkItems.length; i++) {
      const item = bulkItems[i];
      if (item.status === 'success') continue;

      setBulkItems((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, status: 'uploading', error: undefined } : it))
      );

      try {
        const base64Data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(item.file);
        });

        // Upload media to storage for persistent URL (never store large raw base64 permanently)
        const upRes = await fetch('/api/admin/upload-media', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            mediaBase64: base64Data,
            filename: `tpl_${effectiveCat.toLowerCase().replace(/[^a-z0-9]/g, '_')}`
          })
        });

        const upData = await upRes.json().catch(() => null);
        if (!upRes.ok || !upData?.url) {
          throw new Error(upData?.error || `Upload media failed (HTTP ${upRes.status})`);
        }
        const persistentUrl = upData.url;

        // Post template with the category's shared prompt & reference image URL
        const tplPayload = {
          title: item.title.trim() || `${effectiveCat} Style ${i + 1}`,
          description: `${effectiveCat} AI Photo Style Template`,
          category: effectiveCat,
          aspectRatio: bulkAspectRatio,
          isFeatured: bulkIsFeatured,
          isActive: bulkIsActive,
          tags: bulkTags.split(',').map((t) => t.trim()).filter(Boolean),
          type: 'photo',
          inputType: 'IMAGE_ONLY',
          mediaBase64: persistentUrl,
          coverBase64: persistentUrl,
          referenceImageUrl: persistentUrl,
          referenceImageBase64: persistentUrl,
          workflow: 'gemini-photo-style',
          model: 'gemini-3.1-flash-image',
          engine: 'AI_GENERATION',
          providerCostUsd: Number(bulkCostUsd) || 0.08,
          recipe: {
            version: '1.0',
            inputType: 'IMAGE_ONLY',
            provider: 'gemini',
            model: 'gemini-3.1-flash-image',
            engine: 'AI_GENERATION',
            prompt: bulkMasterPrompt.trim(),
            workflow: 'gemini-photo-style',
            aspectRatio: bulkAspectRatio,
            referenceAssets: [persistentUrl],
            referenceImageUrl: persistentUrl
          }
        };

        const createRes = await fetch('/api/admin/templates', {
          method: 'POST',
          headers,
          body: JSON.stringify(tplPayload)
        });

        const createData = await createRes.json().catch(() => null);
        if (!createRes.ok || !createData?.template) {
          throw new Error(createData?.error || `Failed to create template (HTTP ${createRes.status})`);
        }

        successCount++;
        setBulkItems((prev) =>
          prev.map((it) =>
            it.id === item.id
              ? { ...it, status: 'success', createdTemplateId: createData.template.id }
              : it
          )
        );
      } catch (err: any) {
        failCount++;
        setBulkItems((prev) =>
          prev.map((it) =>
            it.id === item.id ? { ...it, status: 'failed', error: err.message || 'Failed' } : it
          )
        );
      }

      setBulkProgress({
        current: successCount + failCount,
        total: totalCount,
        successCount,
        failCount
      });
    }

    setIsBulkUploading(false);
    setBulkSummary({
      completed: true,
      total: totalCount,
      successCount,
      failCount
    });

    await Promise.all([fetchAdminTemplates(), refreshTemplates()]);
    if (failCount === 0) {
      showNotification(`All ${successCount} photo templates published successfully to ${effectiveCat}!`);
    } else {
      showNotification(
        `${successCount} published, ${failCount} failed. You can retry failed items.`,
        'error'
      );
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
        const uploadData = await uploadRes.json().catch(() => null);
        if (!uploadRes.ok || !uploadData?.url) {
          const errMsg = uploadData?.error || (uploadRes.status === 403 ? 'Admin authorization failed. Please enter your ADMIN_SECRET_KEY.' : `Media upload failed (HTTP ${uploadRes.status})`);
          if (uploadRes.status === 403) {
            setIsAdminVerified(false);
            setShowKeyInput(true);
          }
          throw new Error(errMsg);
        }
        mediaUrl = uploadData.url;
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
        const errData = await res.json().catch(() => null);
        const errMsg = errData?.error || (res.status === 403 ? 'Admin authorization failed. Please enter your ADMIN_SECRET_KEY.' : `Failed to update banners (HTTP ${res.status})`);
        if (res.status === 403) {
          setIsAdminVerified(false);
          setShowKeyInput(true);
        }
        showNotification(errMsg, 'error');
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
      showNotification('Please select a video from phone gallery or enter URL', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      let finalVideoUrl = demoVideoPreview.startsWith('http') ? demoVideoPreview : currentDemoVideoUrl;

      if (demoVideoPreview.startsWith('data:')) {
        const uploadRes = await fetch('/api/admin/upload-media', {
          method: 'POST',
          headers: getAdminHeaders(),
          body: JSON.stringify({ mediaBase64: demoVideoPreview, filename: 'demo_faceswap' })
        });

        const uploadData = await uploadRes.json().catch(() => null);
        if (!uploadRes.ok || !uploadData?.url) {
          const errMsg = uploadData?.error || (uploadRes.status === 403 ? 'Admin authorization failed. Please enter your ADMIN_SECRET_KEY.' : `Upload failed with HTTP ${uploadRes.status}`);
          if (uploadRes.status === 403) {
            setIsAdminVerified(false);
            setShowKeyInput(true);
          }
          throw new Error(errMsg);
        }
        finalVideoUrl = uploadData.url;
      }

      const res = await fetch('/api/admin/faceswap/config', {
        method: 'PUT',
        headers: getAdminHeaders(),
        body: JSON.stringify({ demoVideoUrl: finalVideoUrl })
      });

      const resData = await res.json().catch(() => null);
      if (res.ok && resData?.success) {
        setCurrentDemoVideoUrl(finalVideoUrl);
        setDemoVideoPreview('');
        showNotification('Face Swap Demo Video updated! Home is immediately live with this video.');
      } else {
        const errMsg = resData?.error || (res.status === 403 ? 'Admin authorization failed. Please enter your ADMIN_SECRET_KEY.' : `Failed to update demo video (HTTP ${res.status})`);
        if (res.status === 403) {
          setIsAdminVerified(false);
          setShowKeyInput(true);
        }
        throw new Error(errMsg);
      }
    } catch (err: any) {
      console.error('[Demo Save Error]:', err);
      showNotification(err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ==========================================
  // FACE SWAP SCENES ADMIN HANDLERS
  // ==========================================
  const fetchAdminFaceSwapScenes = async (refresh: boolean = false) => {
    try {
      const url = refresh ? '/api/admin/faceswap/scenes?refresh=true' : '/api/admin/faceswap/scenes';
      const res = await fetch(url, { headers: getAdminHeaders() });
      if (res.ok) {
        const data = await res.json();
        if (data.scenes && Array.isArray(data.scenes)) {
          setAdminFaceSwapScenes(data.scenes);
          return;
        }
      }
    } catch (err) {
      console.warn('[Admin] Could not fetch admin scenes:', err);
    }
    setAdminFaceSwapScenes(faceSwapScenes);
  };

  const handleSelectSampleFace = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDetailedError(null);

    // 1. MIME Type check
    const validImageTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const hasImageExt = Boolean(file.name.match(/\.(jpe?g|png|webp)$/i));
    if (!file.type.startsWith('image/') && !hasImageExt) {
      setDetailedError({
        stage: 'Media Validation',
        stepNumber: 'Asset 1: Sample Face Photo',
        fileName: file.name,
        fileType: file.type || 'unknown',
        fileSizeFormatted: formatBytes(file.size),
        probableCause: 'Selected file is not an image (JPEG, PNG, or WEBP).',
        nextStep: 'Please select a clear portrait image in JPG, PNG, or WEBP format.'
      });
      e.target.value = '';
      return;
    }

    // 2. File size check (15MB limit)
    const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
    if (file.size > MAX_PHOTO_BYTES) {
      setDetailedError({
        stage: 'Media Validation',
        stepNumber: 'Asset 1: Sample Face Photo',
        fileName: file.name,
        fileType: file.type,
        fileSizeFormatted: formatBytes(file.size),
        probableCause: `Image size (${formatBytes(file.size)}) exceeds the maximum allowed 15MB limit.`,
        nextStep: 'Please compress the photo or choose an image under 15MB.'
      });
      e.target.value = '';
      return;
    }

    setSceneSampleFaceName(file.name);
    setSceneSampleFaceFile({ name: file.name, size: file.size, type: file.type || 'image/jpeg' });
    const reader = new FileReader();
    reader.onload = () => {
      setSceneSampleFace(reader.result as string);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSelectSourceVideo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDetailedError(null);

    // 1. MIME type validation
    const hasVideoExt = Boolean(file.name.match(/\.(mp4|mov|webm)$/i));
    if (!file.type.startsWith('video/') && !hasVideoExt) {
      setDetailedError({
        stage: 'Media Validation',
        stepNumber: 'Asset 2: Original Video',
        fileName: file.name,
        fileType: file.type || 'unknown',
        fileSizeFormatted: formatBytes(file.size),
        probableCause: 'Selected file is not a supported video format.',
        nextStep: 'Please select an MP4, MOV, or WEBM video file.'
      });
      e.target.value = '';
      return;
    }

    // 2. File size validation (50MB limit)
    const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
    if (file.size > MAX_VIDEO_BYTES) {
      setDetailedError({
        stage: 'Media Validation',
        stepNumber: 'Asset 2: Original Video',
        fileName: file.name,
        fileType: file.type || 'video/*',
        fileSizeFormatted: formatBytes(file.size),
        probableCause: `Video size (${formatBytes(file.size)}) exceeds the 50MB upload limit.`,
        nextStep: 'Please compress the video or trim it to a short 5-15 second clip.'
      });
      e.target.value = '';
      return;
    }

    // 3. Duration check
    try {
      const vidObj = document.createElement('video');
      vidObj.preload = 'metadata';
      const objUrl = URL.createObjectURL(file);
      vidObj.onloadedmetadata = () => {
        URL.revokeObjectURL(objUrl);
        const dur = Math.round(vidObj.duration);
        if (dur > 60) {
          setDetailedError({
            stage: 'Media Validation',
            stepNumber: 'Asset 2: Original Video',
            fileName: file.name,
            fileType: file.type,
            fileSizeFormatted: formatBytes(file.size),
            probableCause: `Video duration (${dur}s) is longer than 60s. Template scenes should be short loops (5-15s).`,
            nextStep: 'Please trim your driving video to a short 5-15 second reel loop.'
          });
        } else {
          setSceneDurationSeconds(Math.min(15, Math.max(4, dur)));
        }
      };
      vidObj.src = objUrl;
    } catch {}

    setSceneSourceVideoName(file.name);
    setSceneSourceVideoFile({ name: file.name, size: file.size, type: file.type || 'video/mp4' });
    const reader = new FileReader();
    reader.onload = () => {
      setSceneSourceVideo(reader.result as string);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSelectResultVideo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDetailedError(null);

    // 1. MIME type validation
    const hasVideoExt = Boolean(file.name.match(/\.(mp4|mov|webm)$/i));
    if (!file.type.startsWith('video/') && !hasVideoExt) {
      setDetailedError({
        stage: 'Media Validation',
        stepNumber: 'Asset 3: Swapped Video',
        fileName: file.name,
        fileType: file.type || 'unknown',
        fileSizeFormatted: formatBytes(file.size),
        probableCause: 'Selected file is not an MP4, MOV, or WEBM video.',
        nextStep: 'Please select an MP4, MOV, or WEBM video file.'
      });
      e.target.value = '';
      return;
    }

    // 2. File size validation (50MB limit)
    const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
    if (file.size > MAX_VIDEO_BYTES) {
      setDetailedError({
        stage: 'Media Validation',
        stepNumber: 'Asset 3: Swapped Video',
        fileName: file.name,
        fileType: file.type || 'video/*',
        fileSizeFormatted: formatBytes(file.size),
        probableCause: `Video size (${formatBytes(file.size)}) exceeds the 50MB upload limit.`,
        nextStep: 'Please compress the result video or trim it to 5-15 seconds.'
      });
      e.target.value = '';
      return;
    }

    setSceneResultVideoName(file.name);
    setSceneResultVideoFile({ name: file.name, size: file.size, type: file.type || 'video/mp4' });
    const reader = new FileReader();
    reader.onload = () => {
      setSceneResultVideo(reader.result as string);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleNewScene = () => {
    setEditingScene(null);
    setSceneTitle('');
    setSceneDescription('');
    setSceneCategory('Viral & Trending');
    setSceneTags('Face Swap, Viral, Reels');
    setSceneCreditCost(45);
    setSceneDurationSeconds(8);
    setSceneAspectRatio('9:16');
    setSceneIsActive(true);
    setSceneStatus('published');
    setSceneIsFeatured(false);
    setSceneOrder(0);

    setSceneSampleFace('');
    setSceneSampleFaceName('');
    setSceneSourceVideo('');
    setSceneSourceVideoName('');
    setSceneResultVideo('');
    setSceneResultVideoName('');
    setSceneMasterRecipePrompt(DEFAULT_MOTION_TRANSFER_RECIPE_PROMPT);

    setFaceSwapSubTab('add');
  };

  const handleEditScene = (scene: FaceSwapScene) => {
    setEditingScene(scene);
    setSceneTitle(scene.title || '');
    setSceneDescription(scene.description || '');
    setSceneCategory(scene.category || 'Viral & Trending');
    setSceneTags(Array.isArray(scene.tags) ? scene.tags.join(', ') : 'Face Swap, Viral');
    setSceneCreditCost(scene.creditCost || 45);
    setSceneDurationSeconds(scene.durationSeconds || 8);
    setSceneAspectRatio(scene.aspectRatio || '9:16');
    setSceneIsActive(scene.isActive !== false);
    setSceneStatus(scene.status || 'published');
    setSceneIsFeatured(Boolean(scene.isFeatured));
    setSceneOrder(scene.order || 0);

    setSceneSampleFace(scene.sampleFace || '');
    setSceneSampleFaceName(scene.sampleFace ? 'Current sample face' : '');
    setSceneSourceVideo(scene.sourceVideoPreview || '');
    setSceneSourceVideoName(scene.sourceVideoPreview ? 'Current original video' : '');
    setSceneResultVideo(scene.resultVideoPreview || '');
    setSceneResultVideoName(scene.resultVideoPreview ? 'Current swapped video' : '');
    setSceneMasterRecipePrompt(scene.masterRecipePrompt || '');

    setFaceSwapSubTab('edit');
  };

  const handleToggleSceneActive = async (scene: FaceSwapScene) => {
    try {
      const headers = getAdminHeaders();
      const res = await fetch(`/api/admin/faceswap/scenes/${scene.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ isActive: !scene.isActive })
      });
      if (res.ok) {
        showNotification(`Scene "${scene.title}" ${!scene.isActive ? 'activated' : 'deactivated'}`);
        await fetchAdminFaceSwapScenes();
        if (refreshFaceSwapScenes) await refreshFaceSwapScenes();
      } else {
        showNotification('Failed to toggle active state', 'error');
      }
    } catch {
      showNotification('Failed to toggle active state', 'error');
    }
  };

  const handleToggleSceneStatus = async (scene: FaceSwapScene) => {
    try {
      const headers = getAdminHeaders();
      const nextStatus = scene.status === 'draft' ? 'published' : 'draft';
      const res = await fetch(`/api/admin/faceswap/scenes/${scene.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ status: nextStatus })
      });
      if (res.ok) {
        showNotification(`Scene "${scene.title}" set to ${nextStatus}`);
        await fetchAdminFaceSwapScenes();
        if (refreshFaceSwapScenes) await refreshFaceSwapScenes();
      } else {
        showNotification('Failed to change status', 'error');
      }
    } catch {
      showNotification('Failed to change status', 'error');
    }
  };

  const handleDeleteScene = async (scene: FaceSwapScene) => {
    if (!window.confirm(`Permanently delete Face Swap scene "${scene.title}"?`)) return;
    try {
      const headers = getAdminHeaders();
      const res = await fetch(`/api/admin/faceswap/scenes/${scene.id}`, {
        method: 'DELETE',
        headers
      });
      if (res.ok) {
        showNotification(`Scene "${scene.title}" permanently deleted`);
        await fetchAdminFaceSwapScenes();
        if (refreshFaceSwapScenes) await refreshFaceSwapScenes();
      } else {
        showNotification('Failed to delete scene', 'error');
      }
    } catch {
      showNotification('Failed to delete scene', 'error');
    }
  };

  const handleSaveFaceSwapScene = async (targetStatus: 'published' | 'draft' = 'published') => {
    setDetailedError(null);
    setUploadStageInfo(null);

    if (!sceneTitle.trim()) {
      showNotification('Scene title is required', 'error');
      return;
    }
    if (!sceneSampleFace) {
      showNotification('Sample Face Photo is required (upload from phone or paste URL)', 'error');
      return;
    }
    if (!sceneSourceVideo) {
      showNotification('Original / Before Video is required (upload from phone or paste URL)', 'error');
      return;
    }
    if (!sceneResultVideo) {
      showNotification('Swapped Face / After Video is required (upload from phone or paste URL)', 'error');
      return;
    }

    setIsSubmitting(true);
    let finalSampleFace = sceneSampleFace;
    let finalSourceVideo = sceneSourceVideo;
    let finalResultVideo = sceneResultVideo;
    let lastStorageProvider = 'local';

    try {
      const headers = getAdminHeaders();

      // ========================================================
      // STAGE 1: SAMPLE FACE PHOTO UPLOAD
      // ========================================================
      if (sceneSampleFace.startsWith('data:')) {
        setUploadStageInfo({ step: 'Step 1 of 4', message: 'Uploading Sample Face Photo...' });
        let upRes: Response;
        try {
          upRes = await fetch('/api/admin/upload-media', {
            method: 'POST',
            headers,
            body: JSON.stringify({ mediaBase64: sceneSampleFace, filename: 'sample_face' })
          });
        } catch (netErr: any) {
          setIsSubmitting(false);
          setUploadStageInfo(null);
          setDetailedError({
            stage: 'Photo Upload',
            stepNumber: 'Step 1 of 4',
            errorCode: 'NETWORK_ERROR',
            serverError: netErr.message || 'Connection lost during photo upload',
            fileName: sceneSampleFaceFile?.name || sceneSampleFaceName || 'sample_face.jpg',
            fileType: sceneSampleFaceFile?.type || 'image/jpeg',
            fileSizeFormatted: sceneSampleFaceFile ? formatBytes(sceneSampleFaceFile.size) : 'Unknown size',
            probableCause: 'Network disconnect or server connection timeout.',
            nextStep: 'Check internet connectivity and retry uploading.'
          });
          return;
        }

        const upData = await upRes.json().catch(() => null);
        if (!upRes.ok || !upData?.url) {
          setIsSubmitting(false);
          setUploadStageInfo(null);
          setDetailedError({
            stage: 'Photo Upload',
            stepNumber: 'Step 1 of 4',
            httpStatus: upRes.status,
            errorCode: upData?.code || `HTTP_${upRes.status}`,
            serverError: upData?.error || upRes.statusText || 'Server rejected photo upload',
            fileName: sceneSampleFaceFile?.name || sceneSampleFaceName || 'sample_face.jpg',
            fileType: sceneSampleFaceFile?.type || 'image/jpeg',
            fileSizeFormatted: sceneSampleFaceFile ? formatBytes(sceneSampleFaceFile.size) : 'Unknown size',
            probableCause: upRes.status === 413
              ? 'Photo payload exceeded server limit.'
              : upRes.status === 403
                ? 'Admin secret key authorization failed or expired.'
                : 'Server storage driver error.',
            nextStep: upRes.status === 403
              ? 'Please re-enter your ADMIN_SECRET_KEY in the top right.'
              : 'Try compressing the photo or selecting another image.'
          });
          return; // ABORT: Do not proceed to subsequent uploads
        }
        finalSampleFace = upData.url;
        lastStorageProvider = upData.provider || 'local';
      }

      // ========================================================
      // STAGE 2: ORIGINAL / BEFORE VIDEO UPLOAD
      // ========================================================
      if (sceneSourceVideo.startsWith('data:')) {
        setUploadStageInfo({ step: 'Step 2 of 4', message: 'Uploading Original / Before Video...' });
        let upRes: Response;
        try {
          upRes = await fetch('/api/admin/upload-media', {
            method: 'POST',
            headers,
            body: JSON.stringify({ mediaBase64: sceneSourceVideo, filename: 'source_video' })
          });
        } catch (netErr: any) {
          setIsSubmitting(false);
          setUploadStageInfo(null);
          setDetailedError({
            stage: 'Original Video Upload',
            stepNumber: 'Step 2 of 4',
            errorCode: 'NETWORK_ERROR',
            serverError: netErr.message || 'Connection lost during original video upload',
            fileName: sceneSourceVideoFile?.name || sceneSourceVideoName || 'source_video.mp4',
            fileType: sceneSourceVideoFile?.type || 'video/mp4',
            fileSizeFormatted: sceneSourceVideoFile ? formatBytes(sceneSourceVideoFile.size) : 'Unknown size',
            probableCause: 'Network connection broke or timed out during large video payload transfer.',
            nextStep: 'Ensure stable internet connection and consider compressing the video clip.'
          });
          return;
        }

        const upData = await upRes.json().catch(() => null);
        if (!upRes.ok || !upData?.url) {
          setIsSubmitting(false);
          setUploadStageInfo(null);
          setDetailedError({
            stage: 'Original Video Upload',
            stepNumber: 'Step 2 of 4',
            httpStatus: upRes.status,
            errorCode: upData?.code || `HTTP_${upRes.status}`,
            serverError: upData?.error || upRes.statusText || 'Server rejected original video upload',
            fileName: sceneSourceVideoFile?.name || sceneSourceVideoName || 'source_video.mp4',
            fileType: sceneSourceVideoFile?.type || 'video/mp4',
            fileSizeFormatted: sceneSourceVideoFile ? formatBytes(sceneSourceVideoFile.size) : 'Unknown size',
            probableCause: upRes.status === 413
              ? 'Original video file size exceeds the server request body limit.'
              : upRes.status === 502
                ? 'Storage driver failed to commit video object to storage.'
                : 'Server processing error or upload timeout.',
            nextStep: 'Please compress the video or trim it to 5-15 seconds before uploading.'
          });
          return; // ABORT: Do not proceed to next upload
        }
        finalSourceVideo = upData.url;
        lastStorageProvider = upData.provider || lastStorageProvider;
      }

      // ========================================================
      // STAGE 3: SWAPPED FACE / AFTER VIDEO UPLOAD
      // ========================================================
      if (sceneResultVideo.startsWith('data:')) {
        setUploadStageInfo({ step: 'Step 3 of 4', message: 'Uploading Swapped Face / After Video...' });
        let upRes: Response;
        try {
          upRes = await fetch('/api/admin/upload-media', {
            method: 'POST',
            headers,
            body: JSON.stringify({ mediaBase64: sceneResultVideo, filename: 'result_video' })
          });
        } catch (netErr: any) {
          setIsSubmitting(false);
          setUploadStageInfo(null);
          setDetailedError({
            stage: 'Result Video Upload',
            stepNumber: 'Step 3 of 4',
            errorCode: 'NETWORK_ERROR',
            serverError: netErr.message || 'Connection lost during result video upload',
            fileName: sceneResultVideoFile?.name || sceneResultVideoName || 'result_video.mp4',
            fileType: sceneResultVideoFile?.type || 'video/mp4',
            fileSizeFormatted: sceneResultVideoFile ? formatBytes(sceneResultVideoFile.size) : 'Unknown size',
            probableCause: 'Network dropped during result video upload.',
            nextStep: 'Check internet connection and try uploading again.'
          });
          return;
        }

        const upData = await upRes.json().catch(() => null);
        if (!upRes.ok || !upData?.url) {
          setIsSubmitting(false);
          setUploadStageInfo(null);
          setDetailedError({
            stage: 'Result Video Upload',
            stepNumber: 'Step 3 of 4',
            httpStatus: upRes.status,
            errorCode: upData?.code || `HTTP_${upRes.status}`,
            serverError: upData?.error || upRes.statusText || 'Server rejected swapped video upload',
            fileName: sceneResultVideoFile?.name || sceneResultVideoName || 'result_video.mp4',
            fileType: sceneResultVideoFile?.type || 'video/mp4',
            fileSizeFormatted: sceneResultVideoFile ? formatBytes(sceneResultVideoFile.size) : 'Unknown size',
            probableCause: upRes.status === 413
              ? 'Result video file size exceeds the server request limit.'
              : 'Storage driver or file encoding error.',
            nextStep: 'Compress the result video clip or convert to MP4 format.'
          });
          return; // ABORT: Do not proceed to save
        }
        finalResultVideo = upData.url;
        lastStorageProvider = upData.provider || lastStorageProvider;
      }

      // ========================================================
      // STAGE 4: SAVE SCENE RECORD (DATABASE METADATA)
      // ========================================================
      setUploadStageInfo({ step: 'Step 4 of 4', message: 'Saving Face Swap Scene record to database...' });
      const payload = {
        title: sceneTitle.trim(),
        description: (sceneDescription || sceneTitle).trim(),
        category: (sceneCategory || 'Viral & Trending').trim(),
        tags: sceneTags.split(',').map((t) => t.trim()).filter(Boolean),
        creditCost: Number(sceneCreditCost) || 45,
        durationSeconds: Number(sceneDurationSeconds) || 8,
        aspectRatio: sceneAspectRatio,
        sampleFace: finalSampleFace,
        sourceVideoPreview: finalSourceVideo,
        resultVideoPreview: finalResultVideo,
        masterRecipePrompt: sceneMasterRecipePrompt.trim() || undefined,
        isActive: sceneIsActive,
        status: targetStatus,
        isFeatured: sceneIsFeatured,
        order: Number(sceneOrder) || 0
      };

      const url = editingScene
        ? `/api/admin/faceswap/scenes/${editingScene.id}`
        : '/api/admin/faceswap/scenes';
      const method = editingScene ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers,
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        setIsSubmitting(false);
        setUploadStageInfo(null);
        setDetailedError({
          stage: 'Save Scene',
          stepNumber: 'Step 4 of 4',
          httpStatus: res.status,
          errorCode: errData?.code || `HTTP_${res.status}`,
          serverError: errData?.error || res.statusText || 'Failed to save Face Swap scene',
          probableCause: res.status === 400
            ? 'Invalid payload format or missing required scene properties.'
            : 'Server database write failure.',
          nextStep: 'Verify all metadata inputs and click save again.'
        });
        return;
      }

      showNotification(
        editingScene
          ? `Face Swap scene "${sceneTitle}" updated! [Stored: ${lastStorageProvider === 'cloudflare_r2' ? 'Cloudflare R2' : 'Local Disk'}]`
          : `Face Swap scene "${sceneTitle}" published live! [Stored: ${lastStorageProvider === 'cloudflare_r2' ? 'Cloudflare R2' : 'Local Disk'}]`
      );

      await fetchAdminFaceSwapScenes();
      if (refreshFaceSwapScenes) {
        await refreshFaceSwapScenes();
      }
      setFaceSwapSubTab('list');
      setEditingScene(null);
      setSceneSampleFaceFile(null);
      setSceneSourceVideoFile(null);
      setSceneResultVideoFile(null);
    } catch (err: any) {
      setDetailedError({
        stage: 'Save Scene',
        stepNumber: 'Unexpected Error',
        serverError: err.message || 'An unexpected failure occurred while processing the scene',
        probableCause: 'Client runtime or unhandled network exception.',
        nextStep: 'Check console logs and verify network connection.'
      });
    } finally {
      setIsSubmitting(false);
      setUploadStageInfo(null);
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

        {/* Admin Authorization Status & Key Unlock Banner */}
        <div className="px-4 pt-3">
          {isAdminVerified === true ? (
            <div className="p-2.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-xs font-semibold text-emerald-300">
                  Verified Studio Admin Access Active
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowKeyInput(!showKeyInput)}
                className="text-[11px] text-stone-400 hover:text-white underline cursor-pointer"
              >
                {showKeyInput ? 'Hide Key' : 'Manage Key'}
              </button>
            </div>
          ) : isAdminVerified === false ? (
            <div className="p-3 rounded-2xl bg-amber-500/15 border border-amber-500/30 space-y-2">
              <div className="flex items-start gap-2">
                <Lock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-xs font-bold text-amber-300">
                    Admin Key Required to Upload & Publish
                  </p>
                  <p className="text-[11px] text-stone-300 mt-0.5">
                    To upload demo videos, hero banners, and new templates, enter your ADMIN_SECRET_KEY below or sign in with your verified owner account.
                  </p>
                </div>
              </div>
              <form onSubmit={handleSaveAdminKey} className="flex gap-2 pt-1">
                <input
                  type="password"
                  value={adminKeyInput}
                  onChange={(e) => setAdminKeyInput(e.target.value)}
                  placeholder="Enter ADMIN_SECRET_KEY..."
                  className="flex-1 px-3 py-1.5 rounded-xl bg-black/60 border border-amber-500/30 text-white text-xs placeholder:text-stone-500 focus:outline-none focus:border-amber-400"
                />
                <button
                  type="submit"
                  disabled={isVerifyingKey || !adminKeyInput.trim()}
                  className="px-3 py-1.5 rounded-xl bg-[#ff9f00] text-black font-bold text-xs uppercase tracking-wider hover:brightness-110 active:scale-95 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                >
                  {isVerifyingKey ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
                  <span>Unlock</span>
                </button>
              </form>
              {!user && (
                <button
                  type="button"
                  onClick={() => setAuthModalOpen(true)}
                  className="w-full mt-1.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white font-medium text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>Or Sign In with Owner Account (backupvideoemail@gmail.com)</span>
                </button>
              )}
            </div>
          ) : null}

          {showKeyInput && isAdminVerified === true && (
            <form onSubmit={handleSaveAdminKey} className="mt-2 p-2.5 rounded-2xl bg-black/40 border border-white/10 flex gap-2">
              <input
                type="password"
                value={adminKeyInput}
                onChange={(e) => setAdminKeyInput(e.target.value)}
                placeholder="Update ADMIN_SECRET_KEY..."
                className="flex-1 px-3 py-1.5 rounded-xl bg-black border border-white/15 text-white text-xs placeholder:text-stone-500 focus:outline-none focus:border-emerald-400"
              />
              <button
                type="submit"
                disabled={isVerifyingKey || !adminKeyInput.trim()}
                className="px-3 py-1.5 rounded-xl bg-emerald-500 text-black font-bold text-xs hover:brightness-110 active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                Save
              </button>
            </form>
          )}
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
            <span>Templates ({displayTemplates.length})</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('catalog');
              if (catalogItems.length === 0) fetchProviderCatalog();
            }}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${
              activeTab === 'catalog'
                ? 'bg-white/10 text-white border border-white/10 shadow-sm'
                : 'text-stone-400 hover:text-white'
            }`}
          >
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <span>Provider Catalog</span>
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
            onClick={() => {
              setActiveTab('pricing_banner');
              fetchPricingBannerConfig();
            }}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${
              activeTab === 'pricing_banner'
                ? 'bg-white/10 text-white border border-white/10 shadow-sm'
                : 'text-stone-400 hover:text-white'
            }`}
          >
            <CreditCard className="w-4 h-4 text-amber-400" />
            <span>Pricing Banner</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('faceswap');
              if (adminFaceSwapScenes.length === 0) fetchAdminFaceSwapScenes();
            }}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${
              activeTab === 'faceswap' || activeTab === 'demo'
                ? 'bg-white/10 text-white border border-white/10 shadow-sm'
                : 'text-stone-400 hover:text-white'
            }`}
          >
            <VideoIcon className="w-4 h-4 text-emerald-400" />
            <span>Face Swap ({adminFaceSwapScenes.length || faceSwapScenes.length})</span>
          </button>
        </div>

        {/* TAB 1: TEMPLATES MANAGEMENT */}
        {activeTab === 'templates' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
            {subTab === 'list' && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-stone-400">
                      Catalog: {displayTemplates.filter((t) => listCategoryFilter === 'all' || t.category === listCategoryFilter).length} / {displayTemplates.length}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                    <button
                      onClick={handleScanAndRecoverR2}
                      disabled={isRecoveringR2}
                      className="px-3 py-1.5 rounded-xl bg-blue-500/15 hover:bg-blue-500/25 text-blue-300 text-xs font-bold flex items-center gap-1.5 border border-blue-500/30 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                      title="Scan Cloudflare R2 for orphaned assets and restore missing templates"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isRecoveringR2 ? 'animate-spin text-blue-400' : ''}`} />
                      <span>{isRecoveringR2 ? 'Scanning R2...' : 'Scan & Recover R2'}</span>
                    </button>
                    <button
                      onClick={() => {
                        setSubTab('bulk');
                        setBulkSummary(null);
                      }}
                      className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-400 to-[#d4af37] text-stone-950 text-xs font-black flex items-center gap-1.5 shadow-md hover:brightness-110 active:scale-95 transition-all cursor-pointer"
                      title="Bulk add multiple photo templates into a category with a shared prompt"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Bulk Add Photo Templates</span>
                    </button>
                    <button
                      onClick={() => {
                        setEditingTemplate(null);
                        setTplTitle('');
                        setTplDescription('');
                        setTplMediaPreview('');
                        setTplCoverPreview('');
                        setTplSampleResultPreview('');
                        setTplSampleBefore('');
                        setTplSampleFaceThumbnail('');
                        setRecipePrompt(tplDetectedType === 'photo' ? DEFAULT_PHOTO_RECIPE_PROMPT : DEFAULT_VIDEO_RECIPE_PROMPT);
                        setSubTab('add');
                      }}
                      className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold flex items-center gap-1.5 border border-white/15 active:scale-95 transition-all cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Single</span>
                    </button>
                  </div>
                </div>

                {/* R2 Recovery Notice Banner */}
                {recoveryNotice && (
                  <div className="p-3 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-between text-xs font-medium text-blue-200">
                    <span>{recoveryNotice}</span>
                    <button
                      onClick={() => setRecoveryNotice(null)}
                      className="text-stone-400 hover:text-white text-xs font-bold px-2 py-0.5 rounded cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {/* Category Filter Chips for Live Catalog Inspection */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                  <button
                    onClick={() => setListCategoryFilter('all')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                      listCategoryFilter === 'all'
                        ? 'bg-amber-400 text-stone-950 font-bold'
                        : 'bg-white/5 text-stone-400 hover:text-white'
                    }`}
                  >
                    All ({displayTemplates.length})
                  </button>
                  {allKnownCategories.map((cat) => {
                    const count = displayTemplates.filter((t) => t.category === cat).length;
                    const isEmpty = count === 0;
                    return (
                      <button
                        key={cat}
                        disabled={isEmpty}
                        onClick={() => !isEmpty && setListCategoryFilter(cat)}
                        title={isEmpty ? `${cat} (0 templates - empty)` : `${cat} (${count} templates)`}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1 ${
                          listCategoryFilter === cat
                            ? 'bg-amber-400 text-stone-950 font-bold'
                            : isEmpty
                            ? 'opacity-35 cursor-not-allowed bg-white/[0.02] text-stone-600 border border-white/5'
                            : 'bg-white/5 text-stone-400 hover:text-white cursor-pointer'
                        }`}
                      >
                        <span>{cat}</span>
                        <span className="text-[10px] opacity-75">({count})</span>
                      </button>
                    );
                  })}
                </div>

                <div className="space-y-2">
                  {displayTemplates
                    .filter((t) => listCategoryFilter === 'all' || t.category === listCategoryFilter)
                    .map((tpl) => (
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
                              {tpl.isActive === false && (
                                <span className="text-[9px] font-black px-1.5 py-0.2 rounded bg-stone-700/60 text-stone-300 border border-stone-600">
                                  INACTIVE
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-stone-400">
                              <span className="text-amber-300/80 font-medium">{tpl.category}</span>
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
                            className={`p-2 rounded-xl border text-xs cursor-pointer ${
                              tpl.isActive !== false
                                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                : 'bg-stone-800 text-stone-500 border-stone-700'
                            }`}
                          >
                            {tpl.isActive !== false ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => startEditTemplate(tpl)}
                            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-stone-300 border border-white/10 text-xs cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteTemplate(tpl.id)}
                            className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* SUBTAB: BULK PHOTO TEMPLATES STUDIO */}
            {subTab === 'bulk' && (
              <div className="space-y-4">
                {/* Header with Back button */}
                <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                  <div>
                    <h4 className="text-sm font-extrabold text-white flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-amber-400" />
                      <span>Bulk Add Photo Templates (थोक फोटो टेम्पलेट्स)</span>
                    </h4>
                    <p className="text-[11px] text-stone-400 mt-0.5">
                      Select multiple photos from phone gallery, set the category front message, and publish live in 1-click.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSubTab('list')}
                    className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-stone-300 hover:text-white text-xs font-bold transition-colors cursor-pointer"
                  >
                    ← Back to Catalog
                  </button>
                </div>

                {/* STEP 1: CATEGORY & SHARED FRONT MESSAGE */}
                <div className="p-3.5 rounded-2xl bg-[#14121a] border border-amber-500/30 space-y-3 shadow-lg">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <label className="text-xs font-black text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded-full bg-[#ff9f00] text-black text-[10px] font-black flex items-center justify-center">1</span>
                      <span>Target Category & Front Message (साझा AI प्रॉम्ट)</span>
                    </label>
                    <span className="text-[10px] text-emerald-400 font-semibold">Gemini 3.1 Flash Photo</span>
                  </div>

                  {/* Category Selection */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-stone-300 block mb-1">
                        Select Category (कैटेगरी चुनें) *
                      </label>
                      <select
                        value={bulkCategory}
                        onChange={(e) => handleBulkCategoryChange(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-black border border-white/15 text-xs text-white focus:outline-none focus:border-amber-400 cursor-pointer"
                      >
                        {allKnownCategories.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat} {cat === 'Devotional' ? '(भक्ति - Hanuman Ji, Mahadev)' : ''}
                          </option>
                        ))}
                        <option value="Custom">+ Custom Category (अन्य नई कैटेगरी)</option>
                      </select>
                    </div>

                    {bulkCategory === 'Custom' ? (
                      <div>
                        <label className="text-[11px] font-bold text-stone-300 block mb-1">
                          Custom Category Name *
                        </label>
                        <input
                          type="text"
                          value={bulkCategoryCustom}
                          onChange={(e) => setBulkCategoryCustom(e.target.value)}
                          placeholder="e.g. Mahadev Bhakti, Bollywood Retro"
                          className="w-full px-3 py-2 rounded-xl bg-black border border-white/15 text-xs text-white placeholder-stone-500 focus:outline-none focus:border-amber-400"
                        />
                      </div>
                    ) : (
                      <div>
                        <label className="text-[11px] font-bold text-stone-300 block mb-1">
                          Aspect Ratio (एस्पेक्ट रेशियो)
                        </label>
                        <select
                          value={bulkAspectRatio}
                          onChange={(e) => setBulkAspectRatio(e.target.value as any)}
                          className="w-full px-3 py-2 rounded-xl bg-black border border-white/15 text-xs text-white focus:outline-none focus:border-amber-400 font-mono cursor-pointer"
                        >
                          <option value="9:16">9:16 (Vertical Reel / Story)</option>
                          <option value="1:1">1:1 (Square Feed)</option>
                          <option value="4:5">4:5 (Portrait Feed)</option>
                          <option value="16:9">16:9 (Landscape)</option>
                        </select>
                      </div>
                    )}
                  </div>

                  {/* Front Message (Shared AI Prompt) */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between flex-wrap gap-1">
                      <label className="text-[11px] font-bold text-stone-300 flex items-center gap-1.5">
                        <Wand2 className="w-3.5 h-3.5 text-amber-400" />
                        <span>Category Front Message (इस कैटेगरी का साझा AI प्रॉम्ट)</span>
                      </label>
                      <button
                        type="button"
                        onClick={handleSaveCategoryPrompt}
                        className="text-[10px] font-bold text-amber-400 hover:text-amber-300 underline cursor-pointer"
                        title="Persist this prompt centrally for this category"
                      >
                        Save as Central Category Prompt
                      </button>
                    </div>
                    <textarea
                      value={bulkMasterPrompt}
                      onChange={(e) => setBulkMasterPrompt(e.target.value)}
                      rows={3}
                      placeholder="Enter the category's master style instruction..."
                      className="w-full p-2.5 rounded-xl bg-black/60 border border-white/15 text-xs text-stone-200 focus:outline-none focus:border-amber-400 font-sans"
                    />
                    <p className="text-[10px] text-stone-400">
                      ℹ️ इस कैटेगरी के सभी टेम्पलेट्स इसी फ्रंट मैसेज के साथ चलेंगे। जेमिनी AI यूजर की फोटो से चेहरा लेगा और टेम्पलेट की रेफरेंस फोटो से स्टाइल व बैकग्राउंड लेगा।
                    </p>
                  </div>

                  {/* Settings Bar */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                    <div>
                      <label className="text-[10px] font-bold text-stone-400 block mb-0.5">Tags</label>
                      <input
                        type="text"
                        value={bulkTags}
                        onChange={(e) => setBulkTags(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-black border border-white/10 text-xs text-white focus:outline-none focus:border-amber-400"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-stone-400 block mb-0.5">Cost USD</label>
                      <input
                        type="number"
                        step="0.01"
                        value={bulkCostUsd}
                        onChange={(e) => setBulkCostUsd(parseFloat(e.target.value) || 0.08)}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-black border border-white/10 text-xs text-white focus:outline-none focus:border-amber-400 font-mono"
                      />
                    </div>

                    <label className="flex items-center gap-2 p-2 rounded-xl bg-black/40 border border-white/10 cursor-pointer self-end">
                      <input
                        type="checkbox"
                        checked={bulkIsActive}
                        onChange={(e) => setBulkIsActive(e.target.checked)}
                        className="rounded accent-emerald-500 w-4 h-4 cursor-pointer"
                      />
                      <span className="text-xs font-bold text-stone-300">Active Live</span>
                    </label>

                    <label className="flex items-center gap-2 p-2 rounded-xl bg-black/40 border border-white/10 cursor-pointer self-end">
                      <input
                        type="checkbox"
                        checked={bulkIsFeatured}
                        onChange={(e) => setBulkIsFeatured(e.target.checked)}
                        className="rounded accent-amber-500 w-4 h-4 cursor-pointer"
                      />
                      <span className="text-xs font-bold text-stone-300">Featured</span>
                    </label>
                  </div>
                </div>

                {/* STEP 2: SELECT REFERENCE PHOTOS FROM PHONE */}
                <div className="space-y-3 p-3.5 rounded-2xl bg-black/40 border border-white/10">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <label className="text-xs font-black text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded-full bg-[#ff9f00] text-black text-[10px] font-black flex items-center justify-center">2</span>
                      <span>Select Style Reference Photos (गैलरी से फोटो चुनें)</span>
                    </label>
                    <span className="text-[10px] text-stone-400">Multi-File Upload</span>
                  </div>

                  <input
                    ref={bulkFileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleBulkFilesSelect}
                    className="hidden"
                  />

                  {/* Big Tap Area */}
                  <div
                    onClick={() => bulkFileInputRef.current?.click()}
                    className="relative w-full p-6 rounded-2xl border-2 border-dashed border-white/20 hover:border-[#ff9f00] bg-stone-900/40 hover:bg-stone-900/60 flex flex-col items-center justify-center cursor-pointer transition-all group"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-2 group-hover:scale-105 transition-transform">
                      <Upload className="w-6 h-6" />
                    </div>
                    <span className="text-sm font-bold text-white text-center">
                      Tap to Choose Multiple Photos from Gallery
                    </span>
                    <span className="text-xs text-stone-400 text-center mt-1">
                      (उदाहरण: हनुमान जी, राम जी, या रॉयल स्वैग की 5-20 अलग-अलग फोटो एक साथ चुनें)
                    </span>
                    <span className="text-[10px] text-amber-300/80 font-mono mt-1">
                      Each photo becomes an individual style template under "{bulkCategory}"
                    </span>
                  </div>

                  {/* Selected Photos List */}
                  {bulkItems.length > 0 && (
                    <div className="space-y-2 pt-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-stone-300">
                          Selected Photos ({bulkItems.length}):
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => bulkFileInputRef.current?.click()}
                            className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-stone-200 text-[11px] font-semibold transition-colors cursor-pointer"
                          >
                            + Add More
                          </button>
                          <button
                            type="button"
                            onClick={handleClearBulkItems}
                            className="px-2.5 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[11px] font-semibold transition-colors cursor-pointer"
                          >
                            Clear All
                          </button>
                        </div>
                      </div>

                      <div className="max-h-64 overflow-y-auto space-y-2 pr-1 no-scrollbar">
                        {bulkItems.map((item, idx) => (
                          <div
                            key={item.id}
                            className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 transition-all ${
                              item.status === 'success'
                                ? 'bg-emerald-500/10 border-emerald-500/30'
                                : item.status === 'failed'
                                ? 'bg-rose-500/10 border-rose-500/30'
                                : item.status === 'uploading'
                                ? 'bg-amber-500/10 border-amber-500/30 animate-pulse'
                                : 'bg-stone-900/70 border-white/10'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <img
                                src={item.previewUrl}
                                alt="Thumb"
                                className="w-10 h-12 rounded-lg object-cover bg-black border border-white/10 shrink-0"
                              />
                              <div className="min-w-0 flex-1">
                                <input
                                  type="text"
                                  value={item.title}
                                  onChange={(e) => handleUpdateBulkTitle(item.id, e.target.value)}
                                  disabled={item.status === 'uploading' || item.status === 'success'}
                                  placeholder={`Template Title ${idx + 1}`}
                                  className="w-full px-2 py-1 rounded-md bg-black/60 border border-white/10 text-xs text-white focus:outline-none focus:border-amber-400"
                                />
                                {item.error && (
                                  <span className="text-[10px] text-rose-400 block truncate mt-0.5">
                                    Error: {item.error}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {item.status === 'pending' && (
                                <span className="text-[10px] px-2 py-0.5 rounded-md bg-white/10 text-stone-300 font-semibold">
                                  Ready
                                </span>
                              )}
                              {item.status === 'uploading' && (
                                <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 font-bold flex items-center gap-1">
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                  <span>Saving...</span>
                                </span>
                              )}
                              {item.status === 'success' && (
                                <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 font-bold flex items-center gap-1">
                                  <Check className="w-3 h-3" />
                                  <span>Live</span>
                                </span>
                              )}
                              {item.status === 'failed' && (
                                <span className="text-[10px] px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 font-bold">
                                  Failed
                                </span>
                              )}

                              {item.status !== 'uploading' && item.status !== 'success' && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveBulkItem(item.id)}
                                  className="p-1.5 rounded-lg text-stone-400 hover:text-red-400 hover:bg-white/5 cursor-pointer"
                                  title="Remove this photo"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Progress Bar & Summary */}
                {isBulkUploading && (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-bold text-amber-300">
                      <span>Publishing templates to catalog...</span>
                      <span>{bulkProgress.current} / {bulkProgress.total}</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-black/60 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-amber-400 to-[#d4af37] transition-all duration-300"
                        style={{ width: `${(bulkProgress.current / Math.max(1, bulkProgress.total)) * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                {bulkSummary && (
                  <div
                    className={`p-3 rounded-xl border flex items-center justify-between text-xs font-semibold ${
                      bulkSummary.failCount === 0
                        ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                        : 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                    }`}
                  >
                    <span>
                      {bulkSummary.failCount === 0
                        ? `🎉 All ${bulkSummary.successCount} photo templates are live in "${bulkCategory}"!`
                        : `⚠️ ${bulkSummary.successCount} templates published, ${bulkSummary.failCount} failed. You can retry failed items.`}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setSubTab('list');
                        setListCategoryFilter(bulkCategory);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-black/40 hover:bg-black/60 text-white font-bold text-[11px] underline cursor-pointer"
                    >
                      View in Catalog →
                    </button>
                  </div>
                )}

                {/* Submit 1-Tap Action Button */}
                <button
                  type="button"
                  onClick={handleExecuteBulkUpload}
                  disabled={isBulkUploading || bulkItems.length === 0 || bulkItems.every((i) => i.status === 'success')}
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-400 to-[#d4af37] text-stone-950 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg hover:brightness-110 active:scale-95 disabled:opacity-40 transition-all cursor-pointer"
                >
                  {isBulkUploading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Publishing ({bulkProgress.current} / {bulkProgress.total})...</span>
                    </>
                  ) : bulkItems.every((i) => i.status === 'success') && bulkItems.length > 0 ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>All Templates Live · Done</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>
                        Publish {bulkItems.filter((i) => i.status !== 'success').length} Templates to "{bulkCategory}" (लाइव पब्लिश करें)
                      </span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* SUBTAB: ADD OR EDIT SINGLE TEMPLATE */}
            {(subTab === 'add' || subTab === 'edit') && (
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

                {/* Step 1: Input Type Selection (Crucial) */}
                <div className="space-y-1.5 p-3 rounded-2xl bg-stone-900/90 border border-white/10">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded-full bg-[#ff9f00] text-black text-[10px] font-black flex items-center justify-center">1</span>
                      <span>User Input Type (What will user upload?)</span>
                    </label>
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setTplInputType('IMAGE_ONLY')}
                      className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                        tplInputType === 'IMAGE_ONLY'
                          ? 'bg-[#ff9f00]/20 border-[#ff9f00] text-white shadow-sm'
                          : 'bg-black/40 border-white/10 text-stone-400 hover:text-white'
                      }`}
                    >
                      <ImageIcon className="w-4 h-4 mx-auto mb-1 text-amber-400" />
                      <span className="text-[11px] font-bold block">Photo Only</span>
                      <span className="text-[9px] text-stone-500 block">Requires Image</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setTplInputType('VIDEO_ONLY')}
                      className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                        tplInputType === 'VIDEO_ONLY'
                          ? 'bg-[#ff9f00]/20 border-[#ff9f00] text-white shadow-sm'
                          : 'bg-black/40 border-white/10 text-stone-400 hover:text-white'
                      }`}
                    >
                      <VideoIcon className="w-4 h-4 mx-auto mb-1 text-pink-400" />
                      <span className="text-[11px] font-bold block">Video Only</span>
                      <span className="text-[9px] text-stone-500 block">Requires Video</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setTplInputType('IMAGE_OR_VIDEO')}
                      className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                        tplInputType === 'IMAGE_OR_VIDEO'
                          ? 'bg-[#ff9f00]/20 border-[#ff9f00] text-white shadow-sm'
                          : 'bg-black/40 border-white/10 text-stone-400 hover:text-white'
                      }`}
                    >
                      <Sparkles className="w-4 h-4 mx-auto mb-1 text-emerald-400" />
                      <span className="text-[11px] font-bold block">Photo or Video</span>
                      <span className="text-[9px] text-stone-500 block">Accepts Both</span>
                    </button>
                  </div>
                </div>

                {/* Step 2: 3 Independent Template Media Assets (Face Thumbnail, BEFORE, AFTER & Auto-Cover) */}
                <div className="space-y-3.5 p-3.5 rounded-2xl bg-stone-900/90 border border-white/10">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <label className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded-full bg-[#ff9f00] text-black text-[10px] font-black flex items-center justify-center">2</span>
                      <span>Template Media Assets (3 Independent Inputs)</span>
                    </label>
                    <span className="text-[10px] text-amber-300 font-medium">Face · Before · After</span>
                  </div>

                  {/* ASSET 1: Face Photo / Thumbnail (चेहरा थंबनेल) */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-stone-200 flex items-center gap-1.5">
                        <UserCheck className="w-3.5 h-3.5 text-purple-400" />
                        <span>1. Face Photo / Thumbnail (चेहरा थंबनेल)</span>
                      </span>
                      <span className="text-[9px] text-stone-400">Optional · Face Portrait</span>
                    </div>

                    <input
                      ref={sampleFaceThumbnailFileRef}
                      type="file"
                      accept="image/*"
                      onChange={handleSampleFaceFileSelect}
                      className="hidden"
                    />

                    <div
                      onClick={() => sampleFaceThumbnailFileRef.current?.click()}
                      className="relative w-full h-24 rounded-xl border border-dashed border-white/20 hover:border-purple-400 bg-black/40 flex items-center justify-center cursor-pointer overflow-hidden group"
                    >
                      {tplSampleFaceThumbnail ? (
                        <div className="flex items-center gap-3 p-2 w-full h-full">
                          <img src={tplSampleFaceThumbnail} alt="Face Sample Thumbnail" className="w-20 h-full object-cover rounded-lg border border-purple-400/40" />
                          <div className="text-left flex-1 min-w-0">
                            <span className="text-xs font-bold text-white block">Face Thumbnail Configured</span>
                            <span className="text-[10px] text-purple-300 block">Click to replace</span>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center text-center p-2">
                          <Upload className="w-5 h-5 text-purple-400 mb-1" />
                          <span className="text-xs font-semibold text-white">Upload Reference Face Thumbnail</span>
                          <span className="text-[9px] text-stone-400">Shown in customer Template Detail next to BEFORE/AFTER example</span>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-xs font-bold text-white">
                        Replace Face Thumbnail
                      </div>
                    </div>
                    <p className="text-[9.5px] text-stone-400 leading-tight">
                      Admin example face. User Face photo will be used for actual AI generation.
                    </p>
                  </div>

                  {/* ASSET 2: BEFORE / Source Sample (बिफोर ओरिजिनल) */}
                  <div className="space-y-1.5 pt-2 border-t border-white/5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-stone-200 flex items-center gap-1.5">
                        <ImageIcon className="w-3.5 h-3.5 text-blue-400" />
                        <span>2. BEFORE / Source Sample (बिफोर ओरिजिनल)</span>
                      </span>
                      <span className="text-[9px] text-stone-400">Optional · Photo or Video</span>
                    </div>

                    <input
                      ref={sampleBeforeFileRef}
                      type="file"
                      accept="image/*,video/*"
                      onChange={handleSampleBeforeFileSelect}
                      className="hidden"
                    />

                    <div
                      onClick={() => sampleBeforeFileRef.current?.click()}
                      className="relative w-full h-24 rounded-xl border border-dashed border-white/20 hover:border-blue-400 bg-black/40 flex items-center justify-center cursor-pointer overflow-hidden group"
                    >
                      {tplSampleBefore ? (
                        <div className="flex items-center gap-3 p-2 w-full h-full">
                          {tplSampleBefore.endsWith('.mp4') || tplSampleBefore.startsWith('data:video/') ? (
                            <video src={tplSampleBefore} autoPlay loop muted playsInline className="w-24 h-full object-cover rounded-lg border border-blue-400/40" />
                          ) : (
                            <img src={tplSampleBefore} alt="Before Reference" className="w-20 h-full object-cover rounded-lg border border-blue-400/40" />
                          )}
                          <div className="text-left flex-1 min-w-0">
                            <span className="text-xs font-bold text-white block">BEFORE Sample Configured</span>
                            <span className="text-[10px] text-blue-300 block">Click to replace</span>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center text-center p-2">
                          <Upload className="w-5 h-5 text-blue-400 mb-1" />
                          <span className="text-xs font-semibold text-white">Upload Original BEFORE Sample</span>
                          <span className="text-[9px] text-stone-400">Displayed on customer screen as the starting look</span>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-xs font-bold text-white">
                        Replace BEFORE Sample
                      </div>
                    </div>
                    <p className="text-[9.5px] text-stone-400 leading-tight">
                      Shows the original scene/person before the AI transformation was applied.
                    </p>
                  </div>

                  {/* ASSET 3: AFTER / Sample Result (आफ्टर फाइनल रिजल्ट & ऑटो कवर) */}
                  <div className="space-y-1.5 pt-2 border-t border-white/5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-stone-200 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                        <span>3. AFTER / Sample Result (आफ्टर फाइनल रिजल्ट)</span>
                      </span>
                      <span className="text-[9px] text-emerald-400 font-bold">Auto-assigned as Cover Photo</span>
                    </div>

                    <input
                      ref={sampleResultFileRef}
                      type="file"
                      accept="image/*,video/*"
                      onChange={handleSampleResultFileSelect}
                      className="hidden"
                    />

                    <div
                      onClick={() => sampleResultFileRef.current?.click()}
                      className="relative w-full h-28 rounded-xl border-2 border-dashed border-emerald-500/40 hover:border-emerald-400 bg-black/50 flex items-center justify-center cursor-pointer overflow-hidden group shadow-inner"
                    >
                      {tplSampleResultPreview ? (
                        tplSampleResultPreview.endsWith('.mp4') || tplSampleResultPreview.startsWith('data:video/') ? (
                          <video src={tplSampleResultPreview} autoPlay loop muted playsInline className="w-full h-full object-cover" />
                        ) : (
                          <img src={tplSampleResultPreview} alt="Sample Result" className="w-full h-full object-cover" />
                        )
                      ) : (
                        <div className="flex flex-col items-center text-center p-2">
                          <Upload className="w-6 h-6 text-emerald-400 mb-1" />
                          <span className="text-xs font-bold text-white">Upload Final AFTER Sample</span>
                          <span className="text-[9.5px] text-stone-400">Acts as visual style target & automatically sets Cover Photo</span>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-xs font-bold text-white">
                        Replace AFTER Sample
                      </div>
                    </div>

                    {tplSampleResultPreview && (
                      <div className="flex items-center gap-1.5 p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10.5px] font-medium">
                        <Check className="w-3.5 h-3.5 stroke-[3] text-emerald-400 shrink-0" />
                        <span>Reused automatically as Cover Photo (no second upload needed).</span>
                      </div>
                    )}
                  </div>

                  {/* Optional Custom Cover Override & Preview Media Accordion */}
                  <div className="pt-2 border-t border-white/5">
                    <button
                      type="button"
                      onClick={() => setShowCustomCoverOverride((prev) => !prev)}
                      className="text-[10.5px] font-semibold text-stone-400 hover:text-white flex items-center justify-between w-full p-1"
                    >
                      <span>Custom Cover Override or Preview Video (Optional)</span>
                      <span>{showCustomCoverOverride ? '▲ Hide' : '▼ Show'}</span>
                    </button>

                    {showCustomCoverOverride && (
                      <div className="space-y-3 pt-2">
                        {/* Custom Cover Photo Override */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-stone-300">Override Cover Photo</span>
                            <span className="text-[9px] text-stone-500">Only if different from AFTER</span>
                          </div>
                          <input
                            ref={coverFileRef}
                            type="file"
                            accept="image/*"
                            onChange={handleCoverFileSelect}
                            className="hidden"
                          />
                          <div
                            onClick={() => coverFileRef.current?.click()}
                            className="relative w-full h-20 rounded-xl border border-dashed border-white/15 bg-black/40 flex items-center justify-center cursor-pointer overflow-hidden"
                          >
                            {tplCoverPreview ? (
                              <img src={tplCoverPreview} alt="Cover Preview" className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-[10px] text-stone-400">Click to upload separate cover</span>
                            )}
                          </div>
                        </div>

                        {/* Custom Preview Media Override */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-stone-300">Override Preview Media (Video/Demo)</span>
                            <span className="text-[9px] text-stone-500">For video templates</span>
                          </div>
                          <input
                            ref={tplFileRef}
                            type="file"
                            accept="image/*,video/*"
                            onChange={handleTplFileSelect}
                            className="hidden"
                          />
                          <div
                            onClick={() => tplFileRef.current?.click()}
                            className="relative w-full h-20 rounded-xl border border-dashed border-white/15 bg-black/40 flex items-center justify-center cursor-pointer overflow-hidden"
                          >
                            {tplMediaPreview ? (
                              tplDetectedType === 'video' ? (
                                <video src={tplMediaPreview} autoPlay loop muted playsInline className="w-full h-full object-cover" />
                              ) : (
                                <img src={tplMediaPreview} alt="Preview" className="w-full h-full object-cover" />
                              )
                            ) : (
                              <span className="text-[10px] text-stone-400">Click to upload demo video</span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Step 3: Execution Recipe (Real AI Generation Engine) */}
                <div className="space-y-3 p-3.5 rounded-2xl bg-[#14121a] border border-amber-500/30 shadow-lg">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <label className="text-xs font-black text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded-full bg-[#ff9f00] text-black text-[10px] font-black flex items-center justify-center">3</span>
                      <span>Execution Recipe (AI Logic)</span>
                    </label>
                    <span className="text-[10px] text-stone-400">Server-Authoritative</span>
                  </div>

                  {/* Import Alert Notice (If provider model needs manual recipe setup) */}
                  {importNotice && (
                    <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-200 text-xs font-semibold flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                      <span>{importNotice}</span>
                    </div>
                  )}

                  {/* RECIPE JSON INTEGRATION: Upload JSON or Paste JSON */}
                  <div className="p-2.5 rounded-xl bg-black/40 border border-white/10 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-stone-300 flex items-center gap-1.5">
                        <Sliders className="w-3.5 h-3.5 text-[#ff9f00]" />
                        <span>Recipe JSON Import</span>
                      </span>
                      <span className="text-[9px] text-stone-500">Direct Configuration</span>
                    </div>

                    <input
                      ref={recipeJsonFileRef}
                      type="file"
                      accept=".json,application/json"
                      onChange={handleUploadRecipeJson}
                      className="hidden"
                    />

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => recipeJsonFileRef.current?.click()}
                        className="py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                      >
                        <Upload className="w-3.5 h-3.5 text-[#ff9f00]" />
                        <span>Upload Recipe JSON</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowPasteJsonModal(true)}
                        className="py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Paste Recipe JSON</span>
                      </button>
                    </div>
                  </div>

                  {/* 1-Tap Presets */}
                  <div>
                    <label className="text-[11px] font-bold text-stone-300 block mb-1">Quick Recipe Presets</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => applyRecipePreset('veo_video')}
                        className={`p-2 rounded-xl border text-left text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                          recipePreset === 'veo_video'
                            ? 'bg-[#ff9f00]/20 border-[#ff9f00] text-white'
                            : 'bg-black/30 border-white/10 text-stone-400 hover:text-white'
                        }`}
                      >
                        <Film className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <div className="truncate">
                          <span>Google Veo 3.1</span>
                          <span className="text-[9px] text-stone-400 block font-normal truncate">Video Generation</span>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => applyRecipePreset('gemini_photo')}
                        className={`p-2 rounded-xl border text-left text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                          recipePreset === 'gemini_photo'
                            ? 'bg-[#ff9f00]/20 border-[#ff9f00] text-white'
                            : 'bg-black/30 border-white/10 text-stone-400 hover:text-white'
                        }`}
                      >
                        <ImageIcon className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <div className="truncate">
                          <span>Gemini 2.5 Photo</span>
                          <span className="text-[9px] text-stone-400 block font-normal truncate">Portrait Studio</span>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => applyRecipePreset('higgsfield_motion')}
                        className={`p-2 rounded-xl border text-left text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                          recipePreset === 'higgsfield_motion'
                            ? 'bg-[#ff9f00]/20 border-[#ff9f00] text-white'
                            : 'bg-black/30 border-white/10 text-stone-400 hover:text-white'
                        }`}
                      >
                        <Zap className="w-3.5 h-3.5 text-pink-400 shrink-0" />
                        <div className="truncate">
                          <span>Higgsfield Motion</span>
                          <span className="text-[9px] text-stone-400 block font-normal truncate">Motion Transfer</span>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => applyRecipePreset('custom')}
                        className={`p-2 rounded-xl border text-left text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                          recipePreset === 'custom'
                            ? 'bg-[#ff9f00]/20 border-[#ff9f00] text-white'
                            : 'bg-black/30 border-white/10 text-stone-400 hover:text-white'
                        }`}
                      >
                        <Sliders className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        <div className="truncate">
                          <span>Custom Recipe</span>
                          <span className="text-[9px] text-stone-400 block font-normal truncate">Custom Config</span>
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Provider & Model */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-bold text-stone-300">AI Provider</label>
                      <select
                        value={recipeProvider}
                        onChange={(e) => {
                          setRecipeProvider(e.target.value);
                          setRecipePreset('custom');
                        }}
                        className="w-full mt-1 px-3 py-2 rounded-xl bg-black border border-white/10 text-white text-xs focus:border-[#ff9f00] focus:outline-none"
                      >
                        <option value="google_veo">Google Veo (Video)</option>
                        <option value="gemini">Google Gemini (Photo)</option>
                        <option value="higgsfield">Higgsfield Genjutsu (Motion Transfer)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-stone-300">Model Name</label>
                      <input
                        type="text"
                        value={recipeModel}
                        onChange={(e) => setRecipeModel(e.target.value)}
                        placeholder="e.g. gemini-omni-1.1-flash"
                        className="w-full mt-1 px-3 py-2 rounded-xl bg-black border border-white/10 text-white text-xs focus:border-[#ff9f00] focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Master AI Prompt */}
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold text-stone-300">Master Recipe Prompt</label>
                      <span className="text-[10px] text-stone-500">Defines the visual aesthetic</span>
                    </div>
                    <textarea
                      value={recipePrompt}
                      onChange={(e) => setRecipePrompt(e.target.value)}
                      placeholder="e.g. Cinematic slow-motion portrait with dramatic golden hour lighting, lens flare, 4k ultra-detailed..."
                      rows={3}
                      className="w-full mt-1 p-2.5 rounded-xl bg-black border border-white/10 text-white text-xs focus:border-[#ff9f00] focus:outline-none resize-none leading-relaxed"
                    />
                  </div>

                  {/* Driving / Reference Video (Crucial Separation from Preview) */}
                  <div className="p-2.5 rounded-xl bg-black/60 border border-white/10 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold text-stone-200 flex items-center gap-1.5">
                        <VideoIcon className="w-3.5 h-3.5 text-pink-400" />
                        <span>Reference / Driving Video (If Required)</span>
                      </label>
                      <span className="text-[9px] text-stone-400">For Motion Transfer</span>
                    </div>

                    <p className="text-[10px] text-stone-400 leading-normal">
                      अगर इस टेम्पलेट में user की फ़ोटो को किसी specific डांस या मोशन वीडियो पर animate करना है, तो वह driving वीडियो यहाँ डालें। यह demo preview से अलग है।
                    </p>

                    <input
                      ref={drivingFileRef}
                      type="file"
                      accept="video/mp4,video/quicktime,video/webm"
                      onChange={handleDrivingFileSelect}
                      className="hidden"
                    />

                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={recipeDrivingVideoUrl}
                        onChange={(e) => setRecipeDrivingVideoUrl(e.target.value)}
                        placeholder="https://... driving video URL (or upload from device)"
                        className="flex-1 px-3 py-2 rounded-xl bg-stone-900 border border-white/10 text-white text-xs focus:border-[#ff9f00] focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => drivingFileRef.current?.click()}
                        className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold shrink-0 transition-colors cursor-pointer"
                      >
                        Upload Video
                      </button>
                    </div>

                    {(recipeDrivingVideoPreview || recipeDrivingVideoUrl) && (
                      <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between text-[11px] text-emerald-300">
                        <span className="flex items-center gap-1.5 truncate">
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                          <span>Driving Video Attached</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setRecipeDrivingVideoPreview('');
                            setRecipeDrivingVideoUrl('');
                          }}
                          className="text-[10px] text-stone-400 hover:text-white underline cursor-pointer"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Step 4: Template Details & Metadata */}
                <div className="space-y-3 p-3 rounded-2xl bg-stone-900/90 border border-white/10">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <label className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded-full bg-[#ff9f00] text-black text-[10px] font-black flex items-center justify-center">4</span>
                      <span>Catalog Information & Cost</span>
                    </label>
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
                        {allKnownCategories.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
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

        {/* TAB: PRICING PAGE MULTI-BANNER ROTATION POOL MANAGEMENT */}
        {activeTab === 'pricing_banner' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
            {/* Header & Quick Stats */}
            <div className="p-4 rounded-2xl bg-stone-900/60 border border-white/10 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-amber-400" />
                    <span>💰 प्राइसिंग पेज बैनर रोटेशन पूल (Pricing Banner Pool)</span>
                  </h4>
                  <p className="text-xs text-stone-300 mt-1">
                    यहाँ आप 4 से 5 फोटो या वीडियो अपलोड कर सकते हैं। ग्राहक जब भी प्लान पेज पर आएगा या रिफ्रेश करेगा, उसे हर बार अलग-अलग फोटो दिखाई देगा (टाइमर पर नहीं बदलेगा, सिर्फ रिफ्रेश करने पर बदलेगा)।
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="px-2.5 py-1 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] font-bold">
                    पूल में: {pricingBannerPool.length} बैनर
                  </span>
                  <button
                    type="button"
                    onClick={fetchPricingBannerConfig}
                    disabled={isLoadingPricingBanner}
                    className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-stone-300 transition-colors cursor-pointer"
                    title="पूल दोबारा लोड करें"
                  >
                    <RefreshCw className={`w-4 h-4 ${isLoadingPricingBanner ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              {/* Notice regarding pre-printed highlights */}
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div className="text-[11px] text-emerald-200 leading-relaxed">
                  <strong>क्लीन कैनवास गारंटी:</strong> आपके अपलोड किए गए फोटो में ऐप के फीचर्स (500+ Templates, No Watermark, Trending AI Effects) पहले से लिखे हुए हैं। इसलिए प्राइसिंग पेज से सभी पुराने HTML ओवरले टेक्स्ट और चिप्स हटा दिए गए हैं, ताकि आपका लिखा हुआ कभी ओवरलैप या ओवरराइट न हो।
                </div>
              </div>
            </div>

            {/* SECTION 1: UPLOAD NEW BANNER TO POOL */}
            <div className="p-4 rounded-2xl bg-stone-900/60 border border-white/10 space-y-4">
              <h5 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Upload className="w-3.5 h-3.5 text-amber-400" />
                <span>1. नया फोटो या वीडियो बैनर जोड़ें (Upload New Banner)</span>
              </h5>

              {/* Media Format Picker */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setNewBannerType('image')}
                  className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 border transition-all cursor-pointer ${
                    newBannerType === 'image'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm'
                      : 'bg-black/40 text-stone-400 border-white/10 hover:text-white'
                  }`}
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>📷 फोटो / पोस्टर (Recommended)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setNewBannerType('video')}
                  className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 border transition-all cursor-pointer ${
                    newBannerType === 'video'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm'
                      : 'bg-black/40 text-stone-400 border-white/10 hover:text-white'
                  }`}
                >
                  <VideoIcon className="w-3.5 h-3.5" />
                  <span>🎥 लूपिंग वीडियो (Optional)</span>
                </button>
              </div>

              {/* Upload Box */}
              <div>
                {newBannerPreview ? (
                  <div className="relative rounded-2xl overflow-hidden border border-amber-500/40 bg-black max-h-64 w-full flex items-center justify-center">
                    {newBannerType === 'video' ? (
                      <video
                        src={newBannerPreview}
                        poster={newBannerPosterPreview || undefined}
                        muted
                        loop
                        autoPlay
                        playsInline
                        className="max-h-64 w-full object-contain"
                      />
                    ) : (
                      <img
                        src={newBannerPreview}
                        alt="New Banner Preview"
                        className="max-h-64 w-full object-contain"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setNewBannerPreview('');
                        setNewBannerPosterPreview('');
                      }}
                      className="absolute top-2 right-2 px-2.5 py-1 rounded-xl bg-black/80 hover:bg-rose-500 text-white text-[11px] font-bold border border-white/20 transition-colors cursor-pointer"
                    >
                      हटाएं (Remove)
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center h-44 rounded-2xl border-2 border-dashed border-white/20 hover:border-amber-400/60 bg-black/40 cursor-pointer p-4 text-center transition-colors">
                    <Upload className="w-8 h-8 text-amber-400/70 mb-2" />
                    <span className="text-xs font-bold text-white">
                      फोन से {newBannerType === 'video' ? 'वीडियो' : 'फोटो'} चुनें
                    </span>
                    <span className="text-[10px] text-stone-400 mt-1">
                      {newBannerType === 'video'
                        ? 'MP4 या WebM वीडियो (हल्का और आकर्षक)'
                        : 'JPEG, PNG या WebP (जिसमें फीचर्स और ऑफर्स लिखे हों)'}
                    </span>
                    <input
                      type="file"
                      accept={newBannerType === 'video' ? 'video/mp4,video/webm' : 'image/*'}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const isVideo = file.type.startsWith('video');
                        setNewBannerType(isVideo ? 'video' : 'image');
                        const reader = new FileReader();
                        reader.onload = () => {
                          setNewBannerPreview(reader.result as string);
                        };
                        reader.readAsDataURL(file);
                      }}
                      className="hidden"
                    />
                  </label>
                )}
              </div>

              {/* If Video: Optional Poster */}
              {newBannerType === 'video' && newBannerPreview && (
                <div className="p-3 rounded-xl bg-black/30 border border-white/10 space-y-2">
                  <label className="text-[11px] font-bold text-stone-300 block">
                    वीडियो पोस्टर थंबनेल (Optional Poster Image)
                  </label>
                  <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-xs text-stone-300 cursor-pointer">
                    <ImageIcon className="w-3.5 h-3.5 text-amber-400" />
                    <span>{newBannerPosterPreview ? 'पोस्टर बदलें' : 'पोस्टर फोटो अपलोड करें'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = () => setNewBannerPosterPreview(reader.result as string);
                        reader.readAsDataURL(file);
                      }}
                      className="hidden"
                    />
                  </label>
                </div>
              )}

              {/* Banner Label Input */}
              <div>
                <label className="text-[11px] font-bold text-stone-300 block mb-1">
                  बैनर का नाम / पहचान (Label/Alt Text)
                </label>
                <input
                  type="text"
                  value={newBannerAltText}
                  onChange={(e) => setNewBannerAltText(e.target.value)}
                  placeholder="उदा. AI Reels Pro Banner 1"
                  className="w-full px-3 py-2 rounded-xl bg-stone-900 border border-white/15 text-xs text-white placeholder-stone-500 focus:outline-none focus:border-amber-400"
                />
              </div>

              {/* Add to Pool Submit Button */}
              <button
                type="button"
                onClick={handleAddPricingBannerToPool}
                disabled={isSavingPricingBanner || !newBannerPreview}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-400 to-[#ff9f00] text-black font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-40 cursor-pointer shadow-lg shadow-amber-500/20"
              >
                {isSavingPricingBanner ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4 stroke-[3]" />
                )}
                <span>बैनर पूल में जोड़ें (Add to Banner Pool)</span>
              </button>
            </div>

            {/* SECTION 2: TEST ROTATION & LIVE CUSTOMER PREVIEW */}
            <div className="p-4 rounded-2xl bg-stone-900/60 border border-white/10 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h5 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                    <span>2. ग्राहक अनुभव लाइव टेस्ट (Customer Refresh Simulation)</span>
                  </h5>
                  <p className="text-[11px] text-stone-400 mt-0.5">
                    चेक करें कि ग्राहक जब प्राइसिंग पेज खोलेगा या रिफ्रेश करेगा तो उसे कौन-सा बैनर दिखेगा।
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleTestRandomRefresh}
                  disabled={isTestingRefresh || pricingBannerPool.length === 0}
                  className="px-3.5 py-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 text-xs font-bold flex items-center gap-2 transition-all active:scale-95 disabled:opacity-40 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isTestingRefresh ? 'animate-spin' : ''}`} />
                  <span>🎲 रिफ्रेश टेस्ट करें (Test Refresh)</span>
                </button>
              </div>

              {testRotatedBanner ? (
                <div className="relative rounded-2xl overflow-hidden border border-white/15 bg-black max-h-72 w-full flex items-center justify-center">
                  {testRotatedBanner.mediaType === 'video' ? (
                    <video
                      src={testRotatedBanner.mediaUrl}
                      poster={testRotatedBanner.posterUrl || undefined}
                      muted
                      loop
                      autoPlay
                      playsInline
                      className="max-h-72 w-full object-contain"
                    />
                  ) : (
                    <img
                      src={testRotatedBanner.mediaUrl}
                      alt={testRotatedBanner.altText || 'Customer Preview'}
                      className="max-h-72 w-full object-contain"
                    />
                  )}
                  <div className="absolute top-2 left-2 px-2.5 py-1 rounded-full bg-black/75 backdrop-blur-md text-[10px] font-bold text-cyan-300 border border-cyan-500/30 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                    <span>ग्राहक को दिखने वाला बैनर ({testRotatedBanner.mediaType === 'video' ? 'वीडियो' : 'फोटो'})</span>
                  </div>
                </div>
              ) : (
                <div className="p-6 text-center rounded-xl bg-black/30 border border-white/5 text-stone-400 text-xs">
                  अभी कोई बैनर सक्रिय नहीं है। ऊपर से फोटो अपलोड करके पूल में जोड़ें।
                </div>
              )}
            </div>

            {/* SECTION 3: BANNER POOL LIST & CONTROLS */}
            <div className="p-4 rounded-2xl bg-stone-900/60 border border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <h5 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Layers className="w-3.5 h-3.5 text-amber-400" />
                  <span>3. मौजूदा बैनर सूची (Active Banners Pool: {pricingBannerPool.length})</span>
                </h5>
                <span className="text-[10px] text-stone-400">
                  सक्रिय: {pricingBannerPool.filter((b) => b.isEnabled !== false).length}
                </span>
              </div>

              {pricingBannerPool.length === 0 ? (
                <div className="p-8 text-center rounded-2xl bg-black/30 border border-white/5 space-y-2">
                  <ImageIcon className="w-8 h-8 text-stone-500 mx-auto opacity-60" />
                  <p className="text-xs text-stone-300 font-semibold">
                    पूल में अभी कोई बैनर नहीं है
                  </p>
                  <p className="text-[11px] text-stone-500">
                    ऊपर दिए गए फॉर्म से 4 से 5 फोटो अपलोड करें। हर बार रिफ्रेश करने पर ग्राहक को अलग फोटो दिखेगा।
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {pricingBannerPool.map((banner, index) => {
                    const isActive = banner.isEnabled !== false;
                    return (
                      <div
                        key={banner.id || index}
                        className={`p-3 rounded-2xl border transition-all flex gap-3 ${
                          isActive
                            ? 'bg-black/50 border-white/15 hover:border-amber-500/40'
                            : 'bg-black/30 border-white/5 opacity-60'
                        }`}
                      >
                        {/* Thumbnail */}
                        <div className="relative w-20 h-24 rounded-xl overflow-hidden bg-black shrink-0 border border-white/10 flex items-center justify-center">
                          {banner.mediaType === 'video' ? (
                            <video
                              src={banner.mediaUrl}
                              poster={banner.posterUrl || undefined}
                              muted
                              playsInline
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <img
                              src={banner.mediaUrl}
                              alt={banner.altText || 'Banner'}
                              className="w-full h-full object-cover"
                            />
                          )}
                          <span className="absolute bottom-0 inset-x-0 bg-black/80 text-[8px] font-bold text-amber-300 text-center uppercase py-0.5">
                            {banner.mediaType === 'video' ? 'Video' : 'Photo'}
                          </span>
                        </div>

                        {/* Banner Details & Action Controls */}
                        <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[10px] font-bold text-white truncate max-w-[140px]">
                                {banner.altText || `बैनर #${index + 1}`}
                              </span>
                              <span
                                className={`text-[9px] font-bold px-1.5 py-0.2 rounded-md ${
                                  isActive
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                    : 'bg-stone-700 text-stone-400'
                                }`}
                              >
                                {isActive ? 'सक्रिय ON' : 'बंद OFF'}
                              </span>
                            </div>
                            <p className="text-[9.5px] text-stone-400 mt-1 line-clamp-1 font-mono">
                              ID: {banner.id}
                            </p>
                          </div>

                          {/* Toggle & Delete Buttons */}
                          <div className="flex items-center gap-1.5 pt-2">
                            <button
                              type="button"
                              onClick={() => handleToggleBannerStatus(banner.id, isActive)}
                              className={`flex-1 py-1.5 px-2 rounded-xl text-[10px] font-bold flex items-center justify-center gap-1 border transition-all cursor-pointer ${
                                isActive
                                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/30 hover:bg-amber-500/25'
                                  : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25'
                              }`}
                              title={isActive ? 'बैनर बंद करें' : 'बैनर चालू करें'}
                            >
                              {isActive ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                              <span>{isActive ? 'निष्क्रिय करें' : 'सक्रिय करें'}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteBannerFromPool(banner.id)}
                              className="p-1.5 rounded-xl bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25 transition-all cursor-pointer"
                              title="पूल से हटाएं"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Strict Isolation Notice */}
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 space-y-1">
              <div className="flex items-center gap-1.5 text-amber-300 text-[11px] font-bold">
                <Info className="w-3.5 h-3.5" />
                <span>आइसोलेशन सुरक्षा गारंटी (Strict Isolation)</span>
              </div>
              <p className="text-[10px] text-stone-400 leading-relaxed">
                यह प्राइसिंग बैनर पूल केवल प्लान/प्राइसिंग पेज के लिए सुरक्षित रूप से संग्रहीत होता है। यह कभी भी पब्लिक टेम्पलेट ग्रिड, होम बैनर, या जेनरेशन रेसिपी में शामिल नहीं होता और न ही टेम्पलेट काउंट को प्रभावित करता है।
              </p>
            </div>
          </div>
        )}

        {/* TAB 3: FACE SWAP STUDIO (Scenes Manager & Global Demo Video) */}
        {(activeTab === 'faceswap' || activeTab === 'demo') && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
            {/* Sub-navigation pills: Scenes & Templates vs Global Demo Video */}
            <div className="flex items-center gap-2 p-1 rounded-2xl bg-black/40 border border-white/10">
              <button
                type="button"
                onClick={() => setFaceSwapSection('scenes')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  faceSwapSection === 'scenes'
                    ? 'bg-gradient-to-r from-amber-400 to-[#d4af37] text-stone-950 font-black shadow-md'
                    : 'text-stone-300 hover:text-white'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Face Swap Templates / Scenes ({adminFaceSwapScenes.length || faceSwapScenes.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setFaceSwapSection('demo')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  faceSwapSection === 'demo'
                    ? 'bg-gradient-to-r from-emerald-400 to-teal-500 text-stone-950 font-black shadow-md'
                    : 'text-stone-300 hover:text-white'
                }`}
              >
                <VideoIcon className="w-3.5 h-3.5" />
                <span>Global Featured Demo Video</span>
              </button>
            </div>

            {/* SECTION A: INDIVIDUAL FACE SWAP SCENES MANAGER */}
            {faceSwapSection === 'scenes' && (
              <div className="space-y-4">
                {faceSwapSubTab === 'list' ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                            Active & Draft Face Swap Scenes
                          </h4>
                          {/* Live Storage Engine Status Badge */}
                          <button
                            type="button"
                            onClick={() => {
                              fetchStorageStatus();
                              setShowStorageDiagnostics(true);
                            }}
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 border transition-all cursor-pointer ${
                              storageStatus?.activeDriver === 'cloudflare_r2' && storageStatus?.r2LiveAuthenticated
                                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25'
                                : 'bg-amber-500/15 text-amber-300 border-amber-500/30 hover:bg-amber-500/25'
                            }`}
                            title="Inspect live storage driver (Cloudflare R2 vs Local Fallback)"
                          >
                            {storageStatus?.activeDriver === 'cloudflare_r2' && storageStatus?.r2LiveAuthenticated ? (
                              <>
                                <Cloud className="w-3 h-3 text-emerald-400" />
                                <span>Storage: Cloudflare R2 (Active)</span>
                              </>
                            ) : (
                              <>
                                <HardDrive className="w-3 h-3 text-amber-400" />
                                <span>Storage: Local Fallback (R2 Pending)</span>
                              </>
                            )}
                          </button>
                        </div>
                        <p className="text-[11px] text-stone-400">
                          Manage each scene's Sample Face, Before Video, and Swapped After Video.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleNewScene}
                        className="px-3.5 py-1.5 rounded-xl bg-[#ff9f00] text-black text-xs font-black flex items-center gap-1.5 shadow-md hover:brightness-110 active:scale-95 transition-all cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        <span>New Scene</span>
                      </button>
                    </div>

                    <div className="space-y-2.5">
                      {(adminFaceSwapScenes.length > 0 ? adminFaceSwapScenes : faceSwapScenes).map((scene) => (
                        <div
                          key={scene.id}
                          className="p-3 rounded-2xl bg-stone-900/70 border border-white/10 hover:border-white/20 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          {/* 3 Asset Thumbnails */}
                          <div className="flex items-center gap-2 shrink-0">
                            {/* 1. Sample Face */}
                            <div className="relative w-12 h-14 rounded-xl overflow-hidden bg-black border border-white/10">
                              <img
                                src={scene.sampleFace}
                                alt="Sample Face"
                                className="w-full h-full object-cover"
                              />
                              <span className="absolute bottom-0 inset-x-0 bg-black/80 text-[7.5px] font-bold text-amber-300 text-center uppercase py-0.5">
                                Face
                              </span>
                            </div>

                            {/* 2. Before / Original Video */}
                            <div className="relative w-12 h-14 rounded-xl overflow-hidden bg-black border border-white/10">
                              {isVideoMedia(scene.sourceVideoPreview) ? (
                                <video
                                  src={scene.sourceVideoPreview}
                                  muted
                                  playsInline
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <img
                                  src={scene.sourceVideoPreview}
                                  alt="Original"
                                  className="w-full h-full object-cover"
                                />
                              )}
                              <span className="absolute bottom-0 inset-x-0 bg-black/80 text-[7.5px] font-bold text-stone-300 text-center uppercase py-0.5">
                                Before
                              </span>
                            </div>

                            {/* 3. After / Swapped Video */}
                            <div className="relative w-12 h-14 rounded-xl overflow-hidden bg-black border border-amber-500/40 shadow-sm">
                              {isVideoMedia(scene.resultVideoPreview) ? (
                                <video
                                  src={scene.resultVideoPreview}
                                  muted
                                  playsInline
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <img
                                  src={scene.resultVideoPreview}
                                  alt="Swapped"
                                  className="w-full h-full object-cover"
                                />
                              )}
                              <span className="absolute bottom-0 inset-x-0 bg-amber-500/90 text-[7.5px] font-black text-stone-950 text-center uppercase py-0.5">
                                Swapped
                              </span>
                            </div>
                          </div>

                          {/* Scene Meta */}
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-xs font-bold text-white truncate max-w-[220px]">
                                {scene.title}
                              </h4>
                              <span className="px-2 py-0.5 rounded-full bg-white/10 text-[9.5px] font-semibold text-stone-300">
                                {scene.category || 'General'}
                              </span>
                              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-[9.5px] font-bold text-amber-300 border border-amber-500/30">
                                {scene.creditCost || 45} Credits
                              </span>
                            </div>

                            <p className="text-[10px] text-stone-400 line-clamp-1">
                              {scene.description || 'No description provided'}
                            </p>

                            <div className="flex items-center gap-2 pt-0.5 text-[10px]">
                              <span
                                className={`px-2 py-0.5 rounded-md font-bold uppercase tracking-wider ${
                                  scene.status === 'draft'
                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                }`}
                              >
                                {scene.status === 'draft' ? 'Draft' : 'Published'}
                              </span>

                              <span
                                className={`px-2 py-0.5 rounded-md font-bold uppercase tracking-wider ${
                                  scene.isActive !== false
                                    ? 'bg-blue-500/20 text-blue-300'
                                    : 'bg-stone-700 text-stone-400'
                                }`}
                              >
                                {scene.isActive !== false ? 'Active ON' : 'Active OFF'}
                              </span>

                              <span className="text-stone-500 font-mono text-[9px]">
                                {scene.durationSeconds || 8}s · {scene.aspectRatio || '9:16'}
                              </span>
                            </div>
                          </div>

                          {/* Quick Mobile Actions */}
                          <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                            {/* Active ON/OFF Toggle */}
                            <button
                              type="button"
                              onClick={() => handleToggleSceneActive(scene)}
                              title={scene.isActive !== false ? 'Deactivate scene' : 'Activate scene'}
                              className={`p-2 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer ${
                                scene.isActive !== false
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30'
                                  : 'bg-white/5 text-stone-400 hover:text-white'
                              }`}
                            >
                              {scene.isActive !== false ? (
                                <Eye className="w-3.5 h-3.5" />
                              ) : (
                                <EyeOff className="w-3.5 h-3.5" />
                              )}
                            </button>

                            {/* Status Draft/Publish Toggle */}
                            <button
                              type="button"
                              onClick={() => handleToggleSceneStatus(scene)}
                              title="Toggle Draft/Publish"
                              className="px-2 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-stone-300 hover:text-white text-[10px] font-bold border border-white/10 transition-colors cursor-pointer"
                            >
                              {scene.status === 'draft' ? 'Publish' : 'Draft'}
                            </button>

                            {/* Edit Button */}
                            <button
                              type="button"
                              onClick={() => handleEditScene(scene)}
                              className="p-2 rounded-xl bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 border border-cyan-500/40 text-xs font-bold transition-colors cursor-pointer"
                              title="Edit Scene"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>

                            {/* Delete Button */}
                            <button
                              type="button"
                              onClick={() => handleDeleteScene(scene)}
                              className="p-2 rounded-xl bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border border-rose-500/40 text-xs font-bold transition-colors cursor-pointer"
                              title="Delete Scene"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  /* SCENE EDIT / ADD FORM */
                  <div className="space-y-4">
                    <div className="flex items-center justify-between pb-2 border-b border-white/10">
                      <div>
                        <h4 className="text-sm font-extrabold text-white flex items-center gap-1.5">
                          <Wand2 className="w-4 h-4 text-amber-400" />
                          <span>
                            {faceSwapSubTab === 'add' ? 'Create New Face Swap Scene' : `Edit Scene: ${sceneTitle || 'Scene'}`}
                          </span>
                        </h4>
                        <p className="text-[11px] text-stone-400">
                          Upload all 3 required demonstration assets and configure costs.
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setFaceSwapSubTab('list');
                          setEditingScene(null);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-stone-300 hover:text-white text-xs font-bold transition-colors cursor-pointer"
                      >
                        ← Back to Scenes
                      </button>
                    </div>

                    {/* UPLOAD PROGRESS BANNER */}
                    {uploadStageInfo && (
                      <div className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center gap-3 animate-pulse">
                        <RefreshCw className="w-4 h-4 text-amber-400 animate-spin shrink-0" />
                        <div className="min-w-0">
                          <span className="text-[10px] font-black uppercase tracking-wider text-amber-300 block">
                            {uploadStageInfo.step}
                          </span>
                          <p className="text-xs font-bold text-white truncate">
                            {uploadStageInfo.message}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* DETAILED DIAGNOSTIC ERROR DISPLAY */}
                    {detailedError && (
                      <div className="p-4 rounded-2xl bg-red-950/50 border border-red-500/40 text-stone-200 space-y-3 shadow-xl">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2.5">
                            <div className="p-2 rounded-xl bg-red-500/20 text-red-400 border border-red-500/30 shrink-0">
                              <AlertTriangle className="w-5 h-5" />
                            </div>
                            <div>
                              <span className="px-2 py-0.5 rounded-md bg-red-500/20 text-red-300 border border-red-500/30 text-[9.5px] font-black uppercase tracking-wider">
                                {detailedError.stepNumber} · {detailedError.stage}
                              </span>
                              <h4 className="text-xs font-black text-white mt-1">
                                Operation Failed: {detailedError.stage}
                              </h4>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setDetailedError(null)}
                            className="text-stone-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Technical Error Details */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] bg-black/60 p-2.5 rounded-xl border border-white/5 font-mono">
                          <div>
                            <span className="text-stone-500 block text-[9.5px]">Server Error:</span>
                            <span className="text-red-300 font-semibold break-words">
                              {detailedError.serverError || 'No error message returned from server'}
                            </span>
                          </div>
                          <div>
                            <span className="text-stone-500 block text-[9.5px]">Status & Code:</span>
                            <span className="text-amber-300 font-semibold">
                              {detailedError.httpStatus ? `HTTP ${detailedError.httpStatus}` : 'Validation Error'} ({detailedError.errorCode || 'FAILED'})
                            </span>
                          </div>
                          {detailedError.fileName && (
                            <div className="sm:col-span-2 pt-1 border-t border-white/5">
                              <span className="text-stone-500 block text-[9.5px]">Target Media Asset:</span>
                              <span className="text-stone-300 truncate block">
                                {detailedError.fileName} · {detailedError.fileType || 'unknown format'} · {detailedError.fileSizeFormatted || 'unknown size'}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Actionable Guidance */}
                        <div className="space-y-1.5 text-xs bg-black/30 p-2.5 rounded-xl border border-white/5">
                          <div className="flex items-start gap-1.5 text-stone-300">
                            <span className="font-bold text-amber-300 shrink-0">Probable Cause:</span>
                            <span className="leading-relaxed">{detailedError.probableCause}</span>
                          </div>
                          <div className="flex items-start gap-1.5 text-stone-300">
                            <span className="font-bold text-emerald-400 shrink-0">Next Step:</span>
                            <span className="leading-relaxed">{detailedError.nextStep}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* THREE DEDICATED ASSET SLOTS */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {/* ASSET 1: SAMPLE FACE PHOTO */}
                      <div className="p-3 rounded-2xl bg-black/40 border border-white/10 space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-black text-amber-300 uppercase tracking-wider flex items-center gap-1">
                            <span>1. Sample Face Photo</span>
                          </label>
                          <span className="text-[9px] text-stone-400">image/*</span>
                        </div>
                        <p className="text-[10px] text-stone-400">
                          Portrait photo of an example person. Used for reference thumbnail only.
                        </p>

                        <div className="relative aspect-[3/4] w-full rounded-xl overflow-hidden bg-stone-950 border border-white/10 flex items-center justify-center">
                          {sceneSampleFace ? (
                            <img
                              src={sceneSampleFace}
                              alt="Sample Face Preview"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="text-center p-3 text-stone-500">
                              <ImageIcon className="w-8 h-8 mx-auto mb-1 opacity-50" />
                              <span className="text-[10px] block font-semibold">No face photo selected</span>
                            </div>
                          )}
                        </div>

                        {sceneSampleFaceName && (
                          <span className="text-[10px] text-stone-400 block truncate font-mono">
                            File: {sceneSampleFaceName}
                          </span>
                        )}

                        <input
                          ref={sceneSampleFaceFileRef}
                          type="file"
                          accept="image/*"
                          onChange={handleSelectSampleFace}
                          className="hidden"
                        />

                        <button
                          type="button"
                          onClick={() => sceneSampleFaceFileRef.current?.click()}
                          className="w-full py-2 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Upload className="w-3.5 h-3.5 text-amber-400" />
                          <span>{sceneSampleFace ? 'Replace Photo' : 'Choose Photo from Gallery'}</span>
                        </button>

                        <input
                          type="text"
                          value={sceneSampleFace.startsWith('data:') ? '' : sceneSampleFace}
                          onChange={(e) => {
                            setSceneSampleFace(e.target.value.trim());
                            setSceneSampleFaceName('Direct URL');
                          }}
                          placeholder="Or paste direct Image URL"
                          className="w-full px-2.5 py-1.5 rounded-lg bg-black/60 border border-white/10 text-[11px] text-white placeholder-stone-500 focus:outline-none focus:border-amber-400"
                        />
                      </div>

                      {/* ASSET 2: ORIGINAL / BEFORE VIDEO */}
                      <div className="p-3 rounded-2xl bg-black/40 border border-white/10 space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-black text-cyan-300 uppercase tracking-wider flex items-center gap-1">
                            <span>2. Original / Before Video</span>
                          </label>
                          <span className="text-[9px] text-stone-400">video/*</span>
                        </div>
                        <p className="text-[10px] text-stone-400">
                          Original driving video of the scene. Displayed on the "Original" preview tab.
                        </p>

                        <div className="relative aspect-[3/4] w-full rounded-xl overflow-hidden bg-stone-950 border border-white/10 flex items-center justify-center">
                          {sceneSourceVideo ? (
                            isVideoMedia(sceneSourceVideo) ? (
                              <video
                                src={sceneSourceVideo}
                                controls
                                playsInline
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <img
                                src={sceneSourceVideo}
                                alt="Original Preview"
                                className="w-full h-full object-cover"
                              />
                            )
                          ) : (
                            <div className="text-center p-3 text-stone-500">
                              <VideoIcon className="w-8 h-8 mx-auto mb-1 opacity-50" />
                              <span className="text-[10px] block font-semibold">No original video selected</span>
                            </div>
                          )}
                        </div>

                        {sceneSourceVideoName && (
                          <span className="text-[10px] text-stone-400 block truncate font-mono">
                            File: {sceneSourceVideoName}
                          </span>
                        )}

                        <input
                          ref={sceneSourceVideoFileRef}
                          type="file"
                          accept="video/*"
                          onChange={handleSelectSourceVideo}
                          className="hidden"
                        />

                        <button
                          type="button"
                          onClick={() => sceneSourceVideoFileRef.current?.click()}
                          className="w-full py-2 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Upload className="w-3.5 h-3.5 text-cyan-400" />
                          <span>{sceneSourceVideo ? 'Replace Video' : 'Choose Video from Phone'}</span>
                        </button>

                        <input
                          type="text"
                          value={sceneSourceVideo.startsWith('data:') ? '' : sceneSourceVideo}
                          onChange={(e) => {
                            setSceneSourceVideo(e.target.value.trim());
                            setSceneSourceVideoName('Direct URL');
                          }}
                          placeholder="Or paste direct Video URL (MP4)"
                          className="w-full px-2.5 py-1.5 rounded-lg bg-black/60 border border-white/10 text-[11px] text-white placeholder-stone-500 focus:outline-none focus:border-amber-400"
                        />
                      </div>

                      {/* ASSET 3: SWAPPED FACE / AFTER VIDEO */}
                      <div className="p-3 rounded-2xl bg-black/40 border border-amber-500/30 space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-black text-emerald-300 uppercase tracking-wider flex items-center gap-1">
                            <span>3. Swapped / After Video</span>
                          </label>
                          <span className="text-[9px] text-stone-400">video/*</span>
                        </div>
                        <p className="text-[10px] text-stone-400">
                          Final face-swapped result video. Default preview shown when opening this scene.
                        </p>

                        <div className="relative aspect-[3/4] w-full rounded-xl overflow-hidden bg-stone-950 border border-white/10 flex items-center justify-center">
                          {sceneResultVideo ? (
                            isVideoMedia(sceneResultVideo) ? (
                              <video
                                src={sceneResultVideo}
                                controls
                                playsInline
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <img
                                src={sceneResultVideo}
                                alt="Swapped Preview"
                                className="w-full h-full object-cover"
                              />
                            )
                          ) : (
                            <div className="text-center p-3 text-stone-500">
                              <Sparkles className="w-8 h-8 mx-auto mb-1 opacity-50" />
                              <span className="text-[10px] block font-semibold">No swapped video selected</span>
                            </div>
                          )}
                        </div>

                        {sceneResultVideoName && (
                          <span className="text-[10px] text-stone-400 block truncate font-mono">
                            File: {sceneResultVideoName}
                          </span>
                        )}

                        <input
                          ref={sceneResultVideoFileRef}
                          type="file"
                          accept="video/*"
                          onChange={handleSelectResultVideo}
                          className="hidden"
                        />

                        <button
                          type="button"
                          onClick={() => sceneResultVideoFileRef.current?.click()}
                          className="w-full py-2 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Upload className="w-3.5 h-3.5 text-emerald-400" />
                          <span>{sceneResultVideo ? 'Replace Video' : 'Choose Video from Phone'}</span>
                        </button>

                        <input
                          type="text"
                          value={sceneResultVideo.startsWith('data:') ? '' : sceneResultVideo}
                          onChange={(e) => {
                            setSceneResultVideo(e.target.value.trim());
                            setSceneResultVideoName('Direct URL');
                          }}
                          placeholder="Or paste direct Video URL (MP4)"
                          className="w-full px-2.5 py-1.5 rounded-lg bg-black/60 border border-white/10 text-[11px] text-white placeholder-stone-500 focus:outline-none focus:border-amber-400"
                        />
                      </div>
                    </div>

                    {/* METADATA FORM */}
                    <div className="space-y-3 p-4 rounded-2xl bg-black/40 border border-white/10">
                      <div>
                        <label className="text-[11px] font-bold text-stone-300 block mb-1">
                          Scene Title *
                        </label>
                        <input
                          type="text"
                          value={sceneTitle}
                          onChange={(e) => setSceneTitle(e.target.value)}
                          placeholder="e.g. Viral Instagram Reels Sequence"
                          className="w-full px-3 py-2 rounded-xl bg-stone-900 border border-white/15 text-xs text-white placeholder-stone-500 focus:outline-none focus:border-amber-400"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-stone-300 block mb-1">
                          Scene Description
                        </label>
                        <textarea
                          value={sceneDescription}
                          onChange={(e) => setSceneDescription(e.target.value)}
                          placeholder="e.g. Electrifying neon stage choreography with fluid hip-hop footwork..."
                          rows={2}
                          className="w-full px-3 py-2 rounded-xl bg-stone-900 border border-white/15 text-xs text-white placeholder-stone-500 focus:outline-none focus:border-amber-400 resize-none leading-relaxed"
                        />
                      </div>

                      {/* SCENE MASTER RECIPE PROMPT */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] font-bold text-amber-300 flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>Motion Transfer Scene Recipe Prompt (सीन AI प्रॉम्ट - Optional)</span>
                          </label>
                          <span className="text-[9.5px] text-stone-400">
                            {sceneMasterRecipePrompt.length} chars
                          </span>
                        </div>
                        <textarea
                          value={sceneMasterRecipePrompt}
                          onChange={(e) => setSceneMasterRecipePrompt(e.target.value)}
                          placeholder="e.g. High aesthetic cinematic neural motion transfer. Seamlessly map target facial identity..."
                          rows={3}
                          className="w-full px-3 py-2 rounded-xl bg-stone-900 border border-white/15 text-xs text-white placeholder-stone-500 focus:outline-none focus:border-amber-400 resize-none leading-relaxed font-mono"
                        />
                        <p className="text-[10px] text-stone-400 mt-1">
                          प्रॉम्ट क्रम: Global Identity Prompt → Scene Recipe Prompt → Customer Instructions. Existing scenes बिना इस field के भी सुरक्षित चलेंगे।
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="text-[11px] font-bold text-stone-300 block mb-1">
                            Category
                          </label>
                          <input
                            type="text"
                            value={sceneCategory}
                            onChange={(e) => setSceneCategory(e.target.value)}
                            placeholder="e.g. Dance & Viral"
                            className="w-full px-3 py-2 rounded-xl bg-stone-900 border border-white/15 text-xs text-white placeholder-stone-500 focus:outline-none focus:border-amber-400"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] font-bold text-stone-300 block mb-1">
                            Credit Cost (✦)
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={500}
                            value={sceneCreditCost}
                            onChange={(e) => setSceneCreditCost(Number(e.target.value) || 45)}
                            className="w-full px-3 py-2 rounded-xl bg-stone-900 border border-white/15 text-xs text-white placeholder-stone-500 focus:outline-none focus:border-amber-400 font-mono"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] font-bold text-stone-300 block mb-1">
                            Duration (seconds)
                          </label>
                          <input
                            type="number"
                            min={4}
                            max={15}
                            value={sceneDurationSeconds}
                            onChange={(e) => setSceneDurationSeconds(Number(e.target.value) || 8)}
                            className="w-full px-3 py-2 rounded-xl bg-stone-900 border border-white/15 text-xs text-white placeholder-stone-500 focus:outline-none focus:border-amber-400 font-mono"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-stone-300 block mb-1">
                          Tags (comma-separated)
                        </label>
                        <input
                          type="text"
                          value={sceneTags}
                          onChange={(e) => setSceneTags(e.target.value)}
                          placeholder="Face Swap, Dance, Viral, Reels"
                          className="w-full px-3 py-2 rounded-xl bg-stone-900 border border-white/15 text-xs text-white placeholder-stone-500 focus:outline-none focus:border-amber-400"
                        />
                      </div>

                      {/* Toggles: Active, Featured, Aspect Ratio */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                        <label className="flex items-center gap-2 p-2 rounded-xl bg-stone-900/60 border border-white/10 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={sceneIsActive}
                            onChange={(e) => setSceneIsActive(e.target.checked)}
                            className="rounded accent-amber-500 w-4 h-4 cursor-pointer"
                          />
                          <span className="text-xs font-bold text-stone-300">Active ON</span>
                        </label>

                        <label className="flex items-center gap-2 p-2 rounded-xl bg-stone-900/60 border border-white/10 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={sceneIsFeatured}
                            onChange={(e) => setSceneIsFeatured(e.target.checked)}
                            className="rounded accent-amber-500 w-4 h-4 cursor-pointer"
                          />
                          <span className="text-xs font-bold text-stone-300">Featured</span>
                        </label>

                        <div>
                          <label className="text-[10px] font-bold text-stone-400 block mb-0.5">
                            Aspect Ratio
                          </label>
                          <select
                            value={sceneAspectRatio}
                            onChange={(e) => setSceneAspectRatio(e.target.value as any)}
                            className="w-full px-2 py-1.5 rounded-xl bg-stone-900 border border-white/15 text-xs text-white focus:outline-none focus:border-amber-400"
                          >
                            <option value="9:16">9:16 (Vertical Reel)</option>
                            <option value="16:9">16:9 (Landscape)</option>
                            <option value="1:1">1:1 (Square)</option>
                            <option value="4:5">4:5 (Portrait Feed)</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-[10px] font-bold text-stone-400 block mb-0.5">
                            Display Order
                          </label>
                          <input
                            type="number"
                            value={sceneOrder}
                            onChange={(e) => setSceneOrder(Number(e.target.value) || 0)}
                            className="w-full px-2 py-1.5 rounded-xl bg-stone-900 border border-white/15 text-xs text-white focus:outline-none focus:border-amber-400 font-mono"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons: Save Draft vs Publish Live */}
                    <div className="flex flex-col sm:flex-row items-center gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => handleSaveFaceSwapScene('draft')}
                        disabled={isSubmitting}
                        className="w-full sm:flex-1 py-3 rounded-2xl bg-stone-800 hover:bg-stone-700 text-stone-200 font-bold text-xs flex items-center justify-center gap-2 border border-white/10 active:scale-95 disabled:opacity-50 transition-all cursor-pointer"
                      >
                        <span>Save as Draft</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSaveFaceSwapScene('published')}
                        disabled={isSubmitting}
                        className="w-full sm:flex-1 py-3 rounded-2xl bg-gradient-to-r from-amber-400 to-[#d4af37] text-stone-950 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg hover:brightness-110 active:scale-95 disabled:opacity-50 transition-all cursor-pointer"
                      >
                        {isSubmitting ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <Check className="w-4 h-4 stroke-[3]" />
                        )}
                        <span>{editingScene ? 'Update & Publish Scene' : 'Publish Scene Live'}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* SECTION B: GLOBAL FEATURED DEMO VIDEO */}
            {faceSwapSection === 'demo' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                      Home Featured Demo Video
                    </h4>
                    <p className="text-[11px] text-stone-400 mt-0.5">
                      This is the marketing demo video played by default on the Home screen card.
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-[10px] font-bold text-amber-300">
                    Home Card Hero
                  </span>
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

                {/* Direct URL or Phone Gallery Upload */}
                <div className="space-y-3">
                  <div>
                    <label className="text-[11px] font-bold text-stone-300 block mb-1">
                      Or Paste Direct Video URL (MP4)
                    </label>
                    <input
                      type="text"
                      value={demoVideoPreview.startsWith('data:') ? '' : (demoVideoPreview || currentDemoVideoUrl)}
                      onChange={(e) => setDemoVideoPreview(e.target.value.trim())}
                      placeholder="https://.../video.mp4"
                      className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-xs text-white placeholder-stone-500 focus:outline-none focus:border-amber-400"
                    />
                  </div>

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
                    className="w-full py-3.5 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/15 text-white font-bold text-xs flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer"
                  >
                    <Upload className="w-4 h-4 text-emerald-400" />
                    <span>Choose New Demo Video from Phone</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveDemoVideo}
                    disabled={isSubmitting || (!demoVideoPreview && !currentDemoVideoUrl)}
                    className="w-full py-3.5 rounded-2xl bg-emerald-500 text-black font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 hover:brightness-110 active:scale-95 disabled:opacity-40 transition-all shadow-lg cursor-pointer"
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
          </div>
        )}

        {/* TAB 4: PROVIDER CATALOG (Higgsfield API + Google Veo + Gemini) */}
        {activeTab === 'catalog' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
            {/* Catalog Header & Refresh Button */}
            <div className="p-3.5 rounded-2xl bg-stone-900/90 border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-cyan-400" />
                    <span>Official Provider Model Catalog</span>
                  </h4>
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>{catalogSource || 'official_higgsfield_api'}</span>
                  </span>
                </div>
                <p className="text-[11px] text-stone-400 mt-0.5">
                  Live official models from Higgsfield API, Google Veo 3.1 & Gemini 2.5.
                </p>
              </div>

              <button
                type="button"
                onClick={fetchProviderCatalog}
                disabled={catalogLoading}
                className="px-3.5 py-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${catalogLoading ? 'animate-spin' : ''}`} />
                <span>{catalogLoading ? 'Refreshing...' : 'Refresh Current Catalog'}</span>
              </button>
            </div>

            {/* Provider Filter Tabs & Search Bar */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar shrink-0">
                {(['all', 'higgsfield', 'google_veo', 'gemini'] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setCatalogFilter(filter)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                      catalogFilter === filter
                        ? 'bg-white/15 text-white border border-white/20 shadow-sm'
                        : 'bg-black/30 text-stone-400 hover:text-white border border-white/5'
                    }`}
                  >
                    {filter === 'all'
                      ? `All (${catalogItems.length})`
                      : filter === 'higgsfield'
                      ? 'Higgsfield API'
                      : filter === 'google_veo'
                      ? 'Google Veo'
                      : 'Gemini'}
                  </button>
                ))}
              </div>

              <div className="relative flex-1">
                <input
                  type="text"
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  placeholder="Search provider models or workflows..."
                  className="w-full px-3 py-1.5 rounded-xl bg-black/50 border border-white/10 text-white text-xs placeholder-stone-500 focus:border-cyan-400 focus:outline-none"
                />
                {catalogSearch && (
                  <button
                    onClick={() => setCatalogSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-500 hover:text-white text-xs"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>

            {/* Catalog Items List */}
            {catalogItems.length === 0 && !catalogLoading ? (
              <div className="p-8 text-center rounded-2xl bg-stone-900/40 border border-white/5 space-y-2">
                <Sparkles className="w-8 h-8 text-cyan-400 mx-auto opacity-70" />
                <p className="text-xs text-stone-300">Click &ldquo;Refresh Current Catalog&rdquo; to fetch official models.</p>
                <button
                  type="button"
                  onClick={fetchProviderCatalog}
                  className="px-4 py-2 rounded-xl bg-cyan-500 text-black text-xs font-bold"
                >
                  Fetch Models Now
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {catalogItems
                  .filter((item) => {
                    if (catalogFilter !== 'all' && item.provider !== catalogFilter) return false;
                    if (catalogSearch.trim()) {
                      const q = catalogSearch.toLowerCase();
                      return (
                        item.name?.toLowerCase().includes(q) ||
                        item.model?.toLowerCase().includes(q) ||
                        item.description?.toLowerCase().includes(q)
                      );
                    }
                    return true;
                  })
                  .map((item) => (
                    <div
                      key={item.id}
                      className="p-3.5 rounded-2xl bg-stone-900/60 border border-white/10 hover:border-cyan-500/40 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
                    >
                      <div className="space-y-1 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-white/10 text-stone-200">
                            {item.provider}
                          </span>
                          <h5 className="text-xs font-bold text-white truncate">{item.name}</h5>
                          {item.manualRecipeRequired ? (
                            <span className="text-[9.5px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              ⚠️ Manual Recipe Required
                            </span>
                          ) : (
                            <span className="text-[9.5px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              ✨ Executable Recipe Ready
                            </span>
                          )}
                        </div>

                        <p className="text-[11px] text-stone-400 line-clamp-2">
                          {item.description}
                        </p>

                        <div className="flex items-center gap-3 text-[10px] text-stone-500 font-mono pt-0.5">
                          <span className="text-stone-400">{item.model}</span>
                          <span>•</span>
                          <span>{item.inputType.replace('_', ' ')}</span>
                          <span>•</span>
                          <span className="text-amber-400 font-semibold">${item.providerCostUsd?.toFixed(2)} USD</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleImportCatalogItem(item)}
                        className="px-3.5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-black flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-all shrink-0 cursor-pointer"
                      >
                        <span>Import to AI Prime → Review</span>
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        {/* PASTE RECIPE JSON MODAL OVERLAY */}
        {showPasteJsonModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <div className="w-full max-w-lg rounded-3xl bg-[#121118] border border-cyan-500/40 p-4 sm:p-5 space-y-3 shadow-2xl">
              <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Edit2 className="w-4 h-4 text-cyan-400" />
                  <span>Paste Recipe JSON</span>
                </h4>
                <button
                  type="button"
                  onClick={() => setShowPasteJsonModal(false)}
                  className="p-1 rounded-lg text-stone-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-[11px] text-stone-400">
                Paste an executable recipe JSON object. Valid keys: provider, model, workflow, prompt, inputType, aspectRatio, providerCostUsd.
              </p>

              <textarea
                value={pasteJsonText}
                onChange={(e) => {
                  setPasteJsonText(e.target.value);
                  setPasteJsonError(null);
                }}
                rows={8}
                placeholder={`{\n  "provider": "google_veo",\n  "model": "gemini-omni-1.1-flash",\n  "workflow": "viral-reels",\n  "prompt": "Cinematic slow-motion 60FPS video reel...",\n  "inputType": "IMAGE_OR_VIDEO"\n}`}
                className="w-full font-mono text-xs p-3 rounded-xl bg-black border border-white/15 text-stone-200 focus:border-cyan-400 focus:outline-none"
              />

              {pasteJsonError && (
                <div className="p-2.5 rounded-xl bg-rose-950/60 border border-rose-800/60 text-xs text-rose-300">
                  {pasteJsonError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowPasteJsonModal(false)}
                  className="px-3 py-2 rounded-xl text-xs font-semibold text-stone-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleApplyPastedJson}
                  className="px-4 py-2 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-black text-xs font-black shadow cursor-pointer active:scale-95 transition-all"
                >
                  Validate & Apply Recipe
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STORAGE DIAGNOSTICS MODAL OVERLAY */}
        {showStorageDiagnostics && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
            <div className="w-full max-w-lg rounded-3xl bg-[#121118] border border-amber-500/40 p-4 sm:p-5 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                    <HardDrive className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">Media Storage Engine Diagnostics</h4>
                    <span className="text-[10px] text-stone-400">Live authoritative check of R2 & Local fallback drivers</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowStorageDiagnostics(false)}
                  className="p-1 rounded-lg text-stone-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Driver Status Card */}
              <div className="p-3.5 rounded-2xl bg-black/60 border border-white/10 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-stone-300">Active Storage Driver:</span>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-black uppercase ${
                    storageStatus?.activeDriver === 'cloudflare_r2' && storageStatus?.r2LiveAuthenticated
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  }`}>
                    {storageStatus?.activeDriver === 'cloudflare_r2' && storageStatus?.r2LiveAuthenticated
                      ? 'Cloudflare R2 (Active & Verified)'
                      : 'Local Isolated Disk Storage (Fallback Active)'}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-stone-400">R2 Authenticated Probe:</span>
                  <span className={`font-mono font-bold ${
                    storageStatus?.r2LiveAuthenticated ? 'text-emerald-400' : 'text-amber-400'
                  }`}>
                    {storageStatus?.r2LiveAuthenticated ? 'CONNECTED' : (storageStatus?.r2Configured ? 'AUTH PROBE FAILED' : 'NOT CONFIGURED (PENDING KEYS)')}
                  </span>
                </div>

                {storageStatus?.bucket && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-stone-400">R2 Bucket:</span>
                    <span className="font-mono text-stone-200">{storageStatus.bucket}</span>
                  </div>
                )}

                {storageStatus?.r2Error && (
                  <div className="p-2 rounded-xl bg-red-950/40 border border-red-500/30 text-[11px] text-red-300">
                    <span className="font-bold block">Probe Error:</span>
                    {storageStatus.r2Error}
                  </div>
                )}
              </div>

              {/* Missing Env Vars */}
              {storageStatus?.missingEnvVars && storageStatus.missingEnvVars.length > 0 && (
                <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
                    <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Missing R2 Environment Variables for Cloudflare R2 Activation:</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {storageStatus.missingEnvVars.map((v: string) => (
                      <span key={v} className="px-2 py-0.5 rounded-md bg-stone-900 border border-amber-500/40 text-[10px] font-mono font-bold text-amber-200">
                        {v}
                      </span>
                    ))}
                  </div>
                  <p className="text-[10.5px] text-stone-400 leading-relaxed">
                    Until these environment variables are provided in production Cloud Run, all uploaded media is safely stored and served from secure local disk storage (<code className="text-stone-300">.data/uploads</code>).
                  </p>
                </div>
              )}

              {/* Local Storage Stats */}
              {storageStatus?.localStats && (
                <div className="p-3 rounded-2xl bg-stone-900/60 border border-white/10 text-xs space-y-1">
                  <span className="font-bold text-stone-300 block">Local Disk Fallback Usage:</span>
                  <div className="flex items-center justify-between text-stone-400 text-[11px]">
                    <span>Directory:</span>
                    <span className="font-mono text-stone-300 truncate max-w-[240px]">{storageStatus.localStats.directory}</span>
                  </div>
                  <div className="flex items-center justify-between text-stone-400 text-[11px]">
                    <span>Files Stored:</span>
                    <span className="font-mono text-white font-bold">{storageStatus.localStats.fileCount} items</span>
                  </div>
                  <div className="flex items-center justify-between text-stone-400 text-[11px]">
                    <span>Total Size:</span>
                    <span className="font-mono text-emerald-400 font-bold">{storageStatus.localStats.totalSizeFormatted}</span>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={fetchStorageStatus}
                  disabled={isTestingStorage}
                  className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isTestingStorage ? 'animate-spin' : ''}`} />
                  <span>Run Live Storage Probe</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowStorageDiagnostics(false)}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-400 to-[#d4af37] text-stone-950 text-xs font-black cursor-pointer shadow active:scale-95"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};
