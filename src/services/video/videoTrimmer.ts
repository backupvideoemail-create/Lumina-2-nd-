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

const execAsync = promisify(exec);
const TEMP_DIR = path.resolve(process.cwd(), '.data', 'temp_trim');

export interface VideoTrimResult {
  trimmedFilePath: string;
  originalDurationSeconds: number;
  trimmedDurationSeconds: number;
  billableDurationSeconds: number;
}

export class VideoTrimmerService {
  constructor() {
    if (!fs.existsSync(TEMP_DIR)) {
      fs.mkdirSync(TEMP_DIR, { recursive: true });
    }
  }

  /**
   * Probes video duration using ffprobe.
   */
  async probeDuration(videoPath: string): Promise<number> {
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file not found at: ${videoPath}`);
    }

    try {
      const { stdout } = await execAsync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`
      );
      const parsed = parseFloat(stdout.trim());
      if (isNaN(parsed) || parsed <= 0) {
        throw new Error('Could not parse valid video duration.');
      }
      return parsed;
    } catch (err: any) {
      throw new Error(`FFprobe failed to inspect video: ${err.message}`);
    }
  }

  /**
   * Physically trims video using ffmpeg between 4 and 15 seconds.
   */
  async trimVideo(inputPathOrBuffer: string | Buffer, targetSeconds: number): Promise<VideoTrimResult> {
    let sourcePath = '';
    let shouldCleanupSource = false;

    if (Buffer.isBuffer(inputPathOrBuffer)) {
      sourcePath = path.join(TEMP_DIR, `src_${Date.now()}_${crypto.randomBytes(3).toString('hex')}.mp4`);
      fs.writeFileSync(sourcePath, inputPathOrBuffer);
      shouldCleanupSource = true;
    } else if (typeof inputPathOrBuffer === 'string') {
      if (inputPathOrBuffer.startsWith('data:')) {
        const matches = inputPathOrBuffer.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        const b64Data = matches ? matches[2] : inputPathOrBuffer.replace(/^data:.*?;base64,/, '');
        sourcePath = path.join(TEMP_DIR, `src_${Date.now()}_${crypto.randomBytes(3).toString('hex')}.mp4`);
        fs.writeFileSync(sourcePath, Buffer.from(b64Data, 'base64'));
        shouldCleanupSource = true;
      } else if (fs.existsSync(inputPathOrBuffer)) {
        sourcePath = inputPathOrBuffer;
      } else {
        throw new Error(`Video file does not exist: ${inputPathOrBuffer}`);
      }
    }

    try {
      // 1. Validate original duration
      const originalDuration = await this.probeDuration(sourcePath);
      if (originalDuration < 3.8) {
        throw new Error(`Uploaded video duration is ${originalDuration.toFixed(1)}s. Minimum allowed duration is 4.0 seconds.`);
      }

      // 2. Clamp target duration strictly between 4 and 15 seconds
      const clampedTarget = Math.max(4, Math.min(15, Math.min(originalDuration, targetSeconds)));

      // 3. Physically trim video with FFmpeg
      const outFileName = `trim_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.mp4`;
      const outputPath = path.join(TEMP_DIR, outFileName);

      const ffmpegCmd = `ffmpeg -y -ss 0 -i "${sourcePath}" -t ${clampedTarget} -c:v libx264 -preset veryfast -crf 22 -c:a aac -b:a 128k -avoid_negative_ts 1 -movflags +faststart "${outputPath}"`;
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
