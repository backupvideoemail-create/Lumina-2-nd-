/**
 * Production Google Gemini Omni Flash Video Generation Pipeline Adapter.
 * 
 * Uses @google/genai TypeScript SDK with gemini-omni-1.1-flash via Interactions API.
 * Handles:
 * - Starting image + cinematic prompt payload (CUSTOMER_SOURCE_PHOTO)
 * - 9:16 portrait mobile aspect ratio
 * - Direct Interactions API request lifecycle with timeout handling
 * - Video bytes extraction (data or uri), durable storage in mediaStorage, and real output URL
 * 
 * NEVER returns fallback previews or template mock videos. If Omni Flash fails or credentials
 * are missing, throws a clear Error so caller automatically initiates exact credit refund.
 */

import { GoogleGenAI } from '@google/genai';
import { mediaStorage } from '../storage/mediaStorage.ts';
import type { VideoGenerationParams, ProviderResult } from '../types.ts';

export class VideoProviderAdapter {
  readonly providerName = 'google_omni';
  readonly modelName = 'gemini-omni-1.1-flash';

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
   * Generates a real AI video using Gemini Omni Flash via Interactions API.
   */
  async generateVideo(params: VideoGenerationParams): Promise<ProviderResult> {
    const startTime = Date.now();
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error(
        'GEMINI_API_KEY is not configured in environment variables. Please provide a valid Gemini API key to execute Gemini Omni video generation.'
      );
    }

    const ai = new GoogleGenAI({ apiKey });
    // Incorporate prompt directives with clear scene and motion instructions
    const prompt = `Cinematic 9:16 Instagram Reels video: ${params.prompt}. Style: ${params.styleWorkflow || 'viral motion'}. Realistic fluid motion, studio lighting, vivid atmospheric smoke, 60fps aesthetic.`;

    const inputParts: any[] = [];

    // Customer Image is the primary identity starting frame (CUSTOMER_SOURCE_PHOTO)
    const primaryIdentityMedia = params.userImageUrl || params.sourceMediaUrl;
    if (primaryIdentityMedia) {
      try {
        const imgPayload = await this.resolveImagePayload(primaryIdentityMedia);
        inputParts.push({
          type: 'image',
          data: imgPayload.data,
          mime_type: imgPayload.mimeType
        });
      } catch (err: any) {
        console.warn('[VideoProviderAdapter] Starting frame resolution note:', err.message);
      }
    }

    // Add text prompt
    inputParts.push({
      type: 'text',
      text: prompt
    });

    const targetAspectRatio = params.aspectRatio === '16:9' ? '16:9' : '9:16';

    try {
      // 1. Invoke Interactions API for gemini-omni-1.1-flash
      const interaction = await ai.interactions.create({
        model: this.modelName,
        input: inputParts,
        background: false,
        store: false,
        stream: false,
        response_format: {
          type: 'video',
          aspect_ratio: targetAspectRatio,
          duration: '5s',
          resolution: '720p'
        }
      }, { timeout: 300000 }); // 5 minutes timeout

      let videoBuffer: Buffer | null = null;
      const videoPart = interaction.output_video;

      if (videoPart?.data) {
        videoBuffer = Buffer.from(videoPart.data, 'base64');
      } else if ((videoPart as any)?.uri) {
        const videoRes = await fetch((videoPart as any).uri);
        if (videoRes.ok) {
          const ab = await videoRes.arrayBuffer();
          videoBuffer = Buffer.from(ab);
        }
      } else {
        // Inspect steps for model_output video
        for (const step of (interaction.steps || []) as any[]) {
          if (step.type === 'model_output' && Array.isArray(step.content)) {
            const vContent = step.content.find((c: any) => c.type === 'video');
            if (vContent && (vContent as any).data) {
              videoBuffer = Buffer.from((vContent as any).data, 'base64');
              break;
            } else if (vContent && (vContent as any).uri) {
              const videoRes = await fetch((vContent as any).uri);
              if (videoRes.ok) {
                const ab = await videoRes.arrayBuffer();
                videoBuffer = Buffer.from(ab);
                break;
              }
            }
          }
        }
      }

      if (!videoBuffer || videoBuffer.length === 0) {
        throw new Error(
          `Gemini Omni Flash completed but returned no video output. Status: ${interaction.status || 'unknown'}`
        );
      }

      // 2. Save actual video bytes to durable storage with owner isolation
      const stored = await mediaStorage.saveMedia(
        videoBuffer,
        'generation',
        `omni_${Date.now()}.mp4`,
        params.ownerUserId,
        false
      );

      return {
        success: true,
        resultUrl: stored.publicUrl,
        provider: this.providerName,
        model: this.modelName,
        processingTimeMs: Date.now() - startTime
      };
    } catch (err: any) {
      console.error('[VideoProviderAdapter] Generation failed:', err.message);
      throw new Error(`Google Omni Flash video generation failed: ${err.message}`);
    }
  }
}

export const videoProviderAdapter = new VideoProviderAdapter();
