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
  HeadObjectCommand,
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

  private async syncMetadataToFirestore(filename: string, metadata: StoredMediaMetadata): Promise<void> {
    if (!adminFirestoreDb) {
      if (metadata.isPublic && process.env.NODE_ENV !== 'test' && !process.env.IS_ISOLATED_TEST) {
        throw new Error('Authoritative Firestore database is not connected to record media metadata.');
      }
      return;
    }
    try {
      await adminFirestoreDb.collection('media_metadata').doc(filename).set(metadata, { merge: true });
      if (metadata.isPublic && process.env.NODE_ENV !== 'test' && !process.env.IS_ISOLATED_TEST) {
        const verifyDoc = await adminFirestoreDb.collection('media_metadata').doc(filename).get();
        if (!verifyDoc.exists) {
          throw new Error(`Media metadata verification failed: document 'media_metadata/${filename}' not found after write.`);
        }
      }
    } catch (err: any) {
      console.error('[MediaStorage Critical] Failed to sync media metadata to Firestore:', err.message);
      if (metadata.isPublic && process.env.NODE_ENV !== 'test' && !process.env.IS_ISOLATED_TEST) {
        throw new Error(`Failed to persist media metadata to Firestore: ${err.message}`);
      }
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
    if (process.env.IS_ISOLATED_TEST === 'true' || process.env.NODE_ENV === 'test') {
      this.s3Client = null;
      return;
    }
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
   * Executes a real 5-point disposable verification against Cloudflare R2:
   * 1. r2_cfg (Config + HeadBucket)
   * 2. r2_upl (PutObject to _diag_probes/)
   * 3. r2_read (HeadObject + GetObject content match)
   * 4. r2_sign (Presigned GET URL generation check, URL never returned/logged)
   * 5. r2_del (DeleteObject cleanup in finally block)
   */
  public async testR2Storage5Point(): Promise<{
    configured: boolean;
    bucket?: string;
    r2_cfg: 'PASS' | 'FAIL' | 'BLOCKED';
    r2_upl: 'PASS' | 'FAIL' | 'BLOCKED';
    r2_read: 'PASS' | 'FAIL' | 'BLOCKED';
    r2_sign: 'PASS' | 'FAIL' | 'BLOCKED';
    r2_del: 'PASS' | 'FAIL' | 'BLOCKED';
    allPassed: boolean;
    error?: string;
  }> {
    const status = this.getStatus();
    if (!this.s3Client || !this.r2Config.bucketName || !status.r2Configured) {
      return {
        configured: false,
        bucket: this.r2Config.bucketName || undefined,
        r2_cfg: 'BLOCKED',
        r2_upl: 'BLOCKED',
        r2_read: 'BLOCKED',
        r2_sign: 'BLOCKED',
        r2_del: 'BLOCKED',
        allPassed: false,
        error: `Missing env vars: ${status.missingEnvVars.join(', ')}`
      };
    }

    const probeKey = `_diag_probes/r2_probe_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.txt`;
    const probePayload = `AI_PRIME_R2_PROBE_${crypto.randomBytes(8).toString('hex')}`;
    let r2_cfg: 'PASS' | 'FAIL' = 'FAIL';
    let r2_upl: 'PASS' | 'FAIL' = 'FAIL';
    let r2_read: 'PASS' | 'FAIL' = 'FAIL';
    let r2_sign: 'PASS' | 'FAIL' = 'FAIL';
    let r2_del: 'PASS' | 'FAIL' = 'FAIL';
    let uploaded = false;
    let firstError: string | undefined;

    try {
      await this.s3Client.send(new HeadBucketCommand({ Bucket: this.r2Config.bucketName }));
      r2_cfg = 'PASS';

      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.r2Config.bucketName,
          Key: probeKey,
          Body: Buffer.from(probePayload, 'utf-8'),
          ContentType: 'text/plain'
        })
      );
      r2_upl = 'PASS';
      uploaded = true;

      await this.s3Client.send(
        new HeadObjectCommand({
          Bucket: this.r2Config.bucketName,
          Key: probeKey
        })
      );
      const getRes: any = await this.s3Client.send(
        new GetObjectCommand({
          Bucket: this.r2Config.bucketName,
          Key: probeKey
        })
      );
      const bodyStr = await getRes?.Body?.transformToString?.('utf-8');
      if (bodyStr === probePayload) {
        r2_read = 'PASS';
      } else {
        firstError = 'R2 GetObject content mismatch during read-back verification';
      }

      const signed = await getSignedUrl(
        this.s3Client,
        new GetObjectCommand({ Bucket: this.r2Config.bucketName, Key: probeKey }),
        { expiresIn: 120 }
      );
      if (signed && signed.startsWith('https://')) {
        r2_sign = 'PASS';
      } else {
        firstError = firstError || 'R2 presigned URL generation returned empty/non-HTTPS URL';
      }
    } catch (err: any) {
      firstError = err.message || 'R2 5-point probe error';
    } finally {
      if (uploaded) {
        try {
          await this.s3Client.send(
            new DeleteObjectCommand({
              Bucket: this.r2Config.bucketName,
              Key: probeKey
            })
          );
          r2_del = 'PASS';
        } catch (delErr: any) {
          r2_del = 'FAIL';
          firstError = firstError || `R2 DeleteObject cleanup failed: ${delErr.message}`;
        }
      }
    }

    const allPassed =
      r2_cfg === 'PASS' &&
      r2_upl === 'PASS' &&
      r2_read === 'PASS' &&
      r2_sign === 'PASS' &&
      r2_del === 'PASS';

    return {
      configured: true,
      bucket: this.r2Config.bucketName,
      r2_cfg,
      r2_upl,
      r2_read,
      r2_sign,
      r2_del,
      allPassed,
      error: firstError
    };
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
      const isOurR2 = Boolean(this.r2Config.publicBaseUrl && payload.startsWith(this.r2Config.publicBaseUrl.replace(/\/$/, '')));
      const isVid = payload.toLowerCase().includes('.mp4') || payload.toLowerCase().includes('.mov') || payload.toLowerCase().includes('.webm');

      if (isOurR2) {
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
          r2Key: payload.replace(this.r2Config.publicBaseUrl.replace(/\/$/, '') + '/', ''),
          createdAt: new Date().toISOString()
        };
      }

      // External URL: fetch remote bytes so the asset can be uploaded to R2
      let fetchedBuffer: Buffer | null = null;
      try {
        const resp = await fetch(payload);
        if (resp.ok) {
          const ab = await resp.arrayBuffer();
          fetchedBuffer = Buffer.from(ab);
        }
      } catch (err: any) {
        console.warn('[MediaStorage] Failed to fetch external URL for R2 persistence:', err.message);
      }

      if (fetchedBuffer) {
        payload = fetchedBuffer;
      } else {
        // Fallback: Return remote URL labeled accurately as 'local' (external remote), never fake 'cloudflare_r2'
        return {
          fileId: path.basename(payload.split('?')[0]) || `${prefix}_${Date.now()}`,
          originalName: customFileName || 'remote_media',
          mimeType: isVid ? 'video/mp4' : 'image/jpeg',
          sizeBytes: 0,
          filePath: '',
          publicUrl: payload,
          ownerUserId,
          isPublic: true,
          provider: 'local',
          r2Key: '',
          createdAt: new Date().toISOString()
        };
      }
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

        // Read-back verification from Cloudflare R2:
        await this.s3Client.send(new HeadObjectCommand({
          Bucket: this.r2Config.bucketName,
          Key: r2Key
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
      if (prefix.startsWith('tpl_') && process.env.NODE_ENV !== 'test' && !process.env.IS_ISOLATED_TEST) {
        throw new Error(`Cloudflare R2 storage is not configured. Template media assets require verified permanent R2 storage.`);
      }
      if (process.env.NODE_ENV === 'production' && !process.env.IS_ISOLATED_TEST) {
        throw new Error('Cloudflare R2 storage is not configured. In production, permanent customer media cannot be stored on ephemeral Cloud Run disk.');
      }
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
    await this.syncMetadataToFirestore(filename, metadata);

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
   * Generates a short-lived, authorized HTTPS GET URL for external AI providers (e.g. Higgsfield)
   * to download private customer assets (face photos, driving videos) without exposing them to public.
   * 
   * If R2 is configured: Generates Cloudflare R2 S3-presigned GET URL (1-hour expiry).
   * If local storage: Generates a secure HMAC-signed proxy URL (/api/media/signed/:token).
   * Privacy: NEVER log signed URLs or private user data.
   */
  public async generateProviderSignedUrl(
    mediaUrlOrName: string,
    expiresInSeconds: number = 3600,
    serverBaseUrl?: string
  ): Promise<string> {
    if (!mediaUrlOrName || typeof mediaUrlOrName !== 'string') {
      return '';
    }

    const trimmed = mediaUrlOrName.trim();

    // If already an external third-party public URL (e.g. Unsplash, Mixkit, external CDN), return as-is
    if (
      (trimmed.startsWith('https://') || trimmed.startsWith('http://')) &&
      !trimmed.includes('/api/media/') &&
      !trimmed.includes('localhost') &&
      !trimmed.includes('127.0.0.1')
    ) {
      return trimmed;
    }

    // Extract file name
    let fileName = trimmed;
    if (trimmed.includes('/api/media/')) {
      fileName = trimmed.split('/api/media/')[1].split('?')[0];
    } else if (trimmed.includes('/')) {
      fileName = path.basename(trimmed.split('?')[0]);
    }
    const safeName = path.basename(fileName);

    // 1. If stored in Cloudflare R2, generate R2 presigned GET URL
    const meta = await this.getMetadata(safeName);
    if (this.s3Client && this.r2Config.bucketName && meta?.r2Key) {
      try {
        const command = new GetObjectCommand({
          Bucket: this.r2Config.bucketName,
          Key: meta.r2Key
        });
        const r2PresignedUrl = await getSignedUrl(this.s3Client, command, { expiresIn: expiresInSeconds });
        if (r2PresignedUrl) {
          return r2PresignedUrl;
        }
      } catch {
        // Fall back to signed local proxy
      }
    }

    // 2. Generate secure HMAC-signed proxy token for local disk storage
    const token = createSignedMediaToken(safeName, expiresInSeconds);
    const hostBase = (process.env.PROD_SERVER_URL || process.env.APP_URL || serverBaseUrl || '').replace(/\/$/, '');
    return hostBase ? `${hostBase}/api/media/signed/${token}` : `/api/media/signed/${token}`;
  }

  /**
   * Streams media directly from authoritative R2 storage with user isolation enforcement.
   */
  public async getAuthorizedObjectStream(
    fileName: string,
    requestingUserId?: string,
    range?: string
  ): Promise<{
    body: any;
    mimeType: string;
    contentRange?: string;
    contentLength?: number;
    statusCode?: number;
    error?: string;
  }> {
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

      const ext = path.extname(safeName).toLowerCase();
      const extMime =
        ext === '.mp4' ? 'video/mp4' :
        ext === '.webm' ? 'video/webm' :
        ext === '.mov' ? 'video/quicktime' :
        ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' :
        ext === '.png' ? 'image/png' :
        ext === '.webp' ? 'image/webp' :
        'application/octet-stream';

      for (const candidateKey of keysToTry) {
        try {
          const commandInput: any = {
            Bucket: this.r2Config.bucketName,
            Key: candidateKey
          };
          if (range) {
            commandInput.Range = range;
          }
          const getRes = await this.s3Client.send(new GetObjectCommand(commandInput));
          const resolvedMime =
            (getRes.ContentType && getRes.ContentType !== 'application/octet-stream') ? getRes.ContentType :
            (meta?.mimeType && meta.mimeType !== 'application/octet-stream') ? meta.mimeType :
            extMime;
          return {
            body: getRes.Body,
            mimeType: resolvedMime,
            contentRange: getRes.ContentRange,
            contentLength: getRes.ContentLength,
            statusCode: range && getRes.ContentRange ? 206 : 200
          };
        } catch (err: any) {
          if (err.name === 'InvalidRange' || err.$metadata?.httpStatusCode === 416) {
            return { body: null, mimeType: '', statusCode: 416, error: 'Requested Range Not Satisfiable' };
          }
          // try next key candidate
        }
      }
    }

    const fullPath = path.join(UPLOADS_DIR, safeName);
    if (fs.existsSync(fullPath)) {
      const ext = path.extname(safeName).toLowerCase();
      const extMime =
        ext === '.mp4' ? 'video/mp4' :
        ext === '.webm' ? 'video/webm' :
        ext === '.mov' ? 'video/quicktime' :
        ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' :
        ext === '.png' ? 'image/png' :
        ext === '.webp' ? 'image/webp' :
        'application/octet-stream';
      const resolvedMime = (meta?.mimeType && meta.mimeType !== 'application/octet-stream') ? meta.mimeType : extMime;
      return { body: fs.createReadStream(fullPath), mimeType: resolvedMime };
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

  /**
   * Scans all objects currently in the R2 bucket with optional key prefix.
   * Handles multi-page pagination with ContinuationToken and resolves durable URLs.
   */
  public async listR2Objects(prefix: string = ''): Promise<Array<{
    key: string;
    filename: string;
    size: number;
    lastModified?: Date;
    publicUrl: string;
    isPublic: boolean;
  }>> {
    if (!this.s3Client || !this.r2Config.bucketName) {
      return [];
    }

    const items: Array<{
      key: string;
      filename: string;
      size: number;
      lastModified?: Date;
      publicUrl: string;
      isPublic: boolean;
    }> = [];

    let continuationToken: string | undefined = undefined;

    try {
      do {
        const command: ListObjectsV2Command = new ListObjectsV2Command({
          Bucket: this.r2Config.bucketName,
          Prefix: prefix || undefined,
          ContinuationToken: continuationToken,
          MaxKeys: 200
        });

        const response: any = await this.s3Client.send(command);
        if (response.Contents) {
          for (const obj of response.Contents) {
            if (!obj.Key) continue;
            const filename = path.basename(obj.Key);
            const isPublic = obj.Key.includes('/public/') || filename.startsWith('tpl_') || filename.startsWith('bulk_');
            let publicUrl = `/api/media/${filename}`;
            if (isPublic && this.r2Config.publicBaseUrl) {
              const base = this.r2Config.publicBaseUrl.replace(/\/$/, '');
              publicUrl = `${base}/${obj.Key}`;
            }

            items.push({
              key: obj.Key,
              filename,
              size: obj.Size || 0,
              lastModified: obj.LastModified,
              publicUrl,
              isPublic
            });
          }
        }
        continuationToken = response.NextContinuationToken;
      } while (continuationToken);

      return items;
    } catch (err: any) {
      console.error('[MediaStorage] listR2Objects scan error:', err.message);
      return items;
    }
  }
}

export const mediaStorage = new MediaStorageService();

/**
 * Secret key used to sign and verify temporary media proxy tokens.
 */
const SIGNED_MEDIA_SECRET =
  process.env.SESSION_SECRET || process.env.ADMIN_SECRET_KEY || 'lumina-secure-signed-media-secret-2026';

/**
 * Creates a tamper-proof, time-limited HMAC-SHA256 signed token for external provider media access.
 */
export function createSignedMediaToken(fileName: string, expiresInSeconds: number = 3600): string {
  const safeName = path.basename(fileName);
  const expiresAt = Math.floor(Date.now() / 1000) + Math.max(60, expiresInSeconds);
  const payload = `${safeName}:${expiresAt}`;
  const hmac = crypto
    .createHmac('sha256', SIGNED_MEDIA_SECRET)
    .update(payload)
    .digest('hex');
  // Format: base64(fileName:expiresAt:hmac)
  return Buffer.from(`${payload}:${hmac}`).toString('base64url');
}

/**
 * Verifies a temporary HMAC-SHA256 signed media token.
 */
export function verifySignedMediaToken(token: string): {
  valid: boolean;
  fileName?: string;
  error?: string;
} {
  try {
    if (!token || typeof token !== 'string') {
      return { valid: false, error: 'Missing token' };
    }
    const decoded = Buffer.from(token, 'base64url').toString('utf-8');
    const parts = decoded.split(':');
    if (parts.length !== 3) {
      return { valid: false, error: 'Malformed token format' };
    }
    const [fileName, expiresAtStr, providedHmac] = parts;
    const expiresAt = parseInt(expiresAtStr, 10);
    if (isNaN(expiresAt)) {
      return { valid: false, error: 'Invalid expiry timestamp' };
    }
    const now = Math.floor(Date.now() / 1000);
    if (now > expiresAt) {
      return { valid: false, error: 'Signed media link has expired' };
    }
    const payload = `${fileName}:${expiresAtStr}`;
    const expectedHmac = crypto
      .createHmac('sha256', SIGNED_MEDIA_SECRET)
      .update(payload)
      .digest('hex');

    if (
      !crypto.timingSafeEqual(
        Buffer.from(providedHmac, 'hex'),
        Buffer.from(expectedHmac, 'hex')
      )
    ) {
      return { valid: false, error: 'Invalid token signature' };
    }

    return { valid: true, fileName: path.basename(fileName) };
  } catch (err: any) {
    return { valid: false, error: err.message || 'Token verification failed' };
  }
}
