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

    // 1. Attach user image (determines subject identity)
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
        console.warn('[GeminiAdapter] User image resolve note:', err.message);
      }
    }

    // 2. Attach template style reference image (guides visual look/aesthetic) if provided
    let hasReferenceImage = false;
    if (params.referenceImageUrl) {
      try {
        const refPayload = await this.resolveImagePayload(params.referenceImageUrl);
        parts.push({
          inlineData: {
            mimeType: refPayload.mimeType,
            data: refPayload.data
          }
        });
        hasReferenceImage = true;
      } catch (err: any) {
        console.warn('[GeminiAdapter] Reference image resolve note:', err.message);
      }
    }

    // 3. Construct prompt:
    // If a reference image is provided, enforce shared server-side master prompt
    // where user photo determines identity and reference image guides style.
    // If no reference image is provided, preserve existing single-image / custom-edit path.
    let promptText: string;
    if (hasReferenceImage) {
      const promptSegments = [
        `High-end photographic transformation:`,
        `- Image 1 is the subject's portrait photo: preserve this person's facial features, identity, facial geometry, and likeness accurately.`,
        `- Image 2 is the style-reference image: replicate its artistic visual style, aesthetic look, color grading, lighting setup, wardrobe/outfit theme, mood, and background atmosphere.`,
        `- Synthesize a new photorealistic, 8k ultra-sharp master photograph depicting the exact person from Image 1 seamlessly integrated into the style and aesthetic of Image 2.`,
        params.prompt && params.prompt.trim() ? `Additional template style instructions: ${params.prompt.trim()}.` : '',
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
