/**
 * Unified AI Generation Router.
 * 
 * Orchestrates calls between Gemini (Image & Editing), Veo (Video Generation),
 * and Higgsfield (Face Swap) without passing static fallback URLs.
 * Ensures genuine AI synthesis, with automatic error propagation for credit rollback.
 */

import type {
  ImageGenerationParams,
  VideoGenerationParams,
  FaceSwapParams,
  TemplateProcessParams,
  ProviderResult
} from '../types.ts';
import { geminiAdapter } from './geminiAdapter.ts';
import { videoProviderAdapter } from './videoProviderAdapter.ts';
import { faceSwapAdapter } from './faceSwapAdapter.ts';
import { isUnifiedPrompt } from '../../config/globalMasterPrompt.ts';
import { MODEL_REGISTRY, calculateEstimatedProviderCostUsd } from '../pricing/pricingService.ts';

export interface ModelEvaluationCandidate {
  modelId: string;
  provider: string;
  workflow: string;
  isEvaluationOnly: boolean;
  isCompatible: boolean;
  isVerified: boolean;
  estimatedCostUsd: number | null;
  status: 'ELIGIBLE' | 'EVALUATION_ONLY' | 'UNSUPPORTED_RESOLUTION' | 'PENDING_QUOTE' | 'INCOMPATIBLE_WORKFLOW';
  reason?: string;
}

export interface ModelEvaluationResult {
  selectedModelId: string | null;
  candidates: ModelEvaluationCandidate[];
  strategy: 'LOWEST_COST_VERIFIED' | 'FALLBACK_COMPATIBLE';
}

