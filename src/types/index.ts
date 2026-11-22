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
  adapter?: string;
  model?: string;
  engine?: TemplateEngine;
  prompt?: string;
  workflow?: string;
  presetId?: string;
  settings?: Record<string, any>;
  drivingVideoUrl?: string;
  referenceAssetUrls?: string[];
  referenceImageUrl?: string;
  sampleFaceThumbnail?: string;
  sampleBefore?: string;
  sampleResult?: string;
  sampleAfter?: string;
}

export interface TemplateExecutionRecipe {
  version: string;
  inputType: TemplateInputType;
  provider: string;
  adapter?: string;
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
  referenceImageUrl?: string;
  sampleFaceThumbnail?: string;
  sampleBefore?: string;
  sampleResult?: string;
  sampleAfter?: string;
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
  isRequired?: boolean;
  slotId?: string;
}

export interface Template {
  id: string;
  title: string;
  type: TemplateType;
  category: TemplateCategory;
  preview: string;
  cover: string;
  referenceImageUrl?: string;
  sampleFaceThumbnail?: string;
  sampleBefore?: string;
  sampleResult?: string;
  sampleAfter?: string;
  mediaType?: 'image' | 'video';
  description: string;
  aspectRatio: AspectRatio;
  inputType?: TemplateInputType;
  recipe?: TemplateExecutionRecipe;
  drivingVideoUrl?: string;
  requiredInputs: TemplateInputDef[];
  creditCost: number;
  engine: TemplateEngine;
  provider?: string;
  adapter?: string;
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
  durationSeconds?: number;
  isFaceSwap?: boolean;
  faceSwapSceneId?: string;
  badge?: string;
  providerCostUsd?: number;
  coverImage?: string;
  coverVideo?: string;
  allowWardrobeChoice?: boolean;
  defaultWardrobeSource?: 'auto' | 'my_photo' | 'template';
  crop?: { aspectRatio: '1:1'; positionX: number; positionY: number; zoom: number };
  readinessStatus?: 'READY' | 'DRAFT_INCOMPLETE' | 'INVALID_CONFIG';
  missingFields?: string[];
  readinessErrors?: string[];
  draftOfTemplateId?: string;
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
  resolution?: string;
  durationSeconds?: number;
  wardrobeSource?: string;
  sourceVideoDurationSeconds?: number;
  requestedOutputDurationSeconds?: number;
  actualOutputDurationSeconds?: number;
  actualBillableDurationSeconds?: number;
  reconciledCostCredits?: number;
  actualCostStatus?: 'UNMEASURED' | 'MEASURED_RECEIPT' | 'ESTIMATED_TARIFF';
  reconciliationStatus?: 'PENDING' | 'RECONCILED' | 'UNMEASURED_NO_POST_DEBIT';
  actualProviderCostUsd?: number;
  providerRequestId?: string;
  providerStatusUrl?: string;
  providerEndpoint?: string;
  providerSubmittedAt?: string;
  providerLastPolledAt?: string;
  providerStatus?: string;
  pollLeaseUntil?: string;
  pollLeaseOwner?: string;
  refundStatus?: 'none' | 'refund_pending' | 'refunded';
  refundError?: string;
}

export type SubscriptionStatus =
  | 'trial'
  | 'active'
  | 'past_due'
  | 'on_hold'
  | 'grace_period'
  | 'paused'
  | 'cancelled'
  | 'revoked'
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
  paidThroughAt?: string;
  lastCapturedPaymentId?: string;
  lastCapturedAt?: string;
  lastWebhookEventAt?: number;
  renewalFailedAt?: string;
  renewalFailureReason?: string;
}

export interface PaymentRecord {
  id: string;
  orderId: string;
  paymentId: string;
  subscriptionId?: string;
  mandateId?: string;
  planId?: string;
  userId: string;
  provider: 'razorpay' | 'cashfree' | 'google_play';
  amount: number; // in INR
  currency: string;
  type: 'intro_mandate' | 'recurring_renewal' | 'one_time' | 'subscription';
  status: 'pending' | 'authorized' | 'captured' | 'failed' | 'refunded';
  isAutoPay: boolean;
  verificationStatus: 'verified' | 'unverified' | 'failed' | 'voided' | 'canceled_rtdn' | 'revoked_rtdn';
  failureReason?: string;
  signature?: string;
  createdAt: string;
  updatedAt: string;
}

export type IntroOfferStatus = 'eligible' | 'pending_reconciliation' | 'claimed';

