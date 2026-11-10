import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  Template,
  UserProfile,
  CreditWallet,
  CreditTransaction,
  Generation,
  UserSubscription,
  PricingPlan,
  TopUpOption,
  FaceSwapScene,
  FaceSwapGenerateRequest,
  GenerationResult
} from '../types';
import { SEED_FACE_SWAP_SCENES } from '../data/faceSwapData';
import { SEED_TEMPLATES, INITIAL_PLANS, INITIAL_TOP_UPS } from '../data/templatesData';

export type PendingAction =
  | { type: 'generate'; templateId: string; inputMediaUrl: string; customPrompt?: string }
  | { type: 'buy_plan'; planId?: string }
  | {
      type: 'faceswap';
      payloadOrSceneId: string | FaceSwapGenerateRequest;
      legacyFacePhotoUrl?: string;
    }
  | { type: 'navigate_creations' }
  | { type: 'navigate_profile' };

interface AppContextType {
  // Navigation & Screens
  activeTab: 'home' | 'templates' | 'creations' | 'profile';
  setActiveTab: (tab: 'home' | 'templates' | 'creations' | 'profile') => void;

  // Face Swap Video
  faceSwapScenes: FaceSwapScene[];
  setFaceSwapScenes: React.Dispatch<React.SetStateAction<FaceSwapScene[]>>;
  refreshFaceSwapScenes: () => Promise<void>;
  selectedFaceSwapScene: FaceSwapScene | null;
  setSelectedFaceSwapScene: (scene: FaceSwapScene | null) => void;
  faceSwapModalOpen: boolean;
  setFaceSwapModalOpen: (open: boolean) => void;
  generateFaceSwapVideo: (
    payloadOrSceneId: string | FaceSwapGenerateRequest,
    legacyFacePhotoUrl?: string
  ) => Promise<GenerationResult>;

  // Templates
  templates: Template[];
  loadingTemplates: boolean;
  selectedTemplate: Template | null;
  setSelectedTemplate: (tpl: Template | null) => void;
  selectedCategory: string;
  setSelectedCategory: (cat: string) => void;
  selectedCategories: string[];
  setSelectedCategories: (cats: string[]) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  filterType: 'all' | 'photo' | 'video';
  setFilterType: (type: 'all' | 'photo' | 'video') => void;
  likedTemplates: string[];
  toggleLikeTemplate: (templateId: string) => Promise<void>;
  refreshTemplates: () => Promise<void>;
  catalogueStatus: 'loading' | 'ready' | 'empty' | 'offline_error';

  // User & Wallet & Admin
  user: UserProfile | null;
  isAdmin: boolean;
  serverAdminVerified: boolean;
  wallet: CreditWallet | null;
  activeSubscription: UserSubscription | null;
  transactions: CreditTransaction[];
  refreshUserData: () => Promise<void>;
  updateProfile: (name: string, avatar: string) => Promise<boolean>;
  deleteAccount: () => Promise<boolean>;
  logout: () => Promise<void>;

  // Generations
  generations: Generation[];
  loadingGenerations: boolean;
  activeGeneration: Generation | null;
  setActiveGeneration: (gen: Generation | null) => void;
  createGeneration: (
    templateId: string,
    inputMediaUrl: string,
    customPrompt?: string,
    mediaDetails?: {
      inputMediaUrls?: string[];
      inputMedia?: Array<{ slotId: string; type: string; media: string }>;
    },
    options?: {
      resolution?: string;
      durationSeconds?: number;
      model?: string;
      wardrobeSource?: string;
      wardrobeSourceA?: string;
      wardrobeSourceB?: string;
    }
  ) => Promise<GenerationResult>;
  deleteGeneration: (id: string) => Promise<void>;
  refreshGenerations: () => Promise<void>;

  // Plans & Payments
  plans: PricingPlan[];
  topUps: TopUpOption[];
  hasActivePlan: boolean;
  isIntroEligible: boolean;
  isPaying: boolean;
  initiateCheckout: (type: 'plan' | 'topup', itemId: string, provider?: 'cashfree' | 'razorpay', phone?: string) => Promise<{ success: boolean; orderId?: string; subscriptionId?: string; customerId?: string; shortUrl?: string; isAutoPay?: boolean; error?: string }>;
  verifyPayment: (orderId: string, type: 'plan' | 'topup', itemId: string, provider?: string, paymentId?: string, signature?: string, subscriptionId?: string) => Promise<{ success: boolean; error?: string }>;
  reconcilePayment: (paymentId?: string, subscriptionId?: string) => Promise<{ success: boolean; message?: string; error?: string }>;
  cancelSubscription: () => Promise<boolean>;