export function evaluateBestCompatibleModel(
  modality: 'image' | 'video' | 'face_swap',
  preferredWorkflow?: string,
  resolution: '480p' | '720p' | '1080p' = '720p',
  durationSeconds: number = 5
): ModelEvaluationResult {
  const allEntries = Object.values(MODEL_REGISTRY);
  const candidates: ModelEvaluationCandidate[] = [];

  for (const entry of allEntries) {
    // 1. Modality & Workflow Compatibility
    let isCompatible = false;
    if (modality === 'image') {
      isCompatible = entry.workflow === 'PHOTO_GENERATION' || entry.workflow === 'PHOTO_EDIT';
    } else if (modality === 'face_swap') {
      isCompatible = entry.workflow === 'MOTION_TRANSFER' || entry.workflow === 'OBJECT_SWAP' || entry.workflow === 'VIDEO_FACE_REPLACEMENT';
    } else if (modality === 'video') {
      isCompatible = entry.workflow === 'VIDEO_EDIT' || entry.workflow === 'IMAGE_TO_VIDEO' || entry.workflow === 'MOTION_TRANSFER';
    }

    if (preferredWorkflow && isCompatible) {
      if (entry.workflow !== preferredWorkflow && preferredWorkflow !== 'auto') {
        isCompatible = false;
      }
    }

    if (!isCompatible) {
      candidates.push({
        modelId: entry.modelId,
        provider: entry.provider,
        workflow: entry.workflow,
        isEvaluationOnly: Boolean(entry.isEvaluationOnly),
        isCompatible: false,
        isVerified: false,
        estimatedCostUsd: null,
        status: 'INCOMPATIBLE_WORKFLOW',
        reason: `Workflow ${entry.workflow} does not match required modality ${modality} (preferred: ${preferredWorkflow || 'any'}).`
      });
      continue;
    }

    // 2. Evaluation Only Check
    if (entry.isEvaluationOnly) {
      candidates.push({
        modelId: entry.modelId,
        provider: entry.provider,
        workflow: entry.workflow,
        isEvaluationOnly: true,
        isCompatible: true,
        isVerified: false,
        estimatedCostUsd: null,
        status: 'EVALUATION_ONLY',
        reason: `Model ${entry.modelId} is restricted for internal evaluation only.`
      });
      continue;
    }

    // 3. Resolution Tariff Support
    const tariff = entry.resolutionTariffs[resolution];
    if (!tariff || tariff.supportStatus === 'UNSUPPORTED') {
      candidates.push({
        modelId: entry.modelId,
        provider: entry.provider,
        workflow: entry.workflow,
        isEvaluationOnly: false,
        isCompatible: true,
        isVerified: false,
        estimatedCostUsd: null,
        status: 'UNSUPPORTED_RESOLUTION',
        reason: `Resolution ${resolution} is marked UNSUPPORTED for ${entry.modelId}.`
      });
      continue;
    }

    // 4. Verification & Tariff Quote
    const isVerified =
      tariff.supportStatus === 'SUPPORTED' &&
      entry.endpointVerificationStatus === 'VERIFIED' &&
      entry.billsSourceVideo !== 'UNKNOWN';

    const costEst = calculateEstimatedProviderCostUsd({
      modelId: entry.modelId,
      resolution,
      requestedOutputDurationSeconds: durationSeconds,
      allowPublishedListPriceFallback: false
    });

    if (costEst.status === 'QUOTED' && isVerified) {
      candidates.push({
        modelId: entry.modelId,
        provider: entry.provider,
        workflow: entry.workflow,
        isEvaluationOnly: false,
        isCompatible: true,
        isVerified: true,
        estimatedCostUsd: costEst.estimatedProviderCostUsd ?? null,
        status: 'ELIGIBLE',
        reason: `Verified and quoted at $${costEst.estimatedProviderCostUsd}.`
      });
    } else {
      candidates.push({
        modelId: entry.modelId,
        provider: entry.provider,
        workflow: entry.workflow,
        isEvaluationOnly: false,
        isCompatible: true,
        isVerified: false,
        estimatedCostUsd: costEst.status === 'QUOTED' ? (costEst.estimatedProviderCostUsd ?? null) : null,
        status: 'PENDING_QUOTE',
        reason: costEst.reason || `Model ${entry.modelId} capability or quote is pending verification.`
      });
    }
  }

  // Choose lowest-cost verified eligible model
  const eligible = candidates.filter((c) => c.status === 'ELIGIBLE' && c.estimatedCostUsd !== null);
  if (eligible.length > 0) {
    eligible.sort((a, b) => (a.estimatedCostUsd ?? 0) - (b.estimatedCostUsd ?? 0));
    return {
      selectedModelId: eligible[0].modelId,
      candidates,
      strategy: 'LOWEST_COST_VERIFIED'
    };
  }

  // Fail closed: No verified compatible model available without verified quote
  return {
    selectedModelId: null,
    candidates,
    strategy: 'BLOCKED_PENDING_QUOTE' as any
  };
}

export function selectBestCompatibleModel(
  modality: 'image' | 'video' | 'face_swap',
  preferredWorkflow?: string,
  resolution: '480p' | '720p' | '1080p' = '720p',
  durationSeconds: number = 5
): string | null {
  const evaluation = evaluateBestCompatibleModel(modality, preferredWorkflow, resolution, durationSeconds);
  if (evaluation.selectedModelId) return evaluation.selectedModelId;

  // Strict Fail-Closed: Do not invent or select unverified models
  return null;
}

export class AIRouter {
  // 1. Unified Image Generation
  async generateImage(params: ImageGenerationParams): Promise<ProviderResult> {
    return await geminiAdapter.generateImage(params);
  }

  // 2. Unified Video Generation
  async generateVideo(params: VideoGenerationParams): Promise<ProviderResult> {
    return await videoProviderAdapter.generateVideo(params);
  }

  // 3. Unified Face Swap Video (Higgsfield Genjutsu Motion Transfer / Object Swap)
  async generateFaceSwapVideo(params: FaceSwapParams & { masterRecipePrompt?: string; model?: string; resolution?: '480p' | '720p' | '1080p'; isCouple?: boolean }): Promise<ProviderResult> {
    const videoUrl = params.videoUrl || params.targetVideoUrl || '';
    const imageUrls =
      params.imageUrls && params.imageUrls.length > 0
        ? params.imageUrls
        : params.sourceFaceUrl
        ? [params.sourceFaceUrl]
        : [];

    return await faceSwapAdapter.generateFaceSwapVideo({
      videoUrl,
      imageUrls,
      masterRecipePrompt: params.masterRecipePrompt,
      customInstructions: params.customInstructions,
      resolution: params.resolution || '480p',
      durationSeconds: params.durationSeconds,
      model: params.model,
      isCouple: params.isCouple
    });
  }

