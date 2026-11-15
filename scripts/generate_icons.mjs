import fs from 'fs';
import path from 'path';
import { Resvg } from '@resvg/resvg-js';

const rootDir = process.cwd();
const iconsDir = path.join(rootDir, 'public', 'icons');
fs.mkdirSync(iconsDir, { recursive: true });

const standardSvg = fs.readFileSync(path.join(iconsDir, 'logo-icon.svg'), 'utf8');

function buildFullBleedSvg({ scaleFactor, translateOffset }) {
  return `<svg viewBox="0 0 512 512" width="512" height="512" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#18171d" />
      <stop offset="60%" stop-color="#0d0d12" />
      <stop offset="100%" stop-color="#08080a" />
    </linearGradient>
    <linearGradient id="topGlassSheen" x1="256" y1="0" x2="256" y2="230" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.14" />
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0" />
    </linearGradient>
    <linearGradient id="aiPrimeGold" x1="4" y1="4" x2="40" y2="40" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#fff8e7" />
      <stop offset="30%" stop-color="#f5d77f" />
      <stop offset="65%" stop-color="#d4af37" />
      <stop offset="100%" stop-color="#966d0c" />
    </linearGradient>
    <linearGradient id="lensRingGrad" x1="10" y1="10" x2="34" y2="34" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.88" />
      <stop offset="50%" stop-color="#d4af37" stop-opacity="0.82" />
      <stop offset="100%" stop-color="#5a4512" stop-opacity="0.95" />
    </linearGradient>
    <radialGradient id="videoPlayCore" cx="45%" cy="45%" r="55%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="35%" stop-color="#fae29c" />
      <stop offset="70%" stop-color="#dfb743" />
      <stop offset="100%" stop-color="#a3760e" />
    </radialGradient>
  </defs>
  <rect x="0" y="0" width="512" height="512" fill="url(#bgGrad)" />
  <rect x="0" y="0" width="512" height="230" fill="url(#topGlassSheen)" />
  <g transform="translate(${translateOffset}, ${translateOffset}) scale(${scaleFactor})">
    <path d="M8 15V11C8 9.34315 9.34315 8 11 8H15" stroke="url(#aiPrimeGold)" stroke-width="2.2" stroke-linecap="round" />
    <path d="M29 8H33C34.6569 8 36 9.34315 36 11V15" stroke="url(#aiPrimeGold)" stroke-width="2.2" stroke-linecap="round" />
    <path d="M36 29V33C36 34.6569 34.6569 36 33 36H29" stroke="url(#aiPrimeGold)" stroke-width="2.2" stroke-linecap="round" />
    <path d="M15 36H11C9.34315 36 8 34.6569 8 33V29" stroke="url(#aiPrimeGold)" stroke-width="2.2" stroke-linecap="round" />
    <circle cx="22" cy="22" r="11.5" stroke="url(#lensRingGrad)" stroke-width="1.2" stroke-dasharray="2 2.5" opacity="0.92" />
    <path d="M18.5 16.5C18.5 15.65 19.45 15.15 20.15 15.62L27.4 20.45C28.05 20.88 28.05 21.85 27.4 22.28L20.15 27.11C19.45 27.58 18.5 27.08 18.5 26.23V16.5Z" fill="url(#videoPlayCore)" />
    <path d="M33 5.5L34.3 9.8L38.6 11.1L34.3 12.4L33 16.7L31.7 12.4L27.4 11.1L31.7 9.8L33 5.5Z" fill="#ffffff" />
    <circle cx="33" cy="11.1" r="1.3" fill="#f5d77f" />
    <circle cx="12" cy="32" r="1.1" fill="#fff5d6" opacity="0.95" />
    <path d="M12 30V34M10 32H14" stroke="#f5d77f" stroke-width="0.8" stroke-linecap="round" opacity="0.85" />
  </g>
</svg>`;
}

function renderPng(svg, width, outName) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: width }
  });
  const rendered = resvg.render();
  const pngBuffer = rendered.asPng();
  const outPath = path.join(iconsDir, outName);
  fs.writeFileSync(outPath, pngBuffer);
  console.log(`Generated ${outName}: ${rendered.width}x${rendered.height} (${pngBuffer.length} bytes)`);
}

// 1. Standard PWA icons (32-bit RGBA matching rounded dark glass badge)
renderPng(standardSvg, 192, 'icon-192.png');
renderPng(standardSvg, 512, 'icon-512.png');

// 2. Google Play Store listing icon: 512x512 PNG, 32-bit RGBA with alpha, <= 1024 KB
renderPng(standardSvg, 512, 'playstore-512.png');

// 3. Maskable PWA icon: 512x512 full-bleed dark obsidian with inner 72% safe zone (368x368 centered => offset 72, scale 368/44=8.3636)
const maskableSvg = buildFullBleedSvg({ scaleFactor: 8.3636, translateOffset: 72 });
renderPng(maskableSvg, 512, 'icon-maskable-512.png');

// 4. Apple Touch icon: 180x180 full-bleed dark obsidian (iOS masks corners automatically; comfortable 82% inner artwork)
const appleSvg = buildFullBleedSvg({ scaleFactor: 9.5454, translateOffset: 46 });
renderPng(appleSvg, 180, 'apple-touch-icon.png');
