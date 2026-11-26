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

const PRIVATE_MEDIA_PREFIXES = [
  'gen_',
  'gen_fsv_',
  'user_',
  'private_',
  'gemini_',
  'genjutsu_',
  'smart_',
  'face_ref_',
  'asset_',
  'user_gen_',
  'user_trimmed_video_',
  'faceswap_trimmed_',
  'diag_media_'
];

export function isPrivateMediaFilename(fileName: string): boolean {
  const base = path.basename(String(fileName || '')).toLowerCase();
  return PRIVATE_MEDIA_PREFIXES.some((prefix) => base.startsWith(prefix));
}

export function extractMediaFileIdFromRef(mediaUrlOrFileId: string): string {
  const raw = String(mediaUrlOrFileId || '').trim();
  if (!raw) return '';
  if (raw.includes('/api/media/signed/')) {
    const seg = raw.split('/api/media/signed/')[1]?.split('?')[0]?.split('/')[0] || '';
    const v = verifySignedMediaToken(seg);
    if (v.valid && v.fileName) return path.basename(v.fileName);
  }
  if (raw.includes('/api/media/')) {
    const seg = raw.split('/api/media/')[1]?.split('?')[0]?.split('/')[0] || '';
    return path.basename(decodeURIComponent(seg));
  }
  return path.basename(raw.split('?')[0]);
}

export function detectMediaFormatFromBuffer(buf: Buffer): { mimeType: string; ext: string } | null {
  if (!buf || buf.length < 4) return null;
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return { mimeType: 'image/png', ext: 'png' };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { mimeType: 'image/jpeg', ext: 'jpg' };
  }
  if (
    buf.length >= 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return { mimeType: 'image/webp', ext: 'webp' };
  }
  if (
    buf.length >= 6 &&
    (buf.toString('ascii', 0, 6) === 'GIF87a' || buf.toString('ascii', 0, 6) === 'GIF89a')
  ) {
    return { mimeType: 'image/gif', ext: 'gif' };
  }
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    return { mimeType: 'video/webm', ext: 'webm' };
  }
  if (buf.length >= 12 && buf.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buf.toString('ascii', 8, 12).trim().toLowerCase();
    if (brand === 'qt') {
      return { mimeType: 'video/quicktime', ext: 'mov' };
    }
    return { mimeType: 'video/mp4', ext: 'mp4' };
  }
  return null;
}

const UPLOADS_DIR = path.resolve(process.cwd(), '.data', 'uploads');

type StorageMonitoringReporter = (
  severity: 'CRITICAL' | 'ERROR' | 'WARNING',
  message: string,
  context?: Record<string, any>
) => void;

let storageMonitoringReporter: StorageMonitoringReporter | null = null;

export function configureStorageMonitoring(reporter: StorageMonitoringReporter | null): void {
  storageMonitoringReporter = reporter;
}

/**
 * AWS/R2 SDK requires S3 x-amz-meta-* header values to contain only printable US-ASCII characters.
 * Unicode template titles or filenames would otherwise throw InvalidCharacterError -> HTTP 500.
 */
