import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fitImage, cropRectangle, compressImage } from '../../public/src/imageTools.js';

test('photo resizing preserves aspect ratio without upscaling small images', () => {
  assert.deepEqual(fitImage(4000, 3000), { width: 1600, height: 1200 });
  assert.deepEqual(fitImage(900, 3000), { width: 480, height: 1600 });
  assert.deepEqual(fitImage(600, 300), { width: 600, height: 300 });
});

test('crop bounds handle reverse drags and clamp outside pointers to the image', () => {
  assert.deepEqual(cropRectangle({ x: 900, y: 800 }, { x: -20, y: 100 }, 600, 400),
    { x: 0, y: 100, width: 600, height: 300 });
});

test('compression crops original pixels, paints a white JPEG background and sends bounded dimensions', () => {
  let drawn, filled;
  const canvas = { getContext: () => ({ fillRect: (...args) => { filled = args; }, drawImage: (...args) => { drawn = args; } }),
    toDataURL: (type, quality) => { assert.equal(type, 'image/jpeg'); assert.equal(quality, 0.88); return 'data:image/jpeg;base64,aGVsbG8='; } };
  const source = { naturalWidth: 4000, naturalHeight: 3000 };
  const result = compressImage(source, { x: 1000, y: 500, width: 2000, height: 1000 }, () => canvas);
  assert.deepEqual(drawn, [source, 1000, 500, 2000, 1000, 0, 0, 1600, 800]);
  assert.deepEqual(filled, [0, 0, 1600, 800]);
  assert.equal(result.mimeType, 'image/jpeg'); assert.equal(result.width, 1600);
  assert.throws(() => compressImage(source, { width: 0, height: 1 }), /有效範圍/);
});
