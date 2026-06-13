/**
 * Generates the app icons from the painted "The Pantry" wordmark.
 * Master = white square, black Yellowtail brush script as a stacked
 * two-line lockup ("The" above "Pantry"), tilted a few degrees so it
 * reads as hand-painted. Rasterised to the four PNG sizes the manifest
 * and apple-touch-icon links expect.
 *
 * Run: node scripts/generate-icons.mjs
 * Deps: @resvg/resvg-js (npm install @resvg/resvg-js — node_modules is gitignored)
 * The Yellowtail TTF (OFL) is downloaded on first run; it is gitignored too.
 */

import { Resvg } from '@resvg/resvg-js';
import { writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, '..', 'public');
const fontPath = join(here, 'Yellowtail-Regular.ttf');

const SIZES = [180, 192, 256, 512];

// The default User-Agent gets a plain .ttf back from the Fonts CSS API.
async function ensureFont() {
  if (existsSync(fontPath)) return;
  const css = await (await fetch('https://fonts.googleapis.com/css?family=Yellowtail')).text();
  const ttfUrl = (css.match(/https:\/\/[^)]+\.ttf/) || [])[0];
  if (!ttfUrl) throw new Error('Could not resolve Yellowtail TTF from Fonts CSS');
  const res = await fetch(ttfUrl);
  if (!res.ok) throw new Error(`Could not download Yellowtail: ${res.status}`);
  writeFileSync(fontPath, Buffer.from(await res.arrayBuffer()));
  console.log('Downloaded Yellowtail-Regular.ttf');
}

// 1024 master canvas (scaled to each output size via width/height); tuned so
// the wordmark sits centred with safe padding (iOS rounds the corners, so
// nothing important goes near the edges).
function masterSvg(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="#ffffff"/>
  <g transform="rotate(-4 512 512)" fill="#111111" font-family="Yellowtail">
    <text x="512" y="430" font-size="208" text-anchor="middle">The</text>
    <text x="512" y="712" font-size="296" text-anchor="middle">Pantry</text>
  </g>
</svg>`;
}

async function main() {
  await ensureFont();
  for (const size of SIZES) {
    const resvg = new Resvg(masterSvg(size), {
      font: { fontFiles: [fontPath], defaultFontFamily: 'Yellowtail', loadSystemFonts: false }
    });
    const png = resvg.render().asPng();
    const out = join(publicDir, `mp-touch-${size}.png`);
    writeFileSync(out, png);
    console.log(`Wrote ${out} (${png.length} bytes)`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
