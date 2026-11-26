/**
 * Production Gemini AI Image Generation & Transformation Adapter.
 * 
 * Uses @google/genai TypeScript SDK with gemini-3.1-flash-image.
 * Strictly takes real user input media, constructs the neural generation request,
 * extracts actual output image bytes, stores them via MediaStorage, and returns
 * the real generated asset URL.
 * 
 * NEVER returns fallback previews or template images. If Gemini fails or credentials
 * are missing, throws a clear Error so caller automatically initiates exact credit refund.
 */

import crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';
import {
  mediaStorage,
  extractMediaFileIdFromRef,
  detectMediaFormatFromBuffer
} from '../storage/mediaStorage.ts';
import type { ImageGenerationParams, ProviderResult } from '../types.ts';
import type { GenerationDiagnosticInputItem } from '../../types/index.ts';
import { isUnifiedPrompt } from '../../config/globalMasterPrompt.ts';
import { resolveCanonicalModelId } from '../pricing/pricingService.ts';

const SUPPORTED_GEMINI_IMAGE_MODELS = new Set<string>([
  'gemini-2.5-flash-image',
  'gemini-3.1-flash-lite-image',
  'gemini-3.1-flash-image',
  'gemini-3-pro-image',
  'gemini-nano-banana-2.1'
]);

function sha256Prefix(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
}

interface ResolvedImagePayload {
  data: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
}

export class GeminiAdapter {
  readonly providerName = 'gemini';
  readonly adapterName = 'geminiAdapter';
  readonly modelName = 'gemini-3.1-flash-image';

  /**
   * Helper to resolve an image URL / /api/media ref / base64 string into validated base64 data and authoritative MIME type.
   * Fails closed on missing files, HTML error pages, or 0-byte images (never falls through silently).
   */
  private async resolveImagePayload(imageInput: string, ownerUserId?: string): Promise<ResolvedImagePayload> {
    const raw = String(imageInput || '').trim();
    if (!raw) {
      throw new Error('EMPTY_IMAGE_INPUT: Image input is empty.');
    }

    const finalizeBuffer = (buf: Buffer, hintMime?: string): ResolvedImagePayload => {
      if (!buf || buf.length === 0) {
        throw new Error('EMPTY_IMAGE_BYTES: Resolved image contains 0 bytes.');
      }
      const sniffed = detectMediaFormatFromBuffer(buf);
      if (sniffed && sniffed.mimeType.startsWith('video/')) {
        throw new Error(`INVALID_IMAGE_FORMAT: Expected an image but detected '${sniffed.mimeType}'.`);
      }
      const normalizedHint = String(hintMime || 'image/jpeg').split(';')[0].trim().toLowerCase();
      const mimeType = sniffed?.mimeType || (normalizedHint.startsWith('image/') ? normalizedHint : 'image/jpeg');
      const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
      return {
        data: buf.toString('base64'),
        mimeType,
        sizeBytes: buf.length,
        sha256
      };
    };

    // 1. Data URI
    if (raw.startsWith('data:')) {
      const match = raw.match(/^data:([^;]+);base64,(.+)$/is);
      if (!match) {
        throw new Error('INVALID_DATA_URI: Image data URI is malformed or missing base64 payload.');
      }
      const cleanB64 = match[2].replace(/\s+/g, '');
      const buf = Buffer.from(cleanB64, 'base64');
      return finalizeBuffer(buf, match[1]);
    }

    // 2. Local storage path / signed token path / R2 stream (fail closed — NEVER fall through!)
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
        const extHint = fileId.toLowerCase().endsWith('.png')
          ? 'image/png'
          : fileId.toLowerCase().endsWith('.webp')
          ? 'image/webp'
          : fileId.toLowerCase().endsWith('.gif')
          ? 'image/gif'
          : 'image/jpeg';
        return finalizeBuffer(buf, extHint);
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
        return finalizeBuffer(buf, streamRes.mimeType || 'image/jpeg');
      }

