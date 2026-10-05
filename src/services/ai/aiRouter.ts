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

  // 4. Unified Template Processing (Protected template prompt + user custom instructions safely combined)
  async processTemplate(params: TemplateProcessParams): Promise<ProviderResult> {
    if (params.templateType === 'video') {
      const basePrompt = `Synthesize video reel for ${params.templateTitle}. Workflow: ${params.workflow}.`;
      const combinedPrompt =
        params.customPrompt && params.customPrompt.trim()
          ? `${basePrompt}\nAdditional User Creative Instructions (Hindi/English/Hinglish): ${params.customPrompt.trim()}`
          : basePrompt;

      return await this.generateVideo({
        prompt: combinedPrompt,
        sourceMediaUrl: params.inputMediaUrl,
        userImageUrl: params.inputMediaUrl,
        aspectRatio: (params.aspectRatio as any) || '9:16',
        styleWorkflow: params.workflow,
        ownerUserId: params.ownerUserId
      });
    } else {
      const basePrompt = `Transform image with ${params.templateTitle} aesthetic. Workflow: ${params.workflow}.`;
      const combinedPrompt =
        params.customPrompt && params.customPrompt.trim()
          ? `${basePrompt}\nAdditional User Creative Instructions (Hindi/English/Hinglish): ${params.customPrompt.trim()}`
          : basePrompt;

      return await this.generateImage({
        prompt: combinedPrompt,
        userImageUrl: params.inputMediaUrl,
        aspectRatio: (params.aspectRatio as any) || '9:16',
        styleWorkflow: params.workflow,
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