export interface PendingIntroPaymentSummary {
  orderId: string;
  paymentId?: string;
  subscriptionId?: string;
  status: PaymentRecord['status'];
  verificationStatus: PaymentRecord['verificationStatus'];
  amount: number;
  createdAt: string;
  updatedAt: string;
}

export interface IntroOfferState {
  eligible: boolean;
  status: IntroOfferStatus;
  pendingPayment: PendingIntroPaymentSummary | null;
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
  sourceVideoPreview: string; // Original / Before Video (Required Driving Video)
  resultVideoPreview?: string; // Optional Swapped Face / After Video Demo
  sampleFace?: string; // Optional Sample Face Photo / Poster Thumbnail
  creditCost: number;
  durationSeconds: number;
  aspectRatio: AspectRatio;
  category: string;
  tags: string[];
  demoVideoUrl?: string;
  masterRecipePrompt?: string; // Optional Scene Recipe Prompt (Motion Transfer Recipe)
  coverSource?: 'auto' | 'original' | 'after'; // Gallery Cover Source: auto (after if present, else original), original, or after
  provider?: string; // Strict per-scene Provider selection (e.g. 'higgsfield' | 'gemini')
  adapter?: string; // Strict per-scene Adapter selection (e.g. 'faceSwapAdapter' | 'videoProviderAdapter')
  model?: string; // Strict per-scene Model ID (e.g. 'hf_mult_motion_control_flash' | 'hf_mult_replace_object_flash')
  workflow?: string; // Strict per-scene Workflow (e.g. 'MOTION_TRANSFER' | 'OBJECT_SWAP')
  resolution?: '480p' | '720p' | '1080p';
  isActive?: boolean;
  status?: 'published' | 'draft';
  isFeatured?: boolean;
  order?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface FxRateStatus {
  rate: number | null;
  source: string;
  fetchedAt: string | null;
  expiresAt: string | null;
  status: 'FRESH' | 'CACHED_VALID' | 'EXPIRED_UNAVAILABLE' | 'UNFETCHED_UNAVAILABLE';
  isFresh: boolean;
  ttlMinutes: number;
  lastError?: string | null;
}

export interface PerTemplateReadinessItem {
  id: string;
  title: string;
  itemKind: 'TEMPLATE' | 'FACESWAP_SCENE';
  type: 'photo' | 'video';
  provider: string;
  adapter: string;
  model: string;
  workflow: string;
  apiKeyStatus: 'LOCAL_NO_KEY' | 'CONFIGURED_UNVERIFIED_BALANCE' | 'MISSING_SECRET';
  billingStatus: 'FREE_LOCAL' | 'EVALUATION_GUARDED' | 'VERIFIED' | 'PUBLISHED_LIST_ACTIVE' | 'MISSING';
  quotaOrBalanceStatus: 'LOCAL_FREE' | 'UNKNOWN_MISSING_KEY' | 'UNVERIFIED_EXTERNAL_QUOTA';
  resDurVerification: 'VERIFIED' | 'SUPPORTED' | 'MISSING_CONFIG';
  quoteStatus: 'QUOTED' | 'EVALUATION_ONLY' | 'FX_EXPIRED' | 'BLOCKED';
  creditsQuoted: number;
  realTestStatus: 'PASSED_LOCAL' | 'PASSED_OWNER_LIVE' | 'NOT_YET_TESTED_LIVE';
  finalStatus: 'READY_CONFIG' | 'GUARDED_EVALUATION_ONLY' | 'BLOCKED_MISSING_SECRET' | 'BLOCKED_FX_EXPIRED' | 'BLOCKED_CONFIG';
  rootCause?: string;
  recommendedSolution?: string;
}

export interface OwnerOmniTestRecord {
  id: string;
  adminEmail: string;
  model: string;
  prompt: string;
  durationSeconds: number;
  resolution: '480p' | '720p' | '1080p';
  estimatedUsd: number;
  status: 'completed' | 'failed';
  resultVideoUrl?: string;
  error?: string;
  processingTimeMs?: number;
  rawSanitizedResponse?: Record<string, any>;
  createdAt: string;
}

export interface FaceSwapGenerateRequest {
  sceneId?: string;
  sourceVideoUrl?: string;
  sourceVideoBase64?: string;
  durationSeconds?: number;
  faceReferenceUrls?: string[];
  faceReferenceBase64List?: string[];
  customInstructions?: string;
}

export interface GenerationResult {
  success: boolean;
  error?: string;
  errorCode?: string;
  httpStatus?: number;
  stage?: string;
  correlationId?: string;
  timestamp?: string;
  refunded?: boolean;
}
