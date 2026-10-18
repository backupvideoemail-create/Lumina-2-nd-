/**
 * Production-Ready Modular Media Storage Service.
 * 
 * Supports:
 * - Provider-agnostic storage architecture (Local Disk & Cloudflare R2 / S3 / GCS)
 * - User isolation: private media accessible only to owning user
 * - Protected signed download URLs via /api/media/:fileId
 * - Transparent status reporting: detects if Cloudflare R2 credentials are fully configured or pending
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { adminFirestoreDb } from '../db/database.ts';

const UPLOADS_DIR = path.resolve(process.cwd(), '.data', 'uploads');

export interface StoredMediaMetadata {
  fileId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  filePath: string;
  publicUrl: string;
  ownerUserId?: string;
  isPublic?: boolean;
  provider: 'local' | 'cloudflare_r2';
  r2Key?: string;
  createdAt: string;
  r2UploadError?: string;
}

export interface StorageProviderStatus {
  activeDriver: 'local' | 'cloudflare_r2';
  r2Configured: boolean;
  r2LiveAuthenticated?: boolean;
  r2Error?: string;
  message: string;
  bucket?: string;
  publicBaseUrl?: string;
  requiredEnvVars: string[];
  missingEnvVars: string[];
  localStats: {
    directory: string;
    fileCount: number;
    totalSizeBytes: number;
    totalSizeFormatted: string;
  };
}

export class MediaStorageService {
  private r2Config = {
    accountId: process.env.R2_ACCOUNT_ID || '',
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    bucketName: process.env.R2_BUCKET_NAME || '',
    publicBaseUrl: process.env.R2_PUBLIC_BASE_URL || ''
  };

  private s3Client: S3Client | null = null;
  private metadataIndex: Record<string, StoredMediaMetadata> = {};

  constructor() {
    this.ensureDirectory();
    this.loadIndex();
    this.initR2Client();
    this.loadMetadataFromFirestore().catch(() => {});
  }

  private async loadMetadataFromFirestore() {
    if (!adminFirestoreDb) return;
    try {
      const snap = await adminFirestoreDb.collection('media_metadata').get();
      snap.forEach((d: any) => {
        const meta = d.data() as StoredMediaMetadata;
        if (meta && meta.fileId) {
          this.metadataIndex[meta.fileId] = meta;
        }
      });
    } catch (err: any) {
      console.warn('[MediaStorage] Firestore metadata load note:', err.message);
    }
  }

  private async syncMetadataToFirestore(filename: string, metadata: StoredMediaMetadata) {
    if (!adminFirestoreDb) return;
    try {
      await adminFirestoreDb.collection('media_metadata').doc(filename).set(metadata, { merge: true });
    } catch (err: any) {
      console.warn('[MediaStorage] Failed to sync media metadata to Firestore:', err.message);
    }
  }

  public async getMetadata(fileName: string): Promise<StoredMediaMetadata | null> {
    const safeName = path.basename(fileName);
    if (this.metadataIndex[safeName]) {
      return this.metadataIndex[safeName];
    }
    if (adminFirestoreDb) {
      try {
        const doc = await adminFirestoreDb.collection('media_metadata').doc(safeName).get();
        if (doc.exists) {
          const meta = doc.data() as StoredMediaMetadata;
          this.metadataIndex[safeName] = meta;
          return meta;
        }
      } catch (err: any) {
        console.warn('[MediaStorage] Lookup error in Firestore:', err.message);
      }
    }
    return null;
  }

  private initR2Client() {
    if (
      this.r2Config.accountId &&
      this.r2Config.accessKeyId &&
      this.r2Config.secretAccessKey &&
      this.r2Config.bucketName
    ) {
      try {
        let rawAcc = this.r2Config.accountId.trim();
        let endpoint = '';
        if (rawAcc.startsWith('http://') || rawAcc.startsWith('https://')) {
          endpoint = rawAcc.replace(/\/$/, '');
        } else {
          endpoint = `https://${rawAcc}.r2.cloudflarestorage.com`;
        }

        this.s3Client = new S3Client({
          region: 'auto',
          endpoint,
          credentials: {
            accessKeyId: this.r2Config.accessKeyId.trim(),
            secretAccessKey: this.r2Config.secretAccessKey.trim()
          },
          forcePathStyle: true
        });
        console.log(`[MediaStorage] Connected to Cloudflare R2 on bucket '${this.r2Config.bucketName}' (Authoritative)`);
      } catch (err: any) {
        console.error('[MediaStorage] Failed to initialize R2 S3Client:', err.message);
        this.s3Client = null;
      }
    }
  }

  private ensureDirectory() {
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
  }

  private loadIndex() {
    const indexPath = path.join(UPLOADS_DIR, 'metadata.json');
    if (fs.existsSync(indexPath)) {
      try {
        this.metadataIndex = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      } catch {
        this.metadataIndex = {};
      }
    }
  }

  private saveIndex() {
    const indexPath = path.join(UPLOADS_DIR, 'metadata.json');
    try {
      fs.writeFileSync(indexPath, JSON.stringify(this.metadataIndex, null, 2), 'utf-8');
    } catch (err) {
      console.error('[MediaStorage] Failed to save metadata index:', err);
    }
  }

  private getLocalDiskStats() {
    let fileCount = 0;
    let totalSizeBytes = 0;
    try {
      if (fs.existsSync(UPLOADS_DIR)) {
        const files = fs.readdirSync(UPLOADS_DIR);
        fileCount = files.length;
        for (const f of files) {
          try {
            const stat = fs.statSync(path.join(UPLOADS_DIR, f));
            totalSizeBytes += stat.size;
          } catch {}
        }
      }
    } catch {}

    const formatBytes = (bytes: number) => {
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    };

    return {
      directory: UPLOADS_DIR,
      fileCount,
      totalSizeBytes,
      totalSizeFormatted: formatBytes(totalSizeBytes)
    };
  }

  public getStatus(): StorageProviderStatus {
    const missing: string[] = [];
    if (!this.r2Config.accountId) missing.push('R2_ACCOUNT_ID');
    if (!this.r2Config.accessKeyId) missing.push('R2_ACCESS_KEY_ID');
    if (!this.r2Config.secretAccessKey) missing.push('R2_SECRET_ACCESS_KEY');
    if (!this.r2Config.bucketName) missing.push('R2_BUCKET_NAME');

    const isR2Ready = Boolean(
      this.s3Client &&
      this.r2Config.bucketName &&
      missing.length === 0
    );

    return {
      activeDriver: isR2Ready ? 'cloudflare_r2' : 'local',
      r2Configured: isR2Ready,
      bucket: this.r2Config.bucketName || undefined,
      publicBaseUrl: this.r2Config.publicBaseUrl || undefined,
      message: isR2Ready
        ? `Cloudflare R2 active on bucket '${this.r2Config.bucketName}' with authenticated presigned URLs & user isolation.`
        : 'Cloudflare R2 driver pending credentials. Operating in local secure isolated storage.',
      requiredEnvVars: [
        'R2_ACCOUNT_ID',
        'R2_ACCESS_KEY_ID',
        'R2_SECRET_ACCESS_KEY',
        'R2_BUCKET_NAME',
        'R2_PUBLIC_BASE_URL (Optional)'
      ],
      missingEnvVars: missing,
      localStats: this.getLocalDiskStats()
    };
  }

  /**
   * Performs an actual live authenticated check against the Cloudflare R2 bucket.
   */
  public async testR2Connection(): Promise<StorageProviderStatus> {
    const status = this.getStatus();
    if (!this.s3Client || !this.r2Config.bucketName) {
      status.r2LiveAuthenticated = false;
      return status;
    }

    try {
      await this.s3Client.send(new HeadBucketCommand({ Bucket: this.r2Config.bucketName }));
      status.r2LiveAuthenticated = true;
      return status;
    } catch (err: any) {
      status.r2LiveAuthenticated = false;
      status.r2Error = `R2 authentication probe failed: ${err.message}`;
      return status;
    }
  }

  /**
   * Ingests and stores media bytes with user isolation metadata.
   */
  public async saveMedia(
    payload: string | Buffer,
    prefix: string = 'media',
    customFileName?: string,
    ownerUserId?: string,
    isPublic: boolean = false
  ): Promise<StoredMediaMetadata> {
    this.ensureDirectory();

    if (typeof payload === 'string' && (payload.startsWith('http://') || payload.startsWith('https://'))) {
      const isVid = payload.toLowerCase().includes('.mp4') || payload.toLowerCase().includes('.mov') || payload.toLowerCase().includes('.webm');
      return {
        fileId: path.basename(payload.split('?')[0]) || `${prefix}_${Date.now()}`,
        originalName: customFileName || 'remote_media',
        mimeType: isVid ? 'video/mp4' : 'image/jpeg',
        sizeBytes: 0,
        filePath: '',
        publicUrl: payload,
        ownerUserId,
        isPublic: true,
        provider: 'cloudflare_r2',
        r2Key: '',
        createdAt: new Date().toISOString()
      };
    }

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
      const commaIdx = payload.indexOf(',');
      if (commaIdx !== -1) {
        const metaPart = payload.substring(0, commaIdx);
        const rawBase64 = payload.substring(commaIdx + 1);
        const mimeMatch = metaPart.match(/data:([^;]+)/);
        if (mimeMatch) {
          mimeType = mimeMatch[1].trim();
        }
        buffer = Buffer.from(rawBase64, 'base64');
        if (mimeType.includes('video') || mimeType.includes('mp4') || mimeType.includes('quicktime') || mimeType.includes('webm')) {
          ext = 'mp4';
          mimeType = 'video/mp4';
        } else if (mimeType.includes('png')) {
          ext = 'png';
          mimeType = 'image/png';
        } else if (mimeType.includes('webp')) {
          ext = 'webp';
          mimeType = 'image/webp';
        } else if (mimeType.includes('gif')) {
          ext = 'gif';
          mimeType = 'image/gif';
        } else {
          ext = 'jpg';
          mimeType = 'image/jpeg';
        }
      } else {
        buffer = Buffer.from(payload, 'base64');
      }
    } else if (typeof payload === 'string') {
      // Raw base64 string or binary payload
      try {
        buffer = Buffer.from(payload, 'base64');
      } catch {
        buffer = Buffer.from(payload, 'utf-8');
      }
    } else {
      buffer = Buffer.from(payload as any);
    }

    const fileId = `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const filename = `${fileId}.${ext}`;
    const filePath = path.join(UPLOADS_DIR, filename);

    // Save local copy for rapid response or backup
    fs.writeFileSync(filePath, buffer);

    let publicUrl = `/api/media/${filename}`;
    let provider: 'local' | 'cloudflare_r2' = 'cloudflare_r2';
    const scopeFolder = (isPublic || prefix.startsWith('tpl_')) ? 'public' : (ownerUserId ? `users/${ownerUserId}` : 'general');
    const r2Key = `media/${scopeFolder}/${filename}`;
    let r2UploadError: string | undefined = undefined;

    // Cloudflare R2 is authoritative storage driver when configured
    if (this.s3Client && this.r2Config.bucketName) {
      try {
        await this.s3Client.send(new PutObjectCommand({
          Bucket: this.r2Config.bucketName,
          Key: r2Key,
          Body: buffer,
          ContentType: mimeType,
          Metadata: {
            ownerUserId: ownerUserId || 'anonymous',
            originalName: customFileName || filename,
            isPublic: String(Boolean(isPublic || prefix.startsWith('tpl_')))
          }
        }));
        if (isPublic && this.r2Config.publicBaseUrl) {
          const base = this.r2Config.publicBaseUrl.replace(/\/$/, '');
          publicUrl = `${base}/${r2Key}`;
        }
        provider = 'cloudflare_r2';
      } catch (err: any) {
        console.error('[MediaStorage] R2 PutObject warning:', err.message);
        r2UploadError = err.message;
        provider = 'local';
        // Requirement: Do not silently disguise failed R2 upload as success
        throw new Error(`Cloudflare R2 PutObject failed on bucket '${this.r2Config.bucketName}': ${err.message}`);
      }
    } else {
      provider = 'local';
    }

    const metadata: StoredMediaMetadata = {
      fileId: filename,
      originalName: customFileName || filename,
      mimeType,
      sizeBytes: buffer.length,
      filePath,
      publicUrl,
      ownerUserId,
      isPublic: Boolean(isPublic || prefix.startsWith('tpl_')),
      provider,
      r2Key,
      r2UploadError,
      createdAt: new Date().toISOString()
    };

    this.metadataIndex[filename] = metadata;
    this.saveIndex();
    this.syncMetadataToFirestore(filename, metadata).catch(() => {});

    return metadata;
  }

  /**
   * Generates a signed presigned URL for private R2 object with owner validation.
   */
  public async getPresignedUrl(
    fileName: string,
    requestingUserId?: string,
    expiresInSeconds: number = 3600
  ): Promise<string | null> {
    const safeName = path.basename(fileName);
    const meta = await this.getMetadata(safeName);

    if (!meta) return null;

    // Validate ownership for private files
    if (!meta.isPublic && meta.ownerUserId && meta.ownerUserId !== requestingUserId) {
      return null;
    }

    if (this.s3Client && this.r2Config.bucketName && meta.r2Key) {
      try {
        const command = new GetObjectCommand({
          Bucket: this.r2Config.bucketName,
          Key: meta.r2Key
        });
        return await getSignedUrl(this.s3Client, command, { expiresIn: expiresInSeconds });
      } catch (err: any) {
        console.error('[MediaStorage] getSignedUrl error:', err.message);
      }
    }

    return meta.publicUrl;
  }

  /**
   * Streams media directly from authoritative R2 storage with user isolation enforcement.
   */
  public async getAuthorizedObjectStream(
    fileName: string,
    requestingUserId?: string
  ): Promise<{ body: any; mimeType: string; error?: string }> {
    const safeName = path.basename(fileName);
    const meta = await this.getMetadata(safeName);

    // Enforce ownership for private files
    if (meta && !meta.isPublic && meta.ownerUserId) {
      if (!requestingUserId || requestingUserId !== meta.ownerUserId) {
        return { body: null, mimeType: '', error: 'Unauthorized: Access restricted to owner.' };
      }
    }

    if (this.s3Client && this.r2Config.bucketName) {
      const keysToTry = [
        meta?.r2Key,
        `media/public/${safeName}`,
        `media/general/${safeName}`,
        requestingUserId ? `media/users/${requestingUserId}/${safeName}` : null
      ].filter(Boolean) as string[];

      for (const candidateKey of keysToTry) {
        try {
          const getRes = await this.s3Client.send(new GetObjectCommand({
            Bucket: this.r2Config.bucketName,
            Key: candidateKey
          }));
          return { body: getRes.Body, mimeType: meta?.mimeType || 'application/octet-stream' };
        } catch {
          // try next key candidate
        }
      }
    }

    const fullPath = path.join(UPLOADS_DIR, safeName);
    if (fs.existsSync(fullPath)) {
      return { body: fs.createReadStream(fullPath), mimeType: meta?.mimeType || 'application/octet-stream' };
    }

    return { body: null, mimeType: '', error: 'Media file not found' };
  }

  /**
   * Verifies access and retrieves file path or presigned stream.
   * Ensures user isolation: private user media cannot be accessed by other users.
   */
  public getAuthorizedFilePath(
    fileName: string,
    requestingUserId?: string
  ): { filePath: string | null; mimeType?: string; error?: string } {
    const safeName = path.basename(fileName);
    const meta = this.metadataIndex[safeName];

    // If metadata exists and it's private, enforce user identity match
    if (meta && !meta.isPublic && meta.ownerUserId) {
      if (!requestingUserId || requestingUserId !== meta.ownerUserId) {
        return { filePath: null, error: 'Unauthorized: You do not have permission to access this private media file.' };
      }
    }

    const fullPath = path.join(UPLOADS_DIR, safeName);
    if (fs.existsSync(fullPath)) {
      return { filePath: fullPath, mimeType: meta?.mimeType || 'application/octet-stream' };
    }

    return { filePath: null, error: 'Media file not found' };
  }

  public getFilePath(fileName: string): string | null {
    const safeName = path.basename(fileName);
    const fullPath = path.join(UPLOADS_DIR, safeName);
    return fs.existsSync(fullPath) ? fullPath : null;
  }

  public async deleteMedia(fileName: string): Promise<boolean> {
    const safeName = path.basename(fileName);
    const meta = this.metadataIndex[safeName];

    if (this.s3Client && this.r2Config.bucketName && meta?.r2Key) {
      try {
        await this.s3Client.send(new DeleteObjectCommand({
          Bucket: this.r2Config.bucketName,
          Key: meta.r2Key
        }));
      } catch (err: any) {
        console.error('[MediaStorage] Failed to delete from R2:', err.message);
      }
    }

    const fullPath = path.join(UPLOADS_DIR, safeName);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      delete this.metadataIndex[safeName];
      this.saveIndex();
      return true;
    }
    return false;
  }

  /**
   * Deletes all private media assets belonging to a user (used during account deletion).
   */
  public async deleteUserMedia(userId: string): Promise<number> {
    if (!userId) return 0;
    const userFiles = Object.values(this.metadataIndex).filter(
      (m) => m.ownerUserId === userId
    );

    let deletedCount = 0;
    for (const file of userFiles) {
      try {
        await this.deleteMedia(file.fileId);
        deletedCount++;
      } catch (err: any) {
        console.warn(`[MediaStorage] Error deleting user file ${file.fileId}:`, err.message);
      }
    }

    return deletedCount;
  }
}

export const mediaStorage = new MediaStorageService();
