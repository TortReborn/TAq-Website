import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import {
  MAX_DIMENSION,
  MAX_UPLOAD_BYTES,
  TARGET_STORED_BYTES,
  VERCEL_BODY_LIMIT_BYTES,
  compressWikiImage,
  formatBytes,
} from './wiki-image-compress';

/** Gaussian noise compresses worse than any real photograph — the worst case. */
function noisyPng(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
      noise: { type: 'gaussian', mean: 128, sigma: 70 },
    },
  }).png().toBuffer();
}

/** Smooth shapes and gradients — what a screenshot or banner actually is. */
function realisticJpeg(width: number, height: number): Promise<Buffer> {
  const svg = Buffer.from(
    `<svg width="${width}" height="${height}">
       <defs><linearGradient id="g"><stop offset="0%" stop-color="#f80"/><stop offset="100%" stop-color="#08f"/></linearGradient></defs>
       <rect width="${width}" height="${height}" fill="url(#g)"/>
       <circle cx="${width / 3}" cy="${height / 3}" r="${height / 4}" fill="#fff" opacity="0.6"/>
     </svg>`,
  );
  return sharp(svg).jpeg({ quality: 92 }).toBuffer();
}

describe('upload size budget', () => {
  it('stays under the platform limit enforced before our code runs', () => {
    // A Vercel Function refuses request bodies over 4.5 MB, and does so at the
    // edge. Accepting more than that would hand the user an opaque 413 instead
    // of our own message — the bug this constant exists to prevent.
    expect(MAX_UPLOAD_BYTES).toBeLessThan(VERCEL_BODY_LIMIT_BYTES);
  });

  it('aims to store far less than it accepts', () => {
    expect(TARGET_STORED_BYTES).toBeLessThan(MAX_UPLOAD_BYTES);
  });
});

describe('compressWikiImage', () => {
  it('gets a realistic large image comfortably inside the stored target', async () => {
    const input = await realisticJpeg(4000, 3000);
    const out = await compressWikiImage(sharp, input, 'image/jpeg');
    expect(out.mime).toBe('image/webp');
    expect(out.data.length).toBeLessThanOrEqual(TARGET_STORED_BYTES);
    // Ordinary content should never need the low rungs of the quality ladder.
    expect(out.quality).toBe(85);
  }, 60_000);

  it('squeezes even incompressible noise below what we accept', async () => {
    // Pure noise cannot reach the stored target at usable quality, so the
    // contract is weaker but still firm: it must shrink hugely and must never
    // exceed the upload cap.
    const input = await noisyPng(4000, 3000);
    const out = await compressWikiImage(sharp, input, 'image/png');
    expect(out.data.length).toBeLessThan(MAX_UPLOAD_BYTES);
    expect(out.data.length).toBeLessThan(input.length / 10);
  }, 60_000);

  it('caps the long edge and keeps the aspect ratio', async () => {
    const out = await compressWikiImage(sharp, await realisticJpeg(4000, 2000), 'image/jpeg');
    expect(out.width).toBe(MAX_DIMENSION);
    expect(out.height).toBe(MAX_DIMENSION / 2);
  }, 60_000);

  it('does not enlarge an image that is already small', async () => {
    const out = await compressWikiImage(sharp, await realisticJpeg(320, 200), 'image/jpeg');
    expect(out.width).toBe(320);
    expect(out.height).toBe(200);
  }, 30_000);

  it('re-encodes gifs instead of passing them through', async () => {
    // Gifs used to bypass compression entirely, which meant the format most in
    // need of it was the only one that never got any.
    const gif = await sharp(await realisticJpeg(800, 600)).gif().toBuffer();
    const out = await compressWikiImage(sharp, gif, 'image/gif');
    expect(out.mime).toBe('image/webp');
    expect(out.data.length).toBeLessThan(gif.length);
  }, 30_000);

  it('strips EXIF, which on a phone photo carries GPS', async () => {
    const withExif = await sharp(await realisticJpeg(800, 600))
      .withMetadata({ exif: { IFD0: { Copyright: 'test', Software: 'test-suite' } } })
      .jpeg()
      .toBuffer();
    const out = await compressWikiImage(sharp, withExif, 'image/jpeg');
    const meta = await sharp(out.data).metadata();
    expect(meta.exif).toBeUndefined();
  }, 30_000);
});

describe('formatBytes', () => {
  it('reads naturally in an error message', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});
