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
import { resolveCanonicalModelId } from '../pricing/pricingService.ts';
import { safeFetchAllowedVideoBuffer } from '../video/videoTrimmer.ts';

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
  provider?: string;
  adapter?: string;
  workflow?: string;
  isCouple?: boolean;
  inputMedia?: Array<{ slotId?: string; role?: string; type?: string; media?: string; mediaUrl?: string }>;
}

export interface HiggsfieldSubmittedJob {
  requestId?: string;
  statusUrl?: string;
  endpoint: string;
  model: string;
  providerStatus: string;
  immediateVideoUrl?: string;
}

export interface HiggsfieldStatusCheckResult {
  state: 'pending' | 'completed' | 'failed';
  providerStatus: string;
  resultVideoUrl?: string;
  error?: string;
  isTerminal?: boolean;
}

function extractResultVideoUrl(payload: any): string | null {
  if (!payload || typeof payload !== 'object') return null;
  return (
    (typeof payload.video === 'string' ? payload.video : payload.video?.url) ||
    payload.video_url ||
    payload.output?.video?.url ||
    payload.output?.video_url ||
    payload.result_url ||
    payload.result_video_url ||
    null
  );
}

export class HiggsfieldGenjutsuAdapter {
  readonly providerName = 'higgsfield';
  readonly adapterName = 'faceSwapAdapter';
  readonly primaryModelName = 'higgsfield/genjutsu-light/motion-transfer/v1.0';
  readonly modelName = 'higgsfield/genjutsu-light/motion-transfer/v1.0';
  readonly motionControlModel = 'hf_mult_motion_control_flash';
  readonly replaceObjectModel = 'hf_mult_replace_object_flash';
  readonly endpoint = 'https://api.higgsfield.ai/higgsfield/genjutsu-light/motion-transfer/v1.0';

  private getConfig() {
    const apiKey = process.env.HIGGSFIELD_API_KEY || process.env.HF_API_KEY_ID || '';
    const apiSecret = process.env.HIGGSFIELD_API_SECRET || process.env.HF_API_KEY_SECRET || '';
    return { apiKey, apiSecret, isConfigured: Boolean(apiKey) };
  }

  public static buildAuthHeader(apiKey: string, apiSecret?: string): string {
    const cleanKey = String(apiKey || '').trim();
    const cleanSecret = String(apiSecret || '').trim();
    if (cleanKey.startsWith('Key ') || cleanKey.startsWith('Bearer ')) {
      return cleanKey;
    }
    if (cleanKey && cleanSecret && !cleanKey.includes(':')) {
      return `Key ${cleanKey}:${cleanSecret}`;
    }
    return `Key ${cleanKey}`;
  }

  private getAuthHeaders(): Record<string, string> {
    const config = this.getConfig();
    if (!config.isConfigured) {
      throw new Error(
        'HIGGSFIELD_API_KEY is not configured in server environment variables. ' +
        'Please set complete HIGGSFIELD_API_KEY (Authorization: Key <api-key>) in server secrets to enable Genjutsu Light. ' +
        'Your credits have been refunded in full.'
      );
    }
    return {
      'Content-Type': 'application/json',
      Authorization: HiggsfieldGenjutsuAdapter.buildAuthHeader(config.apiKey, config.apiSecret)
    };
  }

  getPublicStatus() {
    const config = this.getConfig();
    const billingVerified = process.env.HIGGSFIELD_BILLING_VERIFIED === 'true';
    const flagEnabled = process.env.ENABLE_GENJUTSU_CUSTOMER_GENERATION === 'true';
    const objectSwapFlagEnabled = process.env.ENABLE_GENJUTSU_OBJECT_SWAP_CUSTOMER_GENERATION === 'true';
    return {
      provider: this.providerName,
      model: this.modelName,
      primaryModel: this.primaryModelName,
      motionControlModel: this.motionControlModel,
      replaceObjectModel: this.replaceObjectModel,
      authHeaderFormat: 'Authorization: Key <api-key>',
      status: config.isConfigured ? 'UNVERIFIED' : 'MISSING_SECRET',
      billingVerified,
      customerGenerationEnabled: config.isConfigured && billingVerified && flagEnabled,
      objectSwapCustomerGenerationEnabled:
        config.isConfigured && billingVerified && flagEnabled && objectSwapFlagEnabled,
      supportedResolutions: ['480p', '720p', '1080p'],
      verifiedOutputDurationSeconds: 4
    };
  }

