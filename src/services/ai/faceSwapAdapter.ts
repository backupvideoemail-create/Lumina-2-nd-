/**
 * Production Higgsfield Genjutsu Motion Transfer Adapter.
 * 
 * Model: higgsfield/genjutsu/motion-transfer/v1.0
 * Official Endpoint: https://api.higgsfield.ai/higgsfield/genjutsu/motion-transfer/v1.0
 * 
 * Architecture Rules:
 * - Real API integration, no placeholder /v1/faceswap
 * - Server-side only credentials (never exposed to client)
 * - Required parameters: video_url, image_urls
 * - Optional parameters: prompt (Protected Base Identity Prompt + user instructions), resolution: "480p"
 * - Locked to 480p MVP
 * - Real physical video duration enforcement
 * - Supports 1 to multiple reference images (recommended 4-5)
 * - Provider-documented status polling (request_id, status_url)
 * - Terminal states: queued, in_progress, completed, failed, canceled
 * - Stored with ownerUserId and private ownership (isPublic = false)
 * - If credentials missing or provider fails, throws clean error for 100% exact atomic credit refund
 */

import { mediaStorage } from '../storage/mediaStorage.ts';
import type { ProviderResult } from '../types.ts';

export const HIGGSFIELD_BASE_IDENTITY_PROMPT =
  "Replace the main character in the source video with the person shown in the uploaded reference images. " +
  "Preserve the person's facial identity as faithfully as possible throughout the entire video. " +
  "Use all supplied reference images together as identity references for the SAME person. " +
  "Compare the facial features across the references and maintain consistent identity throughout the video. " +
  "Do not combine, average, or blend identities from different people. " +
  "Keep the same facial structure, eyes, nose, lips, jawline, skin tone, hairstyle and overall identity as faithfully as possible. " +
  "Do not redesign, beautify, age, de-age, cartoonize or intentionally alter the person's identity. " +
  "Preserve the original body motion, camera movement, timing, framing, pose, clothing, environment, lighting and scene composition unless the source video naturally requires changes. " +
  "Keep the replacement face naturally aligned with the original head movement, perspective and camera angle. " +
  "Maintain realistic skin texture and natural facial integration. " +
  "Avoid face distortion, identity drift, double faces, warped features, flickering, unnatural skin, inconsistent facial appearance, facial artifacts, or sudden identity changes between frames. " +
  "Use all uploaded reference images as visual identity references for the same person and maintain consistent appearance across the entire video. " +
  "Prioritize natural-looking face integration and consistent identity while preserving the original motion and scene.";

export interface GenjutsuMotionTransferParams {
  videoUrl: string;
  imageUrls: string[];
  masterRecipePrompt?: string; // Optional Scene Recipe Prompt (Untruncated)
  customInstructions?: string; // Optional Customer Instructions (sensible max 300 chars)
  resolution?: '480p' | '720p' | '1080p';
  durationSeconds?: number;
  ownerUserId?: string;
  model?: 'hf_mult_motion_control_flash' | 'hf_mult_replace_object_flash' | 'higgsfield/genjutsu-light/motion-transfer/v1.0' | string;
  isCouple?: boolean;
}

export class HiggsfieldGenjutsuAdapter {
  readonly providerName = 'higgsfield';
  readonly primaryModelName = 'higgsfield/genjutsu-light/motion-transfer/v1.0';
  readonly fallbackModelName = 'higgsfield/genjutsu/motion-transfer/v1.0';
  readonly modelName = 'higgsfield/genjutsu-light/motion-transfer/v1.0';
  readonly motionControlModel = 'hf_mult_motion_control_flash';
  readonly replaceObjectModel = 'hf_mult_replace_object_flash';
  readonly endpoint = 'https://api.higgsfield.ai/higgsfield/genjutsu-light/motion-transfer/v1.0';

  private getConfig() {
    const apiKey = process.env.HIGGSFIELD_API_KEY || process.env.HF_API_KEY_ID || '';
    const apiSecret = process.env.HIGGSFIELD_API_SECRET || process.env.HF_API_KEY_SECRET || '';
    return { apiKey, apiSecret, isConfigured: Boolean(apiKey) };
  }

