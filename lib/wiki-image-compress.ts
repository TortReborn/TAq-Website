/**
 * Server-side image normalisation for the wiki.
 *
 * Two distinct budgets are at play and they are easy to confuse:
 *
 *   INBOUND — a Vercel Function accepts at most 4.5 MB of request body. This is
 *   a platform limit, hit before any of our code runs, so nothing here can
 *   rescue a file that is too big. Shrinking has to happen in the browser
 *   before the request is sent (see compressImageInBrowser in the editor).
 *
 *   STORED — what we keep and later serve. Smaller is better for page weight
 *   and for the storage quota, and this is the budget the functions below
 *   actually enforce, by stepping quality down until the result fits.
 */

import type sharpNamespace from 'sharp';

/** Largest request body a Vercel Function will accept. */
export const VERCEL_BODY_LIMIT_BYTES = 4.5 * 1024 * 1024;

/**
 * Refused above this, leaving headroom under the platform limit so a rejection
 * is our clear error message rather than an opaque 413 from the edge.
 */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/** What we aim to store. Comfortably under the upload cap for a lead image. */
export const TARGET_STORED_BYTES = 600 * 1024;

/** Long edge cap. Articles render images far smaller than this. */
export const MAX_DIMENSION = 1920;

// Descends only as far as a given image needs. Real photographs and
// screenshots settle at 85; the low rungs exist for pathologically
// incompressible input (sensor noise, dithered gradients) which would
// otherwise blow the stored budget.
const QUALITY_STEPS = [85, 75, 65, 55, 45, 35];

export interface CompressedImage {
  data: Buffer;
  mime: string;
  width: number | null;
  height: number | null;
  /** Quality actually used, for logging when a file needed heavy squeezing. */
  quality: number;
}

/**
 * Normalise to WebP within TARGET_STORED_BYTES where possible.
 *
 * Animated GIFs are converted to animated WebP rather than passed through. A
 * GIF is usually the largest thing anyone uploads and compresses worst; passing
 * them through untouched, as this used to, meant the one format most in need of
 * compression was the only one that never got any.
 *
 * If even the lowest quality misses the target the smallest attempt is kept —
 * refusing a legitimate image because it is a photograph would be worse than
 * storing a slightly large one.
 */
export async function compressWikiImage(
  sharp: typeof sharpNamespace,
  input: Buffer,
  mime: string,
): Promise<CompressedImage> {
  const animated = mime === 'image/gif';

  let best: CompressedImage | null = null;
  for (const quality of QUALITY_STEPS) {
    const processed = await sharp(input, { animated })
      // Applies EXIF orientation, after which all metadata (including GPS) is
      // dropped — these are public pages and phone photos carry location.
      .rotate()
      .resize({
        width: MAX_DIMENSION,
        height: MAX_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality, effort: 4 })
      .toBuffer({ resolveWithObject: true });

    const candidate: CompressedImage = {
      data: processed.data,
      mime: 'image/webp',
      width: processed.info.width,
      // sharp reports an animated WebP's height as every frame stacked, so
      // divide back down to one frame for a sane stored dimension.
      height: animated && processed.info.pages
        ? Math.round(processed.info.height / processed.info.pages)
        : processed.info.height,
      quality,
    };

    if (!best || candidate.data.length < best.data.length) best = candidate;
    if (candidate.data.length <= TARGET_STORED_BYTES) return candidate;
  }

  return best!;
}

/** Human-readable size, for error messages the uploader will actually read. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
