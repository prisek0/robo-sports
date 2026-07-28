/* ============================================================
   Generate the icon set — favicon.ico, apple-touch-icon.png, og-image.png.

       node tools/make-icons.js

   These are the only binary files in the repo, and they exist for other
   people's software: browsers too old for the inline SVG favicon, and link
   unfurlers (iMessage, Slack, WhatsApp) which need a real fetchable URL and
   cannot use a data URI. The games never reference them and still run fine
   off file:// without them.

   So that "everything is drawn in code" stays literally true, nothing here
   is hand-drawn: the orb is the same maths shared/art.js uses on canvas —
   a radial brass gradient, a meridian band and a specular highlight —
   evaluated per pixel, with 3x3 supersampling for the edges. PNG is written
   by hand (zlib is in Node's standard library) and ICO is a header wrapped
   around a PNG, so there are no dependencies to install.
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');

/* ---------- PNG writing --------------------------------------
   A PNG is a signature plus IHDR/IDAT/IEND chunks; each chunk is
   length + type + data + CRC32. The pixel data is raw RGBA scanlines,
   each prefixed with a filter byte, deflated as one stream. */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/** @param {Buffer} rgba  w*h*4 bytes */
function encodePNG(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;            // bit depth
  ihdr[9] = 6;            // colour type: RGBA
  ihdr[10] = 0;           // deflate
  ihdr[11] = 0;           // adaptive filtering
  ihdr[12] = 0;           // no interlace

  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;                                  // filter: none
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* An .ico may carry a PNG payload verbatim, which keeps this to a header. */
function encapsulateICO(png, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);      // reserved
  header.writeUInt16LE(1, 2);      // type: icon
  header.writeUInt16LE(1, 4);      // one image
  const entry = Buffer.alloc(16);
  entry[0] = size >= 256 ? 0 : size;   // 0 means 256
  entry[1] = size >= 256 ? 0 : size;
  entry[2] = 0;                        // palette
  entry[3] = 0;                        // reserved
  entry.writeUInt16LE(1, 4);           // colour planes
  entry.writeUInt16LE(32, 6);          // bits per pixel
  entry.writeUInt32BE(0, 8);
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(6 + 16, 12);     // offset of the payload
  return Buffer.concat([header, entry, png]);
}

/* ---------- the palette, from shared/art.js and basket/game.js ---------- */
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const mix = (a, b, t) => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t)
];

// the orb's radial gradient stops, as drawBall() uses them
const ORB = [
  [0.00, [0xff, 0xee, 0xb8]],
  [0.35, [0xd9, 0xb0, 0x4a]],
  [0.72, [0x8a, 0x64, 0x18]],
  [1.00, [0x3d, 0x2a, 0x08]]
];
const RIM = [0x24, 0x17, 0x05];

function orbColour(t) {
  t = clamp(t, 0, 1);
  for (let i = 1; i < ORB.length; i++) {
    if (t <= ORB[i][0]) {
      const [t0, c0] = ORB[i - 1], [t1, c1] = ORB[i];
      return mix(c0, c1, (t - t0) / (t1 - t0));
    }
  }
  return ORB[ORB.length - 1][1];
}

/**
 * Sample the orb at a point in unit space: the centre is (0,0) and the ball
 * has radius 1. Returns [r,g,b,a]. Anti-aliasing is left to the caller's
 * supersampling, so this is a hard-edged sample.
 */
function sampleOrb(x, y) {
  const d = Math.hypot(x, y);
  if (d > 1) return null;                       // outside the ball

  // outline
  if (d > 0.925) return [RIM[0], RIM[1], RIM[2], 255];

  // body: gradient measured from the light source, up and to the left
  const g = Math.hypot(x + 0.34, y + 0.38) / 1.34;
  let c = orbColour(g);

  // Meridians — drawBall() *strokes* two ellipses across the orb, so these
  // are outlines. Filling the region between them instead reads as a flat
  // stripe painted on a disc rather than a band wrapping a sphere.
  if (d < 0.90) {
    const seam = (e, lw, strength) => {
      const t = Math.abs(e - 1) / lw;
      if (t < 1) c = mix(c, [0x28, 0x1a, 0x06], strength * (1 - t * t));
    };
    seam(Math.hypot(x, y / 0.34), 0.10, 0.45);   // equator
    seam(Math.hypot(x / 0.34, y), 0.10, 0.22);   // and the faint polar seam
  }

  // specular highlight
  const hx = (x + 0.36) / 0.30, hy = (y + 0.40) / 0.20;
  const h = Math.hypot(hx, hy);
  if (h < 1) c = mix(c, [0xff, 0xf8, 0xe0], 0.5 * (1 - h) ** 0.7);

  return [c[0], c[1], c[2], 255];
}

