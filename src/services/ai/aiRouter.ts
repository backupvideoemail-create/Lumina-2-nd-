import {
  ImageGenerationParams,
  VideoGenerationParams,
  FaceSwapParams,
  TemplateProcessParams,
  ProviderResult
} from '../types';
import { geminiAdapter } from './geminiAdapter';
import { videoProviderAdapter } from './videoProviderAdapter';
import { faceSwapAdapter } from './faceSwapAdapter';

export interface ProviderConfig {
  imageProvider: 'gemini' | 'mock';
  videoProvider: 'default_video' | 'mock';
  faceSwapProvider: 'default_faceswap' | 'mock';
}

export class AIRouter {
  private config: ProviderConfig = {
    imageProvider: 'gemini',
    videoProvider: 'default_video',
    faceSwapProvider: 'default_faceswap'
  };

  setProviderConfig(newConfig: Partial<ProviderConfig>) {
    this.config = { ...this.config, ...newConfig };
  }

  // 1. Unified Image Generation interface
  async generateImage(params: ImageGenerationParams, fallbackResultUrl: string): Promise<ProviderResult> {
    return await geminiAdapter.generateImage(params, fallbackResultUrl);
  }

  // 2. Unified Video Generation interface
  async generateVideo(params: VideoGenerationParams, fallbackResultUrl: string): Promise<ProviderResult> {
    return await videoProviderAdapter.generateVideo(params, fallbackResultUrl);
  }

  // 3. Unified Face Swap Video interface
  async generateFaceSwapVideo(params: FaceSwapParams, fallbackResultUrl: string): Promise<ProviderResult> {
    return await faceSwapAdapter.generateFaceSwapVideo(params, fallbackResultUrl);
  }

  // 4. Unified Template Processing interface
  async processTemplate(params: TemplateProcessParams, defaultResultUrl: string): Promise<ProviderResult> {
    if (params.templateType === 'video') {
      return await this.generateVideo(
        {
          prompt: params.customPrompt || `Synthesize video reel for ${params.templateTitle}`,
          sourceMediaUrl: params.inputMediaUrl,
          aspectRatio: (params.aspectRatio as any) || '9:16',
          motionStyle: params.workflow
        },
        defaultResultUrl
      );
    } else {
      return await this.generateImage(
        {
          prompt: params.customPrompt || `Transform image with ${params.templateTitle} aesthetic`,
          sourceImageUrl: params.inputMediaUrl,
          aspectRatio: (params.aspectRatio as any) || '4:5',
          styleWorkflow: params.workflow
        },
        defaultResultUrl
      );
    }
  }
}

export const aiRouter = new AIRouter();

// Top-level standardized functional exports for the application
export const generateImage = (params: ImageGenerationParams, fallback: string) =>
  aiRouter.generateImage(params, fallback);

export const generateVideo = (params: VideoGenerationParams, fallback: string) =>
  aiRouter.generateVideo(params, fallback);

export const generateFaceSwapVideo = (params: FaceSwapParams, fallback: string) =>
  aiRouter.generateFaceSwapVideo(params, fallback);

export const processTemplate = (params: TemplateProcessParams, fallback: string) =>
  aiRouter.processTemplate(params, fallback);