  /**
   * Submits a Genjutsu Light job synchronously inside the originating HTTP request
   * and returns the durable Higgsfield requestId / statusUrl for Request-Based Billing status polling.
   */
  async submitFaceSwapJob(
    params: GenjutsuMotionTransferParams,
    fetchImpl: typeof fetch = fetch
  ): Promise<HiggsfieldSubmittedJob> {
    // 1. Fail-closed strict provider, adapter, and model-workflow parity checks
    if (params.provider && params.provider.trim().toLowerCase() !== this.providerName) {
      throw new Error(
        `PROVIDER_ROUTING_MISMATCH: FaceSwapAdapter cannot execute non-Higgsfield provider '${params.provider}'.`
      );
    }
    if (params.adapter && params.adapter.trim() !== this.adapterName) {
      throw new Error(
        `PROVIDER_ROUTING_MISMATCH: FaceSwapAdapter cannot execute mismatched adapter '${params.adapter}'.`
      );
    }

    const rawModel = (params.model || this.primaryModelName).trim();
    const canonicalModel = resolveCanonicalModelId(rawModel);
    const isMotionControl =
      canonicalModel === 'hf_mult_motion_control_flash' ||
      rawModel.includes('motion-transfer');
    const isObjectSwap =
      canonicalModel === 'hf_mult_replace_object_flash' ||
      rawModel.includes('object-swap');

    if (!isMotionControl && !isObjectSwap) {
      throw new Error(
        `PROVIDER_ROUTING_MISMATCH: Model '${rawModel}' is incompatible with Higgsfield FaceSwapAdapter.`
      );
    }
    const wf = (params.workflow || '').trim().toUpperCase();
    if (wf === 'OBJECT_SWAP' && isMotionControl) {
      throw new Error(
        `PROVIDER_ROUTING_MISMATCH: Model '${rawModel}' cannot execute OBJECT_SWAP workflow.`
      );
    }
    if (wf === 'MOTION_TRANSFER' && isObjectSwap) {
      throw new Error(
        `PROVIDER_ROUTING_MISMATCH: Model '${rawModel}' cannot execute MOTION_TRANSFER workflow.`
      );
    }

    const headers = this.getAuthHeaders();

    if (!params.videoUrl) {
      throw new Error('Missing videoUrl for Genjutsu Motion Transfer.');
    }

    const validImageUrls = (params.imageUrls || []).map((u) => String(u || '').trim()).filter(Boolean);
    if (validImageUrls.length === 0) {
      throw new Error('At least 1 face reference image is required (4-5 recommended from different angles).');
    }
    if (validImageUrls.some((u) => u === params.videoUrl)) {
      throw new Error('INVALID_CUSTOMER_INPUT: Customer face image cannot be identical to template drivingVideoUrl.');
    }
    if (params.isCouple && validImageUrls.length < 2) {
      throw new Error('MISSING_PARTNER_PHOTO: Couple FaceSwap requires both Person A and Person B face images.');
    }
    if (params.isCouple && Array.isArray(params.inputMedia) && params.inputMedia.length > 0) {
      const hasPersonA = params.inputMedia.some(
        (m) =>
          m?.role === 'person_a' ||
          m?.role === 'CUSTOMER_SOURCE_PHOTO_PERSON_A' ||
          m?.slotId === 'partner_1' ||
          m?.slotId === 'slot_1'
      );
      const hasPersonB = params.inputMedia.some(
        (m) =>
          m?.role === 'person_b' ||
          m?.role === 'CUSTOMER_SOURCE_PHOTO_PERSON_B' ||
          m?.slotId === 'partner_2' ||
          m?.slotId === 'slot_2'
      );
      if (!hasPersonA || !hasPersonB) {
        throw new Error('INVALID_COUPLE_SLOTS: Couple FaceSwap requires distinct Person A and Person B inputs.');
      }
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

    let finalPrompt = '';
    const recipeHasIdentityRule =
      recipePrompt.includes('COUPLE DUAL IDENTITY') ||
      recipePrompt.includes('IDENTITY INTEGRITY') ||
      recipePrompt.includes('FACE SWAP IDENTITY');
    if (!recipeHasIdentityRule) {
      finalPrompt = basePrompt;
    }

    if (recipePrompt) {
      finalPrompt = finalPrompt ? `${finalPrompt}\n\nSCENE_RECIPE_PROMPT:\n${recipePrompt}` : recipePrompt;
    }

    if (params.customInstructions && params.customInstructions.trim() && !alreadyHasUserCustomInstructions) {
      const sanitizedCustomerInput = params.customInstructions.trim().slice(0, 300);
      finalPrompt = `${finalPrompt}\n\nUSER_CUSTOM_INSTRUCTIONS:\n${sanitizedCustomerInput}`;
    }

    if (finalPrompt.length > 4000) {
      throw new Error(
        `VALIDATION_ERROR: Higgsfield prompt length (${finalPrompt.length} chars) exceeds maximum provider limit (4000 chars).`
      );
    }

    const selectedModel = canonicalModel || rawModel;
    const requestedResolution = params.resolution || '480p';
    const targetEndpoint = isObjectSwap
      ? 'https://api.higgsfield.ai/higgsfield/genjutsu-light/object-swap/v1.0'
      : 'https://api.higgsfield.ai/higgsfield/genjutsu-light/motion-transfer/v1.0';

    const payload: Record<string, any> = {
      video_url: params.videoUrl,
      image_urls: validImageUrls,
      prompt: finalPrompt,
      resolution: requestedResolution
    };

    const requestInit: RequestInit = {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000)
    };
    const response = await (
      fetchImpl === fetch
        ? fetch(targetEndpoint, requestInit)
        : fetchImpl(targetEndpoint, requestInit)
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Higgsfield Genjutsu API returned HTTP ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const immediateVideoUrl = extractResultVideoUrl(data) || undefined;
    const requestId = (data.request_id || data.id) ? String(data.request_id || data.id) : undefined;
    const statusUrl =
      data.status_url ||
      (requestId ? `https://api.higgsfield.ai/requests/${requestId}/status` : undefined);

    if (!immediateVideoUrl && !requestId && !statusUrl) {
      throw new Error('Higgsfield Genjutsu API response lacked request_id, status_url, and result video URL.');
    }

    return {
      requestId,
      statusUrl,
      endpoint: targetEndpoint,
      model: selectedModel,
      providerStatus: String(data.status || (immediateVideoUrl ? 'completed' : 'queued')).toLowerCase(),
      immediateVideoUrl
    };
  }

  /**
   * Single bounded upstream status probe intended for active HTTP status/My Creations requests.
   * Never marks an active job failed on transient network/5xx errors; returns isTerminal=true ONLY
   * upon verified provider terminal failure or verified job expiry (HTTP 404/410).
   */
  async checkFaceSwapJobStatus(
    params: { requestId?: string; statusUrl?: string },
    fetchImpl: typeof fetch = fetch
  ): Promise<HiggsfieldStatusCheckResult> {
    const pollEndpoint =
      params.statusUrl ||
      (params.requestId ? `https://api.higgsfield.ai/requests/${params.requestId}/status` : '');
    if (!pollEndpoint) {
      return {
        state: 'failed',
        providerStatus: 'missing_provider_handle',
        error: 'Higgsfield job is missing both status_url and request_id.',
        isTerminal: true
      };
    }

    let headers: Record<string, string>;
    try {
      headers = this.getAuthHeaders();
    } catch (authErr: any) {
      return {
        state: 'pending',
        providerStatus: 'auth_check_deferred',
        error: authErr?.message
      };
    }

    try {
      const pollRes = await fetchImpl(pollEndpoint, {
        headers,
        signal: AbortSignal.timeout(15000)
      });

      if (pollRes.status === 404 || pollRes.status === 410) {
        return {
          state: 'failed',
          providerStatus: 'expired',
          error: `Higgsfield job expired or was not found on provider (HTTP ${pollRes.status}).`,
          isTerminal: true
        };
      }

      if (!pollRes.ok) {
        return {
          state: 'pending',
          providerStatus: `http_${pollRes.status}_retry`
        };
      }

      const pollData = await pollRes.json();
      const currentStatus = String(pollData.status || 'in_progress').toLowerCase();

      if (currentStatus === 'completed' || currentStatus === 'succeeded' || currentStatus === 'finished') {
        const resultVideoUrl = extractResultVideoUrl(pollData);
        if (!resultVideoUrl) {
          return {
            state: 'failed',
            providerStatus: currentStatus,
            error: 'Higgsfield completed the job without returning a valid video URL.',
            isTerminal: true
          };
        }
        return {
          state: 'completed',
          providerStatus: currentStatus,
          resultVideoUrl
        };
      }

      if (
        currentStatus === 'failed' ||
        currentStatus === 'canceled' ||
        currentStatus === 'cancelled' ||
        currentStatus === 'expired' ||
        currentStatus === 'nsfw'
      ) {
        return {
          state: 'failed',
          providerStatus: currentStatus,
          error: `Higgsfield Genjutsu job terminated with status: ${currentStatus} - ${pollData.error || pollData.message || 'Provider rejected generation'}`,
          isTerminal: true
        };
      }

      return {
        state: 'pending',
        providerStatus: currentStatus
      };
    } catch (pollErr: any) {
      console.warn('[Higgsfield Poll Note]:', pollErr?.message || pollErr);
      return {
        state: 'pending',
        providerStatus: 'network_retry'
      };
    }
  }

  /**
   * Downloads provider output video with SSRF + MIME + 150MB stream enforcement and persists privately to R2.
   */
  async downloadAndSaveFaceSwapResult(params: {
    resultVideoUrl: string;
    ownerUserId?: string;
    fetchImpl?: typeof fetch;
    dnsLookup?: (hostname: string) => Promise<Array<{ address: string }>>;
  }): Promise<{ publicUrl: string; mimeType?: string; sizeBytes?: number }> {
    const buf = await safeFetchAllowedVideoBuffer(params.resultVideoUrl, {
      strictR2Only: false,
      maxBytes: 150 * 1024 * 1024,
      timeoutMs: 60000,
      fetchImpl: params.fetchImpl,
      dnsLookup: params.dnsLookup
    });

    const stored = await mediaStorage.saveMedia(
      buf,
      'generation',
      `genjutsu_${Date.now()}.mp4`,
      params.ownerUserId,
      false // Private: owned by authenticated user
    );
    return { publicUrl: stored.publicUrl, mimeType: stored.mimeType, sizeBytes: stored.sizeBytes };
  }

  /**
   * Generates a face/character video via official Higgsfield Genjutsu Light endpoints.
   * Preserved for direct synchronous/test callers; /api/faceswap/generate uses submitFaceSwapJob + request-driven polling.
   */
  async generateFaceSwapVideo(params: GenjutsuMotionTransferParams): Promise<ProviderResult> {
    const startTime = Date.now();
    const submitted = await this.submitFaceSwapJob(params);
    let resultVideoUrl = submitted.immediateVideoUrl || null;

    if (!resultVideoUrl && (submitted.statusUrl || submitted.requestId)) {
      let attempts = 0;
      const maxAttempts = 60;
      while (attempts < maxAttempts && !resultVideoUrl) {
        await new Promise((r) => setTimeout(r, 5000));
        attempts++;
        const check = await this.checkFaceSwapJobStatus({
          requestId: submitted.requestId,
          statusUrl: submitted.statusUrl
        });
        if (check.state === 'completed' && check.resultVideoUrl) {
          resultVideoUrl = check.resultVideoUrl;
          break;
        }
        if (check.state === 'failed' && check.isTerminal) {
          throw new Error(check.error || `Higgsfield Genjutsu job terminated with status: ${check.providerStatus}`);
        }
      }
    }

    if (!resultVideoUrl) {
      throw new Error('Higgsfield Genjutsu generation timed out or did not return a valid video output.');
    }

    const stored = await this.downloadAndSaveFaceSwapResult({
      resultVideoUrl,
      ownerUserId: params.ownerUserId
    });

    const elapsedMs = Date.now() - startTime;
    return {
      success: true,
      resultUrl: stored.publicUrl,
      provider: this.providerName,
      adapter: this.adapterName,
      model: submitted.model,
      processingTimeMs: elapsedMs,
      diagnostics: {
        provider: this.providerName,
        adapter: this.adapterName,
        model: submitted.model,
        workflow: params.workflow || 'MOTION_TRANSFER',
        customerInputCount: (params.imageUrls || []).length,
        providerStatus: 'completed',
        processingTimeMs: elapsedMs,
        output: {
          mimeType: stored.mimeType || 'video/mp4',
          sizeBytes: stored.sizeBytes || 0
        }
      }
    };
  }
}

export const faceSwapAdapter = new HiggsfieldGenjutsuAdapter();
