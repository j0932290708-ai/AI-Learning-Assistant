// Read bounded raster headers without decompressing user-controlled image data.
// This is dimension validation, not a substitute for a full image decoder.
export function imageDimensions(bytes, mimeType) {
  if (mimeType === 'image/png') {
    if (bytes.length < 33 || bytes.readUInt32BE(8) !== 13 || bytes.toString('ascii', 12, 16) !== 'IHDR') return null;
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (mimeType === 'image/jpeg') {
    let offset = 2;
    const frames = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
    while (offset < bytes.length) {
      if (bytes[offset++] !== 0xff) return null;
      while (offset < bytes.length && bytes[offset] === 0xff) offset++;
      if (offset >= bytes.length) return null;
      const marker = bytes[offset++];
      if (marker === 0xda || marker === 0xd9) return null;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
      if (offset + 2 > bytes.length) return null;
      const length = bytes.readUInt16BE(offset);
      if (length < 2 || offset + length > bytes.length) return null;
      if (frames.has(marker)) {
        if (length < 8) return null;
        return { width: bytes.readUInt16BE(offset + 5), height: bytes.readUInt16BE(offset + 3) };
      }
      offset += length;
    }
  }
  if (mimeType === 'image/webp') {
    if (bytes.length < 20 || bytes.readUInt32LE(4) + 8 !== bytes.length) return null;
    let offset = 12;
    while (offset + 8 <= bytes.length) {
      const kind = bytes.toString('ascii', offset, offset + 4);
      const length = bytes.readUInt32LE(offset + 4);
      const start = offset + 8;
      if (start + length > bytes.length) return null;
      if (kind === 'VP8X' && length >= 10) {
        if (bytes[start] & 2) return null; // Animated WebP is not a study photo.
        return { width: 1 + bytes.readUIntLE(start + 4, 3), height: 1 + bytes.readUIntLE(start + 7, 3) };
      }
      if (kind === 'VP8 ' && length >= 10 && bytes.subarray(start + 3, start + 6).equals(Buffer.from([0x9d, 0x01, 0x2a]))) {
        return { width: bytes.readUInt16LE(start + 6) & 0x3fff, height: bytes.readUInt16LE(start + 8) & 0x3fff };
      }
      if (kind === 'VP8L' && length >= 5 && bytes[start] === 0x2f) {
        return { width: 1 + (bytes[start + 1] | ((bytes[start + 2] & 0x3f) << 8)),
          height: 1 + ((bytes[start + 2] >> 6) | (bytes[start + 3] << 2) | ((bytes[start + 4] & 0x0f) << 10)) };
      }
      offset = start + length + (length % 2);
    }
  }
  return null;
}

export function hasSafeImageDimensions(bytes, mimeType) {
  const size = imageDimensions(bytes, mimeType);
  return Boolean(size && size.width > 0 && size.height > 0 && size.width <= 10000 && size.height <= 10000
    && size.width * size.height <= 20_000_000);
}
