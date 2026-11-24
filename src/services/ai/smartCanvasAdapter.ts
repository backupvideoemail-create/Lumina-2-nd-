/**
 * Native Server-Side Smart Canvas Processor (@resvg/resvg-js + FFmpeg).
 *
 * Executes all 7 SMART_TEMPLATE workflows deterministically without requiring paid LLM inference:
 * - retro-polaroid-warm (tpl_retro_35mm_kodak): Warm 35mm Kodak film frame, date stamp & soft vignette
 * - story-clean-minimal (tpl_instagram_story_quote): Editorial Instagram 9:16 quote card layout
 * - dark-academia-mood (tpl_dark_academia_library): Moody sepia/parchment academic portrait frame
 * - bali-jungle-glow (tpl_bali_resort_morning): Golden-hour tropical resort luxury frame
 * - synthwave-grid-animation (tpl_cyber_synthwave_horizon): Real 5s 9:16 H.264 MP4 synthwave neon-grid animated reel via FFmpeg
 * - film-strip-carousel (tpl_instagram_aesthetic_polaroid_carousel): Multi-frame Polaroid / 35mm film-strip collage
 * - good-morning-frame (tpl_daily_status_morning): Vibrant daily morning greeting frame with custom caption support
 *
 * Also supports legacy smart workflows (milan-runway, old-money-neutral, paris-bw-grain).
 * Resolves customer uploads cleanly from disk, R2 object stream, data URIs, or signed/HTTP URLs,
 * and persists outputs privately via mediaStorage with strict ownerUserId isolation.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { Resvg } from '@resvg/resvg-js';
import { mediaStorage, extractMediaFileIdFromRef } from '../storage/mediaStorage.ts';
import type { ProviderResult } from '../types.ts';

const execFileAsync = promisify(execFile);

export interface SmartCanvasProcessParams {
  templateId?: string;
  templateTitle: string;
  templateType: 'photo' | 'video';
  workflow: string;
  model?: string;
  inputMediaUrls: string[];
  aspectRatio?: string;
  customPrompt?: string;
  durationSeconds?: number;
  resolution?: '480p' | '720p' | '1080p';
  ownerUserId?: string;
}

interface ResolvedImageAsset {
  dataUri: string;
  mimeType: string;
  buffer: Buffer;
}

function escapeXml(text: string): string {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function normalizeMimeType(raw?: string | null): string {
  const base = String(raw || 'image/jpeg').split(';')[0].trim().toLowerCase();
  if (base === 'image/png' || base === 'image/webp' || base === 'image/jpeg' || base === 'image/gif') {
    return base;
  }
  if (base === 'image/jpg') return 'image/jpeg';
  return 'image/jpeg';
}

function inferCanvasDimensions(aspectRatio?: string, resolution?: '480p' | '720p' | '1080p'): { width: number; height: number } {
  const highRes = resolution === '1080p';
  switch (aspectRatio) {
    case '1:1':
      return highRes ? { width: 1080, height: 1080 } : { width: 900, height: 900 };
    case '4:5':
      return highRes ? { width: 1080, height: 1350 } : { width: 864, height: 1080 };
    case '16:9':
      return highRes ? { width: 1920, height: 1080 } : { width: 1280, height: 720 };
    case '9:16':
    default:
      return highRes ? { width: 1080, height: 1920 } : { width: 720, height: 1280 };
  }
}

async function streamToBuffer(body: any): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);
  if (Buffer.isBuffer(body)) return body;
  if (typeof body.transformToByteArray === 'function') {
    const arr = await body.transformToByteArray();
    return Buffer.from(arr);
  }
  const chunks: Buffer[] = [];
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export class SmartCanvasAdapter {
  readonly providerName = 'smart_template';
  readonly adapterName = 'smartCanvas';

  private async resolveInputImage(input: string, ownerUserId?: string): Promise<ResolvedImageAsset> {
    const trimmed = String(input || '').trim();
    if (!trimmed) {
      throw new Error('SMART_CANVAS_INPUT_MISSING: No customer input image was provided.');
    }

    if (trimmed.startsWith('data:')) {
      const match = trimmed.match(/^data:([^;]+);base64,(.+)$/i);
      if (!match) {
        throw new Error('SMART_CANVAS_INPUT_INVALID: Invalid base64 data URI supplied.');
      }
      const mimeType = normalizeMimeType(match[1]);
      const buffer = Buffer.from(match[2], 'base64');
      return { dataUri: `data:${mimeType};base64,${buffer.toString('base64')}`, mimeType, buffer };
    }

    if (trimmed.startsWith('/api/media/')) {
      const fileId = extractMediaFileIdFromRef(trimmed);
      const isSigned = trimmed.startsWith('/api/media/signed/');
      const diskPath = fileId ? mediaStorage.getFilePath(fileId) : null;
      if (diskPath && fs.existsSync(diskPath)) {
        const buffer = fs.readFileSync(diskPath);
        const mimeType = fileId.toLowerCase().endsWith('.png')
          ? 'image/png'
          : fileId.toLowerCase().endsWith('.webp')
          ? 'image/webp'
          : 'image/jpeg';
        return { dataUri: `data:${mimeType};base64,${buffer.toString('base64')}`, mimeType, buffer };
      }

      const streamRes = await mediaStorage.getAuthorizedObjectStream(fileId, ownerUserId, undefined, {
        trustedSignedToken: isSigned
      });
      if (streamRes.body) {
        const buffer = await streamToBuffer(streamRes.body);
        const mimeType = normalizeMimeType(streamRes.mimeType);
        return { dataUri: `data:${mimeType};base64,${buffer.toString('base64')}`, mimeType, buffer };
      }
      throw new Error(`SMART_CANVAS_INPUT_NOT_FOUND: Input media '${fileId}' could not be loaded from storage.`);
    }

    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const res = await fetch(trimmed);
      if (!res.ok) {
        throw new Error(`SMART_CANVAS_INPUT_FETCH_FAILED: HTTP ${res.status} fetching source image.`);
      }
      const arrayBuf = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);
      const mimeType = normalizeMimeType(res.headers.get('content-type'));
      return { dataUri: `data:${mimeType};base64,${buffer.toString('base64')}`, mimeType, buffer };
    }

    // Raw base64 fallback
    const buffer = Buffer.from(trimmed, 'base64');
    return { dataUri: `data:image/jpeg;base64,${buffer.toString('base64')}`, mimeType: 'image/jpeg', buffer };
  }

  private wrapCaptionLines(rawText: string, maxCharsPerLine: number, maxLines: number): string[] {
    const clean = (rawText || '').replace(/\s+/g, ' ').trim();
    if (!clean) return [];
    const words = clean.split(' ');
    const lines: string[] = [];
    let current = '';
    for (const w of words) {
      if ((current + ' ' + w).trim().length <= maxCharsPerLine) {
        current = (current + ' ' + w).trim();
      } else {
        if (current) lines.push(current);
        current = w.slice(0, maxCharsPerLine);
        if (lines.length >= maxLines) break;
      }
    }
    if (current && lines.length < maxLines) lines.push(current);
    return lines;
  }

  private buildWorkflowSvg(
    workflow: string,
    assets: ResolvedImageAsset[],
    width: number,
    height: number,
    templateTitle: string,
    customPrompt?: string
  ): string {
    const primary = assets[0];
    const secondary = assets[1] || assets[0];
    const tertiary = assets[2] || assets[1] || assets[0];
    const wf = (workflow || '').trim().toLowerCase();
    const caption = (customPrompt || '').trim();
    const now = new Date();
    const dateStamp = `${String(now.getDate()).padStart(2, '0')} ${now
      .toLocaleString('en-US', { month: 'short' })
      .toUpperCase()} '${String(now.getFullYear()).slice(-2)}`;

    // 1. Retro 35mm Kodak Polaroid Warm Frame
    if (wf === 'retro-polaroid-warm') {
      const framePad = Math.round(width * 0.065);
      const photoW = width - framePad * 2;
      const photoH = Math.round(height * 0.72);
      const photoY = Math.round(height * 0.08);
      const note = caption || 'KODAK GOLD 200 · ANALOG MEMORIES';
      const lines = this.wrapCaptionLines(note, 34, 2);
      return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1E1712"/>
      <stop offset="100%" stop-color="#0D0A08"/>
    </linearGradient>
    <linearGradient id="warmTint" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#FFB347" stop-opacity="0.16"/>
      <stop offset="100%" stop-color="#D9531E" stop-opacity="0.22"/>
    </linearGradient>
    <clipPath id="photoClip">
      <rect x="${framePad}" y="${photoY}" width="${photoW}" height="${photoH}" rx="6"/>
    </clipPath>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <rect x="${Math.round(framePad * 0.45)}" y="${Math.round(photoY * 0.55)}" width="${width - Math.round(framePad * 0.9)}" height="${height - Math.round(photoY * 1.1)}" rx="10" fill="#F4EDE0"/>
  <image href="${primary.dataUri}" x="${framePad}" y="${photoY}" width="${photoW}" height="${photoH}" preserveAspectRatio="xMidYMid slice" clip-path="url(#photoClip)"/>
  <rect x="${framePad}" y="${photoY}" width="${photoW}" height="${photoH}" fill="url(#warmTint)" clip-path="url(#photoClip)"/>
  <text x="${width - framePad - 18}" y="${photoY + photoH - 22}" text-anchor="end" font-family="monospace" font-size="${Math.round(width * 0.028)}" font-weight="bold" fill="#FF8C24" letter-spacing="2">${escapeXml(dateStamp)}</text>
  <text x="${Math.round(width / 2)}" y="${photoY + photoH + Math.round(height * 0.07)}" text-anchor="middle" font-family="serif" font-size="${Math.round(width * 0.036)}" font-weight="bold" fill="#2A2018">${escapeXml(lines[0] || '')}</text>
  ${lines[1] ? `<text x="${Math.round(width / 2)}" y="${photoY + photoH + Math.round(height * 0.11)}" text-anchor="middle" font-family="serif" font-size="${Math.round(width * 0.028)}" fill="#5E4C3E">${escapeXml(lines[1])}</text>` : ''}
</svg>`.trim();
    }

    // 2. Instagram Story Clean Minimal Quote
    if (wf === 'story-clean-minimal') {
      const margin = Math.round(width * 0.075);
      const cardW = width - margin * 2;
      const photoH = Math.round(height * 0.58);
      const photoY = Math.round(height * 0.12);
      const quote = caption || 'Quiet mornings, focused mind, timeless frame.';
      const lines = this.wrapCaptionLines(quote, 32, 3);
      return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <clipPath id="storyClip">
      <rect x="${margin}" y="${photoY}" width="${cardW}" height="${photoH}" rx="28"/>
    </clipPath>
  </defs>
  <rect width="${width}" height="${height}" fill="#F7F5F0"/>
  <rect x="${margin}" y="${Math.round(height * 0.06)}" width="${cardW}" height="1.5" fill="#D8D2C7"/>
  <text x="${margin}" y="${Math.round(height * 0.092)}" font-family="sans-serif" font-size="${Math.round(width * 0.024)}" font-weight="bold" fill="#8C8375" letter-spacing="4">EDITORIAL STORY · 01</text>
  <image href="${primary.dataUri}" x="${margin}" y="${photoY}" width="${cardW}" height="${photoH}" preserveAspectRatio="xMidYMid slice" clip-path="url(#storyClip)"/>
  ${lines
    .map(
      (line, idx) =>
        `<text x="${Math.round(width / 2)}" y="${photoY + photoH + Math.round(height * 0.08) + idx * Math.round(height * 0.042)}" text-anchor="middle" font-family="serif" font-size="${Math.round(width * 0.04)}" fill="#1F1D1A">${escapeXml(line)}</text>`
    )
    .join('\n  ')}
  <text x="${Math.round(width / 2)}" y="${height - Math.round(height * 0.055)}" text-anchor="middle" font-family="sans-serif" font-size="${Math.round(width * 0.022)}" fill="#9E9689" letter-spacing="3">AI PRIME STUDIO EDITION</text>
</svg>`.trim();
    }

    // 3. Dark Academia Library Mood
    if (wf === 'dark-academia-mood') {
      const inset = Math.round(width * 0.085);
      const imgW = width - inset * 2;
      const imgH = Math.round(height * 0.69);
      const imgY = Math.round(height * 0.11);
      const motto = caption || 'EX LIBRIS · TIMELESS CHRONICLE';
      return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="acadBg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#19130E"/>
      <stop offset="100%" stop-color="#0C0907"/>
    </linearGradient>
    <linearGradient id="sepiaGlow" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#3D2614" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#120B06" stop-opacity="0.45"/>
    </linearGradient>
    <clipPath id="acadClip">
      <rect x="${inset}" y="${imgY}" width="${imgW}" height="${imgH}" rx="4"/>
    </clipPath>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#acadBg)"/>
  <rect x="${inset - 14}" y="${imgY - 14}" width="${imgW + 28}" height="${imgH + 28}" fill="none" stroke="#9E7B4F" stroke-width="2"/>
  <rect x="${inset - 6}" y="${imgY - 6}" width="${imgW + 12}" height="${imgH + 12}" fill="none" stroke="#5A4328" stroke-width="1"/>
  <image href="${primary.dataUri}" x="${inset}" y="${imgY}" width="${imgW}" height="${imgH}" preserveAspectRatio="xMidYMid slice" clip-path="url(#acadClip)"/>
  <rect x="${inset}" y="${imgY}" width="${imgW}" height="${imgH}" fill="url(#sepiaGlow)" clip-path="url(#acadClip)"/>
  <text x="${Math.round(width / 2)}" y="${Math.round(height * 0.068)}" text-anchor="middle" font-family="serif" font-size="${Math.round(width * 0.026)}" fill="#C49E65" letter-spacing="5">ARCHIVE VOLUME IV</text>
  <text x="${Math.round(width / 2)}" y="${imgY + imgH + Math.round(height * 0.08)}" text-anchor="middle" font-family="serif" font-size="${Math.round(width * 0.036)}" fill="#E5D5BA">${escapeXml(motto.slice(0, 40))}</text>
</svg>`.trim();
    }

    // 4. Bali Resort Jungle Glow
    if (wf === 'bali-jungle-glow') {
      const margin = Math.round(width * 0.055);
      const imgW = width - margin * 2;
      const imgH = Math.round(height * 0.78);
      const imgY = Math.round(height * 0.055);
      const subtitle = caption || 'UBUD GOLDEN HOUR · TROPICAL SANCTUARY';
      return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="baliBg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0E281F"/>
      <stop offset="50%" stop-color="#173D2E"/>
      <stop offset="100%" stop-color="#2B2614"/>
    </linearGradient>
    <linearGradient id="sunWash" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#FFD27D" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="#145A32" stop-opacity="0.16"/>
    </linearGradient>
    <clipPath id="baliClip">
      <rect x="${margin}" y="${imgY}" width="${imgW}" height="${imgH}" rx="28"/>
    </clipPath>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#baliBg)"/>
  <image href="${primary.dataUri}" x="${margin}" y="${imgY}" width="${imgW}" height="${imgH}" preserveAspectRatio="xMidYMid slice" clip-path="url(#baliClip)"/>
  <rect x="${margin}" y="${imgY}" width="${imgW}" height="${imgH}" fill="url(#sunWash)" clip-path="url(#baliClip)"/>
  <rect x="${margin}" y="${imgY}" width="${imgW}" height="${imgH}" rx="28" fill="none" stroke="#D9B467" stroke-width="2.5" stroke-opacity="0.7"/>
  <text x="${Math.round(width / 2)}" y="${imgY + imgH + Math.round(height * 0.068)}" text-anchor="middle" font-family="sans-serif" font-size="${Math.round(width * 0.03)}" font-weight="bold" fill="#F5DFAA" letter-spacing="3">${escapeXml(subtitle.slice(0, 42))}</text>
  <text x="${Math.round(width / 2)}" y="${imgY + imgH + Math.round(height * 0.105)}" text-anchor="middle" font-family="serif" font-size="${Math.round(width * 0.026)}" fill="#98C9A3">GOLDEN HOUR ESCAPE</text>
</svg>`.trim();
    }

    // 5. Film Strip Carousel (1-3 photos laid out on a genuine 35mm sprocket contact sheet)
    if (wf === 'film-strip-carousel') {
      const stripX = Math.round(width * 0.11);
      const stripW = width - stripX * 2;
      const topY = Math.round(height * 0.065);
      const gap = Math.round(height * 0.025);
      const frameH = Math.round((height - topY * 2 - gap * 2 - Math.round(height * 0.06)) / 3);
      const frameX = stripX + Math.round(stripW * 0.09);
      const frameW = stripW - Math.round(stripW * 0.18);
      const frames = [primary, secondary, tertiary];
      const holes: string[] = [];
      for (let y = topY + 20; y < height - topY - 12; y += 36) {
        holes.push(`<rect x="${stripX + 12}" y="${y}" width="18" height="20" rx="3" fill="#171717"/>`);
        holes.push(`<rect x="${stripX + stripW - 30}" y="${y}" width="18" height="20" rx="3" fill="#171717"/>`);
      }
      return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#141312"/>
  <rect x="${stripX}" y="${topY - 18}" width="${stripW}" height="${height - topY * 2 + 12}" rx="8" fill="#070707" stroke="#2F2C28" stroke-width="2"/>
  ${holes.join('\n  ')}
  ${frames
    .map((asset, i) => {
      const y = topY + i * (frameH + gap);
      return `<defs><clipPath id="fClip${i}"><rect x="${frameX}" y="${y}" width="${frameW}" height="${frameH}" rx="4"/></clipPath></defs>
  <image href="${asset.dataUri}" x="${frameX}" y="${y}" width="${frameW}" height="${frameH}" preserveAspectRatio="xMidYMid slice" clip-path="url(#fClip${i})"/>
  <text x="${frameX + 8}" y="${y + frameH - 8}" font-family="monospace" font-size="14" fill="#F59E0B">35MM FRAME 0${i + 1}A</text>`;
    })
    .join('\n  ')}
  <text x="${Math.round(width / 2)}" y="${height - Math.round(height * 0.03)}" text-anchor="middle" font-family="monospace" font-size="${Math.round(width * 0.025)}" fill="#E5C07B" letter-spacing="3">${escapeXml((caption || '35MM CONTACT ROLL · AI PRIME').slice(0, 40))}</text>
</svg>`.trim();
    }

    // 6. Good Morning Frame (Vibrant celebratory daily status card)
    if (wf === 'good-morning-frame') {
      const margin = Math.round(width * 0.065);
      const imgW = width - margin * 2;
      const imgH = Math.round(height * 0.65);
      const imgY = Math.round(height * 0.16);
      const greeting = caption || 'Good Morning · Fresh Energy & Positivity';
      const lines = this.wrapCaptionLines(greeting, 30, 2);
      return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="gmBg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#FFF1C9"/>
      <stop offset="50%" stop-color="#FFD495"/>
      <stop offset="100%" stop-color="#FF9A62"/>
    </linearGradient>
    <clipPath id="gmClip">
      <rect x="${margin}" y="${imgY}" width="${imgW}" height="${imgH}" rx="32"/>
    </clipPath>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#gmBg)"/>
  <text x="${Math.round(width / 2)}" y="${Math.round(height * 0.085)}" text-anchor="middle" font-family="serif" font-size="${Math.round(width * 0.062)}" font-weight="bold" fill="#7A2E0B">Good Morning</text>
  <text x="${Math.round(width / 2)}" y="${Math.round(height * 0.125)}" text-anchor="middle" font-family="sans-serif" font-size="${Math.round(width * 0.024)}" font-weight="bold" fill="#9E481B" letter-spacing="4">HAVE A RADIANT DAY</text>
  <image href="${primary.dataUri}" x="${margin}" y="${imgY}" width="${imgW}" height="${imgH}" preserveAspectRatio="xMidYMid slice" clip-path="url(#gmClip)"/>
  <rect x="${margin}" y="${imgY}" width="${imgW}" height="${imgH}" rx="32" fill="none" stroke="#FFFFFF" stroke-width="5"/>
  <text x="${Math.round(width / 2)}" y="${imgY + imgH + Math.round(height * 0.075)}" text-anchor="middle" font-family="serif" font-size="${Math.round(width * 0.034)}" font-weight="bold" fill="#4E1F08">${escapeXml(lines[0] || '')}</text>
  ${lines[1] ? `<text x="${Math.round(width / 2)}" y="${imgY + imgH + Math.round(height * 0.115)}" text-anchor="middle" font-family="sans-serif" font-size="${Math.round(width * 0.026)}" fill="#6E2E10">${escapeXml(lines[1])}</text>` : ''}
</svg>`.trim();
    }

    // 7. Cyber Synthwave Horizon Frame (used for both still poster & animated FFmpeg video reel)
    if (wf === 'synthwave-grid-animation' || wf === 'cyber-synthwave-horizon') {
      const margin = Math.round(width * 0.065);
      const imgW = width - margin * 2;
      const imgH = Math.round(height * 0.66);
      const imgY = Math.round(height * 0.13);
      const label = caption || 'SYNTHWAVE 1984 · NEON HORIZON';
      return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="synthBg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#120428"/>
      <stop offset="55%" stop-color="#2D0952"/>
      <stop offset="100%" stop-color="#090114"/>
    </linearGradient>
    <linearGradient id="neonOverlay" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#FF00A8" stop-opacity="0.16"/>
      <stop offset="100%" stop-color="#00F0FF" stop-opacity="0.16"/>
    </linearGradient>
    <clipPath id="synthClip">
      <rect x="${margin}" y="${imgY}" width="${imgW}" height="${imgH}" rx="18"/>
    </clipPath>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#synthBg)"/>
  <circle cx="${Math.round(width / 2)}" cy="${imgY}" r="${Math.round(width * 0.28)}" fill="#FF2E93" fill-opacity="0.22"/>
  <image href="${primary.dataUri}" x="${margin}" y="${imgY}" width="${imgW}" height="${imgH}" preserveAspectRatio="xMidYMid slice" clip-path="url(#synthClip)"/>
  <rect x="${margin}" y="${imgY}" width="${imgW}" height="${imgH}" fill="url(#neonOverlay)" clip-path="url(#synthClip)"/>
  <rect x="${margin}" y="${imgY}" width="${imgW}" height="${imgH}" rx="18" fill="none" stroke="#00F0FF" stroke-width="3"/>
  <rect x="${margin + 6}" y="${imgY + 6}" width="${imgW - 12}" height="${imgH - 12}" rx="14" fill="none" stroke="#FF00A8" stroke-width="1.5"/>
  <text x="${Math.round(width / 2)}" y="${Math.round(height * 0.08)}" text-anchor="middle" font-family="monospace" font-size="${Math.round(width * 0.036)}" font-weight="bold" fill="#00F0FF" letter-spacing="4">NEON GRID // V2</text>
  <text x="${Math.round(width / 2)}" y="${imgY + imgH + Math.round(height * 0.08)}" text-anchor="middle" font-family="monospace" font-size="${Math.round(width * 0.03)}" font-weight="bold" fill="#FF6AC1" letter-spacing="2">${escapeXml(label.slice(0, 38))}</text>
</svg>`.trim();
    }

    // 8. Clean Generic Editorial Smart Frame fallback (covers legacy workflows cleanly)
    const margin = Math.round(width * 0.06);
    const imgW = width - margin * 2;
    const imgH = Math.round(height * 0.74);
    const imgY = Math.round(height * 0.09);
    return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <clipPath id="genericClip">
      <rect x="${margin}" y="${imgY}" width="${imgW}" height="${imgH}" rx="20"/>
    </clipPath>
  </defs>
  <rect width="${width}" height="${height}" fill="#121216"/>
  <image href="${primary.dataUri}" x="${margin}" y="${imgY}" width="${imgW}" height="${imgH}" preserveAspectRatio="xMidYMid slice" clip-path="url(#genericClip)"/>
  <rect x="${margin}" y="${imgY}" width="${imgW}" height="${imgH}" rx="20" fill="none" stroke="#D4AF37" stroke-width="2" stroke-opacity="0.75"/>
  <text x="${Math.round(width / 2)}" y="${imgY + imgH + Math.round(height * 0.075)}" text-anchor="middle" font-family="serif" font-size="${Math.round(width * 0.034)}" fill="#F5F3EE">${escapeXml((caption || templateTitle || 'STUDIO EDITION').slice(0, 42))}</text>
</svg>`.trim();
  }

  private async renderPngFromSvg(svg: string): Promise<Buffer> {
    const resvg = new Resvg(svg, {
      fitTo: { mode: 'original' }
    });
    const rendered = resvg.render();
    return Buffer.from(rendered.asPng());
  }

  private async encodeVideoFromPosterPng(pngBuffer: Buffer, width: number, height: number, durationSeconds: number): Promise<Buffer> {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smartcanvas-'));
    const inputPngPath = path.join(tmpDir, 'poster.png');
    const outputMp4Path = path.join(tmpDir, 'output.mp4');
    const safeDuration = Math.max(3, Math.min(15, Math.round(durationSeconds || 5)));
    const fps = 24;
    const totalFrames = safeDuration * fps;

    try {
      fs.writeFileSync(inputPngPath, pngBuffer);
      // Smooth deterministic Ken Burns push-in + subtle synthwave neon grid & scanline overlay via native FFmpeg
      const filterComplex = [
        `[0:v]scale=${width * 2}:${height * 2},zoompan=z='min(zoom+0.0012,1.18)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=${width}x${height}:fps=${fps},format=yuv420p[base]`,
        `[base]drawgrid=w=64:h=64:t=1:c=0x00F0FF@0.12,eq=contrast=1.06:saturation=1.18[vout]`
      ].join(';');

      await execFileAsync('ffmpeg', [
        '-y',
        '-loop', '1',
        '-i', inputPngPath,
        '-filter_complex', filterComplex,
        '-map', '[vout]',
        '-t', String(safeDuration),
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        outputMp4Path
      ], { timeout: 60000 });

      return fs.readFileSync(outputMp4Path);
    } finally {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
    }
  }

  async processSmartTemplate(params: SmartCanvasProcessParams): Promise<ProviderResult> {
    const startTime = Date.now();
    const validInputs = (params.inputMediaUrls || []).map((u) => String(u || '').trim()).filter(Boolean);
    if (validInputs.length === 0) {
      throw new Error('SMART_CANVAS_INPUT_MISSING: Please upload at least one photo to render this Smart Template.');
    }

    const resolvedAssets: ResolvedImageAsset[] = [];
    for (const input of validInputs.slice(0, 3)) {
      resolvedAssets.push(await this.resolveInputImage(input, params.ownerUserId));
    }

    const { width, height } = inferCanvasDimensions(params.aspectRatio, params.resolution);
    const svg = this.buildWorkflowSvg(
      params.workflow,
      resolvedAssets,
      width,
      height,
      params.templateTitle,
      params.customPrompt
    );
    const pngBuffer = await this.renderPngFromSvg(svg);

    const wfLower = (params.workflow || '').trim().toLowerCase();
    const isVideoOutput = params.templateType === 'video' || wfLower === 'synthwave-grid-animation';

    if (isVideoOutput) {
      const mp4Buffer = await this.encodeVideoFromPosterPng(
        pngBuffer,
        width,
        height,
        params.durationSeconds || 5
      );
      const stored = await mediaStorage.saveMedia(
        mp4Buffer,
        'generation',
        `smart_${crypto.randomBytes(3).toString('hex')}.mp4`,
        params.ownerUserId,
        false
      );
      return {
        success: true,
        resultUrl: stored.publicUrl,
        provider: this.providerName,
        adapter: this.adapterName,
        model: params.model || 'smart_canvas_ffmpeg',
        processingTimeMs: Date.now() - startTime
      };
    }

    const stored = await mediaStorage.saveMedia(
      pngBuffer,
      'generation',
      `smart_${crypto.randomBytes(3).toString('hex')}.png`,
      params.ownerUserId,
      false
    );

    return {
      success: true,
      resultUrl: stored.publicUrl,
      provider: this.providerName,
      adapter: this.adapterName,
      model: params.model || 'smart_canvas',
      processingTimeMs: Date.now() - startTime
    };
  }
}

export const smartCanvasAdapter = new SmartCanvasAdapter();
