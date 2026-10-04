/**
 * Production Google Veo Video Generation Pipeline Adapter.
 * 
 * Uses @google/genai TypeScript SDK with veo-3.1-lite-generate-preview.
 * Handles:
 * - Starting image + cinematic prompt payload
 * - 9:16 portrait mobile aspect ratio
 * - Asynchronous operation polling until completion
 * - Video bytes download, durable media storage, and real output URL
 * 
 * NEVER returns fallback previews or template mock videos. If Veo fails or credentials
 * are missing, throws a clear Error so caller automatically initiates exact credit refund.
 */

import { GoogleGenAI } from '@google/genai';
import { mediaStorage } from '../storage/mediaStorage.ts';
import type { VideoGenerationParams, ProviderResult } from '../types.ts';

export class VideoProviderAdapter {
  readonly providerName = 'google_veo';
  readonly modelName = 'veo-3.1-lite-generate-preview';

  /**
   * Helper to resolve starting image input into base64 bytes and mimeType.
   */
  private async resolveImagePayload(imageInput: string): Promise<{ data: string; mimeType: string }> {
    if (imageInput.startsWith('data:')) {
      const match = imageInput.match(/^data:([^;]+);base64,(.+)$/);
      if (match) return { mimeType: match[1], data: match[2] };
    }

    if (imageInput.startsWith('/api/media/')) {
      const fileId = imageInput.replace('/api/media/', '');
      const filePath = mediaStorage.getFilePath(fileId);
      if (filePath) {
        const fs = await import('fs');
        const buf = fs.readFileSync(filePath);
        return {
          data: buf.toString('base64'),
          mimeType: fileId.endsWith('.png') ? 'image/png' : 'image/jpeg'
        };
      }
    }

    if (imageInput.startsWith('http://') || imageInput.startsWith('https://')) {
      const res = await fetch(imageInput);
      if (!res.ok) {
        throw new Error(`Failed to fetch source image for video from ${imageInput}`);
      }
      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const mimeType = res.headers.get('content-type') || 'image/jpeg';
      return { data: buffer.toString('base64'), mimeType };
    }

    return { data: imageInput, mimeType: 'image/jpeg' };
  }

  /**
   * Generates a real AI video using Google Veo.
   */
  async generateVideo(params: VideoGenerationParams): Promise<ProviderResult> {
    const startTime = Date.now();
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error(
        'GEMINI_API_KEY is not configured in environment variables. Please provide a valid Gemini API key to execute Veo video generation.'
      );
    }

    const ai = new GoogleGenAI();
    const prompt = `Cinematic 9:16 Instagram Reels video: ${params.prompt}. Style: ${params.styleWorkflow || 'viral motion'}. Realistic fluid motion, studio lighting, vivid atmospheric smoke, 60fps aesthetic.`;

    const requestPayload: any = {
      model: this.modelName,
      prompt,
      config: {
        numberOfVideos: 1,
        resolution: '720p',
        aspectRatio: '9:16'
      }
    };

    // Attach initial image if available
    if (params.userImageUrl) {
      try {
        const imgPayload = await this.resolveImagePayload(params.userImageUrl);
        requestPayload.image = {
          imageBytes: imgPayload.data,
          mimeType: imgPayload.mimeType
        };
      } catch (err: any) {
        console.warn('[VideoProviderAdapter] Starting frame note:', err.message);
      }
    }

    // 1. Initiate asynchronous video generation operation
    let operation = await ai.models.generateVideos(requestPayload);

    // 2. Poll until operation completes (max 5 minutes)
    const pollTimeout = Date.now() + 5 * 60 * 1000;
    while (!operation.done) {
      if (Date.now() > pollTimeout) {
        throw new Error('Veo video generation timed out after 5 minutes.');
      }
      await new Promise((resolve) => setTimeout(resolve, 6000));
      operation = await ai.operations.getVideosOperation({ operation });
    }

    if (operation.error) {
      throw new Error(`Veo video generation failed: ${operation.error.message || JSON.stringify(operation.error)}`);
    }

    const generatedVideos = operation.response?.generatedVideos;
    const videoData = generatedVideos?.[0]?.video;

    if (!videoData?.videoBytes) {
      throw new Error('Veo operation completed but did not return video bytes.');
    }

    // 3. Save actual video bytes to durable storage
    const stored = await mediaStorage.saveMedia(
      videoData.videoBytes,
      'generation',
      `veo_${Date.now()}.mp4`
    );

    return {
      success: true,
      resultUrl: stored.publicUrl,
      provider: this.providerName,
      model: this.modelName,
      processingTimeMs: Date.now() - startTime
    };
  }
}

export const videoProviderAdapter = new VideoProviderAdapter();
