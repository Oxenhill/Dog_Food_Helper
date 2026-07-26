/**
 * Generates the favicon by cropping the circular mark out of the Bowl lockup.
 *
 * Why this exists
 * ---------------
 * The supplied logo (`public/bowl-logo.png`) is a square lockup: the mark, the
 * "Bowl" wordmark, the tagline and "by Dog Smart". It cannot be used directly
 * as a favicon:
 *   - Next does not resize file-convention icons, so `app/icon.png` would ship
 *     a 1.35 MB, 1254px image on every page load.
 *   - At 32px the wordmark and tagline are illegible, and most of the square is
 *     whitespace, so the tab icon would read as a smudge.
 *
 * So the mark alone is cropped out and box-downsampled to a real icon-sized
 * PNG. `next/og` would have been the idiomatic way to do this, but the version
 * of `@vercel/og` bundled with Next 14.2 throws `TypeError: Invalid URL` from
 * `fileURLToPath` on Windows, which breaks the build. Node built-ins only here,
 * so there is no new dependency and no platform surprise.
 *
 * The crop box was MEASURED off the asset, not eyeballed: scanning for the
 * ring's green put it at x 379-869, y 162-667, centred on (624, 415) in the
 * 1254px source. A 512px square centred there frames the ring with a few
 * pixels of margin on every side.
 *
 * Run: node scripts/make-icon.mjs
 * Re-run this if the logo asset changes. If a dedicated square, mark-only
 * export ever lands, point SOURCE at it and set CROP to the full image.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync, deflateSync } from 'node:zlib';

const SOURCE = 'public/bowl-logo.png';
const OUTPUT = 'src/app/icon.png';
/** Measured bounds of the circular mark, in source pixels. */
const CROP = { x: 368, y: 159, side: 512 };
const OUT_SIZE = 64;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// ---------------------------------------------------------------------------
// CRC32 (PNG chunks carry one; Node has no built-in)
// ---------------------------------------------------------------------------
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ---------------------------------------------------------------------------
// Decode: RGB, 8-bit, non-interlaced (verified: colour type 2, bit depth 8)
// ---------------------------------------------------------------------------
function decodeRgbPng(buf) {
  if (!buf.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('not a PNG');

  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const bitDepth = buf[24];
  const colourType = buf[25];
  const interlace = buf[28];
  if (bitDepth !== 8 || colourType !== 2 || interlace !== 0) {
    throw new Error(
      `unsupported PNG: bitDepth=${bitDepth} colourType=${colourType} interlace=${interlace} — this script handles 8-bit RGB only`
    );
  }

  // IDAT can be split across many chunks; they concatenate into one zlib stream.
  const parts = [];
  let off = 8;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    if (type === 'IDAT') parts.push(buf.subarray(off + 8, off + 8 + len));
    if (type === 'IEND') break;
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(parts));

  const bpp = 3;
  const stride = width * bpp;
  const pixels = Buffer.alloc(height * stride);

  // Undo per-scanline filtering.
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const out = pixels.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null;

    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? out[i - bpp] : 0; // left
      const b = prev ? prev[i] : 0; // above
      const c = prev && i >= bpp ? prev[i - bpp] : 0; // above-left
      let value;
      switch (filter) {
        case 0: value = line[i]; break;
        case 1: value = line[i] + a; break;
        case 2: value = line[i] + b; break;
        case 3: value = line[i] + ((a + b) >> 1); break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          value = line[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default: throw new Error(`unknown PNG filter ${filter} on row ${y}`);
      }
      out[i] = value & 0xff;
    }
  }

  return { width, height, pixels, stride };
}

// ---------------------------------------------------------------------------
// Crop + box downsample
// ---------------------------------------------------------------------------
function cropResize(src, crop, outSize) {
  const out = Buffer.alloc(outSize * outSize * 3);
  const scale = crop.side / outSize;

  for (let oy = 0; oy < outSize; oy++) {
    for (let ox = 0; ox < outSize; ox++) {
      // Average every source pixel falling in this output cell — a box filter,
      // which avoids the aliasing a nearest-neighbour pick would produce on
      // photographic detail like the dog's fur.
      const x0 = Math.floor(crop.x + ox * scale);
      const x1 = Math.max(x0 + 1, Math.floor(crop.x + (ox + 1) * scale));
      const y0 = Math.floor(crop.y + oy * scale);
      const y1 = Math.max(y0 + 1, Math.floor(crop.y + (oy + 1) * scale));

      let r = 0, g = 0, b = 0, n = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const i = sy * src.stride + sx * 3;
          r += src.pixels[i];
          g += src.pixels[i + 1];
          b += src.pixels[i + 2];
          n++;
        }
      }
      const o = (oy * outSize + ox) * 3;
      out[o] = Math.round(r / n);
      out[o + 1] = Math.round(g / n);
      out[o + 2] = Math.round(b / n);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Encode: RGB, 8-bit, filter 0
// ---------------------------------------------------------------------------
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([len, typeAndData, crc]);
}

function encodeRgbPng(pixels, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: RGB
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  const stride = size * 3;
  const rawWithFilters = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    rawWithFilters[y * (stride + 1)] = 0; // filter: None
    pixels.copy(rawWithFilters, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(rawWithFilters, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const src = decodeRgbPng(readFileSync(SOURCE));
console.log(`source: ${SOURCE} ${src.width}x${src.height}`);
const resized = cropResize(src, CROP, OUT_SIZE);
const png = encodeRgbPng(resized, OUT_SIZE);
writeFileSync(OUTPUT, png);
console.log(
  `wrote ${OUTPUT} ${OUT_SIZE}x${OUT_SIZE} (${png.length} bytes) from crop x=${CROP.x} y=${CROP.y} side=${CROP.side}`
);
