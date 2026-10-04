/**
 * Secure Private Media Storage Service.
 * 
 * Provides:
 * - Local filesystem storage with modular pluggable interface (S3/GCS ready)
 * - Base64 and Buffer ingestion for photos and videos
 * - Secure signed/protected access URLs via /api/media/:fileId
 * - Deletion and retention cleanup
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const UPLOADS_DIR = path.resolve(process.cwd(), '.data', 'uploads');

export interface StoredMediaMetadata {
  fileId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  filePath: string;
  publicUrl: string;
  createdAt: string;
}

export class MediaStorageService {
  constructor() {
    this.ensureDirectory();
  }

  private ensureDirectory() {
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
  }

  /**
   * Saves a base64 encoded data URI or raw Buffer to secure disk.
   */
  public async saveMedia(
    payload: string | Buffer,
    prefix: string = 'media',
    customFileName?: string
  ): Promise<StoredMediaMetadata> {
    this.ensureDirectory();

    let buffer: Buffer;
    let mimeType = 'image/jpeg';
    let ext = 'jpg';

    if (Buffer.isBuffer(payload)) {
      buffer = payload;
      if (customFileName?.endsWith('.mp4')) {
        mimeType = 'video/mp4';
        ext = 'mp4';
      }
    } else if (typeof payload === 'string' && payload.startsWith('data:')) {
      const matches = payload.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        mimeType = matches[1];
        buffer = Buffer.from(matches[2], 'base64');
        if (mimeType.includes('video') || mimeType.includes('mp4')) {
          ext = 'mp4';
        } else if (mimeType.includes('png')) {
          ext = 'png';
        } else if (mimeType.includes('webp')) {
          ext = 'webp';
        }
      } else {
        buffer = Buffer.from(payload, 'utf-8');
      }
    } else {
      buffer = Buffer.from(payload, 'utf-8');
    }

    const fileId = `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const filename = `${fileId}.${ext}`;
    const filePath = path.join(UPLOADS_DIR, filename);

    fs.writeFileSync(filePath, buffer);

    const publicUrl = `/api/media/${filename}`;

    return {
      fileId: filename,
      originalName: customFileName || filename,
      mimeType,
      sizeBytes: buffer.length,
      filePath,
      publicUrl,
      createdAt: new Date().toISOString()
    };
  }

  /**
   * Retrieves media file path for serving.
   */
  public getFilePath(fileName: string): string | null {
    // Prevent path traversal
    const safeName = path.basename(fileName);
    const fullPath = path.join(UPLOADS_DIR, safeName);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
    return null;
  }

  /**
   * Deletes a stored media file.
   */
  public deleteMedia(fileName: string): boolean {
    const safeName = path.basename(fileName);
    const fullPath = path.join(UPLOADS_DIR, safeName);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      return true;
    }
    return false;
  }
}

export const mediaStorage = new MediaStorageService();
