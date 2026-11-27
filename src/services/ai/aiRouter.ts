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
import { smartCanvasAdapter } from './smartCanvasAdapter.ts';
import { isUnifiedPrompt } from '../../config/globalMasterPrompt.ts';
import { MODEL_REGISTRY, calculateEstimatedProviderCostUsd, getRegisteredModelEntry, resolveCanonicalModelId } from '../pricing/pricingService.ts';

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
  strategy: 'LOWEST_COST_VERIFIED' | 'FALLBACK_COMPATIBLE' | 'BLOCKED_PENDING_QUOTE';
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
  // 1. Unified Image Generation (Strict Gemini Photo Adapter)
  async generateImage(params: ImageGenerationParams): Promise<ProviderResult> {
    if (params.provider && params.provider.trim().toLowerCase() !== 'gemini') {
      throw new Error(`PROVIDER_ROUTING_MISMATCH: Image generation requires provider 'gemini', received '${params.provider}'.`);
    }
    if (params.adapter && params.adapter.trim() !== 'geminiAdapter') {
      throw new Error(`PROVIDER_ROUTING_MISMATCH: Image generation requires adapter 'geminiAdapter', received '${params.adapter}'.`);
    }
    return await geminiAdapter.generateImage(params);
  }

  // 2. Unified Video Generation (Strict Gemini Omni Video Adapter)
  async generateVideo(params: VideoGenerationParams): Promise<ProviderResult> {
    if (params.provider && !['google_omni', 'gemini', 'google_veo'].includes(params.provider.trim().toLowerCase())) {
      throw new Error(`PROVIDER_ROUTING_MISMATCH: VideoProviderAdapter rejected incompatible provider '${params.provider}'.`);
    }
    if (params.adapter && params.adapter.trim() !== 'videoProviderAdapter') {
      throw new Error(`PROVIDER_ROUTING_MISMATCH: VideoProviderAdapter rejected mismatched adapter '${params.adapter}'.`);
    }
    return await videoProviderAdapter.generateVideo(params);
  }

  // 3. Unified Face Swap Video (Higgsfield Genjutsu Motion Transfer / Object Swap)
  async generateFaceSwapVideo(
    params: FaceSwapParams & {
      masterRecipePrompt?: string;
      model?: string;
      resolution?: '480p' | '720p' | '1080p';
      isCouple?: boolean;
      provider?: string;
      adapter?: string;
      workflow?: string;
      ownerUserId?: string;
    }
  ): Promise<ProviderResult> {
    if (params.provider && params.provider.trim().toLowerCase() !== 'higgsfield') {
      throw new Error(`PROVIDER_ROUTING_MISMATCH: FaceSwap generation requires provider 'higgsfield', received '${params.provider}'.`);
    }
    if (params.adapter && params.adapter.trim() !== 'faceSwapAdapter') {
      throw new Error(`PROVIDER_ROUTING_MISMATCH: FaceSwap generation requires adapter 'faceSwapAdapter', received '${params.adapter}'.`);
    }

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
      ownerUserId: params.ownerUserId,
      model: params.model,
      provider: params.provider || 'higgsfield',
      adapter: params.adapter || 'faceSwapAdapter',
      workflow: params.workflow,
      isCouple: params.isCouple
    });
  }

  // 4. Unified Template Processing (Strict Provider + Adapter + Model Routing — Zero Silent Omni Fallback)
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

    const explicitProvider = (activeWorkflowConfig?.provider || params.provider || '').toString().trim().toLowerCase();
    const resolvedAdapter = (activeWorkflowConfig?.adapter || params.adapter || '').toString().trim();
    const workflowName = (activeWorkflowConfig?.workflow || params.workflow || '').toString().trim();
    const drivingVideoUrl = activeWorkflowConfig?.drivingVideoUrl || params.drivingVideoUrl || recipe?.drivingVideoUrl;
    const isSmartTemplateRoute =
      params.engine === 'SMART_TEMPLATE' ||
      explicitProvider === 'smart_template' ||
      resolvedAdapter === 'smartCanvas';

    const rawProvider = isSmartTemplateRoute
      ? 'smart_template'
      : (
          explicitProvider ||
          (params.templateType === 'video' ? (drivingVideoUrl ? 'higgsfield' : '') : 'gemini')
        );

    const rawModel = (activeWorkflowConfig?.model || params.model || '').toString().trim();
    let selectedModel: string | undefined = rawModel ? resolveCanonicalModelId(rawModel) : undefined;

    if (isSmartTemplateRoute) {
      if (!selectedModel || selectedModel === 'auto') {
        selectedModel = params.templateType === 'video' ? 'smart_canvas_ffmpeg' : 'smart_canvas';
      }
    } else if (!selectedModel || selectedModel === 'auto') {
      const modality = drivingVideoUrl && isInputImage ? 'face_swap' : (isInputVideo || params.templateType === 'video' ? 'video' : 'image');
      selectedModel = selectBestCompatibleModel(modality, workflowName) || undefined;
      if (!selectedModel) {
        throw new Error(`NO_VERIFIED_MODEL: No verified compatible model available for modality '${modality}' and workflow '${workflowName}'.`);
      }
    }

    const regEntry = getRegisteredModelEntry(selectedModel);

    // Unconditional Omni / Evaluation-Only Model Guard (protects all routes including driving video)
    const isEvalAllowed = Boolean(params.customParameters?.isEvaluationMode || params.isEvaluationMode);
    if (regEntry?.isEvaluationOnly && !isEvalAllowed) {
      throw new Error(`MODEL_EVALUATION_ONLY: Model '${selectedModel}' is configured for internal evaluation only and is guarded from production customer generation.`);
    }

    // Strict Registry Provider & Workflow Parity Checks (never mix providers/models/adapters)
    if (regEntry) {
      const expectedProvider = regEntry.provider;
      const providerCompatible =
        rawProvider === expectedProvider ||
        (expectedProvider === 'gemini' && ['google_omni', 'google_veo', 'gemini'].includes(rawProvider));

      if (!providerCompatible) {
        throw new Error(
          `PROVIDER_ROUTING_MISMATCH: Model '${selectedModel}' belongs to provider '${expectedProvider}', not '${rawProvider}'.`
        );
      }
      if (resolvedAdapter && regEntry.adapterId && resolvedAdapter !== regEntry.adapterId) {
        throw new Error(
          `PROVIDER_ROUTING_MISMATCH: Model '${selectedModel}' requires adapter '${regEntry.adapterId}', not '${resolvedAdapter}'.`
        );
      }
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

    // 3. Explicit Higgsfield / Driving Video Route (NO silent cross-provider fallback)
    if (rawProvider === 'higgsfield' || resolvedAdapter === 'faceSwapAdapter') {
      if (!drivingVideoUrl) {
        throw new Error(
          `PROVIDER_ROUTING_MISMATCH: Higgsfield template '${params.templateTitle}' requires a valid drivingVideoUrl.`
        );
      }
      return await this.generateFaceSwapVideo({
        videoUrl: drivingVideoUrl,
        imageUrls: customerMediaUrls,
        inputMedia: params.inputMedia,
        masterRecipePrompt: basePrompt,
        customInstructions: alreadyHasCustomerInstructions ? undefined : params.customPrompt,
        ownerUserId: params.ownerUserId,
        provider: 'higgsfield',
        adapter: 'faceSwapAdapter',
        workflow: workflowName,
        model: selectedModel || (workflowName === 'OBJECT_SWAP' ? 'hf_mult_replace_object_flash' : 'hf_mult_motion_control_flash'),
        resolution: params.resolution || ((params.aspectRatio as any) === '1080p' ? '1080p' : '480p'),
        durationSeconds: params.durationSeconds,
        isCouple
      });
    }

    if (drivingVideoUrl && isInputImage && rawProvider !== 'google_omni' && rawProvider !== 'google_veo') {
      return await this.generateFaceSwapVideo({
        videoUrl: drivingVideoUrl,
        imageUrls: customerMediaUrls,
        inputMedia: params.inputMedia,
        masterRecipePrompt: basePrompt,
        customInstructions: alreadyHasCustomerInstructions ? undefined : params.customPrompt,
        ownerUserId: params.ownerUserId,
        provider: 'higgsfield',
        adapter: 'faceSwapAdapter',
        workflow: workflowName,
        model: selectedModel || (workflowName === 'OBJECT_SWAP' ? 'hf_mult_replace_object_flash' : 'hf_mult_motion_control_flash'),
        resolution: params.resolution || ((params.aspectRatio as any) === '1080p' ? '1080p' : '480p'),
        durationSeconds: params.durationSeconds,
        isCouple
      });
    }

    // 4. Native Smart Template Canvas Route (Resvg + FFmpeg — Photo & Video)
    if (isSmartTemplateRoute) {
      return await smartCanvasAdapter.processSmartTemplate({
        templateId: params.templateId,
        templateTitle: params.templateTitle,
        templateType: params.templateType,
        workflow: workflowName || rawModel || 'smart_canvas',
        model: selectedModel || (params.templateType === 'video' ? 'smart_canvas_ffmpeg' : 'smart_canvas'),
        inputMediaUrls: customerMediaUrls,
        inputMedia: params.inputMedia?.map((m) => ({
          slotId: m.slotId,
          role: m.role,
          type: (m.type === 'video' ? 'video' : 'image') as 'image' | 'video'
        })),
        isCouple,
        aspectRatio: activeWorkflowConfig?.aspectRatio || params.aspectRatio || '9:16',
        customPrompt: params.customPrompt,
        durationSeconds: params.durationSeconds,
        resolution: params.resolution,
        ownerUserId: params.ownerUserId
      });
    }

    // 5. Execute according to resolved target media type & provider (NO silent fallback to Gemini Omni)
    const sampleBeforeUrl =
      params.sampleBeforeUrl ||
      activeWorkflowConfig?.sampleBefore ||
      recipe?.sampleBefore;

    if (params.templateType === 'photo') {
      if (rawProvider !== 'gemini') {
        throw new Error(
          `PROVIDER_ROUTING_MISMATCH: Photo template '${params.templateTitle}' cannot execute under provider '${rawProvider}'.`
        );
      }
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
        inputMedia: params.inputMedia,
        isCouple,
        referenceImageUrl,
        sampleBeforeUrl,
        sampleResultUrl: referenceImageUrl,
        sampleFaceThumbnailUrl: params.sampleFaceThumbnailUrl,
        aspectRatio: (activeWorkflowConfig?.aspectRatio || params.aspectRatio || '9:16') as any,
        styleWorkflow: workflowName,
        provider: 'gemini',
        adapter: 'geminiAdapter',
        model: selectedModel,
        ownerUserId: params.ownerUserId,
        isIterativeEdit: params.isIterativeEdit,
        previousGenerationId: params.previousGenerationId
      });
    }

    // Video execution path: ONLY route to videoProviderAdapter when explicitly Omni/Veo compatible
    const isOmniCompatible =
      ['google_omni', 'google_veo', 'gemini'].includes(rawProvider) &&
      (!resolvedAdapter || resolvedAdapter === 'videoProviderAdapter') &&
      (!selectedModel || selectedModel.includes('omni') || selectedModel.startsWith('veo'));

    if (!isOmniCompatible) {
      throw new Error(
        `PROVIDER_ROUTING_MISMATCH: Video template '${params.templateTitle}' (provider='${rawProvider}', model='${selectedModel || 'unset'}') cannot silently fall back to Gemini Omni.`
      );
    }

    return await this.generateVideo({
      prompt: combinedPrompt,
      sourceMediaUrl: params.inputMediaUrl,
      userImageUrl: customerMediaUrls[0] || params.inputMediaUrl,
      userImageUrls: customerMediaUrls,
      inputMedia: params.inputMedia,
      isCouple,
      referenceImageUrl: params.referenceImageUrl,
      sampleBeforeUrl,
      sampleResultUrl: params.sampleResultUrl,
      sampleFaceThumbnailUrl: params.sampleFaceThumbnailUrl,
      aspectRatio: (activeWorkflowConfig?.aspectRatio || params.aspectRatio || '9:16') as any,
      durationSeconds: params.durationSeconds,
      resolution: params.resolution,
      styleWorkflow: workflowName,
      provider: rawProvider,
      adapter: 'videoProviderAdapter',
      model: selectedModel,
      ownerUserId: params.ownerUserId,
      isIterativeEdit: params.isIterativeEdit,
      previousGenerationId: params.previousGenerationId
    });
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
