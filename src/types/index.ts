export type TemplateType = 'photo' | 'video';

export type TemplateCategory =
  | 'Trending'
  | 'Dance'
  | 'Portrait'
  | 'Cinematic'
  | 'Luxury'
  | 'Fashion'
  | 'Travel'
  | 'Festival'
  | 'Reels'
  | 'Stories'
  | 'Social'
  | 'Creative'
  | 'Professional'
  | 'Retro 80s'
  | 'Royal Swag'
  | 'Devotional'
  | 'Daily Status'
  | 'Birthday'
  | 'Family Moments'
  | 'Kids'
  | 'Creative & Artistic'
  | 'Sports'
  | 'Photography'
  | 'Greetings & Wishes'
  | 'Couple'
  | (string & {});

export type AspectRatio = '9:16' | '4:5' | '1:1' | '16:9';

export type TemplateEngine = 'SMART_TEMPLATE' | 'AI_GENERATION';

export type TemplateInputType = 'IMAGE_ONLY' | 'VIDEO_ONLY' | 'IMAGE_OR_VIDEO';

export interface TemplateWorkflowConfig {
  provider?: 'gemini' | 'google_veo' | 'higgsfield' | 'smart_canvas' | string;
  model?: string;
  engine?: TemplateEngine;
  prompt?: string;
  workflow?: string;
  presetId?: string;
  settings?: Record<string, any>;
  drivingVideoUrl?: string;
  referenceAssetUrls?: string[];
}

export interface TemplateExecutionRecipe {
  version: string;
  inputType: TemplateInputType;
  provider: string;
  model: string;
  engine: TemplateEngine;
  prompt: string;
  workflow: string;
  presetId?: string;
  settings?: Record<string, any>;
  aspectRatio?: AspectRatio;
  duration?: number;
  requiredInputs?: TemplateInputDef[];
  referenceAssets?: string[];
  drivingVideoUrl?: string;
  inputRules?: {
    minDurationSeconds?: number;
    maxDurationSeconds?: number;
    maxFileSizeMb?: number;
  };
  imageWorkflow?: TemplateWorkflowConfig;
  videoWorkflow?: TemplateWorkflowConfig;
}

export interface TemplateInputDef {
  id: string;
  label: string;
  type: 'image' | 'video';
  description?: string;
}

export interface Template {
  id: string;
  title: string;
  type: TemplateType;
  category: TemplateCategory;
  preview: string;
  cover: string;
  sampleBefore?: string;
  sampleResult?: string;
  mediaType?: 'image' | 'video';
  description: string;
  aspectRatio: AspectRatio;
  inputType?: TemplateInputType;
  recipe?: TemplateExecutionRecipe;
  drivingVideoUrl?: string;
  requiredInputs: TemplateInputDef[];
  creditCost: number;
  engine: TemplateEngine;
  model: string;
  workflow: string;
  sortOrder: number;
  isFeatured: boolean;
  isTrending?: boolean;
  isActive: boolean;
  tags: string[];
  musicTrack?: {
    name: string;
    author: string;
  };
  likesCount?: number;
  resolutionLabel?: string;
  isFaceSwap?: boolean;
  faceSwapSceneId?: string;
  badge?: string;
  providerCostUsd?: number;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone?: string;
  avatar: string;
  onboarded: boolean;
  role: 'user' | 'creator' | 'vip' | 'admin';
  createdAt: string;
  generationCount: number;
}

export interface CreditGrant {
  id: string;
  userId: string;
  source: 'intro' | 'renewal' | 'weekly' | 'monthly' | 'topup' | 'admin' | 'refund';
  creditsGranted: number;
  creditsRemaining: number;
  grantedAt: string;
  expiresAt: string | null; // null for non-expiring like topup
  planId?: string;
  referenceId?: string;
}

export interface CreditWallet {
  userId: string;
  balance: number;
  expiringBalance?: number;
  topupBalance?: number;
  lifetimeCredits: number;
  spentCredits: number;
  grants?: CreditGrant[];
  updatedAt: string;
}

export type TransactionType =
  | 'purchase'
  | 'topup'
  | 'subscription'
  | 'generation'
  | 'refund'
  | 'promo'
  | 'adjustment';

export interface CreditTransaction {
  id: string;
  userId: string;
  amount: number;
  type: TransactionType;
  description: string;
  referenceId?: string;
  createdAt: string;
}

export type GenerationState =
  | 'preparing'
  | 'uploading'
  | 'processing'
  | 'finalizing'
  | 'completed'
  | 'failed';

export interface Generation {
  id: string;
  userId: string;
  templateId: string;
  templateTitle: string;
  templateType: TemplateType;
  aspectRatio: AspectRatio;
  status: GenerationState;
  inputMediaUrl: string;
  resultMediaUrl?: string;
  creditCost: number;
  engine: TemplateEngine;
  model: string;
  workflow: string;
  createdAt: string;
  completedAt?: string;
  error?: string;
  isAiGenerated: boolean;
  watermarkRemoved?: boolean;
}

export type SubscriptionStatus =
  | 'trial'
  | 'active'
  | 'past_due'
  | 'cancelled'
  | 'expired'
  | 'payment_failed';

export interface UserSubscription {
  id: string;
  userId: string;
  planId: string;
  planName: string;
  provider: 'cashfree' | 'razorpay' | 'mandate_gateway' | 'google_play';
  mandateId: string;
  subscriptionId?: string;
  status: SubscriptionStatus;
  introPaymentId?: string;
  startAt: string;
  nextChargeAt: string;
  renewalAmount: number;
  dailyCredits?: number;
  cancelledAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PaymentRecord {
  id: string;
  orderId: string;
  paymentId: string;
  subscriptionId?: string;
  mandateId?: string;
  userId: string;
  provider: 'razorpay' | 'cashfree' | 'google_play';
  amount: number; // in INR
  currency: string;
  type: 'intro_mandate' | 'recurring_renewal' | 'one_time' | 'subscription';
  status: 'pending' | 'authorized' | 'captured' | 'failed' | 'refunded';
  isAutoPay: boolean;
  verificationStatus: 'verified' | 'unverified' | 'failed';
  signature?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PricingPlan {
  id: string;
  name: string;
  badge?: string;
  price: number;
  durationHours: number;
  includedCredits: number;
  renewalInterval: 'daily' | 'weekly' | 'monthly' | 'one_time';
  renewalPrice: number;
  features: string[];
  isIntro?: boolean;
  isPopular?: boolean;
  disclosureText: string;
}

export interface TopUpOption {
  id: string;
  name?: string;
  price: number;
  credits: number;
  bonusCredits?: number;
  popular?: boolean;
  tagline?: string;
  badge?: string;
}

export interface FaceSwapScene {
  id: string;
  title: string;
  description: string;
  sourceVideoPreview: string; // Original / Before Video
  resultVideoPreview: string; // Swapped Face / After Video
  sampleFace: string; // Sample Face Photo
  creditCost: number;
  durationSeconds: number;
  aspectRatio: AspectRatio;
  category: string;
  tags: string[];
  demoVideoUrl?: string;
  isActive?: boolean;
  status?: 'published' | 'draft';
  isFeatured?: boolean;
  order?: number;
  createdAt?: string;
  updatedAt?: string;
}

