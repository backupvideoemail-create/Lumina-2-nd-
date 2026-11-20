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

async function readStreamToBuffer(body: any, maxBytes = MAX_REMOTE_VIDEO_BYTES): Promise<Buffer> {
  if (!body) throw new Error('Empty media stream body.');
  if (Buffer.isBuffer(body)) return body;
  if (typeof body.transformToByteArray === 'function') {
    const arr = await body.transformToByteArray();
    return Buffer.from(arr);
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
  for await (const chunk of nodeStream) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > maxBytes) {
      throw new Error(`Remote source video exceeds maximum supported size (${Math.round(maxBytes / (1024 * 1024))}MB).`);
    }
    chunks.push(buf);
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
   * /api/media/signed/:token, or remote http(s):// URL into a readable local file path.
   */
  private async resolveSourceToTempPath(
    inputPathOrBuffer: string | Buffer,
    options?: { ownerUserId?: string }
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

    // Extract internal /api/media/signed/:token or /api/media/:fileId even if wrapped in full origin URL
    let apiMediaPath = trimmedInput;
    if (/^https?:\/\//i.test(trimmedInput)) {
      try {
        const parsed = new URL(trimmedInput);
        if (parsed.pathname.startsWith('/api/media/')) {
          apiMediaPath = parsed.pathname;
        }
      } catch {
        // Treat as regular URL below
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
      const res = await fetch(trimmedInput, { signal: AbortSignal.timeout(30000) });
      if (!res.ok) {
        throw new Error(`Failed to fetch remote source video (HTTP ${res.status}).`);
      }
      const contentLen = Number(res.headers.get('content-length') || '0');
      if (contentLen > MAX_REMOTE_VIDEO_BYTES) {
        throw new Error('Remote source video exceeds maximum supported size (150MB).');
      }
      const arrayBuf = await res.arrayBuffer();
      const buf = Buffer.from(arrayBuf);
      if (buf.length === 0) {
        throw new Error('Remote source video returned empty payload.');
      }
      if (buf.length > MAX_REMOTE_VIDEO_BYTES) {
        throw new Error('Remote source video exceeds maximum supported size (150MB).');
      }
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