  // High-Intent Auth Modal & Pending Action Execution
  authModalOpen: boolean;
  setAuthModalOpen: (open: boolean) => void;
  pendingAction: PendingAction | null;
  setPendingAction: (action: PendingAction | null) => void;
  triggerHighIntentAction: (action: PendingAction) => boolean;
  onAuthSuccess: (authenticatedUser: UserProfile, token: string) => Promise<void>;

  // Modals & Sheets
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  plansModalOpen: boolean;
  setPlansModalOpen: (open: boolean) => void;
  topUpModalOpen: boolean;
  setTopUpModalOpen: (open: boolean) => void;
  insufficientCreditsModal: { open: boolean; requiredCredits: number; availableCredits: number } | null;
  setInsufficientCreditsModal: (val: { open: boolean; requiredCredits: number; availableCredits: number } | null) => void;
  supportModalOpen: boolean;
  setSupportModalOpen: (open: boolean) => void;
  legalModal: 'privacy' | 'terms' | 'refund' | 'delete' | null;
  setLegalModal: (modal: 'privacy' | 'terms' | 'refund' | 'delete' | null) => void;
  reportModalGenId: string | null;
  setReportModalGenId: (id: string | null) => void;
  transactionsModalOpen: boolean;
  setTransactionsModalOpen: (open: boolean) => void;
  templateManagerOpen: boolean;
  setTemplateManagerOpen: (open: boolean) => void;
  diagnosticsModalOpen: boolean;
  setDiagnosticsModalOpen: (open: boolean) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// Resilient Response Helper for Cloud Run 503 / HTML interception
export async function safeParseJsonResponse<T = any>(
  res: Response
): Promise<{ ok: boolean; status: number; data: T | null; error?: string }> {
  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');

  if (!isJson) {
    const rawText = await res.text().catch(() => '');
    if (res.status === 503) {
      return {
        ok: false,
        status: 503,
        data: null,
        error: 'Cloud Run service warming up (503 Service Unavailable). Please retry in a moment.'
      };
    }
    if (res.status === 401) {
      return {
        ok: false,
        status: 401,
        data: null,
        error: 'Authentication session expired or required (401 Unauthorized).'
      };
    }
    return {
      ok: false,
      status: res.status,
      data: null,
      error: rawText.slice(0, 160) || `Server returned HTTP ${res.status}`
    };
  }

  try {
    const data = await res.json();
    return {
      ok: res.ok,
      status: res.status,
      data,
      error: res.ok ? undefined : (data?.error || `HTTP ${res.status}`)
    };
  } catch {
    return {
      ok: false,
      status: res.status,
      data: null,
      error: 'Invalid JSON response from server'
    };
  }
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeTab, setActiveTab] = useState<'home' | 'templates' | 'creations' | 'profile'>('home');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [catalogueStatus, setCatalogueStatus] = useState<'loading' | 'ready' | 'empty' | 'offline_error'>('loading');
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [serverAdminVerified, setServerAdminVerified] = useState<boolean>(false);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [selectedCategoryState, setSelectedCategoryState] = useState<string>('Trending');
  const [selectedCategoriesState, setSelectedCategoriesState] = useState<string[]>(['Trending']);

  const selectedCategory = selectedCategoryState;
  const selectedCategories = selectedCategoriesState;

  const setSelectedCategory = useCallback((cat: string) => {
    setSelectedCategoryState(cat);
    if (cat === 'All') {
      setSelectedCategoriesState([]);
    } else {
      setSelectedCategoriesState([cat]);
    }
  }, []);

