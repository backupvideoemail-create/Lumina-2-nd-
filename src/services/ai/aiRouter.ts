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

  // 3. Unified Face Swap Video
  async generateFaceSwapVideo(params: FaceSwapParams): Promise<ProviderResult> {
    return await faceSwapAdapter.generateFaceSwapVideo(params);
  }

  // 4. Unified Template Processing
  async processTemplate(params: TemplateProcessParams): Promise<ProviderResult> {
    if (params.templateType === 'video') {
      return await this.generateVideo({
        prompt: params.customPrompt || `Synthesize video reel for ${params.templateTitle}`,
        sourceMediaUrl: params.inputMediaUrl,
        userImageUrl: params.inputMediaUrl,
        aspectRatio: (params.aspectRatio as any) || '9:16',
        styleWorkflow: params.workflow
      });
    } else {
      return await this.generateImage({
        prompt: params.customPrompt || `Transform image with ${params.templateTitle} aesthetic`,
        userImageUrl: params.inputMediaUrl,
        aspectRatio: (params.aspectRatio as any) || '9:16',
        styleWorkflow: params.workflow
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
