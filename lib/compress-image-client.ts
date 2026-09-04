/**
 * Shrink an image in the browser before uploading it.
 *
 * This is not an optimisation — it is what makes large files work at all. A
 * Vercel Function accepts at most 4.5 MB of request body, and that limit is
 * enforced by the platform before any server code runs, so a 12 MB phone
 * screenshot cannot be "compressed on the server": it never arrives. The only
 * place to make it smaller is here, before the request is sent.
 *
 * Animated GIFs are left alone. A canvas can only capture one frame, so
 * compressing here would silently throw the animation away; they are sent as-is
 * and re-encoded to animated WebP on the server, and are refused outright if
 * they exceed the cap.
 */

export interface ClientCompressResult {
  file: File;
  originalBytes: number;
  bytes: number;
  /** False when the file was passed through untouched. */
  compressed: boolean;
}

const MAX_DIMENSION = 1920;
const QUALITY_STEPS = [0.85, 0.75, 0.6, 0.45];

/** Leaves headroom under the server's own cap for multipart overhead. */
const TARGET_BYTES = 3.5 * 1024 * 1024;

/** Below this, re-encoding usually makes the file bigger, not smaller. */
const SKIP_BELOW_BYTES = 400 * 1024;

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function compressImageInBrowser(file: File): Promise<ClientCompressResult> {
  const untouched: ClientCompressResult = {
    file,
    originalBytes: file.size,
    bytes: file.size,
    compressed: false,
  };

  // A canvas flattens animation to a single frame, so never re-encode a GIF.
  if (file.type === 'image/gif') return untouched;
  if (file.size <= SKIP_BELOW_BYTES) return untouched;
  if (typeof document === 'undefined' || typeof createImageBitmap === 'undefined') return untouched;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // Unreadable by the browser — let the server decide what to say about it.
    return untouched;
  }

  try {
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return untouched;
    ctx.drawImage(bitmap, 0, 0, width, height);

    let smallest: Blob | null = null;
    for (const quality of QUALITY_STEPS) {
      const blob = await canvasToBlob(canvas, 'image/webp', quality);
      if (!blob) continue;
      if (!smallest || blob.size < smallest.size) smallest = blob;
      if (blob.size <= TARGET_BYTES) break;
    }
    if (!smallest) return untouched;

    // Re-encoding a small, already-efficient image can inflate it; keep whichever
    // is actually smaller.
    if (smallest.size >= file.size) return untouched;

    const name = file.name.replace(/\.[a-z0-9]+$/i, '') + '.webp';
    return {
      file: new File([smallest], name, { type: 'image/webp' }),
      originalBytes: file.size,
      bytes: smallest.size,
      compressed: true,
    };
  } finally {
    bitmap.close();
  }
}
