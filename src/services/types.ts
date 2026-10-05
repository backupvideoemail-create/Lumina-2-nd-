// Common Provider-Agnostic Interfaces

export interface ImageGenerationParams {
  prompt: string;
  sourceImageUrl?: string;
  userImageUrl?: string;
  aspectRatio?: '9:16' | '4:5' | '1:1' | '16:9';
  styleWorkflow?: string;
  customParameters?: Record<string, any>;
}

export interface VideoGenerationParams {
  prompt: string;
  sourceMediaUrl?: string;
  userImageUrl?: string;
  aspectRatio?: '9:16' | '4:5' | '1:1' | '16:9';
  durationSeconds?: number;
  motionStyle?: string;
  styleWorkflow?: string;
  customParameters?: Record<string, any>;
}

export interface FaceSwapParams {
  targetVideoUrl?: string;
  sourceFaceUrl?: string;
  videoUrl?: string;
  imageUrls?: string[];
  sceneTitle?: string;
  customInstructions?: string;
  resolution?: '480p';
  durationSeconds?: number;
  aspectRatio?: '9:16' | '4:5' | '1:1' | '16:9';
  customParameters?: Record<string, any>;
}

export interface TemplateProcessParams {
  templateId: string;
  templateTitle: string;
  templateType: 'photo' | 'video';
  engine: 'SMART_TEMPLATE' | 'AI_GENERATION';
  inputMediaUrl: string;
  aspectRatio: string;
  workflow: string;
  customPrompt?: string;
}

export interface ProviderResult {
  success: boolean;
  resultUrl: string;
  provider: string;
  model: string;
  processingTimeMs: number;
  error?: string;
}

// Payment Interfaces
export interface MandateScheduleDetails {
  frequency: 'daily' | 'weekly' | 'monthly';
  scheduleRule: 'next_calendar_day' | 'interval_hours';
  renewalAmount: number;
  startDateFormatted: string;
  startAtIso: string;
  startAtUnixSeconds: number;
  disclosure: string;
}

export interface CreateOrderParams {
  userId: string;
  type: 'plan' | 'topup';
  itemId: string;
  amount: number;
  credits: number;
  itemTitle: string;
  isMandate?: boolean;
  mandateFrequency?: string;
  mandateSchedule?: MandateScheduleDetails;
}

export interface OrderResult {
  orderId: string;
  amount: number;
  currency: string;
  provider: string;
  paymentToken: string;
  isMandate: boolean;
  mandateDetails?: MandateScheduleDetails | null;
  checkoutUrl: string | null;
}

export interface VerifyPaymentParams {
  orderId: string;
  userId: string;
  paymentId?: string;
  signature?: string;
  type: 'plan' | 'topup';
  itemId: string;
}

export interface PaymentVerificationResult {
  success?: boolean;
  verified?: boolean;
  creditsAdded?: number;
  orderId: string;
  provider?: string;
  transactionRef?: string;
  paymentId?: string;
  status?: string;
  amount?: number;
  error?: string;
}

export interface CancelSubscriptionParams {
  userId: string;
  subscriptionId?: string;
  mandateId?: string;
}
