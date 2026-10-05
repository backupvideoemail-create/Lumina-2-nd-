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
  FaceSwapScene
} from '../types';
import { SEED_FACE_SWAP_SCENES } from '../data/faceSwapData';
import { SEED_TEMPLATES, INITIAL_PLANS, INITIAL_TOP_UPS } from '../data/templatesData';

export type PendingAction =
  | { type: 'generate'; templateId: string; inputMediaUrl: string; customPrompt?: string }
  | { type: 'buy_plan'; planId?: string }
  | {
      type: 'faceswap';
      payloadOrSceneId:
        | string
        | {
            sourceVideoUrl?: string;
            sourceVideoBase64?: string;
            durationSeconds: number;
            faceReferenceUrls?: string[];
            faceReferenceBase64List?: string[];
            customInstructions?: string;
          };
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
  selectedFaceSwapScene: FaceSwapScene | null;
  setSelectedFaceSwapScene: (scene: FaceSwapScene | null) => void;
  faceSwapModalOpen: boolean;
  setFaceSwapModalOpen: (open: boolean) => void;
  generateFaceSwapVideo: (
    payloadOrSceneId:
      | string
      | {
          sourceVideoUrl?: string;
          sourceVideoBase64?: string;
          durationSeconds: number;
          faceReferenceUrls?: string[];
          faceReferenceBase64List?: string[];
          customInstructions?: string;
        },
    legacyFacePhotoUrl?: string
  ) => Promise<{ success: boolean; error?: string }>;

  // Templates
  templates: Template[];
  loadingTemplates: boolean;
  selectedTemplate: Template | null;
  setSelectedTemplate: (tpl: Template | null) => void;
  selectedCategory: string;
  setSelectedCategory: (cat: string) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  filterType: 'all' | 'photo' | 'video';
  setFilterType: (type: 'all' | 'photo' | 'video') => void;
  likedTemplates: string[];
  toggleLikeTemplate: (templateId: string) => Promise<void>;

  // User & Wallet
  user: UserProfile | null;
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
  createGeneration: (templateId: string, inputMediaUrl: string, customPrompt?: string) => Promise<{ success: boolean; error?: string }>;
  deleteGeneration: (id: string) => Promise<void>;
  refreshGenerations: () => Promise<void>;

  // Plans & Payments
  plans: PricingPlan[];
  topUps: TopUpOption[];
  hasActivePlan: boolean;
  isPaying: boolean;
  initiateCheckout: (type: 'plan' | 'topup', itemId: string, provider?: 'cashfree' | 'razorpay') => Promise<{ success: boolean; orderId?: string; error?: string }>;
  verifyPayment: (orderId: string, type: 'plan' | 'topup', itemId: string, provider?: string, paymentId?: string, signature?: string) => Promise<boolean>;
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

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeTab, setActiveTab] = useState<'home' | 'templates' | 'creations' | 'profile'>('home');
  const [templates, setTemplates] = useState<Template[]>(SEED_TEMPLATES);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('Trending');
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

  // Active Plan Check: true if user has an active or trial subscription plan
  const hasActivePlan = Boolean(
    activeSubscription &&
      (activeSubscription.status === 'active' ||
        activeSubscription.status === 'trial' ||
        Boolean(activeSubscription.mandateId))
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
      if (selectedCategory && selectedCategory !== 'All') params.append('category', selectedCategory);
      if (searchQuery.trim()) params.append('search', searchQuery.trim());

      const res = await fetch(`/api/templates?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (data?.templates && data.templates.length > 0) {
          setTemplates(data.templates);
        }
      }
    } catch {
      // Keep existing
    } finally {
      setLoadingTemplates(false);
    }
  }, [filterType, selectedCategory, searchQuery]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  // Fetch User & Wallet (Only if session token exists)
  const refreshUserData = useCallback(async () => {
    const token = localStorage.getItem('lumina_session_token');
    if (!token) {
      setUser(null);
      setWallet({ userId: '', balance: 0, lifetimeCredits: 0, spentCredits: 0, updatedAt: new Date().toISOString() });
      setActiveSubscription(null);
      setTransactions([]);
      setGenerations([]);
      return;
    }

    try {
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.user) {
          setUser(data.user);
          if (data.wallet) setWallet(data.wallet);
          setActiveSubscription(data.activeSubscription || null);
          if (data.likedTemplates) setLikedTemplates(data.likedTemplates);
        } else {
          // Token expired or invalid
          localStorage.removeItem('lumina_session_token');
          setUser(null);
        }
      }
    } catch {
      // Keep current state
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
    setWallet({ userId: '', balance: 0, lifetimeCredits: 0, spentCredits: 0, updatedAt: '' });
    setGenerations([]);
    setTransactions([]);
    setActiveTab('home');
  };

  // Create Generation (Atomic Credit Reserve)
  const createGeneration = async (
    templateId: string,
    inputMediaUrl: string,
    customPrompt?: string
  ): Promise<{ success: boolean; error?: string }> => {
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
        body: JSON.stringify({ templateId, inputMediaUrl, customPrompt })
      });

      const data = await res.json();
      if (res.ok && data.generation) {
        setActiveGeneration(data.generation);
        setGenerations((prev) => [data.generation, ...prev.filter((g) => g.id !== data.generation.id)]);
        if (data.remainingCredits !== undefined && wallet) {
          setWallet({ ...wallet, balance: data.remainingCredits });
        }
        await refreshUserData();
        return { success: true };
      } else {
        if (res.status === 402) {
          setInsufficientCreditsModal({
            open: true,
            requiredCredits: data.requiredCredits || 30,
            availableCredits: wallet?.balance ?? 0
          });
        }
        return { success: false, error: data.error || 'Generation request failed' };
      }
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error' };
    }
  };

  // Face Swap Generation
  const generateFaceSwapVideo = async (
    payloadOrSceneId:
      | string
      | {
          sourceVideoUrl?: string;
          sourceVideoBase64?: string;
          durationSeconds: number;
          faceReferenceUrls?: string[];
          faceReferenceBase64List?: string[];
          customInstructions?: string;
        },
    legacyFacePhotoUrl?: string
  ): Promise<{ success: boolean; error?: string }> => {
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
        return { success: true };
      } else {
        if (res.status === 402) {
          setInsufficientCreditsModal({
            open: true,
            requiredCredits: data.requiredCredits || 214,
            availableCredits: wallet?.balance ?? 0
          });
        }
        return { success: false, error: data.error || 'Face swap request failed' };
      }
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error' };
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

  // Initiate Razorpay Checkout Order
  const initiateCheckout = async (
    type: 'plan' | 'topup',
    itemId: string,
    provider: 'razorpay' | 'cashfree' = 'razorpay'
  ): Promise<{ success: boolean; orderId?: string; error?: string }> => {
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
        body: JSON.stringify({ type, planId: itemId, topUpId: itemId, itemId, provider })
      });
      const data = await res.json();
      setIsPaying(false);

      if (res.ok && data.orderId) {
        return { success: true, orderId: data.orderId };
      } else {
        return { success: false, error: data.error || 'Failed to create payment order' };
      }
    } catch (err: any) {
      setIsPaying(false);
      return { success: false, error: err.message || 'Payment initiation error' };
    }
  };

  // Verify Real Razorpay Payment Signature
  const verifyPayment = async (
    orderId: string,
    type: 'plan' | 'topup',
    itemId: string,
    provider: string = 'razorpay',
    paymentId?: string,
    signature?: string
  ): Promise<boolean> => {
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
          signature
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (data.wallet) setWallet(data.wallet);
        if (data.subscription) setActiveSubscription(data.subscription);
        await refreshUserData();
        setIsPaying(false);
        return true;
      }
    } catch (err) {
      console.error('Payment verify error:', err);
    }
    setIsPaying(false);
    return false;
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
      if (res.ok) {
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
        searchQuery,
        setSearchQuery,
        filterType,
        setFilterType,
        likedTemplates,
        toggleLikeTemplate,
        user,
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
        isPaying,
        initiateCheckout,
        verifyPayment,
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