export function sanitizeS3MetadataValue(raw: string | undefined, fallback: string = 'media'): string {
  const cleaned = String(raw || '')
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/[\r\n]/g, ' ')
    .trim()
    .slice(0, 128);
  return cleaned || fallback;
}

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
  optionalEnvVars?: string[];
  optionalVarsPresent?: Record<string, boolean>;
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
    const isProductionRuntime = process.env.NODE_ENV !== 'test' && !process.env.IS_ISOLATED_TEST;
    if (!adminFirestoreDb) {
      if (isProductionRuntime) {
        throw new Error('Authoritative Firestore database is not connected to record media metadata.');
      }
      return;
    }
    try {
      const sanitizedMetadata = JSON.parse(JSON.stringify(metadata));
      await adminFirestoreDb.collection('media_metadata').doc(filename).set(sanitizedMetadata, { merge: true });
      if (isProductionRuntime) {
        const verifyDoc = await adminFirestoreDb.collection('media_metadata').doc(filename).get();
        if (!verifyDoc.exists) {
          throw new Error(`Media metadata verification failed: document 'media_metadata/${filename}' not found after write.`);
        }
      }
    } catch (err: any) {
      console.error('[MediaStorage Critical] Failed to sync media metadata to Firestore:', err.message);
      if (isProductionRuntime) {
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

  public async setMetadataForTest(
    fileName: string,
    patch: Partial<StoredMediaMetadata>
  ): Promise<StoredMediaMetadata | null> {
    if (process.env.IS_ISOLATED_TEST !== 'true' && process.env.NODE_ENV !== 'test') {
      throw new Error('setMetadataForTest is only allowed in isolated test environments.');
    }
    const safeName = path.basename(fileName);
    const existing = await this.getMetadata(safeName);
    if (!existing) return null;
    const updated: StoredMediaMetadata = { ...existing, ...patch, fileId: safeName };
    this.metadataIndex[safeName] = updated;
    this.saveIndex();
    if (adminFirestoreDb) {
      await adminFirestoreDb.collection('media_metadata').doc(safeName).set(updated);
    }
    return updated;
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
        const rawAcc = this.r2Config.accountId.trim();
        let endpoint = '';
        if (rawAcc.startsWith('http://') || rawAcc.startsWith('https://')) {
          try {
            endpoint = new URL(rawAcc).origin;
          } catch {
            endpoint = rawAcc.replace(/\/+$/, '');
          }
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
        ? `Cloudflare R2 active on bucket '${this.r2Config.bucketName}' with private presigned URLs & owner isolation (R2_PUBLIC_BASE_URL optional).`
        : 'Cloudflare R2 driver pending credentials. Operating in local isolated storage with signed proxy delivery.',
      requiredEnvVars: [
        'R2_ACCOUNT_ID',
        'R2_ACCESS_KEY_ID',
        'R2_SECRET_ACCESS_KEY',
        'R2_BUCKET_NAME'
      ],
      optionalEnvVars: ['R2_PUBLIC_BASE_URL'],
      optionalVarsPresent: {
        R2_PUBLIC_BASE_URL: Boolean(this.r2Config.publicBaseUrl)
      },
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
          if (!probeKey.startsWith('_diag_probes/r2_probe_') || probeKey.includes('..')) {
            throw new Error(`SAFETY_ABORT: Refusing R2 cleanup outside disposable _diag_probes/r2_probe_ prefix (${probeKey})`);
          }
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
    const lowerCustomName = (customFileName || '').toLowerCase();

    const applyCustomNameExtHint = () => {
      if (lowerCustomName.endsWith('.mp4')) {
        mimeType = 'video/mp4';
        ext = 'mp4';
      } else if (lowerCustomName.endsWith('.mov')) {
        mimeType = 'video/quicktime';
        ext = 'mov';
      } else if (lowerCustomName.endsWith('.webm')) {
        mimeType = 'video/webm';
        ext = 'webm';
      } else if (lowerCustomName.endsWith('.png')) {
        mimeType = 'image/png';
        ext = 'png';
      } else if (lowerCustomName.endsWith('.webp')) {
        mimeType = 'image/webp';
        ext = 'webp';
      } else if (lowerCustomName.endsWith('.gif')) {
        mimeType = 'image/gif';
        ext = 'gif';
      }
    };

    if (Buffer.isBuffer(payload)) {
      buffer = payload;
      applyCustomNameExtHint();
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
        if (mimeType.includes('webm')) {
          ext = 'webm';
          mimeType = 'video/webm';
        } else if (mimeType.includes('quicktime')) {
          ext = 'mov';
          mimeType = 'video/quicktime';
        } else if (mimeType.includes('video') || mimeType.includes('mp4')) {
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
        applyCustomNameExtHint();
      }
    } else if (typeof payload === 'string') {
      // Raw base64 string or binary payload
      applyCustomNameExtHint();
      try {
        buffer = Buffer.from(payload, 'base64');
      } catch {
        buffer = Buffer.from(payload, 'utf-8');
      }
    } else {
      buffer = Buffer.from(payload as any);
      applyCustomNameExtHint();
    }

    if (!buffer || buffer.length === 0) {
      throw new Error('Cannot store empty (0-byte) media payload.');
    }

    // Authoritative magic-byte verification ensures actual PNG/JPEG/WEBP/MP4 bytes never get stored under mismatched extension or MIME type
    const detectedFormat = detectMediaFormatFromBuffer(buffer);
    if (detectedFormat) {
      mimeType = detectedFormat.mimeType;
      ext = detectedFormat.ext;
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
            ownerUserId: sanitizeS3MetadataValue(ownerUserId, 'anonymous'),
            originalName: sanitizeS3MetadataValue(customFileName, filename),
            isPublic: String(Boolean(isPublic || prefix.startsWith('tpl_')))
          }
        }));

        // Read-back verification from Cloudflare R2 (HeadObject ContentLength + tiny GetObject byte probe)
        const headRes = await this.s3Client.send(new HeadObjectCommand({
          Bucket: this.r2Config.bucketName,
          Key: r2Key
        }));
        if (typeof headRes.ContentLength === 'number' && headRes.ContentLength <= 0) {
          throw new Error(`R2 HeadObject returned 0 bytes for key '${r2Key}'.`);
        }
        const rangeEnd = Math.min(31, Math.max(0, buffer.length - 1));
        const getRes: any = await this.s3Client.send(new GetObjectCommand({
          Bucket: this.r2Config.bucketName,
          Key: r2Key,
          Range: `bytes=0-${rangeEnd}`
        }));
        let readBytesCount = 0;
        if (getRes?.Body?.transformToByteArray) {
          const arr = await getRes.Body.transformToByteArray();
          readBytesCount = arr?.length || 0;
        } else if (getRes?.Body) {
          readBytesCount = Number(getRes.ContentLength || buffer.length);
        }
        if (readBytesCount <= 0) {
          throw new Error(`R2 GetObject read-back returned 0 readable bytes for key '${r2Key}'.`);
        }

        if (isPublic && this.r2Config.publicBaseUrl) {
          const base = this.r2Config.publicBaseUrl.replace(/\/$/, '');
          publicUrl = `${base}/${r2Key}`;
        }
        provider = 'cloudflare_r2';
      } catch (err: any) {
        console.error('[MediaStorage] R2 PutObject/read-back warning:', err.message);
        r2UploadError = err.message;
        provider = 'local';
        storageMonitoringReporter?.('ERROR', `Cloudflare R2 upload or read-back failed on bucket '${this.r2Config.bucketName}'`, {
          source: 'storage_r2',
          errorStage: 'r2_put_object',
          bucket: this.r2Config.bucketName,
          fileId: filename,
          errorMessage: err.message
        });
        // Requirement: Do not silently disguise failed R2 upload as success
        throw new Error(`Cloudflare R2 PutObject/read-back failed on bucket '${this.r2Config.bucketName}': ${err.message}`);
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
   * Resolves short-lived authorized delivery URLs for browser playback and download.
   * Fail-closed: private files require strict ownerUserId match and metadata presence.
   * Never requires R2_PUBLIC_BASE_URL for private media.
   */
  public async getAuthorizedDeliveryBundle(
    fileName: string,
    requestingUserId?: string,
    expiresInSeconds: number = 600
  ): Promise<{
    ok: boolean;
    statusCode: number;
    error?: string;
    url?: string;
    fallbackUrl?: string;
    downloadUrl?: string;
    mimeType?: string;
    sizeBytes?: number;
    provider?: 'local' | 'cloudflare_r2';
    isPublic?: boolean;
    expiresInSeconds?: number;
    expiresAt?: string;
  }> {
    const safeName = path.basename(fileName);
    const meta = await this.getMetadata(safeName);
    if (!meta) {
      return { ok: false, statusCode: 403, error: 'Unauthorized: Media metadata missing or access restricted to owner.' };
    }

    if (!meta.isPublic) {
      if (!meta.ownerUserId || !requestingUserId || meta.ownerUserId !== requestingUserId) {
        return { ok: false, statusCode: 403, error: 'Unauthorized: Access restricted to owner.' };
      }
    }

    const clampedTtl = Math.max(60, Math.min(3600, Math.round(expiresInSeconds || 600)));
    const expiresAt = new Date(Date.now() + clampedTtl * 1000).toISOString();

    // Verify object actually has readable bytes before minting signed links
    let verifiedSizeBytes = meta.sizeBytes || 0;
    let r2Verified = false;
    if (this.s3Client && this.r2Config.bucketName && meta.r2Key) {
      try {
        const head = await this.s3Client.send(
          new HeadObjectCommand({
            Bucket: this.r2Config.bucketName,
            Key: meta.r2Key
          })
        );
        if (typeof head.ContentLength === 'number' && head.ContentLength > 0) {
          verifiedSizeBytes = head.ContentLength;
          r2Verified = true;
        }
      } catch (err: any) {
        console.warn('[MediaStorage] R2 HeadObject check failed for delivery bundle:', err?.message || err);
      }
    }

    const fullPath = path.join(UPLOADS_DIR, safeName);
    const localExists = fs.existsSync(fullPath);
    const localSize = localExists ? fs.statSync(fullPath).size : 0;
    if (!r2Verified && localSize > 0) {
      verifiedSizeBytes = localSize;
    }

    if (!r2Verified && localSize <= 0) {
      return {
        ok: false,
        statusCode: 404,
        error: 'Stored media file bytes missing or empty (0 bytes).'
      };
    }

    const token = createSignedMediaToken(
      safeName,
      clampedTtl,
      !meta.isPublic ? meta.ownerUserId : undefined
    );
    const fallbackUrl = `/api/media/signed/${token}`;
    const downloadUrl = `/api/media/signed/${token}?download=1`;

    let primaryUrl = meta.isPublic ? meta.publicUrl : fallbackUrl;
    if (this.s3Client && this.r2Config.bucketName && meta.r2Key && r2Verified) {
      try {
        const command = new GetObjectCommand({
          Bucket: this.r2Config.bucketName,
          Key: meta.r2Key
        });
        const presigned = await getSignedUrl(this.s3Client, command, { expiresIn: clampedTtl });
        if (presigned) {
          primaryUrl = presigned;
        }
      } catch (err: any) {
        console.error('[MediaStorage] getSignedUrl error:', err.message);
        storageMonitoringReporter?.('ERROR', `R2 signed GET URL generation failed for '${safeName}'`, {
          source: 'storage_r2',
          errorStage: 'r2_signed_url',
          fileId: safeName,
          errorMessage: err.message
        });
      }
    }

    return {
      ok: true,
      statusCode: 200,
      url: primaryUrl,
      fallbackUrl,
      downloadUrl,
      mimeType: meta.mimeType || 'application/octet-stream',
      sizeBytes: verifiedSizeBytes,
      provider: r2Verified ? 'cloudflare_r2' : meta.provider,
      isPublic: Boolean(meta.isPublic),
      expiresInSeconds: clampedTtl,
      expiresAt
    };
  }

  /**
   * Generates a signed presigned URL for private R2 object (or signed same-origin proxy fallback)
   * with strict fail-closed owner validation. Never returns bare /api/media/:fileId for private media.
   */
  public async getPresignedUrl(
    fileName: string,
    requestingUserId?: string,
    expiresInSeconds: number = 600
  ): Promise<string | null> {
    const bundle = await this.getAuthorizedDeliveryBundle(fileName, requestingUserId, expiresInSeconds);
    if (!bundle.ok || !bundle.url) {
      return null;
    }
    return bundle.url;
  }

  /**
   * Verifies that a newly generated private media output is durably saved, readable (>0 bytes),
   * bound to the expected owner in metadata, and resolvable via an authorized signed URL.
   */
  public async verifyStoredMediaDeliverable(
    mediaUrlOrFileId: string,
    expectedOwnerUserId: string
  ): Promise<{
    verified: boolean;
    fileId: string;
    reason?: string;
    sizeBytes?: number;
    mimeType?: string;
    deliveryUrl?: string;
  }> {
    const safeName = extractMediaFileIdFromRef(mediaUrlOrFileId);
    if (!safeName) {
      return { verified: false, fileId: '', reason: 'Empty or unparseable result media reference.' };
    }

    const meta = await this.getMetadata(safeName);
    if (!meta) {
      return { verified: false, fileId: safeName, reason: `Missing authoritative media_metadata for '${safeName}'.` };
    }
    if (meta.isPublic) {
      return { verified: false, fileId: safeName, reason: `Private generation output '${safeName}' was unexpectedly marked public.` };
    }
    if (!expectedOwnerUserId || meta.ownerUserId !== expectedOwnerUserId) {
      return { verified: false, fileId: safeName, reason: `Owner mismatch on stored media '${safeName}'.` };
    }

    let sizeBytes = 0;
    let verifiedRead = false;

    if (this.s3Client && this.r2Config.bucketName && meta.r2Key) {
      try {
        const headRes = await this.s3Client.send(
          new HeadObjectCommand({
            Bucket: this.r2Config.bucketName,
            Key: meta.r2Key
          })
        );
        const len = Number(headRes.ContentLength || 0);
        if (len > 0) {
          const rangeEnd = Math.min(31, len - 1);
          const getRes: any = await this.s3Client.send(
            new GetObjectCommand({
              Bucket: this.r2Config.bucketName,
              Key: meta.r2Key,
              Range: `bytes=0-${rangeEnd}`
            })
          );
          let chunkLen = 0;
          if (getRes?.Body?.transformToByteArray) {
            const bytes = await getRes.Body.transformToByteArray();
            chunkLen = bytes?.length || 0;
          } else if (getRes?.Body) {
            chunkLen = Number(getRes.ContentLength || len);
          }
          if (chunkLen > 0) {
            sizeBytes = len;
            verifiedRead = true;
          }
        }
      } catch (r2Err: any) {
        return {
          verified: false,
          fileId: safeName,
          reason: `R2 verification failed for '${safeName}': ${r2Err?.message || 'unreadable'}`
        };
      }
    } else {
      const fullPath = path.join(UPLOADS_DIR, safeName);
      if (!fs.existsSync(fullPath)) {
        return { verified: false, fileId: safeName, reason: `Stored local file missing for '${safeName}'.` };
      }
      const stat = fs.statSync(fullPath);
      if (stat.size <= 0) {
        return { verified: false, fileId: safeName, reason: `Stored file '${safeName}' is empty (0 bytes).` };
      }
      const fd = fs.openSync(fullPath, 'r');
      try {
        const probeBuf = Buffer.alloc(Math.min(32, stat.size));
        const bytesRead = fs.readSync(fd, probeBuf, 0, probeBuf.length, 0);
        if (bytesRead <= 0) {
          return { verified: false, fileId: safeName, reason: `Stored file '${safeName}' returned 0 readable bytes.` };
        }
        sizeBytes = stat.size;
        verifiedRead = true;
      } finally {
        fs.closeSync(fd);
      }
    }

    if (!verifiedRead || sizeBytes <= 0) {
      return { verified: false, fileId: safeName, reason: `Deliverable read-back failed for '${safeName}'.` };
    }

    const bundle = await this.getAuthorizedDeliveryBundle(safeName, expectedOwnerUserId, 600);
    if (!bundle.ok || !bundle.url || bundle.url === `/api/media/${safeName}`) {
      return {
        verified: false,
        fileId: safeName,
        reason: bundle.error || `Failed to mint signed deliverable URL for '${safeName}'.`
      };
    }

    return {
      verified: true,
      fileId: safeName,
      sizeBytes,
      mimeType: bundle.mimeType || meta.mimeType,
      deliveryUrl: bundle.url
    };
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
      } catch (err: any) {
        storageMonitoringReporter?.('ERROR', `Provider R2 signed URL generation failed for '${safeName}'`, {
          source: 'storage_r2',
          errorStage: 'r2_provider_signed_url',
          fileId: safeName,
          errorMessage: err?.message || 'signed_url_error'
        });
        // Fall back to signed local proxy
      }
    }

    // 2. Generate secure HMAC-signed proxy token for local disk storage
    const token = createSignedMediaToken(safeName, expiresInSeconds, meta && !meta.isPublic ? meta.ownerUserId : undefined);
    const hostBase = (
      process.env.PROD_SERVER_URL ||
      process.env.PUBLIC_APP_URL ||
      process.env.APP_URL ||
      serverBaseUrl ||
      ''
    ).replace(/\/$/, '');
    return hostBase ? `${hostBase}/api/media/signed/${token}` : `/api/media/signed/${token}`;
  }

  /**
   * Streams media directly from authoritative R2 storage or local cache with strict user isolation.
   */
  public async getAuthorizedObjectStream(
    fileName: string,
    requestingUserId?: string,
    range?: string,
    options?: { trustedSignedToken?: boolean }
  ): Promise<{
    body: any;
    mimeType: string;
    contentRange?: string;
    contentLength?: number;
    statusCode?: number;
    isPublic?: boolean;
    error?: string;
  }> {
    const safeName = path.basename(fileName);
    const meta = await this.getMetadata(safeName);
    const privateByPrefix = isPrivateMediaFilename(safeName);

    // Fail-closed ownership enforcement for private metadata or private filename prefixes
    if (meta && !meta.isPublic) {
      if (!options?.trustedSignedToken) {
        if (!meta.ownerUserId || !requestingUserId || requestingUserId !== meta.ownerUserId) {
          return { body: null, mimeType: '', statusCode: 403, error: 'Unauthorized: Access restricted to owner.' };
        }
      } else if (requestingUserId && meta.ownerUserId && requestingUserId !== meta.ownerUserId) {
        return { body: null, mimeType: '', statusCode: 403, error: 'Unauthorized: Signed token owner mismatch.' };
      }
    } else if (!meta && privateByPrefix && !options?.trustedSignedToken) {
      return { body: null, mimeType: '', statusCode: 403, error: 'Unauthorized: Access restricted to owner.' };
    }

    const effectiveIsPublic = Boolean(meta ? meta.isPublic : !privateByPrefix);

    if (this.s3Client && this.r2Config.bucketName) {
      const keysToTry = Array.from(
        new Set(
          [
            meta?.r2Key,
            `media/public/${safeName}`,
            `media/general/${safeName}`,
            requestingUserId ? `media/users/${requestingUserId}/${safeName}` : null
          ].filter(Boolean) as string[]
        )
      );

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
            statusCode: range && getRes.ContentRange ? 206 : 200,
            isPublic: effectiveIsPublic
          };
        } catch (err: any) {
          if (err.name === 'InvalidRange' || err.$metadata?.httpStatusCode === 416) {
            return { body: null, mimeType: '', statusCode: 416, error: 'Requested Range Not Satisfiable' };
          }
          const isNotFound = err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404;
          if (!isNotFound) {
            storageMonitoringReporter?.('ERROR', `R2 GetObject read failed for '${candidateKey}'`, {
              source: 'storage_r2',
              errorStage: 'r2_get_object',
              fileId: safeName,
              errorMessage: err?.message || 'r2_read_error'
            });
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
      const stat = fs.statSync(fullPath);
      const totalSize = stat.size;

      if (range && totalSize > 0) {
        const match = /^bytes=(\d*)-(\d*)$/i.exec(range.trim());
        if (!match || (match[1] === '' && match[2] === '')) {
          return { body: null, mimeType: resolvedMime, statusCode: 416, error: 'Requested Range Not Satisfiable' };
        }
        let start = match[1] ? Number(match[1]) : 0;
        let end = match[2] ? Number(match[2]) : totalSize - 1;
        if (!match[1] && match[2]) {
          // Suffix byte range: last N bytes
          const suffixLength = Number(match[2]);
          start = Math.max(0, totalSize - suffixLength);
          end = totalSize - 1;
        }
        if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= totalSize) {
          return { body: null, mimeType: resolvedMime, statusCode: 416, error: 'Requested Range Not Satisfiable' };
        }
        end = Math.min(end, totalSize - 1);
        const chunkSize = end - start + 1;
        return {
          body: fs.createReadStream(fullPath, { start, end }),
          mimeType: resolvedMime,
          contentRange: `bytes ${start}-${end}/${totalSize}`,
          contentLength: chunkSize,
          statusCode: 206,
          isPublic: effectiveIsPublic
        };
      }

      return {
        body: fs.createReadStream(fullPath),
        mimeType: resolvedMime,
        contentLength: totalSize,
        statusCode: 200,
        isPublic: effectiveIsPublic
      };
    }

    return { body: null, mimeType: '', statusCode: 404, error: 'Media file not found' };
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

    // Fail-closed ownership enforcement for private media
    if (meta && !meta.isPublic) {
      if (!meta.ownerUserId || !requestingUserId || requestingUserId !== meta.ownerUserId) {
        return { filePath: null, error: 'Unauthorized: You do not have permission to access this private media file.' };
      }
    } else if (!meta && isPrivateMediaFilename(safeName)) {
      return { filePath: null, error: 'Unauthorized: You do not have permission to access this private media file.' };
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
    const meta = await this.getMetadata(safeName);
    let deletedAny = false;

    if (this.s3Client && this.r2Config.bucketName && meta?.r2Key) {
      try {
        await this.s3Client.send(new DeleteObjectCommand({
          Bucket: this.r2Config.bucketName,
          Key: meta.r2Key
        }));
        deletedAny = true;
      } catch (err: any) {
        console.error('[MediaStorage] Failed to delete from R2:', err.message);
      }
    }

    const fullPath = path.join(UPLOADS_DIR, safeName);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      deletedAny = true;
    }

    if (this.metadataIndex[safeName]) {
      delete this.metadataIndex[safeName];
      this.saveIndex();
      deletedAny = true;
    }

    if (adminFirestoreDb) {
      try {
        await adminFirestoreDb.collection('media_metadata').doc(safeName).delete();
      } catch (err: any) {
        console.warn('[MediaStorage] Failed to delete Firestore media_metadata:', err?.message || err);
      }
    }

    return deletedAny;
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
 * Creates a tamper-proof, time-limited HMAC-SHA256 signed token for private media access.
 * Supports optional ownerUserId binding (4-part token) while staying backward-compatible with 3-part provider tokens.
 */
