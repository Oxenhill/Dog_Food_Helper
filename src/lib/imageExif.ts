/**
 * EXIF/metadata stripping (Phase 5, architecture doc §10 — "strip EXIF/
 * location metadata from uploaded images before storage, since a photo
 * taken at home can carry GPS coordinates without the owner realising").
 *
 * ---------------------------------------------------------------------------
 * DEVIATION LOGGED (per CLAUDE.md's "stop and log, don't guess" rule) — see
 * BUILD_PROGRESS.md for the full note. Summary: there's no image-processing
 * library in this project yet (no `sharp`, no `exifr`/`piexifjs`), and
 * earlier phases (2/3/4) hit repeated npm-install corruption issues in this
 * build sandbox, so adding a new native/binary dependency (`sharp` needs a
 * platform-specific binary) risked repeating that failure mode. Implemented
 * instead as a small, dependency-free, pure-JS metadata stripper:
 *
 *  - JPEG: walks the marker segments and drops APP1 (EXIF/XMP, 0xFFE1) and
 *    APP13 (Photoshop IPTC, 0xFFED) segments, which is where GPS/location
 *    data lives in a JPEG. All other segments (including APP0/JFIF, the
 *    actual image data in SOS) are preserved byte-for-byte.
 *  - PNG: drops ancillary text/metadata chunks (tEXt, iTXt, zTXt, eXIf —
 *    the last being where PNG can carry EXIF as of the 2017 PNG spec
 *    extension) while preserving all critical/image chunks.
 *  - WebP/other formats: passed through unchanged, with a console warning —
 *    not silently claimed as "stripped" when it wasn't. WebP EXIF lives in
 *    an optional 'EXIF' RIFF chunk; a targeted stripper for it can be added
 *    if owner photos in that format become common enough to matter.
 *
 * Needs owner input: if a stronger guarantee than this is required (e.g. for
 * formats beyond JPEG/PNG, or HEIC from iPhones — which this does NOT
 * handle), swap in `sharp` (`.withMetadata(false)` on read) or `exifr`'s
 * removal helpers in a proper (non-sandboxed) install environment.
 * ---------------------------------------------------------------------------
 */

const JPEG_SOI = 0xffd8;
const JPEG_APP1 = 0xffe1; // EXIF / XMP
const JPEG_APP13 = 0xffed; // Photoshop IPTC (can carry location-adjacent metadata)
const JPEG_SOS = 0xffda; // Start of Scan — image data follows, stop parsing markers

function stripExifFromJpeg(buffer: Buffer): Buffer {
  if (buffer.length < 4 || buffer.readUInt16BE(0) !== JPEG_SOI) {
    // Not a well-formed JPEG we can safely parse — return unchanged rather
    // than risk corrupting the file with a naive byte-slice.
    return buffer;
  }

  const segments: Buffer[] = [buffer.subarray(0, 2)]; // keep SOI marker
  let offset = 2;

  while (offset < buffer.length - 1) {
    const marker = buffer.readUInt16BE(offset);

    // Markers without a length field (standalone) — just copy and continue.
    if (marker < 0xffc0 || marker === 0xff01 || (marker >= 0xffd0 && marker <= 0xffd9)) {
      segments.push(buffer.subarray(offset, offset + 2));
      offset += 2;
      if (marker === JPEG_SOS) break;
      continue;
    }

    if (offset + 4 > buffer.length) break; // malformed — bail out safely
    const length = buffer.readUInt16BE(offset + 2);
    const segmentEnd = offset + 2 + length;

    if (marker === JPEG_APP1 || marker === JPEG_APP13) {
      // Drop this segment entirely (EXIF/XMP/IPTC — where GPS lives).
      offset = segmentEnd;
      continue;
    }

    segments.push(buffer.subarray(offset, segmentEnd));
    offset = segmentEnd;

    if (marker === JPEG_SOS) break;
  }

  // Append the remaining compressed image data (after the last parsed marker).
  segments.push(buffer.subarray(offset));

  return Buffer.concat(segments);
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_METADATA_CHUNK_TYPES = new Set(['tEXt', 'iTXt', 'zTXt', 'eXIf']);

function stripMetadataFromPng(buffer: Buffer): Buffer {
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return buffer;
  }

  const chunks: Buffer[] = [buffer.subarray(0, 8)]; // keep PNG signature
  let offset = 8;

  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const chunkEnd = offset + 8 + length + 4; // length + type + data + CRC

    if (chunkEnd > buffer.length) break; // malformed — bail out safely

    if (!PNG_METADATA_CHUNK_TYPES.has(type)) {
      chunks.push(buffer.subarray(offset, chunkEnd));
    }

    offset = chunkEnd;
    if (type === 'IEND') break;
  }

  return Buffer.concat(chunks);
}

/**
 * Strip EXIF/location metadata from an uploaded image buffer before it's
 * ever written to storage. Never throws — falls back to returning the
 * original buffer (with a warning) for formats it doesn't know how to
 * safely parse, rather than corrupting an upload.
 */
export function stripImageMetadata(buffer: Buffer, mimeType: string): Buffer {
  try {
    if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
      return stripExifFromJpeg(buffer);
    }
    if (mimeType === 'image/png') {
      return stripMetadataFromPng(buffer);
    }
    console.warn(
      `[imageExif] No metadata stripper implemented for mimeType "${mimeType}" — ` +
        'storing the image unchanged. See src/lib/imageExif.ts header comment.'
    );
    return buffer;
  } catch (err) {
    console.error('[imageExif] Metadata stripping failed, storing original buffer unchanged', err);
    return buffer;
  }
}
