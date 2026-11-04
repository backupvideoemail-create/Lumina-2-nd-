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
import { MODEL_REGISTRY } from '../pricing/pricingService.ts';

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
    const selectedModel = activeWorkflowConfig?.model || params.model;

    // 2. Prompt Construction: Combine protected template prompt + optional user custom instructions
    const basePrompt =
      activeWorkflowConfig?.prompt ||
      (params.templateType === 'video'
        ? `Synthesize video reel for ${params.templateTitle}. Workflow: ${workflowName}.`
        : `Transform image with ${params.templateTitle} aesthetic. Workflow: ${workflowName}.`);

    const alreadyHasCustomerInstructions =
      basePrompt.includes('--- OPTIONAL CUSTOMER INSTRUCTIONS ---') ||
      (params.customPrompt && basePrompt.includes(params.customPrompt.trim()));

    const combinedPrompt =
      params.customPrompt && params.customPrompt.trim() && !alreadyHasCustomerInstructions
        ? `${basePrompt}\nAdditional User Creative Instructions (Hindi/English/Hinglish): ${params.customPrompt.trim()}`
        : basePrompt;

    // Extract all candidate customer media URLs
    const customerMediaUrls =
      params.inputMediaUrls && params.inputMediaUrls.length > 0
        ? params.inputMediaUrls
        : params.inputMediaUrl.includes('|||')
        ? params.inputMediaUrl.split('|||').map((s) => s.trim()).filter(Boolean)
        : [params.inputMediaUrl];

    const isCouple = customerMediaUrls.length >= 2 || (params.inputMedia && params.inputMedia.length >= 2);

    // 3. Reference / Driving Video Support:
    // If template recipe has a fixed driving video and user provided a photo, run motion transfer synthesis!
    if (drivingVideoUrl && isInputImage) {
      return await this.generateFaceSwapVideo({
        videoUrl: drivingVideoUrl,
        imageUrls: customerMediaUrls,
        masterRecipePrompt: basePrompt,
        customInstructions: params.customPrompt,
        ownerUserId: params.ownerUserId,
        model: selectedModel || (workflowName === 'MOTION_TRANSFER' ? 'hf_mult_motion_control_flash' : 'hf_mult_replace_object_flash'),
        resolution: (params.aspectRatio as any) === '1080p' ? '1080p' : '720p',
        isCouple
      });
    }

    // 4. Execute according to resolved target media type & provider
    const sampleBeforeUrl =
      params.sampleBeforeUrl ||
      activeWorkflowConfig?.sampleBefore ||
      recipe?.sampleBefore;

    if (provider === 'google_veo' || params.templateType === 'video' || isInputVideo) {
      if (selectedModel && MODEL_REGISTRY[selectedModel]?.isEvaluationOnly) {
        throw new Error(`MODEL_EVALUATION_ONLY: Model '${selectedModel}' is configured for internal evaluation only and is guarded from production customer generation.`);
      }
      return await this.generateVideo({
        prompt: combinedPrompt,
        sourceMediaUrl: params.inputMediaUrl,
        userImageUrl: customerMediaUrls[0] || params.inputMediaUrl,
        userImageUrls: customerMediaUrls,
        referenceImageUrl: params.referenceImageUrl,
        sampleBeforeUrl,
        sampleResultUrl: params.sampleResultUrl,
        aspectRatio: (activeWorkflowConfig?.aspectRatio || params.aspectRatio || '9:16') as any,
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