  const setSelectedCategories = useCallback((cats: string[]) => {
    setSelectedCategoriesState(cats);
    if (cats.length === 1) {
      setSelectedCategoryState(cats[0]);
    } else if (cats.length === 0) {
      setSelectedCategoryState('All');
    } else {
      setSelectedCategoryState(cats[0]);
    }
  }, []);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterType, setFilterType] = useState<'all' | 'photo' | 'video'>('all');
  const [likedTemplates, setLikedTemplates] = useState<string[]>([]);

  // Face Swap Video state
  const [faceSwapScenes, setFaceSwapScenes] = useState<FaceSwapScene[]>(SEED_FACE_SWAP_SCENES);
  const [selectedFaceSwapScene, setSelectedFaceSwapScene] = useState<FaceSwapScene | null>(null);
  const [faceSwapModalOpen, setFaceSwapModalOpen] = useState(false);

  // Clean initial user state: starts at NULL for unauthenticated visitors
  const [user, setUser] = useState<UserProfile | null>(null);
  const [wallet, setWallet] = useState<CreditWallet | null>({
    userId: '',
    balance: 0,
    lifetimeCredits: 0,
    spentCredits: 0,
    updatedAt: new Date().toISOString()
  });
  const [activeSubscription, setActiveSubscription] = useState<UserSubscription | null>(null);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);

  // Clean initial generations: zero fake generations
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [loadingGenerations, setLoadingGenerations] = useState(false);
  const [activeGeneration, setActiveGeneration] = useState<Generation | null>(null);

  const [plans, setPlans] = useState<PricingPlan[]>(INITIAL_PLANS);
  const [topUps, setTopUps] = useState<TopUpOption[]>(INITIAL_TOP_UPS);
  const [isPaying, setIsPaying] = useState(false);

  // High-Intent Action & Auth Modal
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  // Other Modals
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [plansModalOpen, setPlansModalOpen] = useState(false);
  const [topUpModalOpen, setTopUpModalOpen] = useState(false);
  const [insufficientCreditsModal, setInsufficientCreditsModal] = useState<{ open: boolean; requiredCredits: number; availableCredits: number } | null>(null);
  const [supportModalOpen, setSupportModalOpen] = useState(false);
  const [legalModal, setLegalModal] = useState<'privacy' | 'terms' | 'refund' | 'delete' | null>(null);
  const [reportModalGenId, setReportModalGenId] = useState<string | null>(null);
  const [transactionsModalOpen, setTransactionsModalOpen] = useState(false);
  const [templateManagerOpen, setTemplateManagerOpen] = useState(false);
  const [diagnosticsModalOpen, setDiagnosticsModalOpen] = useState(false);
  const [isIntroEligible, setIsIntroEligible] = useState<boolean>(true);

  // Active Plan Check: strictly require active or trial subscription (cancelled or expired do NOT count)
  const isCancelledOrExpired = Boolean(
    activeSubscription &&
      (activeSubscription.status === 'cancelled' ||
        activeSubscription.status === 'expired' ||
        activeSubscription.status === 'payment_failed')
  );
  const hasActivePlan = Boolean(
    activeSubscription &&
      !isCancelledOrExpired &&
      (activeSubscription.status === 'active' || activeSubscription.status === 'trial')
  );

  // Sync Plans and Top-Up packs from Central Server Configuration
  useEffect(() => {
    fetch('/api/payments/config')
      .then((res) => res.json())
      .then((data) => {
        if (data?.plans) setPlans(data.plans);
        if (data?.topUps) setTopUps(data.topUps);
      })
      .catch((err) => console.warn('[AppContext] Payment config sync note:', err));
  }, []);

  // Auth Header Helper
  const getAuthHeaders = (): Record<string, string> => {
    const token = localStorage.getItem('lumina_session_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  // Fetch Templates (Publicly accessible to any visitor)
  const fetchTemplates = useCallback(async () => {
    try {
      setLoadingTemplates(true);
      const params = new URLSearchParams();
      if (filterType !== 'all') params.append('type', filterType);
      if (selectedCategories.length > 0) {
        params.append('categories', selectedCategories.join(','));
      } else if (selectedCategory && selectedCategory !== 'All') {
        params.append('category', selectedCategory);
      }
      if (searchQuery.trim()) params.append('search', searchQuery.trim());

      const res = await fetch(`/api/templates?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const incoming = Array.isArray(data?.templates) ? data.templates : [];
        setTemplates(incoming);
        setCatalogueStatus(incoming.length > 0 ? 'ready' : 'empty');
      } else {
        setCatalogueStatus('offline_error');
      }
    } catch {
      setCatalogueStatus('offline_error');
    } finally {
      setLoadingTemplates(false);
    }
  }, [filterType, selectedCategory, selectedCategories, searchQuery]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  // Auto-refresh public catalogue on window focus and every 60s to reflect new admin publishes immediately
  useEffect(() => {
    const onFocus = () => {
      fetchTemplates();
    };
    window.addEventListener('focus', onFocus);
    const interval = setInterval(onFocus, 60000);
    return () => {
      window.removeEventListener('focus', onFocus);
      clearInterval(interval);
    };
  }, [fetchTemplates]);

  // Fetch Face Swap Scenes (Dynamic from server)
  const fetchFaceSwapScenes = useCallback(async () => {
    try {
      const res = await fetch('/api/faceswap/scenes');
      if (res.ok) {
        const data = await res.json();
        if (data.scenes && Array.isArray(data.scenes) && data.scenes.length > 0) {
          setFaceSwapScenes(data.scenes);
        }
      }
    } catch (err) {
      console.warn('[AppContext] Could not fetch face swap scenes:', err);
    }
  }, []);

  useEffect(() => {
    fetchFaceSwapScenes();
  }, [fetchFaceSwapScenes]);

  // Fetch User & Wallet (Only if session token exists)
  const refreshUserData = useCallback(async () => {
    const token = localStorage.getItem('lumina_session_token');
    if (!token) {
      setUser(null);
      setWallet({ userId: '', balance: 0, lifetimeCredits: 0, spentCredits: 0, updatedAt: new Date().toISOString() });
      setActiveSubscription(null);
      setTransactions([]);
      setGenerations([]);
      setIsIntroEligible(true);
      setIsAdmin(false);
      setServerAdminVerified(false);
      return;
    }

    try {
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      });

      // Clear the token ONLY when the server explicitly confirms an invalid/expired session with HTTP 401
      if (res.status === 401) {
        console.warn('[AppContext] Server explicitly confirmed session invalid/expired (HTTP 401). Clearing token.');
        localStorage.removeItem('lumina_session_token');
        setUser(null);
        setIsAdmin(false);
        setServerAdminVerified(false);
        return;
      }

      // Preserve session during temporary outages (Firestore OFFLINE, 5xx, timeouts, network errors)
      if (!res.ok) {
        console.warn(`[AppContext] /api/auth/me returned HTTP ${res.status}. Preserving session token for outage recovery.`);
        return;
      }

      const data = await res.json();
      if (data?.user) {
        setUser(data.user);
        if (data.wallet) setWallet(data.wallet);
        setActiveSubscription(data.activeSubscription || null);
        if (data.likedTemplates) setLikedTemplates(data.likedTemplates);
        if (typeof data.isIntroEligible === 'boolean') {
          setIsIntroEligible(data.isIntroEligible);
        }

        // Server-side cryptographic admin verification:
        // Keep "/api/admin/verify" as the SOLE source of "serverAdminVerified = true".
        // Never set "serverAdminVerified" merely from "user.role" or a client-side Gmail comparison.
        try {
          const adminCheckRes = await fetch('/api/admin/verify', {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (adminCheckRes.ok) {
            const adminData = await adminCheckRes.json();
            if (adminData.authorized === true) {
              setIsAdmin(true);
              setServerAdminVerified(true);
            } else {
              setIsAdmin(false);
              setServerAdminVerified(false);
            }
          } else {
            setIsAdmin(false);
            setServerAdminVerified(false);
          }
        } catch {
          setIsAdmin(false);
          setServerAdminVerified(false);
        }
      } else {
        // If response is 200 but user object is not yet populated (e.g. database syncing or offline),
        // DO NOT delete session token. Keep token for automatic recovery.
        console.warn('[AppContext] User record not returned in /api/auth/me. Preserving session token for recovery.');
      }
    } catch (err) {
      // Network errors, fetch aborts, or client offline: preserve token and keep current state
      console.warn('[AppContext] Network or timeout error during session refresh. Preserving session token:', err);
    }
  }, []);

  // Fetch Generations for Authenticated User
  const refreshGenerations = useCallback(async () => {
    const token = localStorage.getItem('lumina_session_token');
    if (!token) {
      setGenerations([]);
      return;
    }

    try {
      setLoadingGenerations(true);
      const res = await fetch('/api/generations', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.generations) {
          setGenerations(data.generations);
        }
      }
    } catch {
      // Keep existing
    } finally {
      setLoadingGenerations(false);
    }
  }, []);

  useEffect(() => {
    refreshUserData();
  }, [refreshUserData]);

  useEffect(() => {
    if (user) {
      refreshGenerations();
    }
  }, [user, refreshGenerations]);

  // Real Interactive Like Toggle on Templates
  const toggleLikeTemplate = async (templateId: string) => {
    if (!user) {
      setPendingAction(null);
      setAuthModalOpen(true);
      return;
    }

    // Optimistic UI update
    const isCurrentlyLiked = likedTemplates.includes(templateId);
    setLikedTemplates((prev) =>
      isCurrentlyLiked ? prev.filter((id) => id !== templateId) : [...prev, templateId]
    );

    setTemplates((prev) =>
      prev.map((t) => {
        if (t.id === templateId) {
          return {
            ...t,
            likesCount: Math.max(0, (t.likesCount || 0) + (isCurrentlyLiked ? -1 : 1))
          };
        }
        return t;
      })
    );

    try {
      await fetch(`/api/templates/${templateId}/like`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        }
      });
    } catch (err) {
      console.warn('Like toggle sync error:', err);
    }
  };

  // High-Intent Action Trigger Helper:
  // If user is already authenticated, returns true to proceed immediately.
  // If visitor is unauthenticated, stores the pending action, opens auth modal, and returns false.
  const triggerHighIntentAction = (action: PendingAction): boolean => {
    if (user) {
      return true;
    }
    setPendingAction(action);
    setAuthModalOpen(true);
    return false;
  };

  // Called after successful Firebase authentication
  const onAuthSuccess = async (authenticatedUser: UserProfile, token: string) => {
    localStorage.setItem('lumina_session_token', token);
    setUser(authenticatedUser);
    setAuthModalOpen(false);

    // Authoritative server-side verification: refreshUserData() calls /api/admin/verify
    // which is the sole authoritative source of truth for isAdmin and serverAdminVerified
    await refreshUserData();
    await refreshGenerations();

    // Automatically resume the high-intent action without user having to repeat steps!
    if (pendingAction) {
      const action = pendingAction;
      setPendingAction(null);

      if (action.type === 'generate') {
        // Automatically trigger generation with the selected template & uploaded media!
        const tpl = templates.find((t) => t.id === action.templateId);
        if (tpl) {
          setSelectedTemplate(tpl);
          createGeneration(action.templateId, action.inputMediaUrl, action.customPrompt);
        }
      } else if (action.type === 'buy_plan') {
        setPlansModalOpen(true);
      } else if (action.type === 'faceswap') {
        setFaceSwapModalOpen(true);
        generateFaceSwapVideo(action.payloadOrSceneId, action.legacyFacePhotoUrl);
      } else if (action.type === 'navigate_creations') {
        setActiveTab('creations');
      } else if (action.type === 'navigate_profile') {
        setActiveTab('profile');
      }
    }
  };

  // Profile Update
  const updateProfile = async (name: string, avatar: string): Promise<boolean> => {
    if (!user) return false;
    try {
      const res = await fetch('/api/auth/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({ name, avatar })
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        return true;
      }
    } catch {
      // Error
    }
    return false;
  };

  // Real Account Deletion
  const deleteAccount = async (): Promise<boolean> => {
    if (!user) return false;
    try {
      const res = await fetch('/api/auth/account', {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      if (res.ok) {
        localStorage.removeItem('lumina_session_token');
        setUser(null);
        setIsAdmin(false);
        setServerAdminVerified(false);
        setWallet({ userId: '', balance: 0, lifetimeCredits: 0, spentCredits: 0, updatedAt: '' });
        setGenerations([]);
        setTransactions([]);
        setActiveTab('home');
        return true;
      }
    } catch {
      // Error
    }
    return false;
  };

  // Logout
  const logout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: getAuthHeaders()
      });
    } catch {}
    localStorage.removeItem('lumina_session_token');
    setUser(null);
    setIsAdmin(false);
    setServerAdminVerified(false);
    setWallet({ userId: '', balance: 0, lifetimeCredits: 0, spentCredits: 0, updatedAt: '' });
    setGenerations([]);
    setTransactions([]);
    setActiveTab('home');
  };

  // Create Generation (Atomic Credit Reserve)
  const createGeneration = async (
    templateId: string,
    inputMediaUrl: string,
    customPrompt?: string,
    mediaDetails?: {
      inputMediaUrls?: string[];
      inputMedia?: Array<{ slotId: string; type: string; media: string }>;
    },
    options?: {
      resolution?: string;
      durationSeconds?: number;
      model?: string;
      wardrobeSource?: string;
      wardrobeSourceA?: string;
      wardrobeSourceB?: string;
    }
  ): Promise<GenerationResult> => {
    if (!user) {
      setPendingAction({ type: 'generate', templateId, inputMediaUrl, customPrompt });
      setAuthModalOpen(true);
      return { success: false, error: 'Authentication required' };
    }

    try {
      const res = await fetch('/api/generations/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          templateId,
          inputMediaUrl,
          customPrompt,
          inputMediaUrls: mediaDetails?.inputMediaUrls,
          inputMedia: mediaDetails?.inputMedia,
          resolution: options?.resolution,
          durationSeconds: options?.durationSeconds,
          model: options?.model,
          wardrobeSource: options?.wardrobeSource,
          wardrobeSourceA: options?.wardrobeSourceA,
          wardrobeSourceB: options?.wardrobeSourceB
        })
      });

      const data = await res.json();
      if (res.ok && data.generation) {
        setActiveGeneration(data.generation);
        setGenerations((prev) => [data.generation, ...prev.filter((g) => g.id !== data.generation.id)]);
        if (data.remainingCredits !== undefined && wallet) {
          setWallet({ ...wallet, balance: data.remainingCredits });
        }
        await refreshUserData();
        return {
          success: true,
          correlationId: data.generation.id,
          timestamp: data.generation.createdAt
        };
      } else {
        if (res.status === 402) {
          setInsufficientCreditsModal({
            open: true,
            requiredCredits: data.requiredCredits || 30,
            availableCredits: wallet?.balance ?? 0
          });
        }
        return {
          success: false,
          error: data.error || 'Generation request failed',
          errorCode: data.code || `HTTP_${res.status}`,
          httpStatus: res.status,
          stage: data.stage || 'generation_request',
          correlationId: data.correlationId || data.requestId || data.generationId || `req_${Date.now()}`,
          timestamp: data.timestamp || new Date().toISOString(),
          refunded: Boolean(data.refunded)
        };
      }
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Network error',
        errorCode: 'NETWORK_ERROR',
        httpStatus: 0,
        stage: 'network',
        timestamp: new Date().toISOString()
      };
    }
  };

  // Face Swap Generation
  const generateFaceSwapVideo = async (
    payloadOrSceneId: string | FaceSwapGenerateRequest,
    legacyFacePhotoUrl?: string
  ): Promise<GenerationResult> => {
    if (!user) {
      setPendingAction({ type: 'faceswap', payloadOrSceneId, legacyFacePhotoUrl });
      setAuthModalOpen(true);
      return { success: false, error: 'Authentication required' };
    }

    try {
      let requestBody: any;
      if (typeof payloadOrSceneId === 'string') {
        requestBody = {
          sourceVideoUrl: payloadOrSceneId,
          faceReferenceUrls: legacyFacePhotoUrl ? [legacyFacePhotoUrl] : [],
          durationSeconds: 5
        };
      } else {
        requestBody = payloadOrSceneId;
      }

      const res = await fetch('/api/faceswap/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify(requestBody)
      });

      const data = await res.json();
      if (res.ok && data.generation) {
        setActiveGeneration(data.generation);
        setGenerations((prev) => [data.generation, ...prev.filter((g) => g.id !== data.generation.id)]);
        if (data.remainingCredits !== undefined && wallet) {
          setWallet({ ...wallet, balance: data.remainingCredits });
        }
        await refreshUserData();
        return {
          success: true,
          correlationId: data.generation.id,
          timestamp: data.generation.createdAt
        };
      } else {
        if (res.status === 402) {
          setInsufficientCreditsModal({
            open: true,
            requiredCredits: data.requiredCredits || 214,
            availableCredits: wallet?.balance ?? 0
          });
        }
        return {
          success: false,
          error: data.error || 'Face swap request failed',
          errorCode: data.code || `HTTP_${res.status}`,
          httpStatus: res.status,
          stage: data.stage || 'validation',
          correlationId: data.correlationId || data.requestId || `fsv_${Date.now()}`,
          timestamp: data.timestamp || new Date().toISOString(),
          refunded: Boolean(data.refunded)
        };
      }
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Network error',
        errorCode: 'NETWORK_ERROR',
        httpStatus: 0,
        stage: 'network',
        timestamp: new Date().toISOString()
      };
    }
  };

  // Delete Generation
  const deleteGeneration = async (id: string): Promise<void> => {
    try {
      await fetch(`/api/generations/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      setGenerations((prev) => prev.filter((g) => g.id !== id));
      if (activeGeneration?.id === id) {
        setActiveGeneration(null);
      }
    } catch (err) {
      console.error('Delete generation error:', err);
    }
  };

  // Auto-Reconciliation of Pending Payments on App Mount or Network Online Event
  useEffect(() => {
    const attemptPendingReconciliation = async () => {
      try {
        const rawPending = localStorage.getItem('lumina_pending_payment');
        if (!rawPending) return;
        const pending = JSON.parse(rawPending);
        if (pending && (pending.paymentId || pending.subscriptionId || pending.orderId)) {
          console.log('[Payment Resilience] Auto-reconciling pending payment from storage:', pending);
          const recon = await reconcilePayment(pending.paymentId, pending.subscriptionId);
          if (recon.success) {
            console.log('[Payment Resilience] Auto-reconciliation succeeded:', recon.message);
            localStorage.removeItem('lumina_pending_payment');
          }
        }
      } catch (e) {
        console.warn('[Payment Resilience] Auto-reconciliation check error:', e);
      }
    };

    attemptPendingReconciliation();
    window.addEventListener('online', attemptPendingReconciliation);
    return () => window.removeEventListener('online', attemptPendingReconciliation);
  }, []);

  // Initiate Razorpay Checkout Order / Subscription
  const initiateCheckout = async (
    type: 'plan' | 'topup',
    itemId: string,
    provider: 'razorpay' | 'cashfree' = 'razorpay',
    phone?: string
  ): Promise<{ success: boolean; orderId?: string; subscriptionId?: string; customerId?: string; shortUrl?: string; isAutoPay?: boolean; error?: string }> => {
    if (!user) {
      setPendingAction({ type: 'buy_plan', planId: itemId });
      setAuthModalOpen(true);
      return { success: false, error: 'Authentication required' };
    }

    try {
      setIsPaying(true);
      const res = await fetch('/api/payments/checkout/order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({ type, planId: itemId, topUpId: itemId, itemId, provider, phone })
      });
      const parsed = await safeParseJsonResponse<{
        orderId?: string;
        subscriptionId?: string;
        customerId?: string;
        shortUrl?: string;
        isAutoPay?: boolean;
        error?: string;
      }>(res);
      setIsPaying(false);

      if (parsed.ok && parsed.data && (parsed.data.orderId || parsed.data.subscriptionId)) {
        return {
          success: true,
          orderId: parsed.data.orderId,
          subscriptionId: parsed.data.subscriptionId,
          customerId: parsed.data.customerId,
          shortUrl: parsed.data.shortUrl,
          isAutoPay: Boolean(parsed.data.isAutoPay || parsed.data.subscriptionId)
        };
      } else {
        return { success: false, error: parsed.error || 'Failed to create payment order or mandate' };
      }
    } catch (err: any) {
      setIsPaying(false);
      return { success: false, error: err.message || 'Payment initiation error' };
    }
  };

  // Verify Real Razorpay Payment Signature & Subscription Mandate
  const verifyPayment = async (
    orderId: string,
    type: 'plan' | 'topup',
    itemId: string,
    provider: string = 'razorpay',
    paymentId?: string,
    signature?: string,
    subscriptionId?: string
  ): Promise<{ success: boolean; error?: string }> => {
    // Record pending payment in localStorage to survive transient 503 or network drop
    try {
      localStorage.setItem(
        'lumina_pending_payment',
        JSON.stringify({
          orderId,
          type,
          itemId,
          provider,
          paymentId,
          signature,
          subscriptionId,
          timestamp: Date.now()
        })
      );
    } catch {}

    try {
      const res = await fetch('/api/payments/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          orderId,
          type,
          itemId,
          provider,
          paymentId,
          signature,
          subscriptionId
        })
      });
      const parsed = await safeParseJsonResponse<{
        success: boolean;
        error?: string;
        wallet?: CreditWallet;
        subscription?: UserSubscription;
      }>(res);
      setIsPaying(false);

      if (parsed.ok && parsed.data?.success) {
        localStorage.removeItem('lumina_pending_payment');
        if (parsed.data.wallet) setWallet(parsed.data.wallet);
        if (parsed.data.subscription) setActiveSubscription(parsed.data.subscription);
        await refreshUserData();
        return { success: true };
      }

      return {
        success: false,
        error: parsed.error || 'Payment verification pending. If money was debited, your credits will activate automatically.'
      };
    } catch (err: any) {
      console.error('Payment verify error:', err);
      setIsPaying(false);
      return {
        success: false,
        error: err.message || 'Network error during verification. Your payment is saved and will auto-reconcile.'
      };
    }
  };

  // Idempotent Customer Payment Reconciliation
  const reconcilePayment = async (
    paymentId?: string,
    subscriptionId?: string
  ): Promise<{ success: boolean; message?: string; error?: string }> => {
    try {
      const res = await fetch('/api/payments/reconcile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({ paymentId, subscriptionId })
      });
      const parsed = await safeParseJsonResponse<{
        success: boolean;
        message?: string;
        error?: string;
        wallet?: CreditWallet;
        subscription?: UserSubscription;
      }>(res);

      if (parsed.ok && parsed.data?.success) {
        localStorage.removeItem('lumina_pending_payment');
        if (parsed.data.wallet) setWallet(parsed.data.wallet);
        if (parsed.data.subscription) setActiveSubscription(parsed.data.subscription);
        await refreshUserData();
        return { success: true, message: parsed.data.message };
      }
      return { success: false, error: parsed.error || 'Reconciliation failed' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error during reconciliation' };
    }
  };

  // Cancel Subscription
  const cancelSubscription = async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/subscription/cancel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        }
      });
      const parsed = await safeParseJsonResponse(res);
      if (parsed.ok) {
        await refreshUserData();
        return true;
      }
    } catch (err) {
      console.error('Subscription cancellation error:', err);
    }
    return false;
  };

  return (
    <AppContext.Provider
      value={{
        activeTab,
        setActiveTab,
        faceSwapScenes,
        setFaceSwapScenes,
        refreshFaceSwapScenes: fetchFaceSwapScenes,
        selectedFaceSwapScene,
        setSelectedFaceSwapScene,
        faceSwapModalOpen,
        setFaceSwapModalOpen,
        generateFaceSwapVideo,
        templates,
        loadingTemplates,
        selectedTemplate,
        setSelectedTemplate,
        selectedCategory,
        setSelectedCategory,
        selectedCategories,
        setSelectedCategories,
        searchQuery,
        setSearchQuery,
        filterType,
        setFilterType,
        likedTemplates,
        toggleLikeTemplate,
        refreshTemplates: fetchTemplates,
        catalogueStatus,
        user,
        isAdmin,
        serverAdminVerified,
        wallet,
        activeSubscription,
        transactions,
        refreshUserData,
        updateProfile,
        deleteAccount,
        logout,
        generations,
        loadingGenerations,
        activeGeneration,
        setActiveGeneration,
        createGeneration,
        deleteGeneration,
        refreshGenerations,
        plans,
        topUps,
        hasActivePlan,
        isIntroEligible,
        isPaying,
        initiateCheckout,
        verifyPayment,
        reconcilePayment,
        cancelSubscription,
        authModalOpen,
        setAuthModalOpen,
        pendingAction,
        setPendingAction,
        triggerHighIntentAction,
        onAuthSuccess,
        drawerOpen,
        setDrawerOpen,
        plansModalOpen,
        setPlansModalOpen,
        topUpModalOpen,
        setTopUpModalOpen,
        insufficientCreditsModal,
        setInsufficientCreditsModal,
        supportModalOpen,
        setSupportModalOpen,
        legalModal,
        setLegalModal,
        reportModalGenId,
        setReportModalGenId,
        transactionsModalOpen,
        setTransactionsModalOpen,
        templateManagerOpen,
        setTemplateManagerOpen,
        diagnosticsModalOpen,
        setDiagnosticsModalOpen
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
