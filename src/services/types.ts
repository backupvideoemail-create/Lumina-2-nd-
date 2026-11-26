// Common Provider-Agnostic Interfaces
import type { GenerationPipelineDiagnostics } from '../types/index.ts';

export interface ImageGenerationParams {
  prompt: string;
  sourceImageUrl?: string;
  userImageUrl?: string;
  userImageUrls?: string[];
  inputMedia?: Array<{ slotId?: string; role?: string; type?: string; media?: string; mediaUrl?: string }>;
  referenceImageUrl?: string;
  sampleBeforeUrl?: string;
  sampleResultUrl?: string;
  sampleFaceThumbnailUrl?: string;
  aspectRatio?: '9:16' | '4:5' | '1:1' | '16:9';
  provider?: string;
  adapter?: string;
  model?: string;
  styleWorkflow?: string;
  customParameters?: Record<string, any>;
  ownerUserId?: string;
}

export interface VideoGenerationParams {
  prompt: string;
  sourceMediaUrl?: string;
  userImageUrl?: string;
  userImageUrls?: string[];
  inputMedia?: Array<{ slotId?: string; role?: string; type?: string; media?: string; mediaUrl?: string }>;
  referenceImageUrl?: string;
  sampleBeforeUrl?: string;
  sampleResultUrl?: string;
  sampleFaceThumbnailUrl?: string;
  aspectRatio?: '9:16' | '4:5' | '1:1' | '16:9';
  resolution?: '480p' | '720p' | '1080p';
  durationSeconds?: number;
  provider?: string;
  adapter?: string;
  model?: string;
  returnRawDiagnostics?: boolean;
  motionStyle?: string;
  styleWorkflow?: string;
  customParameters?: Record<string, any>;
  ownerUserId?: string;
}

export interface FaceSwapParams {
  targetVideoUrl?: string;
  sourceFaceUrl?: string;
  videoUrl?: string;
  imageUrls?: string[];
  sceneTitle?: string;
  customInstructions?: string;
  resolution?: '480p' | '720p' | '1080p';
  durationSeconds?: number;
  aspectRatio?: '9:16' | '4:5' | '1:1' | '16:9';
  provider?: string;
  adapter?: string;
  model?: string;
  workflow?: string;
  customParameters?: Record<string, any>;
  ownerUserId?: string;
  inputMedia?: Array<{ slotId?: string; role?: string; type?: string; media?: string; mediaUrl?: string }>;
}

export interface TemplateProcessParams {
  templateId: string;
  templateTitle: string;
  templateType: 'photo' | 'video';
  engine: 'SMART_TEMPLATE' | 'AI_GENERATION';
  inputMediaUrl: string;
  inputMediaUrls?: string[];
  inputMedia?: Array<{ slotId?: string; role?: string; type?: string; media?: string; mediaUrl?: string }>;
  referenceImageUrl?: string;
  sampleBeforeUrl?: string;
  sampleResultUrl?: string;
  sampleFaceThumbnailUrl?: string;
  aspectRatio: string;
  workflow: string;
  customPrompt?: string;
  ownerUserId?: string;
  detectedInputType?: 'image' | 'video';
  recipe?: any;
  drivingVideoUrl?: string;
  provider?: string;
  adapter?: string;
  model?: string;
  resolution?: '480p' | '720p' | '1080p';
  durationSeconds?: number;
  isCouple?: boolean;
  wardrobeSource?: string;
  customParameters?: Record<string, any>;
  isEvaluationMode?: boolean;
}

export interface ProviderResult {
  success: boolean;
  resultUrl: string;
  provider: string;
  adapter?: string;
  model: string;
  processingTimeMs: number;
  rawSanitizedResponse?: Record<string, any>;
  diagnostics?: Partial<GenerationPipelineDiagnostics>;
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
