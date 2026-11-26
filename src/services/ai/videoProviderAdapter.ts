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

import crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';
import {
  mediaStorage,
  extractMediaFileIdFromRef,
  detectMediaFormatFromBuffer
} from '../storage/mediaStorage.ts';
import type { VideoGenerationParams, ProviderResult } from '../types.ts';
import type { GenerationDiagnosticInputItem } from '../../types/index.ts';
import { resolveCanonicalModelId } from '../pricing/pricingService.ts';

interface ResolvedVideoInputPayload {
  data: string;
  mimeType: string;
  partType: 'image' | 'video';
  sizeBytes: number;
  sha256: string;
}

export class VideoProviderAdapter {
  readonly providerName = 'google_omni';
  readonly adapterName = 'videoProviderAdapter';
  readonly modelName = 'gemini-omni-1.2-flash';

  /**
   * Resolves customer image or video input into base64 bytes, authoritative mimeType, and part type.
   * Fails closed on missing /api/media/* files, HTML error pages, or 0-byte payloads.
   */
  public async resolveMediaPayload(
    mediaInput: string,
    ownerUserId?: string
  ): Promise<ResolvedVideoInputPayload> {
    const raw = String(mediaInput || '').trim();
    if (!raw) {
      throw new Error('EMPTY_MEDIA_INPUT: Media input is empty.');
    }

    const cleanMime = (mime?: string | null, fallback = 'image/jpeg') => {
      const normalized = String(mime || fallback).split(';')[0].trim().toLowerCase();
      return normalized || fallback;
    };

    const finalize = (buf: Buffer, hintMime?: string): ResolvedVideoInputPayload => {
      if (!buf || buf.length === 0) {
        throw new Error('EMPTY_MEDIA_BYTES: Resolved media contains 0 bytes.');
      }
      const sniffed = detectMediaFormatFromBuffer(buf);
      const mimeType = sniffed?.mimeType || cleanMime(hintMime, 'image/jpeg');
      const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
      return {
        data: buf.toString('base64'),
        mimeType,
        partType: mimeType.startsWith('video/') ? 'video' : 'image',
        sizeBytes: buf.length,
        sha256
      };
    };

    if (raw.startsWith('data:')) {
      const match = raw.match(/^data:([^;]+);base64,(.+)$/is);
      if (!match) {
        throw new Error('INVALID_DATA_URI: Media data URI is malformed or missing base64 data.');
      }
      const buf = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
      return finalize(buf, match[1]);
    }

    if (raw.startsWith('/api/media/')) {
      const fileId = extractMediaFileIdFromRef(raw);
      if (!fileId) {
        throw new Error(`INVALID_MEDIA_REF: Could not extract media file ID from '${raw.split('?')[0]}'.`);
      }
      const isSigned = raw.startsWith('/api/media/signed/');
      const filePath = mediaStorage.getFilePath(fileId);
      if (filePath) {
        const fs = await import('fs');
        const buf = fs.readFileSync(filePath);
        const lower = fileId.toLowerCase();
        const hint = lower.endsWith('.mp4')
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
        return finalize(buf, hint);
      }

      const streamRes = await mediaStorage.getAuthorizedObjectStream(fileId, ownerUserId, undefined, {
        trustedSignedToken: isSigned
      });
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
        return finalize(buf, streamRes.mimeType || 'image/jpeg');
      }

      throw new Error(`MISSING_MEDIA_ASSET: Could not load stored media '${fileId}' from disk or R2 (${streamRes.error || streamRes.statusCode}).`);
    }

    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      const res = await fetch(raw, { signal: AbortSignal.timeout(45000) });
      if (!res.ok) {
        throw new Error(`Failed to fetch source media for video: HTTP ${res.status}`);
      }
      const contentType = cleanMime(res.headers.get('content-type'), 'image/jpeg');
      if (contentType.includes('text/html') || contentType.includes('application/json')) {
        throw new Error(`INVALID_MEDIA_RESPONSE: Expected media bytes from URL, received '${contentType}'.`);
      }
      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const headText = buffer.subarray(0, 64).toString('utf8').trimStart().toLowerCase();
      if (headText.startsWith('<!doctype') || headText.startsWith('<html')) {
        throw new Error('INVALID_MEDIA_RESPONSE: Fetched URL returned an HTML document instead of media bytes.');
      }
      return finalize(buffer, contentType);
    }

    if (raw.startsWith('/') || raw.startsWith('<')) {
      throw new Error('UNSUPPORTED_MEDIA_INPUT: Unsupported video/image reference format.');
    }

    const compact = raw.replace(/\s+/g, '');
    if (compact.length < 4 || !/^[A-Za-z0-9+/=]+$/.test(compact)) {
      throw new Error('INVALID_BASE64_MEDIA: Input string is neither a valid media URL nor valid base64 data.');
    }
    const decoded = Buffer.from(compact, 'base64');
    return finalize(decoded, 'image/jpeg');
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

    const structuredInputMeta = Array.isArray(params.inputMedia) ? params.inputMedia : [];
    const rawInputs: string[] =
      params.userImageUrls && params.userImageUrls.length > 0
        ? params.userImageUrls
        : (params.userImageUrl || params.sourceMediaUrl)
        ? String(params.userImageUrl || params.sourceMediaUrl)
            .split('|||')
            .map((s) => s.trim())
            .filter(Boolean)
        : [];

    if (rawInputs.length === 0) {
      throw new Error('CUSTOMER_SOURCE_MEDIA_MISSING: At least one customer photo or source video is required for video generation.');
    }

    const isCoupleMode = Boolean(params.isCouple);
    if (isCoupleMode && rawInputs.length < 2) {
      throw new Error('INVALID_COUPLE_SLOTS: Couple video template requires both Person A and Person B customer inputs.');
    }
    if (isCoupleMode && structuredInputMeta.length > 0) {
      const hasPersonA = structuredInputMeta.some(
        (m) =>
          m?.role === 'person_a' ||
          m?.role === 'CUSTOMER_SOURCE_PHOTO_PERSON_A' ||
          m?.slotId === 'partner_1' ||
          m?.slotId === 'slot_1'
      );
      const hasPersonB = structuredInputMeta.some(
        (m) =>
          m?.role === 'person_b' ||
          m?.role === 'CUSTOMER_SOURCE_PHOTO_PERSON_B' ||
          m?.slotId === 'partner_2' ||
          m?.slotId === 'slot_2'
      );
      if (!hasPersonA || !hasPersonB) {
        throw new Error('INVALID_COUPLE_SLOTS: Couple video template requires distinct Person A and Person B input roles.');
      }
    }

    const resolvedInputs: Array<ResolvedVideoInputPayload & { slotId: string; role: string }> = [];
    for (let i = 0; i < rawInputs.length; i++) {
      const ref = rawInputs[i];
      if (!ref) continue;
      try {
        const mediaPayload = await this.resolveMediaPayload(ref, params.ownerUserId);
        const meta = structuredInputMeta[i];
        const defaultSlotId = isCoupleMode
          ? (i === 0 ? 'partner_1' : i === 1 ? 'partner_2' : `slot_${i + 1}`)
          : (i === 0 ? 'user_input' : `slot_${i + 1}`);
        const slotId = meta?.slotId || defaultSlotId;
        const explicitRole = meta?.role ? String(meta.role).trim() : '';
        const role = isCoupleMode
          ? (explicitRole === 'person_b' || explicitRole === 'CUSTOMER_SOURCE_PHOTO_PERSON_B' || slotId === 'partner_2' || slotId === 'slot_2'
              ? 'CUSTOMER_SOURCE_PHOTO_PERSON_B'
              : explicitRole === 'person_a' || explicitRole === 'CUSTOMER_SOURCE_PHOTO_PERSON_A' || slotId === 'partner_1' || slotId === 'slot_1'
              ? 'CUSTOMER_SOURCE_PHOTO_PERSON_A'
              : i === 0
              ? 'CUSTOMER_SOURCE_PHOTO_PERSON_A'
              : 'CUSTOMER_SOURCE_PHOTO_PERSON_B')
          : (explicitRole &&
              explicitRole !== 'person_a' &&
              explicitRole !== 'person_b' &&
              explicitRole !== 'CUSTOMER_SOURCE_PHOTO_PERSON_A' &&
              explicitRole !== 'CUSTOMER_SOURCE_PHOTO_PERSON_B'
              ? explicitRole
              : mediaPayload.partType === 'video'
              ? 'CUSTOMER_SOURCE_VIDEO'
              : 'CUSTOMER_SOURCE_PHOTO');
        resolvedInputs.push({
          ...mediaPayload,
          slotId,
          role
        });
      } catch (err: any) {
        throw new Error(`Starting frame resolution failed for customer media ${i + 1}: ${err.message}`);
      }
    }

    if (resolvedInputs.length === 0) {
      throw new Error('CUSTOMER_SOURCE_MEDIA_MISSING: Resolved customer media list is empty.');
    }

    const roleGuidance = isCoupleMode
      ? 'Keep Person A (input 1) and Person B (input 2) as two distinct recognizable people; never blend or merge their faces.'
      : resolvedInputs.length > 1
      ? 'Use the provided customer media inputs as the authoritative subject and scene references without splitting into two different couple identities.'
      : 'Use the customer input as the authoritative subject identity throughout the video.';

    const prompt = `${params.prompt}\n\n${roleGuidance}\nTarget style: ${params.styleWorkflow || 'cinematic motion'}. Realistic fluid motion, studio lighting, 60fps aesthetic.`;

    const inputParts: any[] = resolvedInputs.map((item) => ({
      type: item.partType,
      data: item.data,
      mime_type: item.mimeType
    }));

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

      const outSha = crypto.createHash('sha256').update(videoBuffer).digest('hex');
      if (resolvedInputs.some((i) => i.sha256 === outSha)) {
        throw new Error('UNCHANGED_CUSTOMER_INPUT_OUTPUT: Video provider returned customer input unchanged.');
      }

      const outSniffed = detectMediaFormatFromBuffer(videoBuffer);
      const outExt = outSniffed?.ext || 'mp4';

      // 2. Save actual video bytes to durable storage with owner isolation
      const stored = await mediaStorage.saveMedia(
        videoBuffer,
        'generation',
        `omni_${Date.now()}.${outExt}`,
        params.ownerUserId,
        false
      );

      const customerInputsDiag: GenerationDiagnosticInputItem[] = resolvedInputs.map((r) => ({
        slotId: r.slotId,
        role: r.role,
        mediaType: r.partType,
        mimeType: r.mimeType,
        sizeBytes: r.sizeBytes,
        sha256Prefix: r.sha256.slice(0, 16)
      }));

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

      const elapsedMs = Date.now() - startTime;
      return {
        success: true,
        resultUrl: stored.publicUrl,
        provider: this.providerName,
        adapter: this.adapterName,
        model: targetModel,
        processingTimeMs: elapsedMs,
        ...(rawSanitizedResponse ? { rawSanitizedResponse } : {}),
        diagnostics: {
          provider: this.providerName,
          adapter: this.adapterName,
          model: targetModel,
          workflow: params.styleWorkflow || 'IMAGE_TO_VIDEO',
          isCouple: isCoupleMode,
          customerInputCount: customerInputsDiag.length,
          customerInputs: customerInputsDiag,
          providerStatus: 'completed',
          processingTimeMs: elapsedMs,
          output: {
            mimeType: stored.mimeType || outSniffed?.mimeType || 'video/mp4',
            sizeBytes: stored.sizeBytes || videoBuffer.length,
            sha256Prefix: outSha.slice(0, 16)
          }
        }
      };
    } catch (err: any) {
      console.error('[VideoProviderAdapter] Generation failed:', err.message);
      throw new Error(`Google Omni Flash video generation failed: ${err.message}`);
    }
  }
}

export const videoProviderAdapter = new VideoProviderAdapter();
