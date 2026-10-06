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

export class AIRouter {
  // 1. Unified Image Generation
  async generateImage(params: ImageGenerationParams): Promise<ProviderResult> {
    return await geminiAdapter.generateImage(params);
  }

  // 2. Unified Video Generation
  async generateVideo(params: VideoGenerationParams): Promise<ProviderResult> {
    return await videoProviderAdapter.generateVideo(params);
  }

  // 3. Unified Face Swap Video (Higgsfield Genjutsu Motion Transfer)
  async generateFaceSwapVideo(params: FaceSwapParams): Promise<ProviderResult> {
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
      customInstructions: params.customInstructions,
      resolution: '480p',
      durationSeconds: params.durationSeconds
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

    // 2. Reference / Driving Video Support:
    // If template recipe has a fixed driving video and user provided a photo, run motion transfer synthesis!
    if (drivingVideoUrl && isInputImage) {
      return await this.generateFaceSwapVideo({
        videoUrl: drivingVideoUrl,
        imageUrls: [params.inputMediaUrl],
        customInstructions: params.customPrompt,
        ownerUserId: params.ownerUserId
      });
    }

    // 3. Prompt Construction: Combine protected template prompt + optional user custom instructions
    const basePrompt =
      activeWorkflowConfig?.prompt ||
      (params.templateType === 'video'
        ? `Synthesize video reel for ${params.templateTitle}. Workflow: ${workflowName}.`
        : `Transform image with ${params.templateTitle} aesthetic. Workflow: ${workflowName}.`);

    const combinedPrompt =
      params.customPrompt && params.customPrompt.trim()
        ? `${basePrompt}\nAdditional User Creative Instructions (Hindi/English/Hinglish): ${params.customPrompt.trim()}`
        : basePrompt;

    // 4. Execute according to resolved target media type & provider
    if (provider === 'google_veo' || params.templateType === 'video' || isInputVideo) {
      return await this.generateVideo({
        prompt: combinedPrompt,
        sourceMediaUrl: params.inputMediaUrl,
        userImageUrl: params.inputMediaUrl,
        aspectRatio: (activeWorkflowConfig?.aspectRatio || params.aspectRatio || '9:16') as any,
        styleWorkflow: workflowName,
        ownerUserId: params.ownerUserId
      });
    } else {
      return await this.generateImage({
        prompt: combinedPrompt,
        userImageUrl: params.inputMediaUrl,
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
