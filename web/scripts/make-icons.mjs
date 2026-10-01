// Renders the app icons from the shapes below. Run with: npm run icons --workspace web
// The PNGs are committed, so this only needs running when the design changes.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const GREEN = '#047857';
const LIGHT = '#d1fae5';

// A playing card, tilted, with a diamond on it, on the app's green. `inset` shrinks the artwork
// towards the centre: a maskable icon is cropped to a circle or rounded square by the phone, so its
// artwork has to sit inside the middle 80% or it gets cut off.
const svg = ({ rounded, inset }) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${rounded ? 112 : 0}" fill="${GREEN}"/>
  <g transform="translate(256 256) scale(${inset}) translate(-256 -256)">
    <g transform="rotate(-10 256 256)">
      <rect x="146" y="86" width="220" height="320" rx="26" fill="${LIGHT}" opacity="0.55" transform="rotate(16 256 246)"/>
      <rect x="146" y="86" width="220" height="320" rx="26" fill="#ffffff"/>
      <path d="M256 166 L322 246 L256 326 L190 246 Z" fill="${GREEN}"/>
      <circle cx="184" cy="124" r="11" fill="${GREEN}"/>
      <circle cx="328" cy="368" r="11" fill="${GREEN}"/>
    </g>
  </g>
</svg>`;

const icons = [
  { file: 'icon-192.png', size: 192, rounded: true, inset: 1 },
  { file: 'icon-512.png', size: 512, rounded: true, inset: 1 },
  { file: 'icon-maskable-512.png', size: 512, rounded: false, inset: 0.78 },
  // iOS draws its own rounded corners, so this one is a plain square.
  { file: 'apple-touch-icon.png', size: 180, rounded: false, inset: 0.9 },
];

await mkdir(out, { recursive: true });
for (const { file, size, rounded, inset } of icons) {
  await sharp(Buffer.from(svg({ rounded, inset })))
    .resize(size, size)
    .png()
    .toFile(join(out, file));
  console.log(`wrote public/${file}`);
}
await writeFile(join(out, 'favicon.svg'), svg({ rounded: true, inset: 1 }).trim() + '\n');
console.log('wrote public/favicon.svg');
