// Generates the PWA / iOS home-screen icons as PNGs with no dependencies.
// Run: npm run icons
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [14, 15, 18];
const FG = [184, 243, 74];

// Dumbbell made of rectangles, in a 0..1 coordinate space.
function shapes(scale) {
  const c = 0.5;
  const s = (v) => c + (v - c) * scale;
  const rect = (x0, y0, x1, y1) => ({ x0: s(x0), y0: s(y0), x1: s(x1), y1: s(y1) });
  return [
    rect(0.3, 0.465, 0.7, 0.535), // bar
    rect(0.2, 0.3, 0.29, 0.7), // inner plates
    rect(0.71, 0.3, 0.8, 0.7),
    rect(0.12, 0.37, 0.19, 0.63), // outer plates
    rect(0.81, 0.37, 0.88, 0.63),
  ];
}

function crcTable() {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
}
const CRC = crcTable();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size, scale) {
  const rects = shapes(scale);
  const SS = 4; // supersampling for smooth edges
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let hits = 0;
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) {
          const u = (x + (sx + 0.5) / SS) / size;
          const v = (y + (sy + 0.5) / SS) / size;
          if (rects.some((r) => u >= r.x0 && u <= r.x1 && v >= r.y0 && v <= r.y1)) hits++;
        }
      const a = hits / (SS * SS);
      const o = y * (size * 3 + 1) + 1 + x * 3;
      for (let i = 0; i < 3; i++) raw[o + i] = Math.round(BG[i] * (1 - a) + FG[i] * a);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

writeFileSync('public/apple-touch-icon.png', png(180, 1));
writeFileSync('public/icon-192.png', png(192, 1));
writeFileSync('public/icon-512.png', png(512, 1));
writeFileSync('public/icon-512-maskable.png', png(512, 0.75));

const r = shapes(1);
const svgRects = r
  .map((q) => `<rect x="${q.x0 * 64}" y="${q.y0 * 64}" width="${(q.x1 - q.x0) * 64}" height="${(q.y1 - q.y0) * 64}"/>`)
  .join('');
writeFileSync(
  'public/favicon.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="rgb(${BG})"/><g fill="rgb(${FG})">${svgRects}</g></svg>\n`,
);
console.log('icons written to public/');