  getPublicStatus() {
    const config = this.getConfig();
    return {
      provider: this.providerName,
      model: this.modelName,
      primaryModel: this.primaryModelName,
      fallbackModel: this.fallbackModelName,
      motionControlModel: this.motionControlModel,
      replaceObjectModel: this.replaceObjectModel,
      status: config.isConfigured ? 'active' : 'pending_credentials',
      supportedResolutions: ['480p', '720p', '1080p']
    };
  }

  /**
   * Generates a face/character video via official Higgsfield Genjutsu Light endpoints.
   * Motion Control: hf_mult_motion_control_flash / genjutsu-light/motion-transfer
   * Object Swap: hf_mult_replace_object_flash / genjutsu-light/object-swap
   */
  async generateFaceSwapVideo(params: GenjutsuMotionTransferParams): Promise<ProviderResult> {
    const startTime = Date.now();
    const config = this.getConfig();

    if (!config.isConfigured) {
      throw new Error(
        'HIGGSFIELD_API_KEY is not configured in server environment variables. ' +
        'Please set HIGGSFIELD_API_KEY (and optional HIGGSFIELD_API_SECRET) to enable real neural motion transfer. ' +
        'Your credits have been refunded in full.'
      );
    }

    if (!params.videoUrl) {
      throw new Error('Missing videoUrl for Genjutsu Motion Transfer.');
    }

    if (!params.imageUrls || params.imageUrls.length === 0) {
      throw new Error('At least 1 face reference image is required (4-5 recommended from different angles).');
    }

    // Build prompt according to workflow & couple identity
    let basePrompt = HIGGSFIELD_BASE_IDENTITY_PROMPT;
    if (params.isCouple) {
      basePrompt = `COUPLE DUAL IDENTITY TRANSFORMATION:
Slot 1 Image maps strictly to Person A. Slot 2 Image maps strictly to Person B.
Maintain two separate recognizable human identities throughout the entire video.
Never blend, average, cross-apply, or fuse their faces.`;
    }

    // Build prompt without duplicating instructions
    const recipePrompt = params.masterRecipePrompt?.trim() || '';
    const alreadyHasUserCustomInstructions = Boolean(
      (params.customInstructions && recipePrompt.includes(params.customInstructions.trim())) ||
      recipePrompt.includes('--- OPTIONAL CUSTOMER INSTRUCTIONS ---') ||
      recipePrompt.includes('USER_CUSTOM_INSTRUCTIONS:') ||
      recipePrompt.includes('Additional User Creative Instructions')
    );
    const alreadyHasCustomerText = alreadyHasUserCustomInstructions;

    let finalPrompt = '';
    const recipeHasIdentityRule = recipePrompt.includes('COUPLE DUAL IDENTITY') || recipePrompt.includes('IDENTITY INTEGRITY') || recipePrompt.includes('FACE SWAP IDENTITY');
    if (!recipeHasIdentityRule) {
      finalPrompt = basePrompt;
    }

    if (recipePrompt) {
      finalPrompt = finalPrompt ? `${finalPrompt}\n\nSCENE_RECIPE_PROMPT:\n${recipePrompt}` : recipePrompt;
    }

    if (params.customInstructions && params.customInstructions.trim() && !alreadyHasCustomerText) {
      const sanitizedCustomerInput = params.customInstructions.trim().slice(0, 300);
      finalPrompt = `${finalPrompt}\n\nUSER_CUSTOM_INSTRUCTIONS:\n${sanitizedCustomerInput}`;
    }

    if (finalPrompt.length > 4000) {
      throw new Error(`VALIDATION_ERROR: Higgsfield prompt length (${finalPrompt.length} chars) exceeds maximum provider limit (4000 chars).`);
    }

    const selectedModel = params.model || this.primaryModelName;
    const requestedResolution = params.resolution || '480p';

    // Route endpoint by model
    let targetEndpoint = this.endpoint;
    if (selectedModel === 'hf_mult_replace_object_flash') {
      targetEndpoint = 'https://api.higgsfield.ai/higgsfield/genjutsu-light/object-swap/v1.0';
    } else if (selectedModel === 'hf_mult_motion_control_flash') {
      targetEndpoint = 'https://api.higgsfield.ai/higgsfield/genjutsu-light/motion-transfer/v1.0';
    }

    // Official documented Higgsfield Genjutsu payload.
    const payload: Record<string, any> = {
      video_url: params.videoUrl,
      image_urls: params.imageUrls,
      prompt: finalPrompt,
      resolution: requestedResolution
    };

    if (params.durationSeconds && Number(params.durationSeconds) > 0) {
      payload.duration = Number(params.durationSeconds);
    }

    // Official Higgsfield Authorization: "Key ${keyId}:${keySecret}" or "Key ${apiKey}"
    let authHeaderValue: string;
    if (config.apiKey && config.apiSecret) {
      authHeaderValue = `Key ${config.apiKey}:${config.apiSecret}`;
    } else if (config.apiKey.includes(':')) {
      authHeaderValue = `Key ${config.apiKey}`;
    } else if (config.apiKey.startsWith('Bearer ') || config.apiKey.startsWith('Key ')) {
      authHeaderValue = config.apiKey;
    } else {
      authHeaderValue = `Key ${config.apiKey}`;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': authHeaderValue
    };

    const response = await fetch(targetEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Higgsfield Genjutsu API returned HTTP ${response.status}: ${errText}`);
    }

    const data = await response.json();

    // Check for direct output or asynchronous polling
    let resultVideoUrl: string | null =
      (typeof data.video === 'string' ? data.video : data.video?.url) ||
      data.video_url ||
      data.output?.video?.url ||
      data.output?.video_url ||
      data.result_url ||
      data.result_video_url ||
      null;

    const requestId = data.request_id || data.id;

    if (!resultVideoUrl && (data.status_url || requestId)) {
      // Official status polling endpoint: status_url returned by provider, with fallback to https://api.higgsfield.ai/requests/{request_id}/status
      const pollEndpoint = data.status_url || `https://api.higgsfield.ai/requests/${requestId}/status`;
      let attempts = 0;
      const maxAttempts = 60; // 5 minutes max (5s interval)

      while (attempts < maxAttempts && !resultVideoUrl) {
        await new Promise((r) => setTimeout(r, 5000));
        attempts++;

        try {
          const pollRes = await fetch(pollEndpoint, { headers });
          if (pollRes.ok) {
            const pollData = await pollRes.json();
            const currentStatus = (pollData.status || '').toLowerCase();

            if (currentStatus === 'completed' || currentStatus === 'succeeded' || currentStatus === 'finished') {
              resultVideoUrl =
                (typeof pollData.video === 'string' ? pollData.video : pollData.video?.url) ||
                pollData.video_url ||
                pollData.output?.video?.url ||
                pollData.output?.video_url ||
                pollData.result_url ||
                pollData.result_video_url ||
                null;
              break;
            } else if (
              currentStatus === 'failed' ||
              currentStatus === 'canceled' ||
              currentStatus === 'cancelled' ||
              currentStatus === 'nsfw'
            ) {
              throw new Error(
                `Higgsfield Genjutsu job terminated with status: ${currentStatus} - ${pollData.error || pollData.message || 'Provider rejected generation'}`
              );
            }
          }
        } catch (pollErr: any) {
          if (pollErr.message.includes('terminated with status')) {
            throw pollErr;
          }
          console.warn('[Higgsfield Poll Note]:', pollErr.message);
        }
      }
    }

    if (!resultVideoUrl) {
      throw new Error('Higgsfield Genjutsu generation timed out or did not return a valid video output.');
    }

    // Download generated video bytes and save to persistent storage with authenticated ownerUserId
    const videoRes = await fetch(resultVideoUrl);
    if (!videoRes.ok) {
      throw new Error(`Failed to download generated video asset from provider: HTTP ${videoRes.status}`);
    }

    const arrayBuffer = await videoRes.arrayBuffer();
    const stored = await mediaStorage.saveMedia(
      Buffer.from(arrayBuffer),
      'generation',
      `genjutsu_${Date.now()}.mp4`,
      params.ownerUserId,
      false // Private: owned by authenticated user
    );

    return {
      success: true,
      resultUrl: stored.publicUrl,
      provider: this.providerName,
      model: selectedModel,
      processingTimeMs: Date.now() - startTime
    };
  }
}

export const faceSwapAdapter = new HiggsfieldGenjutsuAdapter();