/* ---------- renderers ---------------------------------------- */

/** Square icon: the orb on transparency, so it sits on any tab colour. */
function renderIcon(size, pad) {
  const S = 3;                                   // supersampling factor
  const buf = Buffer.alloc(size * size * 4);
  const r = size * (0.5 - pad);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let R = 0, G = 0, B = 0, A = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const x = (px + (sx + 0.5) / S - size / 2) / r;
          const y = (py + (sy + 0.5) / S - size / 2) / r;
          const c = sampleOrb(x, y);
          if (c) { R += c[0]; G += c[1]; B += c[2]; A += c[3]; }
        }
      }
      const n = S * S, i = (py * size + px) * 4;
      if (A > 0) {
        buf[i] = Math.round(R / (A / 255));      // un-premultiply
        buf[i + 1] = Math.round(G / (A / 255));
        buf[i + 2] = Math.round(B / (A / 255));
        buf[i + 3] = Math.round(A / n);
      }
    }
  }
  return { buf, png: encodePNG(size, size, buf) };
}

/**
 * Link-preview card. No text: unfurlers render the page <title> next to the
 * image themselves, so lettering here would only duplicate it — and drawing
 * type without a font file is exactly the sort of thing this project avoids.
 */
function renderOG(w, h) {
  const S = 2;
  const buf = Buffer.alloc(w * h * 4);
  const r = h * 0.31;
  const cx = w / 2, cy = h / 2;

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      // backdrop: the warm sodium haze the courts are lit with
      const vy = py / h, vx = px / w;
      const vign = 1 - 0.55 * Math.hypot(vx - 0.5, vy - 0.5) * 1.4;
      let R = Math.round((26 + 30 * (1 - vy)) * vign);
      let G = Math.round((20 + 20 * (1 - vy)) * vign);
      let B = Math.round((16 + 12 * (1 - vy)) * vign);
      const glow = Math.max(0, 1 - Math.hypot((px - cx) / (r * 2.6), (py - cy) / (r * 2.6)));
      R += Math.round(70 * glow * glow);
      G += Math.round(42 * glow * glow);
      B += Math.round(14 * glow * glow);

      let oR = 0, oG = 0, oB = 0, oA = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const c = sampleOrb((px + (sx + 0.5) / S - cx) / r, (py + (sy + 0.5) / S - cy) / r);
          if (c) { oR += c[0]; oG += c[1]; oB += c[2]; oA += 1; }
        }
      }
      const n = S * S, a = oA / n, i = (py * w + px) * 4;
      if (a > 0) {
        R = Math.round(R * (1 - a) + (oR / oA) * a);
        G = Math.round(G * (1 - a) + (oG / oA) * a);
        B = Math.round(B * (1 - a) + (oB / oA) * a);
      }
      buf[i] = clamp(R, 0, 255);
      buf[i + 1] = clamp(G, 0, 255);
      buf[i + 2] = clamp(B, 0, 255);
      buf[i + 3] = 255;
    }
  }
  return encodePNG(w, h, buf);
}

/* ---------- write ------------------------------------------- */
const out = [];
const icon32 = renderIcon(32, 0.03);
fs.writeFileSync(path.join(ROOT, 'favicon.ico'), encapsulateICO(icon32.png, 32));
out.push(['favicon.ico', encapsulateICO(icon32.png, 32).length]);

const touch = renderIcon(180, 0.06);
fs.writeFileSync(path.join(ROOT, 'apple-touch-icon.png'), touch.png);
out.push(['apple-touch-icon.png', touch.png.length]);

const og = renderOG(1200, 630);
fs.writeFileSync(path.join(ROOT, 'og-image.png'), og);
out.push(['og-image.png', og.length]);

for (const [name, bytes] of out) {
  console.log(`${name.padEnd(22)} ${(bytes / 1024).toFixed(1)} KB`);
}
