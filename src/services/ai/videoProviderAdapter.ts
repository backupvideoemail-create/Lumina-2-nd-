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
import { resolveCanonicalModelId } from '../pricing/pricingService.ts';

export class VideoProviderAdapter {
  readonly providerName = 'google_omni';
  readonly adapterName = 'videoProviderAdapter';
  readonly modelName = 'gemini-omni-1.2-flash';

  /**
   * Helper to resolve starting image input into base64 bytes and mimeType.
   */
  /**
   * Helper to resolve starting image or video input into base64 bytes, normalized mimeType, and part type.
   */
  private async resolveMediaPayload(mediaInput: string, ownerUserId?: string): Promise<{ data: string; mimeType: string; partType: 'image' | 'video' }> {
    const cleanMime = (raw?: string | null, fallback = 'image/jpeg') => {
      const normalized = String(raw || fallback).split(';')[0].trim().toLowerCase();
      return normalized || fallback;
    };

    if (mediaInput.startsWith('data:')) {
      const match = mediaInput.match(/^data:([^;]+);base64,(.+)$/i);
      if (match) {
        const mimeType = cleanMime(match[1]);
        return {
          mimeType,
          data: match[2],
          partType: mimeType.startsWith('video/') ? 'video' : 'image'
        };
      }
    }

    if (mediaInput.startsWith('/api/media/') && !mediaInput.startsWith('/api/media/signed/')) {
      const fileId = mediaInput.split('?')[0].replace('/api/media/', '');
      const filePath = mediaStorage.getFilePath(fileId);
      if (filePath) {
        const fs = await import('fs');
        const buf = fs.readFileSync(filePath);
        const lower = fileId.toLowerCase();
        const mimeType = lower.endsWith('.mp4')
          ? 'video/mp4'
          : lower.endsWith('.mov')
          ? 'video/quicktime'
          : lower.endsWith('.webm')
          ? 'video/webm'
          : lower.endsWith('.png')
          ? 'image/png'
          : lower.endsWith('.webp')
          ? 'image/webp'
          : 'image/jpeg';
        return {
          data: buf.toString('base64'),
          mimeType,
          partType: mimeType.startsWith('video/') ? 'video' : 'image'
        };
      }

      const streamRes = await mediaStorage.getAuthorizedObjectStream(fileId, ownerUserId);
      if (streamRes.body) {
        const chunks: Buffer[] = [];
        if (typeof streamRes.body.transformToByteArray === 'function') {
          chunks.push(Buffer.from(await streamRes.body.transformToByteArray()));
        } else {
          for await (const c of streamRes.body) {
            chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
          }
        }
        const buf = Buffer.concat(chunks);
        const mimeType = cleanMime(streamRes.mimeType, 'image/jpeg');
        return {
          data: buf.toString('base64'),
          mimeType,
          partType: mimeType.startsWith('video/') ? 'video' : 'image'
        };
      }
    }

    if (mediaInput.startsWith('http://') || mediaInput.startsWith('https://')) {
      const res = await fetch(mediaInput);
      if (!res.ok) {
        throw new Error(`Failed to fetch source media for video from ${mediaInput}: HTTP ${res.status}`);
      }
      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const mimeType = cleanMime(res.headers.get('content-type'), 'image/jpeg');
      return {
        data: buffer.toString('base64'),
        mimeType,
        partType: mimeType.startsWith('video/') ? 'video' : 'image'
      };
    }

    return { data: mediaInput, mimeType: 'image/jpeg', partType: 'image/jpeg'.startsWith('video/') ? 'video' : 'image' };
  }

  private async fetchOutputVideoUri(uri: string, apiKey: string): Promise<Buffer | null> {
    const isGoogleUri = uri.includes('googleapis.com') || uri.includes('generativelanguage');
    const res = await fetch(uri, isGoogleUri ? { headers: { 'x-goog-api-key': apiKey } } : undefined);
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  }

  /**
   * Generates a real AI video using Gemini Omni 1.2 Flash via Interactions API.
   */
  async generateVideo(params: VideoGenerationParams): Promise<ProviderResult> {
    const startTime = Date.now();

    // Fail-closed strict provider, adapter, and model routing validation
    if (params.provider && !['google_omni', 'gemini', 'google_veo'].includes(params.provider.trim().toLowerCase())) {
      throw new Error(
        `PROVIDER_ROUTING_MISMATCH: VideoProviderAdapter cannot execute provider '${params.provider}'.`
      );
    }
    if (params.adapter && params.adapter.trim() !== this.adapterName) {
      throw new Error(
        `PROVIDER_ROUTING_MISMATCH: VideoProviderAdapter cannot execute mismatched adapter '${params.adapter}'.`
      );
    }

    const requestedRaw = (params.model || '').trim();
    const targetModel = requestedRaw ? resolveCanonicalModelId(requestedRaw) : this.modelName;
    if (!targetModel.includes('omni') && !targetModel.startsWith('veo')) {
      throw new Error(
        `PROVIDER_ROUTING_MISMATCH: Model '${requestedRaw || targetModel}' is incompatible with VideoProviderAdapter.`
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        'GEMINI_API_KEY is not configured in environment variables. Please provide a valid Gemini API key to execute Gemini Omni video generation.'
      );
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });

