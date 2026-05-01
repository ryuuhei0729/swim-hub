/**
 * OG Image Generator for SwimHub
 * Generates a 1200x630 PNG for Open Graph / Twitter Card
 * Usage: node scripts/generate-og-image.mjs
 * Requires: sharp (available in monorepo root node_modules)
 */

import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// resolve sharp from swim-hub workspace root
const require = createRequire(import.meta.url);
const sharpPath = path.resolve(__dirname, "../../../node_modules/sharp");
const sharp = require(sharpPath);

const OUTPUT_PATH = path.resolve(__dirname, "../public/og-image.png");

const WIDTH = 1200;
const HEIGHT = 630;

// SVG ベースのデザイン: SwimHub ブランドカラー (#0a1a36, #1f5aa8, #fbfaf6)
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
  <defs>
    <!-- Background gradient -->
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0a1a36;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#1a2f54;stop-opacity:1" />
    </linearGradient>
    <!-- Accent glow -->
    <radialGradient id="glow" cx="75%" cy="40%" r="50%">
      <stop offset="0%" style="stop-color:#86aaff;stop-opacity:0.18" />
      <stop offset="100%" style="stop-color:#86aaff;stop-opacity:0" />
    </radialGradient>
  </defs>

  <!-- Background -->
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)" />
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#glow)" />

  <!-- Subtle grid lines -->
  <line x1="0" y1="1" x2="${WIDTH}" y2="1" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
  <line x1="0" y1="${HEIGHT - 1}" x2="${WIDTH}" y2="${HEIGHT - 1}" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>

  <!-- Left accent bar -->
  <rect x="64" y="80" width="4" height="60" rx="2" fill="#1f5aa8" />

  <!-- Logo area: "SwimHub" wordmark -->
  <text
    x="88"
    y="128"
    font-family="Georgia, 'Times New Roman', serif"
    font-weight="bold"
    font-size="52"
    fill="#ffffff"
    letter-spacing="-1"
  >SwimHub</text>

  <!-- Category label -->
  <text
    x="88"
    y="168"
    font-family="'Courier New', Courier, monospace"
    font-size="13"
    fill="rgba(134,170,255,0.85)"
    letter-spacing="3"
  >水泳選手のための記録プラットフォーム</text>

  <!-- Divider -->
  <line x1="64" y1="210" x2="${WIDTH - 64}" y2="210" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>

  <!-- Main catch copy - line 1 -->
  <text
    x="64"
    y="310"
    font-family="Georgia, 'Hiragino Kaku Gothic Pro', 'Yu Gothic', sans-serif"
    font-weight="bold"
    font-size="80"
    fill="#ffffff"
    letter-spacing="-2"
  >水泳の記録を、</text>

  <!-- Main catch copy - line 2 -->
  <text
    x="64"
    y="408"
    font-family="Georgia, 'Hiragino Kaku Gothic Pro', 'Yu Gothic', sans-serif"
    font-weight="bold"
    font-size="80"
    fill="#ffffff"
    letter-spacing="-2"
  >一生分残す。</text>

  <!-- Bottom: URL -->
  <text
    x="${WIDTH - 64}"
    y="${HEIGHT - 48}"
    font-family="'Courier New', Courier, monospace"
    font-size="18"
    fill="rgba(255,255,255,0.50)"
    text-anchor="end"
    letter-spacing="1"
  >swim-hub.app</text>

  <!-- Bottom accent dots -->
  <circle cx="64" cy="${HEIGHT - 45}" r="4" fill="#1f5aa8" />
  <circle cx="82" cy="${HEIGHT - 45}" r="4" fill="rgba(31,90,168,0.5)" />
  <circle cx="100" cy="${HEIGHT - 45}" r="4" fill="rgba(31,90,168,0.25)" />
</svg>
`.trim();

async function generate() {
  await sharp(Buffer.from(svg))
    .resize(WIDTH, HEIGHT)
    .png({ compressionLevel: 9 })
    .toFile(OUTPUT_PATH);

  console.log(`Generated: ${OUTPUT_PATH} (${WIDTH}x${HEIGHT})`);
}

generate().catch((err) => {
  console.error("Failed to generate og-image:", err);
  process.exit(1);
});
