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
  | 'Retro 80s';

export type AspectRatio = '9:16' | '4:5' | '1:1' | '16:9';

export type TemplateEngine = 'SMART_TEMPLATE' | 'AI_GENERATION';

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
  description: string;
  aspectRatio: AspectRatio;
  requiredInputs: TemplateInputDef[];
  creditCost: number;
  engine: TemplateEngine;
  model: string;
  workflow: string;
  sortOrder: number;
  isFeatured: boolean;
  isActive: boolean;
  tags: string[];
  musicTrack?: {
    name: string;
    author: string;
  };
  sampleResult?: string;
  likesCount?: number;
  resolutionLabel?: string;
  isFaceSwap?: boolean;
  faceSwapSceneId?: string;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatar: string;
  onboarded: boolean;
  role: 'user' | 'creator' | 'vip' | 'admin';
  createdAt: string;
  generationCount: number;
}

export interface CreditWallet {
  userId: string;
  balance: number;
  lifetimeCredits: number;
  spentCredits: number;
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
  provider: 'cashfree' | 'razorpay' | 'mandate_gateway';
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
  provider: 'razorpay' | 'cashfree';
  amount: number; // in INR
  currency: string;
  type: 'intro_mandate' | 'recurring_renewal' | 'one_time';
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
  sourceVideoPreview: string;
  resultVideoPreview: string;
  sampleFace: string;
  creditCost: number;
  durationSeconds: number;
  aspectRatio: AspectRatio;
  category: string;
  tags: string[];
}

