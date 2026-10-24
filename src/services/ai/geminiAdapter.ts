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

import { GoogleGenAI } from '@google/genai';
import { mediaStorage } from '../storage/mediaStorage.ts';
import type { ImageGenerationParams, ProviderResult } from '../types.ts';
import { isUnifiedPrompt } from '../../config/globalMasterPrompt.ts';

export class GeminiAdapter {
  readonly providerName = 'gemini';
  readonly modelName = 'gemini-3.1-flash-image';

  /**
   * Helper to resolve an image URL / base64 string into raw base64 data and mimeType.
   */
  private async resolveImagePayload(imageInput: string): Promise<{ data: string; mimeType: string }> {
    // 1. If already data URI
    if (imageInput.startsWith('data:')) {
      const match = imageInput.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        return { mimeType: match[1], data: match[2] };
      }
    }

    // 2. If it is a local storage path / file ID
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

    // 3. If it's a web URL
    if (imageInput.startsWith('http://') || imageInput.startsWith('https://')) {
      const res = await fetch(imageInput);
      if (!res.ok) {
        throw new Error(`Failed to fetch source image input from ${imageInput}: HTTP ${res.status}`);
      }
      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const mimeType = res.headers.get('content-type') || 'image/jpeg';
      return {
        data: buffer.toString('base64'),
        mimeType
      };
    }

    // 4. Raw base64 fallback
    return {
      data: imageInput,
      mimeType: 'image/jpeg'
    };
  }

  /**
   * Generates or transforms an image using gemini-3.1-flash-image.
   */
  async generateImage(params: ImageGenerationParams): Promise<ProviderResult> {
    const startTime = Date.now();
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error(
        'GEMINI_API_KEY is not configured in environment variables. Please provide a valid Gemini API key to execute AI image generation.'
      );
    }

    const ai = new GoogleGenAI();

    // Build parts array
    const parts: any[] = [];

    // 1. Attach user image (CUSTOMER_SOURCE_PHOTO: determines primary facial identity)
    if (params.userImageUrl) {
      try {
        const imagePayload = await this.resolveImagePayload(params.userImageUrl);
        parts.push({
          inlineData: {
            mimeType: imagePayload.mimeType,
            data: imagePayload.data
          }
        });
      } catch (err: any) {
        throw new Error(`Failed to resolve supplied customer photo (CUSTOMER_SOURCE_PHOTO): ${err.message}`);
      }
    }

    // 2. Attach template style reference image (TEMPLATE_AFTER_REFERENCE: visual target for scene, pose, styling)
    let hasReferenceImage = false;
    const targetRefUrl = params.sampleResultUrl || params.referenceImageUrl;
    if (targetRefUrl) {
      try {
        const refPayload = await this.resolveImagePayload(targetRefUrl);
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

    // 3. Attach optional TEMPLATE_BEFORE_REFERENCE (supporting context if provided and distinct)
    let hasBeforeReference = false;
    if (params.sampleBeforeUrl && params.sampleBeforeUrl !== targetRefUrl && params.sampleBeforeUrl !== params.userImageUrl) {
      try {
        const beforePayload = await this.resolveImagePayload(params.sampleBeforeUrl);
        parts.push({
          inlineData: {
            mimeType: beforePayload.mimeType,
            data: beforePayload.data
          }
        });
        hasBeforeReference = true;
      } catch (err: any) {
        console.warn('[GeminiAdapter] Optional BEFORE reference warning:', err.message);
      }
    }

    // 4. Construct authoritative prompt:
    // When prompt already contains the unified prompt constitution, use it directly with role mappings.
    let promptText: string;
    if (params.prompt && isUnifiedPrompt(params.prompt)) {
      promptText = `${params.prompt}\n\nSupplied Multimodal Inputs:\n- Image 1: CUSTOMER_SOURCE_PHOTO (Preserve customer facial identity and structure)\n- Image 2: TEMPLATE_AFTER_REFERENCE (Recreate scene, pose, attire, atmosphere, and visual composition)${hasBeforeReference ? '\n- Image 3: TEMPLATE_BEFORE_REFERENCE (Starting appearance context)' : ''}\n\nAspect ratio: ${params.aspectRatio || '9:16'}.`;
    } else if (hasReferenceImage) {
      const promptSegments = [
        params.prompt && params.prompt.trim() ? params.prompt.trim() : 'Transform customer photo to match template style.',
        `\n\nMultimodal Input Instructions:`,
        `- Image 1 (CUSTOMER_SOURCE_PHOTO): Preserve this person's authentic facial identity, facial structure, skin tone, and likeness.`,
        `- Image 2 (TEMPLATE_AFTER_REFERENCE): Recreate this exact artistic scene, pose, wardrobe, lighting setup, color grade, and background atmosphere.`,
        hasBeforeReference ? `- Image 3 (TEMPLATE_BEFORE_REFERENCE): Supporting starting example.` : '',
        `- Synthesize a new photorealistic, 8k ultra-sharp master photograph depicting the person from Image 1 in the target scene of Image 2.`,
        `Aspect ratio: ${params.aspectRatio || '9:16'}.`
      ];
      promptText = promptSegments.filter(Boolean).join('\n');
    } else {
      promptText = `High-end cinematic photography: ${params.prompt}. Workflow style: ${params.styleWorkflow || 'cinematic portrait'}. Maintain pristine subject identity, realistic facial geometry, 8k resolution, studio lighting, sharp focus, aesthetic color grading. Aspect ratio: ${params.aspectRatio || '9:16'}.`;
    }
    parts.push({ text: promptText });

    // Allowed aspect ratios for Gemini Image: "1:1", "3:4", "4:3", "9:16", "16:9"
    const allowedRatios = ['1:1', '3:4', '4:3', '9:16', '16:9'];
    const targetRatio = allowedRatios.includes(params.aspectRatio || '') ? params.aspectRatio : '9:16';

    const response = await ai.models.generateContent({
      model: this.modelName,
      contents: { parts },
      config: {
        imageConfig: {
          aspectRatio: targetRatio,
          imageSize: '1K'
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
      throw new Error(`Gemini model did not return image bytes. Details: ${textOutput}`);
    }

    // Save actual generated image to durable storage with owner isolation
    const stored = await mediaStorage.saveMedia(
      generatedBase64,
      'generation',
      `gemini_${Date.now()}.${generatedMimeType.includes('png') ? 'png' : 'jpg'}`,
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
  }
}

export const geminiAdapter = new GeminiAdapter();
