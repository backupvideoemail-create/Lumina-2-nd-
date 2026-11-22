/**
 * Production Video Trimmer & Validator Service.
 * 
 * Uses system FFmpeg & FFprobe to physically trim videos:
 * - Validates input video duration (rejects < 4.0 seconds)
 * - Physically trims source video to user-selected duration (4 - 15 seconds)
 * - Verifies output duration with FFprobe to ensure provider input duration matches billing
 * - Produces actual trimmed MP4 file for Higgsfield Genjutsu input
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dns from 'dns/promises';
import net from 'net';
import { exec } from 'child_process';
import { promisify } from 'util';
import { Readable } from 'stream';
import { mediaStorage, verifySignedMediaToken } from '../storage/mediaStorage.ts';

const execAsync = promisify(exec);
const TEMP_DIR = path.resolve(process.cwd(), '.data', 'temp_trim');
const UPLOADS_DIR = path.resolve(process.cwd(), '.data', 'uploads');
const MAX_REMOTE_VIDEO_BYTES = 150 * 1024 * 1024;

export interface VideoTrimResult {
  trimmedFilePath: string;
  originalDurationSeconds: number;
  trimmedDurationSeconds: number;
  billableDurationSeconds: number;
}

export interface VideoNormalizationResult {
  buffer: Buffer;
  transcoded: boolean;
  originalCodec: string;
}

export function isPrivateOrReservedIp(ipRaw: string): boolean {
  const clean = String(ipRaw || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!clean) return true;
  const zoneIdx = clean.indexOf('%');
  const ip = zoneIdx !== -1 ? clean.slice(0, zoneIdx) : clean;

  if (ip.startsWith('::ffff:')) {
    const mappedV4 = ip.slice('::ffff:'.length);
    if (net.isIPv4(mappedV4)) {
      return isPrivateOrReservedIp(mappedV4);
    }
  }

  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
    const [a, b] = parts;
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local + GCP/AWS metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
    if (a === 192 && b === 0 && (parts[2] === 0 || parts[2] === 2)) return true;
    if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
    if (a >= 224) return true; // multicast / reserved
    return false;
  }

  if (net.isIPv6(ip)) {
    if (ip === '::' || ip === '::1') return true; // unspecified / loopback
    if (ip.startsWith('fc') || ip.startsWith('fd')) return true; // unique local fc00::/7
    if (ip.startsWith('fe8') || ip.startsWith('fe9') || ip.startsWith('fea') || ip.startsWith('feb')) {
      return true; // link-local fe80::/10
    }
    if (ip.startsWith('ff')) return true; // multicast
    return false;
  }

  return true;
}

function getTrustedStudioAppHosts(extraHosts?: string[]): Set<string> {
  const hosts = new Set<string>([
    'ai-prime-studio.ai.studio',
    'ai-prime-studio-photo-video.ai.studio'
  ]);
  for (const envUrl of [process.env.PUBLIC_APP_URL, process.env.APP_URL, process.env.PROD_SERVER_URL]) {
    if (envUrl && envUrl.trim()) {
      try {
        hosts.add(new URL(envUrl.trim()).hostname.toLowerCase());
      } catch {}
    }
  }
  for (const h of extraHosts || []) {
    if (h && h.trim()) hosts.add(h.trim().toLowerCase());
  }
  return hosts;
}

function isTrustedStudioOrigin(parsedUrl: URL, extraHosts?: string[]): boolean {
  if (parsedUrl.protocol !== 'https:') return false;
  const host = parsedUrl.hostname.toLowerCase();
  if (getTrustedStudioAppHosts(extraHosts).has(host)) return true;
  if (host.endsWith('.run.app') || host.endsWith('.ai.studio')) return true;
  return false;
}

function normalizeR2AccountOrigin(): string | null {
  const rawAcc = (process.env.R2_ACCOUNT_ID || '').trim();
  if (!rawAcc) return null;
  if (rawAcc.startsWith('https://')) {
    try {
      return new URL(rawAcc).origin.toLowerCase();
    } catch {
      return null;
    }
  }
  if (/^[a-z0-9-]+$/i.test(rawAcc)) {
    return `https://${rawAcc.toLowerCase()}.r2.cloudflarestorage.com`;
  }
  return null;
}

function extractOwnR2BucketObjectKey(parsedUrl: URL): string | null {
  const bucket = (process.env.R2_BUCKET_NAME || '').trim();
  const accountOrigin = normalizeR2AccountOrigin();
  if (!bucket || !accountOrigin) return null;
  const host = parsedUrl.hostname.toLowerCase();
  const expectedHost = new URL(accountOrigin).hostname.toLowerCase();
  if (host === expectedHost) {
    const cleanPath = parsedUrl.pathname.replace(/^\/+/, '');
    if (cleanPath.startsWith(`${bucket}/`)) {
      return cleanPath.slice(bucket.length + 1) || null;
    }
  }
  if (host === `${bucket.toLowerCase()}.${expectedHost}`) {
    return parsedUrl.pathname.replace(/^\/+/, '') || null;
  }
  return null;
}

export async function validateRemoteVideoUrl(
  rawUrl: string,
  options?: {
    strictR2Only?: boolean;
    dnsLookup?: (hostname: string) => Promise<Array<{ address: string }>>;
  }
): Promise<{
  allowed: boolean;
  reason?: string;
  parsedUrl?: URL;
  ownR2ObjectKey?: string;
}> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { allowed: false, reason: 'Invalid remote video URL syntax.' };
  }

  if (parsed.protocol !== 'https:') {
    return { allowed: false, reason: 'Remote video URL must use HTTPS.' };
  }
  if (parsed.username || parsed.password) {
    return { allowed: false, reason: 'Remote video URL must not contain embedded credentials.' };
  }
  if (parsed.port && parsed.port !== '443') {
    return { allowed: false, reason: 'Remote video URL must use standard HTTPS port 443.' };
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    return { allowed: false, reason: 'Blocked private or local hostname in remote video URL.' };
  }
  if (net.isIP(hostname) !== 0) {
    return { allowed: false, reason: 'Direct IP addresses are not permitted in remote video URLs.' };
  }

  const strictR2Only = options?.strictR2Only !== false;
  const ownR2Key = extractOwnR2BucketObjectKey(parsed);

  if (strictR2Only) {
    const r2PublicBase = (process.env.R2_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
    let matchesConfiguredR2Public = false;
    if (r2PublicBase) {
      try {
        const baseParsed = new URL(r2PublicBase);
        if (baseParsed.protocol === 'https:' && parsed.origin.toLowerCase() === baseParsed.origin.toLowerCase()) {
          const basePathPrefix = baseParsed.pathname.replace(/\/+$/, '');
          matchesConfiguredR2Public =
            !basePathPrefix ||
            parsed.pathname === basePathPrefix ||
            parsed.pathname.startsWith(`${basePathPrefix}/`);
        }
      } catch {}
    }

    if (!matchesConfiguredR2Public && !ownR2Key) {
      return {
        allowed: false,
        reason:
          'SECURITY_POLICY: Only internal /api/media/* storage paths and configured Cloudflare R2 URLs are permitted for video processing.'
      };
    }
  }

  // DNS resolution SSRF defense (blocks DNS rebinding / split-horizon private or metadata IPs)
  const lookupFn =
    options?.dnsLookup ||
    ((host: string) => dns.lookup(host, { all: true }));
  let records: Array<{ address: string }>;
  try {
    records = await lookupFn(hostname);
  } catch {
    return { allowed: false, reason: 'Failed to resolve remote video hostname via DNS.' };
  }
  if (!records || records.length === 0) {
    return { allowed: false, reason: 'Remote video hostname resolved to zero IP addresses.' };
  }
  for (const rec of records) {
    if (isPrivateOrReservedIp(rec.address)) {
      return {
        allowed: false,
        reason: `SECURITY_BLOCKED_SSRF: Remote video host resolved to private or reserved IP address.`
      };
    }
  }

  return {
    allowed: true,
    parsedUrl: parsed,
    ownR2ObjectKey: ownR2Key || undefined
  };
}

function isAllowedVideoContentType(contentTypeHeader: string | null): boolean {
  if (!contentTypeHeader) return true; // Some signed/R2 responses omit Content-Type; FFprobe validates container below
  const mime = contentTypeHeader.split(';')[0].trim().toLowerCase();
  if (!mime) return true;
  if (mime.startsWith('video/')) return true;
  if (mime === 'application/octet-stream' || mime === 'binary/octet-stream') return true;
  return false;
}

export async function safeFetchAllowedVideoBuffer(
  rawUrl: string,
  options?: {
    strictR2Only?: boolean;
    maxBytes?: number;
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
    dnsLookup?: (hostname: string) => Promise<Array<{ address: string }>>;
  }
): Promise<Buffer> {
  const validation = await validateRemoteVideoUrl(rawUrl, {
    strictR2Only: options?.strictR2Only ?? true,
    dnsLookup: options?.dnsLookup
  });
  if (!validation.allowed) {
    throw new Error(validation.reason || 'Remote video URL rejected by security policy.');
  }

  const maxBytes = options?.maxBytes ?? MAX_REMOTE_VIDEO_BYTES;
  const fetchFn = options?.fetchImpl || fetch;

  const res = await fetchFn(rawUrl.trim(), {
    redirect: 'error',
    signal: AbortSignal.timeout(options?.timeoutMs ?? 30000)
  });

  if (res.status >= 300 && res.status < 400) {
    throw new Error(`SECURITY_BLOCKED_REDIRECT: HTTP redirects are not permitted for remote video URLs (HTTP ${res.status}).`);
  }
  if (!res.ok) {
    throw new Error(`Failed to fetch remote source video (HTTP ${res.status}).`);
  }

  const contentType = res.headers.get('content-type');
  if (!isAllowedVideoContentType(contentType)) {
    throw new Error(`SECURITY_INVALID_MIME: Unsupported remote media Content-Type '${contentType}'.`);
  }

  const contentLen = Number(res.headers.get('content-length') || '0');
  if (contentLen > maxBytes) {
    throw new Error(`Remote source video exceeds maximum supported size (${Math.round(maxBytes / (1024 * 1024))}MB).`);
  }

  const buf = await readStreamToBuffer(res.body, maxBytes);
  if (buf.length === 0) {
    throw new Error('Remote source video returned empty payload.');
  }
  if (buf.length > maxBytes) {
    throw new Error(`Remote source video exceeds maximum supported size (${Math.round(maxBytes / (1024 * 1024))}MB).`);
  }
  return buf;
}

async function readStreamToBuffer(body: any, maxBytes = MAX_REMOTE_VIDEO_BYTES): Promise<Buffer> {
  if (!body) throw new Error('Empty media stream body.');
  if (Buffer.isBuffer(body)) {
    if (body.length > maxBytes) {
      throw new Error(`Remote source video exceeds maximum supported size (${Math.round(maxBytes / (1024 * 1024))}MB).`);
    }
    return body;
  }
  if (typeof body.transformToByteArray === 'function' && typeof body.getReader !== 'function' && typeof body.pipe !== 'function') {
    const arr = await body.transformToByteArray();
    const buf = Buffer.from(arr);
    if (buf.length > maxBytes) {
      throw new Error(`Remote source video exceeds maximum supported size (${Math.round(maxBytes / (1024 * 1024))}MB).`);
    }
    return buf;
  }
  const nodeStream: Readable =
    typeof body.pipe === 'function'
      ? body
      : typeof body.getReader === 'function' && typeof Readable.fromWeb === 'function'
      ? Readable.fromWeb(body)
      : (() => {
          throw new Error('Unsupported stream body type');
        })();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for await (const chunk of nodeStream) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buf.length;
      if (total > maxBytes) {
        if (typeof (nodeStream as any).destroy === 'function') {
          (nodeStream as any).destroy();
        }
        throw new Error(`Remote source video exceeds maximum supported size (${Math.round(maxBytes / (1024 * 1024))}MB).`);
      }
      chunks.push(buf);
    }
  } catch (err) {
    if (typeof (nodeStream as any).destroy === 'function') {
      (nodeStream as any).destroy();
    }
    throw err;
  }
  return Buffer.concat(chunks);
}

export class VideoTrimmerService {
  constructor() {
    if (!fs.existsSync(TEMP_DIR)) {
      fs.mkdirSync(TEMP_DIR, { recursive: true });
    }
  }

  /**
   * Resolves a Buffer, Base64 Data URL, local file path, internal /api/media/... path,
   * /api/media/signed/:token, or verified Cloudflare R2 HTTPS URL into a readable local file path.
   */
  private async resolveSourceToTempPath(
    inputPathOrBuffer: string | Buffer,
    options?: { ownerUserId?: string; trustedAppHosts?: string[] }
  ): Promise<{ sourcePath: string; shouldCleanupSource: boolean }> {
    if (Buffer.isBuffer(inputPathOrBuffer)) {
      const sourcePath = path.join(TEMP_DIR, `src_${Date.now()}_${crypto.randomBytes(3).toString('hex')}.mp4`);
      fs.writeFileSync(sourcePath, inputPathOrBuffer);
      return { sourcePath, shouldCleanupSource: true };
    }

    if (typeof inputPathOrBuffer !== 'string' || !inputPathOrBuffer.trim()) {
      throw new Error('Missing video input source.');
    }

    const trimmedInput = inputPathOrBuffer.trim();

    if (trimmedInput.startsWith('data:')) {
      const matches = trimmedInput.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      const b64Data = matches ? matches[2] : trimmedInput.replace(/^data:.*?;base64,/, '');
      const sourcePath = path.join(TEMP_DIR, `src_${Date.now()}_${crypto.randomBytes(3).toString('hex')}.mp4`);
      fs.writeFileSync(sourcePath, Buffer.from(b64Data, 'base64'));
      return { sourcePath, shouldCleanupSource: true };
    }

    if (fs.existsSync(trimmedInput)) {
      return { sourcePath: trimmedInput, shouldCleanupSource: false };
    }

    // Extract internal /api/media/signed/:token or /api/media/:fileId ONLY if bare path or trusted studio origin
    let apiMediaPath = trimmedInput;
    if (/^https?:\/\//i.test(trimmedInput)) {
      try {
        const parsed = new URL(trimmedInput);
        if (parsed.pathname.startsWith('/api/media/') && isTrustedStudioOrigin(parsed, options?.trustedAppHosts)) {
          apiMediaPath = parsed.pathname;
        }
      } catch {
        // Handled by strict URL validator below
      }
    }

    if (apiMediaPath.startsWith('/api/media/signed/')) {
      const token = apiMediaPath.replace('/api/media/signed/', '').split('?')[0];
      const verification = verifySignedMediaToken(token);
      if (!verification.valid || !verification.fileName) {
        throw new Error(verification.error || 'Signed media URL is invalid or expired.');
      }
      const fileId = path.basename(verification.fileName);
      const localUpload = path.join(UPLOADS_DIR, fileId);
      if (fs.existsSync(localUpload)) {
        return { sourcePath: localUpload, shouldCleanupSource: false };
      }
      const streamRes = await mediaStorage.getAuthorizedObjectStream(fileId, undefined);
      if (streamRes.error || !streamRes.body) {
        throw new Error(streamRes.error || `Failed to retrieve signed media '${fileId}' from storage.`);
      }
      const buf = await readStreamToBuffer(streamRes.body);
      if (buf.length === 0) throw new Error(`Retrieved media '${fileId}' is empty.`);
      const sourcePath = path.join(TEMP_DIR, `src_${Date.now()}_${crypto.randomBytes(3).toString('hex')}.mp4`);
      fs.writeFileSync(sourcePath, buf);
      return { sourcePath, shouldCleanupSource: true };
    }

    if (apiMediaPath.startsWith('/api/media/')) {
      const fileId = path.basename(apiMediaPath.split('?')[0]);
      const meta = await mediaStorage.getMetadata(fileId);
      if (meta && !meta.isPublic && meta.ownerUserId && options?.ownerUserId !== meta.ownerUserId) {
        throw new Error('Unauthorized: Private video source belongs to another user.');
      }
      const localUpload = path.join(UPLOADS_DIR, fileId);
      if (fs.existsSync(localUpload)) {
        return { sourcePath: localUpload, shouldCleanupSource: false };
      }
      const streamRes = await mediaStorage.getAuthorizedObjectStream(fileId, options?.ownerUserId);
      if (streamRes.error || !streamRes.body) {
        throw new Error(streamRes.error || `Failed to retrieve media '${fileId}' from storage.`);
      }
      const buf = await readStreamToBuffer(streamRes.body);
      if (buf.length === 0) throw new Error(`Retrieved media '${fileId}' is empty.`);
      const sourcePath = path.join(TEMP_DIR, `src_${Date.now()}_${crypto.randomBytes(3).toString('hex')}.mp4`);
      fs.writeFileSync(sourcePath, buf);
      return { sourcePath, shouldCleanupSource: true };
    }

    if (/^https?:\/\//i.test(trimmedInput)) {
      const validation = await validateRemoteVideoUrl(trimmedInput, { strictR2Only: true });
      if (!validation.allowed) {
        throw new Error(validation.reason || 'Remote video URL rejected.');
      }

      // If URL points directly to our own R2 bucket S3 endpoint and R2_PUBLIC_BASE_URL is unset, try authorized R2 object read first
      if (validation.ownR2ObjectKey) {
        const fileId = path.basename(validation.ownR2ObjectKey);
        const streamRes = await mediaStorage.getAuthorizedObjectStream(fileId, options?.ownerUserId);
        if (!streamRes.error && streamRes.body) {
          const r2Buf = await readStreamToBuffer(streamRes.body);
          if (r2Buf.length > 0) {
            const sourcePath = path.join(TEMP_DIR, `src_${Date.now()}_${crypto.randomBytes(3).toString('hex')}.mp4`);
            fs.writeFileSync(sourcePath, r2Buf);
            return { sourcePath, shouldCleanupSource: true };
          }
        }
      }

      const buf = await safeFetchAllowedVideoBuffer(trimmedInput, { strictR2Only: true });
      const sourcePath = path.join(TEMP_DIR, `src_${Date.now()}_${crypto.randomBytes(3).toString('hex')}.mp4`);
      fs.writeFileSync(sourcePath, buf);
      return { sourcePath, shouldCleanupSource: true };
    }

    throw new Error(`Video file does not exist: ${trimmedInput}`);
  }

  /**
   * Probes video duration using ffprobe (supports local files, /api/media paths, signed URLs, and remote HTTP(S) URLs).
   */
  async probeDuration(videoPathOrUrl: string, options?: { ownerUserId?: string }): Promise<number> {
    const { sourcePath, shouldCleanupSource } = await this.resolveSourceToTempPath(videoPathOrUrl, options);

    try {
      const { stdout } = await execAsync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${sourcePath}"`
      );
      const parsed = parseFloat(stdout.trim());
      if (isNaN(parsed) || parsed <= 0) {
        throw new Error('Could not parse valid video duration.');
      }
      return parsed;
    } catch (err: any) {
      throw new Error(`FFprobe failed to inspect video: ${err.message}`);
    } finally {
      if (shouldCleanupSource && fs.existsSync(sourcePath)) {
        try {
          fs.unlinkSync(sourcePath);
        } catch {}
      }
    }
  }

  /**
   * Probes primary video stream codec and pixel format.
   */
  async probeVideoCodec(videoPath: string): Promise<{ codec: string; pixFmt: string }> {
    const { stdout } = await execAsync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,pix_fmt -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`
    );
    const lines = stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    return {
      codec: (lines[0] || 'unknown').toLowerCase(),
      pixFmt: (lines[1] || 'unknown').toLowerCase()
    };
  }

  /**
   * Normalizes future administrative video uploads (e.g. HEVC/H.265 -> H.264 yuv420p +faststart)
   * so browsers/Android WebViews can decode previews reliably without touching existing R2 assets.
   */
  async normalizeVideoBufferForBrowser(inputBuffer: Buffer): Promise<VideoNormalizationResult> {
    const srcPath = path.join(TEMP_DIR, `norm_src_${Date.now()}_${crypto.randomBytes(3).toString('hex')}.mp4`);
    const outPath = path.join(TEMP_DIR, `norm_out_${Date.now()}_${crypto.randomBytes(3).toString('hex')}.mp4`);
    try {
      fs.writeFileSync(srcPath, inputBuffer);
      const { codec, pixFmt } = await this.probeVideoCodec(srcPath);
      const isBrowserStandardH264 = codec === 'h264' && pixFmt === 'yuv420p';
      if (isBrowserStandardH264) {
        return { buffer: inputBuffer, transcoded: false, originalCodec: codec };
      }
      await execAsync(
        `ffmpeg -y -i "${srcPath}" -c:v libx264 -preset veryfast -crf 22 -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart "${outPath}"`
      );
      if (!fs.existsSync(outPath)) {
        return { buffer: inputBuffer, transcoded: false, originalCodec: codec };
      }
      const normalized = fs.readFileSync(outPath);
      return {
        buffer: normalized.length > 0 ? normalized : inputBuffer,
        transcoded: normalized.length > 0,
        originalCodec: codec
      };
    } catch (err: any) {
      console.warn('[VideoNormalization Note]: Keeping original buffer after check/transcode notice:', err?.message || err);
      return { buffer: inputBuffer, transcoded: false, originalCodec: 'unknown' };
    } finally {
      for (const p of [srcPath, outPath]) {
        if (fs.existsSync(p)) {
          try {
            fs.unlinkSync(p);
          } catch {}
        }
      }
    }
  }

  /**
   * Physically prepares/trims video using ffmpeg up to targetSeconds (4 - 15 seconds).
   */
  async trimVideo(
    inputPathOrBuffer: string | Buffer,
    targetSeconds: number = 15,
    options?: { ownerUserId?: string }
  ): Promise<VideoTrimResult> {
    const { sourcePath, shouldCleanupSource } = await this.resolveSourceToTempPath(inputPathOrBuffer, options);

    try {
      // 1. Validate original duration
      const originalDuration = await this.probeDuration(sourcePath);
      if (originalDuration < 3.8) {
        throw new Error(`Uploaded video duration is ${originalDuration.toFixed(1)}s. Minimum allowed duration is 4.0 seconds.`);
      }

      // 2. Clamp target duration strictly between 4 and 15 seconds (never exceeding originalDuration)
      const clampedTarget = Math.max(4, Math.min(15, Math.min(originalDuration, targetSeconds)));

      // 3. Physically trim video with FFmpeg (universal H.264 + yuv420p + faststart)
      const outFileName = `trim_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.mp4`;
      const outputPath = path.join(TEMP_DIR, outFileName);

      const ffmpegCmd = `ffmpeg -y -ss 0 -i "${sourcePath}" -t ${clampedTarget} -c:v libx264 -preset veryfast -crf 22 -pix_fmt yuv420p -c:a aac -b:a 128k -avoid_negative_ts 1 -movflags +faststart "${outputPath}"`;
      await execAsync(ffmpegCmd);

      if (!fs.existsSync(outputPath)) {
        throw new Error('FFmpeg completed but output trimmed file was not generated.');
      }

      // 4. Measure actual trimmed file duration
      const actualDuration = await this.probeDuration(outputPath);
      const billableDuration = Math.max(4, Math.min(15, Math.ceil(actualDuration)));

      return {
        trimmedFilePath: outputPath,
        originalDurationSeconds: Number(originalDuration.toFixed(2)),
        trimmedDurationSeconds: Number(actualDuration.toFixed(2)),
        billableDurationSeconds: billableDuration
      };
    } finally {
      if (shouldCleanupSource && fs.existsSync(sourcePath)) {
        try {
          fs.unlinkSync(sourcePath);
        } catch {
          // Ignored
        }
      }
    }
  }
}

export const videoTrimmer = new VideoTrimmerService();