  // 4. Unified Template Processing (Executable Recipe + Input Type Detection + Driving Video)
  async processTemplate(params: TemplateProcessParams): Promise<ProviderResult> {
    const recipe = params.recipe;
    const isInputImage = params.detectedInputType === 'image' || (!params.detectedInputType && !params.inputMediaUrl.endsWith('.mp4'));
    const isInputVideo = params.detectedInputType === 'video' || (!params.detectedInputType && params.inputMediaUrl.endsWith('.mp4'));

    // 1. Resolve workflow configuration from Executable Recipe if attached
    let activeWorkflowConfig = recipe?.defaultWorkflow || recipe;
    if (recipe) {
      if (isInputImage && recipe.imageWorkflow) {
        activeWorkflowConfig = recipe.imageWorkflow;
      } else if (isInputVideo && recipe.videoWorkflow) {
        activeWorkflowConfig = recipe.videoWorkflow;
      }
    }

    const provider = activeWorkflowConfig?.provider || (params.templateType === 'video' ? 'google_veo' : 'gemini');
    const workflowName = activeWorkflowConfig?.workflow || params.workflow;
    const drivingVideoUrl = activeWorkflowConfig?.drivingVideoUrl || params.drivingVideoUrl || recipe?.drivingVideoUrl;
    let selectedModel = activeWorkflowConfig?.model || params.model;
    if (!selectedModel || selectedModel === 'auto') {
      const modality = drivingVideoUrl && isInputImage ? 'face_swap' : (isInputVideo || params.templateType === 'video' ? 'video' : 'image');
      selectedModel = selectBestCompatibleModel(modality, workflowName) || undefined;
      if (!selectedModel) {
        throw new Error(`NO_VERIFIED_MODEL: No verified compatible model available for modality '${modality}' and workflow '${workflowName}'.`);
      }
    }

    // Unconditional Omni / Evaluation-Only Model Guard (protects all routes including driving video)
    if (selectedModel && MODEL_REGISTRY[selectedModel]?.isEvaluationOnly && !params.customParameters?.isEvaluationMode) {
      throw new Error(`MODEL_EVALUATION_ONLY: Model '${selectedModel}' is configured for internal evaluation only and is guarded from production customer generation.`);
    }

    // 2. Prompt Construction: Combine protected template prompt + optional user custom instructions
    const basePrompt =
      activeWorkflowConfig?.prompt ||
      (params.templateType === 'video'
        ? `Synthesize video reel for ${params.templateTitle}. Workflow: ${workflowName}.`
        : `Transform image with ${params.templateTitle} aesthetic. Workflow: ${workflowName}.`);

    const alreadyHasCustomerInstructions =
      basePrompt.includes('--- OPTIONAL CUSTOMER INSTRUCTIONS ---') ||
      Boolean(params.customPrompt && basePrompt.includes(params.customPrompt.trim()));

    const combinedPrompt =
      params.customPrompt && params.customPrompt.trim() && !alreadyHasCustomerInstructions
        ? `${basePrompt}\nAdditional User Creative Instructions (Hindi/English/Hinglish): ${params.customPrompt.trim()}`
        : basePrompt;

    if (combinedPrompt.length > 4000) {
      throw new Error(`VALIDATION_ERROR: Generation prompt length (${combinedPrompt.length} chars) exceeds maximum provider limit (4000 chars).`);
    }

    // Extract and slot-order candidate customer media URLs
    let customerMediaUrls: string[] = [];
    if (params.inputMedia && params.inputMedia.length > 0) {
      // Preserve explicit slotId role mapping (partner_1 -> slot 0 / Person A, partner_2 -> slot 1 / Person B)
      const partner1 = params.inputMedia.find((m) => m.slotId === 'partner_1' || m.slotId === 'slot_1');
      const partner2 = params.inputMedia.find((m) => m.slotId === 'partner_2' || m.slotId === 'slot_2');
      if (partner1 && partner2) {
        customerMediaUrls = [partner1.media || partner1.mediaUrl || '', partner2.media || partner2.mediaUrl || ''].filter(Boolean);
      } else {
        customerMediaUrls = params.inputMedia.map((m) => m.media || m.mediaUrl || '').filter(Boolean);
      }
    }

    if (customerMediaUrls.length === 0) {
      customerMediaUrls =
        params.inputMediaUrls && params.inputMediaUrls.length > 0
          ? params.inputMediaUrls
          : params.inputMediaUrl.includes('|||')
          ? params.inputMediaUrl.split('|||').map((s) => s.trim()).filter(Boolean)
          : [params.inputMediaUrl];
    }

    // Strict Couple Flag: only true when explicitly set, not inferred from image count
    const isCouple = Boolean(params.isCouple);

    // 3. Reference / Driving Video Support:
    // If template recipe has a fixed driving video and user provided a photo, run motion transfer synthesis!
    if (drivingVideoUrl && isInputImage) {
      return await this.generateFaceSwapVideo({
        videoUrl: drivingVideoUrl,
        imageUrls: customerMediaUrls,
        masterRecipePrompt: basePrompt,
        customInstructions: alreadyHasCustomerInstructions ? undefined : params.customPrompt,
        ownerUserId: params.ownerUserId,
        model: selectedModel || (workflowName === 'MOTION_TRANSFER' ? 'hf_mult_motion_control_flash' : 'hf_mult_replace_object_flash'),
        resolution: params.resolution || ((params.aspectRatio as any) === '1080p' ? '1080p' : '720p'),
        durationSeconds: params.durationSeconds,
        isCouple
      });
    }

    // 4. Execute according to resolved target media type & provider
    const sampleBeforeUrl =
      params.sampleBeforeUrl ||
      activeWorkflowConfig?.sampleBefore ||
      recipe?.sampleBefore;

    if (provider === 'google_veo' || params.templateType === 'video' || isInputVideo) {
      return await this.generateVideo({
        prompt: combinedPrompt,
        sourceMediaUrl: params.inputMediaUrl,
        userImageUrl: customerMediaUrls[0] || params.inputMediaUrl,
        userImageUrls: customerMediaUrls,
        referenceImageUrl: params.referenceImageUrl,
        sampleBeforeUrl,
        sampleResultUrl: params.sampleResultUrl,
        aspectRatio: (activeWorkflowConfig?.aspectRatio || params.aspectRatio || '9:16') as any,
        durationSeconds: params.durationSeconds,
        styleWorkflow: workflowName,
        ownerUserId: params.ownerUserId
      });
    } else {
      const referenceImageUrl =
        params.referenceImageUrl ||
        params.sampleResultUrl ||
        activeWorkflowConfig?.referenceImageUrl ||
        activeWorkflowConfig?.sampleResult ||
        activeWorkflowConfig?.referenceAssetUrls?.[0] ||
        recipe?.referenceImageUrl ||
        recipe?.sampleResult ||
        recipe?.referenceAssets?.[0];

      return await this.generateImage({
        prompt: combinedPrompt,
        userImageUrl: customerMediaUrls[0] || params.inputMediaUrl,
        userImageUrls: customerMediaUrls,
        referenceImageUrl,
        sampleBeforeUrl,
        sampleResultUrl: referenceImageUrl,
        aspectRatio: (activeWorkflowConfig?.aspectRatio || params.aspectRatio || '9:16') as any,
        styleWorkflow: workflowName,
        ownerUserId: params.ownerUserId
      });
    }
  }
}

export const aiRouter = new AIRouter();

export const generateImage = (params: ImageGenerationParams) =>
  aiRouter.generateImage(params);

export const generateVideo = (params: VideoGenerationParams) =>
  aiRouter.generateVideo(params);

export const generateFaceSwapVideo = (params: FaceSwapParams) =>
  aiRouter.generateFaceSwapVideo(params);

export const processTemplate = (params: TemplateProcessParams) =>
  aiRouter.processTemplate(params);