export function createSignedMediaToken(
  fileName: string,
  expiresInSeconds: number = 3600,
  ownerUserId?: string
): string {
  const safeName = path.basename(fileName);
  const expiresAt = Math.floor(Date.now() / 1000) + Math.max(60, expiresInSeconds);
  const cleanOwner = typeof ownerUserId === 'string' && ownerUserId.trim() ? ownerUserId.trim() : '';
  const payload = cleanOwner
    ? `${safeName}:${expiresAt}:${Buffer.from(cleanOwner, 'utf-8').toString('base64url')}`
    : `${safeName}:${expiresAt}`;
  const hmac = crypto
    .createHmac('sha256', SIGNED_MEDIA_SECRET)
    .update(payload)
    .digest('hex');
  return Buffer.from(`${payload}:${hmac}`).toString('base64url');
}

/**
 * Verifies a temporary HMAC-SHA256 signed media token.
 */
export function verifySignedMediaToken(token: string): {
  valid: boolean;
  fileName?: string;
  ownerUserId?: string;
  error?: string;
} {
  try {
    if (!token || typeof token !== 'string') {
      return { valid: false, error: 'Missing token' };
    }
    const decoded = Buffer.from(token, 'base64url').toString('utf-8');
    const parts = decoded.split(':');
    let fileName = '';
    let expiresAtStr = '';
    let ownerB64 = '';
    let providedHmac = '';
    let payload = '';

    if (parts.length === 3) {
      [fileName, expiresAtStr, providedHmac] = parts;
      payload = `${fileName}:${expiresAtStr}`;
    } else if (parts.length === 4) {
      [fileName, expiresAtStr, ownerB64, providedHmac] = parts;
      payload = `${fileName}:${expiresAtStr}:${ownerB64}`;
    } else {
      return { valid: false, error: 'Malformed token format' };
    }

    const expiresAt = parseInt(expiresAtStr, 10);
    if (isNaN(expiresAt)) {
      return { valid: false, error: 'Invalid expiry timestamp' };
    }
    const now = Math.floor(Date.now() / 1000);
    if (now > expiresAt) {
      return { valid: false, error: 'Signed media link has expired' };
    }
    const expectedHmac = crypto
      .createHmac('sha256', SIGNED_MEDIA_SECRET)
      .update(payload)
      .digest('hex');

    const providedBuf = Buffer.from(providedHmac, 'hex');
    const expectedBuf = Buffer.from(expectedHmac, 'hex');
    if (
      providedBuf.length !== expectedBuf.length ||
      !crypto.timingSafeEqual(providedBuf, expectedBuf)
    ) {
      return { valid: false, error: 'Invalid token signature' };
    }

    const ownerUserId = ownerB64 ? Buffer.from(ownerB64, 'base64url').toString('utf-8') : undefined;
    return { valid: true, fileName: path.basename(fileName), ownerUserId };
  } catch (err: any) {
    return { valid: false, error: err.message || 'Token verification failed' };
  }
}