      throw new Error(`MISSING_MEDIA_ASSET: Could not load stored media '${fileId}' from disk or R2 (${streamRes.error || streamRes.statusCode}).`);
    }

    // 3. Remote HTTPS/HTTP URL (including R2 presigned URLs)
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      const res = await fetch(raw, { signal: AbortSignal.timeout(30000) });
      if (!res.ok) {
        throw new Error(`Failed to fetch source image input: HTTP ${res.status}`);
      }
      const contentType = (res.headers.get('content-type') || 'image/jpeg').split(';')[0].trim().toLowerCase();
      if (contentType.includes('text/html') || contentType.includes('application/json')) {
        throw new Error(`INVALID_IMAGE_RESPONSE: Expected image bytes from URL, received '${contentType}'.`);
      }
      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const headText = buffer.subarray(0, 64).toString('utf8').trimStart().toLowerCase();
      if (headText.startsWith('<!doctype') || headText.startsWith('<html')) {
        throw new Error('INVALID_IMAGE_RESPONSE: Fetched URL returned an HTML document instead of image bytes.');
      }
      return finalizeBuffer(buffer, contentType);
    }

    // 4. Reject stray relative/HTML paths before raw base64 check
    if (raw.startsWith('/') || raw.startsWith('<')) {
      throw new Error(`UNSUPPORTED_IMAGE_INPUT: Unsupported image reference format.`);
    }

    // 5. Raw base64 fallback (strictly validate base64 characters and non-empty decoded bytes)
    const compact = raw.replace(/\s+/g, '');
    if (compact.length < 4 || !/^[A-Za-z0-9+/=]+$/.test(compact)) {
      throw new Error('INVALID_BASE64_IMAGE: Input string is neither a valid media URL nor valid base64 image data.');
    }
    const decoded = Buffer.from(compact, 'base64');
    return finalizeBuffer(decoded, 'image/jpeg');
  }

  /**
   * Builds strictly labeled multimodal parts for Gemini image generation.
   * Note: params.sampleBeforeUrl (TEMPLATE_BEFORE_REFERENCE) and params.sampleFaceThumbnailUrl
   * are NEVER sent as image parts so Gemini never confuses an admin example person with the customer
   * or echoes the BEFORE/thumbnail photo into the generated result.
   */
  public async buildMultimodalRequestParts(params: ImageGenerationParams): Promise<{
    parts: any[];
    attachedUserCount: number;
    hasReferenceImage: boolean;
    referenceSha256?: string;
    userSha256s: string[];
    prohibitedSampleSha256s: string[];
    customerInputsDiagnostics: GenerationDiagnosticInputItem[];
    referenceDiagnostic?: { role: string; mimeType: string; sizeBytes: number; sha256Prefix?: string };
  }> {
    const parts: any[] = [];

    // 1. Resolve customer images (CUSTOMER_SOURCE_PHOTO: authoritative human facial identity)
    const structuredInputMeta = Array.isArray(params.inputMedia) ? params.inputMedia : [];
    const rawUserImages: string[] =
      params.userImageUrls && params.userImageUrls.length > 0
        ? params.userImageUrls
        : params.userImageUrl
        ? (params.userImageUrl.includes('|||') ? params.userImageUrl.split('|||').map((s) => s.trim()).filter(Boolean) : [params.userImageUrl])
        : [];

    if (rawUserImages.length === 0) {
      throw new Error('CUSTOMER_SOURCE_PHOTO is required for Gemini photo generation.');
    }

    const resolvedUserPayloads: Array<ResolvedImagePayload & { slotId: string; role: string }> = [];
    for (let i = 0; i < rawUserImages.length; i++) {
      const uImg = rawUserImages[i];
      if (!uImg) continue;
      try {
        const imagePayload = await this.resolveImagePayload(uImg, params.ownerUserId);
        const meta = structuredInputMeta[i];
        const slotId = meta?.slotId || (i === 0 ? 'partner_1' : i === 1 ? 'partner_2' : `slot_${i + 1}`);
        const role =
          meta?.role ||
          (rawUserImages.length >= 2
            ? i === 0
              ? 'CUSTOMER_SOURCE_PHOTO_PERSON_A'
              : 'CUSTOMER_SOURCE_PHOTO_PERSON_B'
            : 'CUSTOMER_SOURCE_PHOTO');
        resolvedUserPayloads.push({
          ...imagePayload,
          slotId,
          role
        });
      } catch (err: any) {
        throw new Error(`Failed to resolve supplied customer photo ${i + 1} (CUSTOMER_SOURCE_PHOTO): ${err.message}`);
      }
    }

    const attachedUserCount = resolvedUserPayloads.length;
    if (attachedUserCount === 0) {
      throw new Error('CUSTOMER_SOURCE_PHOTO could not be loaded for Gemini photo generation.');
    }

    const isCoupleMode = attachedUserCount >= 2;
    for (let i = 0; i < resolvedUserPayloads.length; i++) {
      const payload = resolvedUserPayloads[i];
      if (isCoupleMode) {
        const slotLabel = i === 0 ? 'Person A' : i === 1 ? 'Person B' : `Person ${i + 1}`;
        parts.push({
          text:
            `IMAGE ${i + 1} — CUSTOMER_SOURCE_PHOTO (${slotLabel} AUTHORITATIVE IDENTITY — MUST APPEAR IN OUTPUT): ` +
            `This is real customer ${slotLabel}. Preserve ${slotLabel}'s exact face, facial bone structure, eyes, eyebrows, nose, lips, jawline, beard/hair, and skin tone. ` +
            `If this photo is a phone screenshot or has UI icons or a corner PiP thumbnail, IGNORE all UI chrome/thumbnails and extract ONLY the main foreground person's real face.`
        });
      } else {
        parts.push({
          text:
            `IMAGE 1 — CUSTOMER_SOURCE_PHOTO (AUTHORITATIVE CUSTOMER IDENTITY — MUST STAR IN OUTPUT): ` +
            `This is the real customer who must appear as the main starring subject in the final generated image. Preserve this exact person's face, facial structure, unobstructed eyes, eyebrows, nose, lips, jawline, natural skin tone, facial hair/beard, hair/head likeness, and gender/identity. ` +
            `If IMAGE 1 is a phone/social-app screenshot or contains status bars, circular filter icons, or a small corner PiP/inset face, IGNORE all app UI elements and small corner thumbnails and extract ONLY the main foreground person's real face.`
        });
      }
      parts.push({
        inlineData: {
          mimeType: payload.mimeType,
          data: payload.data
        }
      });
    }

    // 2. Attach template AFTER reference image (scene, pose, wardrobe, typography ONLY — NEVER keep template person's face)
    let hasReferenceImage = false;
    let referenceSha256: string | undefined;
    let referenceDiagnostic: { role: string; mimeType: string; sizeBytes: number; sha256Prefix?: string } | undefined;
    const targetRefUrl = params.sampleResultUrl || params.referenceImageUrl;
    if (targetRefUrl) {
      try {
        const refPayload = await this.resolveImagePayload(targetRefUrl, params.ownerUserId);
        referenceSha256 = refPayload.sha256;
        referenceDiagnostic = {
          role: 'TEMPLATE_AFTER_REFERENCE',
          mimeType: refPayload.mimeType,
          sizeBytes: refPayload.sizeBytes,
          sha256Prefix: refPayload.sha256.slice(0, 16)
        };
        const refIdx = attachedUserCount + 1;
        parts.push({
          text: isCoupleMode
            ? `IMAGE ${refIdx} — TEMPLATE_AFTER_REFERENCE (TARGET COUPLE SCENE, POSE, STYLING & COMPOSITION ONLY): ` +
              `Recreate this exact scene, background, lighting, framing, pose, attire (subject to wardrobe rules), color grade, and text/emoji overlays, ` +
              `REPLACING the people in this reference image with Person A (IMAGE 1) and Person B (IMAGE 2). ` +
              `Do NOT copy dark sunglasses or face-covering props onto Person A or Person B unless they wear them in their own source photos. ` +
              `NEVER keep or copy the faces or identities of the sample models shown in IMAGE ${refIdx}.`
            : `IMAGE ${refIdx} — TEMPLATE_AFTER_REFERENCE (TARGET SCENE, POSE, STYLING, TEXT & COMPOSITION ONLY): ` +
              `Recreate this exact scene, background, dark/studio lighting, framing, pose, attire/outfit (subject to wardrobe rules), color grade, and text/emoji overlays, ` +
              `COMPLETELY REPLACING the person/face shown in IMAGE ${refIdx} with the real customer from IMAGE 1 (CUSTOMER_SOURCE_PHOTO). ` +
              `CRITICAL: If the sample model in IMAGE ${refIdx} is wearing dark sunglasses or face-occluding accessories, DO NOT copy those dark sunglasses over the customer's eyes — render the customer's real recognizable eyes and full face from IMAGE 1 clearly unless CUSTOMER_SOURCE_PHOTO wears sunglasses or the customer requested them. ` +
              `NEVER keep, copy, or return the face, beard, hair, sunglasses, or identity of the reference model in IMAGE ${refIdx}.`
        });
        parts.push({
          inlineData: {
            mimeType: refPayload.mimeType,
            data: refPayload.data
          }
        });
        hasReferenceImage = true;
      } catch (err: any) {
        throw new Error(`Failed to resolve template after/reference image (TEMPLATE_AFTER_REFERENCE): ${err.message}`);
      }
    }

    // Best-effort hash computation for optional display/before assets so we can detect & reject accidental leaks WITHOUT sending them to Gemini
    const prohibitedSampleSha256s: string[] = [];
    for (const sampleOnlyRef of [params.sampleBeforeUrl, params.sampleFaceThumbnailUrl]) {
      if (!sampleOnlyRef || typeof sampleOnlyRef !== 'string' || !sampleOnlyRef.trim()) continue;
      try {
        const samplePayload = await this.resolveImagePayload(sampleOnlyRef, params.ownerUserId);
        if (samplePayload.sha256) {
          prohibitedSampleSha256s.push(samplePayload.sha256);
        }
      } catch {
        // Optional example/before asset could not be hashed — never block generation on non-generation assets
      }
    }

    // 3. Construct authoritative execution prompt referencing the strictly labeled image parts
    const coupleMappingInstructions = isCoupleMode
      ? `\n\n--- CRITICAL DUAL-IDENTITY MAPPING (COUPLE TEMPLATE) ---\n` +
        `- IMAGE 1 represents Person A (Primary Customer). Accurately preserve Person A's exact facial features, bone structure, and identity for the primary subject in the couple scene.\n` +
        `- IMAGE 2 represents Person B (Partner). Accurately preserve Person B's exact facial features, bone structure, and identity for the partner subject in the couple scene.\n` +
        `- Strictly maintain two distinct, authentic identities. NEVER blend, average, or cross-fuse Person A and Person B's faces into one.`
      : '';

    const identityReplacementDirective = hasReferenceImage
      ? isCoupleMode
        ? `FINAL EXECUTION DIRECTIVE: Generate a brand new photorealistic image starring Person A (IMAGE 1) and Person B (IMAGE 2) inside the scene, pose, lighting, and styling of IMAGE ${attachedUserCount + 1} (TEMPLATE_AFTER_REFERENCE). Replace the reference models' faces completely with Person A and Person B. Keep their unobstructed real eyes and facial features clearly visible. NEVER copy the template models' faces and NEVER return TEMPLATE_AFTER_REFERENCE unchanged.`
        : `FINAL EXECUTION DIRECTIVE: Generate a brand new photorealistic image starring the customer from IMAGE 1 (CUSTOMER_SOURCE_PHOTO) inside the scene, pose, lighting, styling, and text/typography layout of IMAGE ${attachedUserCount + 1} (TEMPLATE_AFTER_REFERENCE). Completely replace the template model's face/head with the customer's face and likeness from IMAGE 1 (adapting hair/beard/features naturally to the real customer, and keeping the customer's real eyes clearly visible rather than cloning any opaque sunglasses from TEMPLATE_AFTER_REFERENCE). NEVER copy the template person's face and NEVER return any reference image unchanged.`
      : '';

    let promptText: string;
    if (params.prompt && isUnifiedPrompt(params.prompt)) {
      promptText = `${params.prompt}${coupleMappingInstructions}\n\nSupplied Multimodal Inputs:\n${
        isCoupleMode
          ? `- IMAGE 1: CUSTOMER_SOURCE_PHOTO (Person A)\n- IMAGE 2: CUSTOMER_SOURCE_PHOTO (Person B Partner)${hasReferenceImage ? `\n- IMAGE 3: TEMPLATE_AFTER_REFERENCE (Target couple scene, pose, attire, atmosphere, and composition ONLY — replace sample faces with Person A & Person B)` : ''}`
          : `- IMAGE 1: CUSTOMER_SOURCE_PHOTO (Authoritative customer facial identity — must star in the output)${hasReferenceImage ? `\n- IMAGE 2: TEMPLATE_AFTER_REFERENCE (Target scene, pose, attire, atmosphere, text/overlays, and composition ONLY — replace sample face with IMAGE 1 customer)` : ''}`
      }\n\n${identityReplacementDirective}\n\nAspect ratio: ${params.aspectRatio || '9:16'}.`;
    } else if (hasReferenceImage) {
      const promptSegments = [
        params.prompt && params.prompt.trim() ? params.prompt.trim() : 'Place the customer into the target template scene and style.',
        coupleMappingInstructions,
        `\nMultimodal Input Instructions:`,
        isCoupleMode
          ? `- IMAGE 1 (CUSTOMER_SOURCE_PHOTO Person A): Preserve Person A's authentic facial identity, structure, skin tone, and likeness.\n- IMAGE 2 (CUSTOMER_SOURCE_PHOTO Person B): Preserve Person B's authentic facial identity, structure, skin tone, and likeness.`
          : `- IMAGE 1 (CUSTOMER_SOURCE_PHOTO): Preserve this customer's authentic facial identity, facial structure, eyes, skin tone, and likeness as the starring subject.`,
        `- IMAGE ${attachedUserCount + 1} (TEMPLATE_AFTER_REFERENCE): Recreate this exact artistic scene, pose, wardrobe, lighting setup, color grade, typography, and background atmosphere, replacing the sample person with the customer from IMAGE 1.`,
        identityReplacementDirective,
        `Aspect ratio: ${params.aspectRatio || '9:16'}.`
      ];
      promptText = promptSegments.filter(Boolean).join('\n');
    } else {
      promptText = `High-end cinematic photography starring the customer from IMAGE 1 (CUSTOMER_SOURCE_PHOTO): ${params.prompt}.${coupleMappingInstructions} Maintain pristine subject identities, realistic facial geometry, 8k resolution, studio lighting, sharp focus, aesthetic color grading. Aspect ratio: ${params.aspectRatio || '9:16'}.`;
    }
    parts.push({ text: promptText });

    const customerInputsDiagnostics: GenerationDiagnosticInputItem[] = resolvedUserPayloads.map((p) => ({
      slotId: p.slotId,
      role: p.role,
      mediaType: 'image',
      mimeType: p.mimeType,
      sizeBytes: p.sizeBytes,
      sha256Prefix: p.sha256.slice(0, 16)
    }));

    return {
      parts,
      attachedUserCount,
      hasReferenceImage,
      referenceSha256,
      userSha256s: resolvedUserPayloads.map((p) => p.sha256),
      prohibitedSampleSha256s,
      customerInputsDiagnostics,
      referenceDiagnostic
    };
  }

  /**
   * Generates or transforms an image using the dynamically assigned Gemini photo model.
   */
  async generateImage(params: ImageGenerationParams): Promise<ProviderResult> {
    const startTime = Date.now();

    // Fail-closed strict provider & adapter routing validation
    if (params.provider && params.provider.trim().toLowerCase() !== this.providerName) {
      throw new Error(
        `PROVIDER_ROUTING_MISMATCH: GeminiAdapter cannot execute provider '${params.provider}'.`
      );
    }
    if (params.adapter && params.adapter.trim() !== this.adapterName) {
      throw new Error(
        `PROVIDER_ROUTING_MISMATCH: GeminiAdapter cannot execute mismatched adapter '${params.adapter}'.`
      );
    }

    const requestedModelRaw = (params.model || '').trim();
    const targetModel = requestedModelRaw ? resolveCanonicalModelId(requestedModelRaw) : this.modelName;

    if (!SUPPORTED_GEMINI_IMAGE_MODELS.has(targetModel)) {
      throw new Error(
        `PROVIDER_ROUTING_MISMATCH: Model '${requestedModelRaw || targetModel}' is not a supported Gemini image generation model.`
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        'GEMINI_API_KEY is not configured in environment variables. Please provide a valid Gemini API key to execute AI image generation.'
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

    const {
      parts,
      referenceSha256,
      userSha256s,
      prohibitedSampleSha256s,
      customerInputsDiagnostics,
      referenceDiagnostic
    } = await this.buildMultimodalRequestParts(params);

    // Allowed aspect ratios for Gemini Image: "1:1", "3:4", "4:3", "9:16", "16:9"
    const allowedRatios = ['1:1', '3:4', '4:3', '9:16', '16:9'];
    const targetRatio = allowedRatios.includes(params.aspectRatio || '') ? params.aspectRatio : '9:16';

    // Only pass imageSize on Gemini 3.1 Flash Image / Nano Banana 2.1 / Gemini 3 Pro Image (omit on 2.5 Flash Image & Lite)
    const supportsImageSize =
      targetModel === 'gemini-3.1-flash-image' ||
      targetModel.includes('nano-banana-2.1') ||
      targetModel.includes('3-pro-image');

    const response = await ai.models.generateContent({
      model: targetModel,
      contents: { parts },
      config: {
        imageConfig: {
          aspectRatio: targetRatio,
          ...(supportsImageSize ? { imageSize: '1K' } : {})
        }
      }
    });

    // Extract real image part
    const candidateParts = response.candidates?.[0]?.content?.parts || [];
    let generatedBase64: string | null = null;
    let generatedMimeType = 'image/jpeg';

    for (const part of candidateParts) {
      if (part.inlineData?.data) {
        generatedBase64 = part.inlineData.data;
        if (part.inlineData.mimeType) {
          generatedMimeType = part.inlineData.mimeType;
        }
        break;
      }
    }

    if (!generatedBase64) {
      const textOutput = response.text || 'No image output generated by model';
      throw new Error(`Gemini model (${targetModel}) did not return image bytes. Details: ${textOutput}`);
    }

    const generatedBytes = Buffer.from(generatedBase64, 'base64');
    if (!generatedBytes || generatedBytes.length === 0) {
      throw new Error(`Gemini model (${targetModel}) returned 0 image bytes.`);
    }

    // Detect true image format from magic bytes so PNG output is never stored as .jpg
    const detectedOutFormat = detectMediaFormatFromBuffer(generatedBytes);
    const authoritativeMime = detectedOutFormat?.mimeType || generatedMimeType;
    const authoritativeExt = detectedOutFormat?.ext || (authoritativeMime.includes('png') ? 'png' : authoritativeMime.includes('webp') ? 'webp' : 'jpg');

    // Reject verbatim unchanged template reference, BEFORE/thumbnail leak, or unchanged customer input echo (>256B real images)
    const generatedSha256 = crypto.createHash('sha256').update(generatedBytes).digest('hex');
    if (generatedBytes.length > 256) {
      if (referenceSha256 && generatedSha256 === referenceSha256) {
        throw new Error(
          'UNCHANGED_REFERENCE_OUTPUT: Gemini returned the template reference image unchanged instead of generating a personalized customer photo.'
        );
      }
      if (userSha256s.includes(generatedSha256)) {
        throw new Error(
          'UNCHANGED_CUSTOMER_INPUT_OUTPUT: Gemini returned the uploaded customer photo unchanged instead of applying the template transformation.'
        );
      }
      if (prohibitedSampleSha256s.includes(generatedSha256)) {
        throw new Error(
          'LEAKED_TEMPLATE_SAMPLE_OUTPUT: Gemini returned an example/before template image instead of a newly generated customer result.'
        );
      }
    }

    // Save actual generated image to durable storage with owner isolation
    const stored = await mediaStorage.saveMedia(
      generatedBytes,
      'generation',
      `gemini_${Date.now()}.${authoritativeExt}`,
      params.ownerUserId,
      false
    );

    const elapsedMs = Date.now() - startTime;
    return {
      success: true,
      resultUrl: stored.publicUrl,
      provider: this.providerName,
      adapter: this.adapterName,
      model: targetModel,
      processingTimeMs: elapsedMs,
      diagnostics: {
        provider: this.providerName,
        adapter: this.adapterName,
        model: targetModel,
        workflow: params.styleWorkflow || 'PHOTO_GENERATION',
        customerInputCount: customerInputsDiagnostics.length,
        customerInputs: customerInputsDiagnostics,
        referenceInput: referenceDiagnostic,
        providerStatus: 'completed',
        processingTimeMs: elapsedMs,
        output: {
          mimeType: stored.mimeType || authoritativeMime,
          sizeBytes: stored.sizeBytes || generatedBytes.length,
          sha256Prefix: sha256Prefix(generatedBytes)
        }
      }
    };
  }
}

export const geminiAdapter = new GeminiAdapter();