    // Incorporate prompt directives with clear scene and motion instructions
    const prompt = `Cinematic 9:16 Instagram Reels video: ${params.prompt}. Style: ${params.styleWorkflow || 'viral motion'}. Realistic fluid motion, studio lighting, vivid atmospheric smoke, 60fps aesthetic.`;

    const inputParts: any[] = [];

    // Customer Image or Video is the primary identity starting frame (CUSTOMER_SOURCE_PHOTO / VIDEO)
    const primaryIdentityMedia = params.userImageUrl || params.sourceMediaUrl;
    if (primaryIdentityMedia) {
      try {
        const mediaPayload = await this.resolveMediaPayload(primaryIdentityMedia, params.ownerUserId);
        inputParts.push({
          type: mediaPayload.partType,
          data: mediaPayload.data,
          mime_type: mediaPayload.mimeType
        });
      } catch (err: any) {
        throw new Error(`Starting frame resolution failed for customer media: ${err.message}`);
      }
    }

    // Add text prompt
    inputParts.push({
      type: 'text',
      text: prompt
    });

    const targetAspectRatio = params.aspectRatio === '16:9' ? '16:9' : '9:16';
    const numericDuration = Number(params.durationSeconds);
    const clampedDuration = Number.isFinite(numericDuration) && numericDuration > 0
      ? Math.max(3, Math.min(15, Math.round(numericDuration)))
      : 5;
    const targetDuration = `${clampedDuration}s`;
    const targetResolution = params.resolution === '1080p' ? '1080p' : '720p';

    try {
      // 1. Invoke Interactions API for gemini-omni-1.2-flash
      const interaction = await ai.interactions.create({
        model: targetModel,
        input: inputParts,
        background: false,
        store: false,
        stream: false,
        response_format: {
          type: 'video',
          aspect_ratio: targetAspectRatio,
          duration: targetDuration,
          resolution: targetResolution
        }
      }, { timeout: 300000 }); // 5 minutes timeout

      let videoBuffer: Buffer | null = null;
      const videoPart = interaction.output_video;

      if (videoPart?.data) {
        videoBuffer = Buffer.from(videoPart.data, 'base64');
      } else if ((videoPart as any)?.uri) {
        videoBuffer = await this.fetchOutputVideoUri((videoPart as any).uri, apiKey);
      } else {
        // Inspect steps for model_output video
        for (const step of (interaction.steps || []) as any[]) {
          if (step.type === 'model_output' && Array.isArray(step.content)) {
            const vContent = step.content.find((c: any) => c.type === 'video');
            if (vContent && (vContent as any).data) {
              videoBuffer = Buffer.from((vContent as any).data, 'base64');
              break;
            } else if (vContent && (vContent as any).uri) {
              videoBuffer = await this.fetchOutputVideoUri((vContent as any).uri, apiKey);
              if (videoBuffer) break;
            }
          }
        }
      }

      if (!videoBuffer || videoBuffer.length === 0) {
        throw new Error(
          `Gemini Omni Flash (${targetModel}) completed but returned no video output. Status: ${interaction.status || 'unknown'}`
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

      const rawSanitizedResponse = params.returnRawDiagnostics
        ? {
            interactionId: (interaction as any)?.id || null,
            status: interaction?.status || 'completed',
            model: targetModel,
            aspectRatio: targetAspectRatio,
            duration: targetDuration,
            resolution: targetResolution,
            stepsCount: Array.isArray(interaction?.steps) ? interaction.steps.length : 0,
            hasVideoPart: Boolean(videoBuffer?.length),
            outputBytes: videoBuffer.length
          }
        : undefined;

      return {
        success: true,
        resultUrl: stored.publicUrl,
        provider: this.providerName,
        adapter: this.adapterName,
        model: targetModel,
        processingTimeMs: Date.now() - startTime,
        ...(rawSanitizedResponse ? { rawSanitizedResponse } : {})
      };
    } catch (err: any) {
      console.error('[VideoProviderAdapter] Generation failed:', err.message);
      throw new Error(`Google Omni Flash video generation failed: ${err.message}`);
    }
  }
}

export const videoProviderAdapter = new VideoProviderAdapter();
