import assert from 'node:assert/strict';
import { test } from 'node:test';
import { imageDimensions, hasSafeImageDimensions } from '../../src/services/imageDimensions.js';

// Header fixtures exercise metadata parsing; the parser intentionally does not decode pixels.
function webp(kind, payload) {
  const bytes = Buffer.alloc(20 + payload.length + (payload.length % 2));
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WEBP', 8);
  bytes.write(kind, 12); bytes.writeUInt32LE(payload.length, 16); payload.copy(bytes, 20);
  return bytes;
}

test('reads baseline and progressive JPEG dimensions past metadata segments', () => {
  for (const marker of [0xc0, 0xc2]) {
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0,
      0xff, marker, 0, 8, 8, 3, 0, 4, 0, 0]);
    assert.deepEqual(imageDimensions(bytes, 'image/jpeg'), { width: 1024, height: 768 });
    assert.equal(hasSafeImageDimensions(bytes, 'image/jpeg'), true);
    assert.equal(imageDimensions(bytes.subarray(0, -1), 'image/jpeg'), null);
  }
  assert.equal(imageDimensions(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]), 'image/jpeg'), null);
  assert.equal(imageDimensions(Buffer.from([0xff, 0xd8, 0xff]), 'image/jpeg'), null);
});

test('reads lossy, lossless and extended WebP dimensions and rejects animation', () => {
  const lossy = Buffer.from([0, 0, 0, 0x9d, 1, 0x2a, 0, 4, 0, 3]);
  assert.deepEqual(imageDimensions(webp('VP8 ', lossy), 'image/webp'), { width: 1024, height: 768 });
  const width = 1200, height = 800;
  const lossless = Buffer.alloc(5); lossless[0] = 0x2f;
  lossless.writeUInt32LE((width - 1) | ((height - 1) << 14), 1);
  assert.deepEqual(imageDimensions(webp('VP8L', lossless), 'image/webp'), { width, height });
  const extended = Buffer.alloc(10); extended.writeUIntLE(width - 1, 4, 3); extended.writeUIntLE(height - 1, 7, 3);
  assert.deepEqual(imageDimensions(webp('VP8X', extended), 'image/webp'), { width, height });
  extended[0] = 2;
  assert.equal(imageDimensions(webp('VP8X', extended), 'image/webp'), null);
  const truncated = webp('VP8 ', lossy).subarray(0, -1);
  assert.equal(imageDimensions(truncated, 'image/webp'), null);
});

test('allows image limits inclusively and rejects zero, excess area and excess side length', () => {
  const png = Buffer.alloc(33); png.writeUInt32BE(13, 8); png.write('IHDR', 12);
  for (const [width, height, safe] of [[5000, 4000, true], [10000, 1, true], [5000, 4001, false], [10001, 1, false], [0, 1, false]]) {
    png.writeUInt32BE(width, 16); png.writeUInt32BE(height, 20);
    assert.equal(hasSafeImageDimensions(png, 'image/png'), safe);
  }
  assert.equal(imageDimensions(png.subarray(0, 24), 'image/png'), null);
});
