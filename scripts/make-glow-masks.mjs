// Builds an alpha mask per card image (opaque = coloured background, transparent = device mockups)
// by region-growing inward from the image border across smoothly changing colour.
// Usage: node scripts/make-glow-masks.mjs
import sharp from 'sharp';
import fs from 'node:fs';

const W = 320, H = 180, STEP = 14, FAR = 150;
const only = process.argv.slice(2); // e.g. 01 02 03 (the featured home cards)
const files = fs.readdirSync('assets/mockups').filter((f) => /^mockup-\d+\.png$/.test(f) && (!only.length || only.some((n) => f.includes(n))));

for (const f of files) {
  const { data } = await sharp('assets/mockups/' + f).resize(W, H).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = (i) => [data[i * 3], data[i * 3 + 1], data[i * 3 + 2]];
  const d = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
  const edge = [];
  for (let x = 0; x < W; x++) edge.push(x, (H - 1) * W + x);
  for (let y = 0; y < H; y++) edge.push(y * W, y * W + W - 1);
  const med = [0, 1, 2].map((c) => edge.map((i) => data[i * 3 + c]).sort((a, b) => a - b)[edge.length >> 1]);
  const inside = new Uint8Array(W * H);
  const q = [];
  for (const i of edge) if (d(px(i), med) <= FAR && !inside[i]) { inside[i] = 1; q.push(i); }
  while (q.length) {
    const i = q.pop(), x = i % W, y = (i / W) | 0, p = px(i);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (inside[j]) continue;
      const pj = px(j);
      if (d(p, pj) <= STEP && d(pj, med) <= FAR) { inside[j] = 1; q.push(j); }
    }
  }
  // Alpha mask, then feather so the light fades out near mockup edges.
  const raw = Buffer.alloc(W * H * 4, 255);
  for (let i = 0; i < W * H; i++) raw[i * 4 + 3] = inside[i] ? 255 : 0;
  await sharp(raw, { raw: { width: W, height: H, channels: 4 } }).blur(2.5).png({ compressionLevel: 9 }).toFile(`public/glow/${f.replace('mockup', 'mask')}`);
  console.log(f, Math.round((inside.reduce((a, b) => a + b, 0) / (W * H)) * 100) + '% background');
}
