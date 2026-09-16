/**
 * Guild uniform compositing (TAQ-89).
 *
 * The uniform PNGs under public/images/uniform/ are overlays, not skins: the
 * head and hat regions are fully transparent and the arm top/bottom faces
 * (hands) are left clear, so the wearer keeps their own head and skin tone.
 * "Applying the uniform" is therefore a straight alpha-composite of the
 * overlay onto the member's current skin.
 *
 * Everything here works on raw RGBA buffers (64x64x4) so it is testable
 * without sharp; the route decodes/encodes at the edges.
 */

export const SKIN_SIZE = 64;
const CH = 4;

export type UniformVariant = 'recruit-captain' | 'chief';
export const UNIFORM_VARIANTS: UniformVariant[] = ['recruit-captain', 'chief'];

export type ArmModel = 'classic' | 'slim';

/**
 * Wynncraft guild tiers that wear the chief variant. Strategist wears the
 * lower-tier uniform (Thundderr, 2026-09-16); only the top of the guild
 * gets the chief palette.
 */
const CHIEF_TIERS = new Set(['CHIEF', 'OWNER']);

export function defaultVariantForGuildRank(guildRank: string | null | undefined): UniformVariant {
  return guildRank && CHIEF_TIERS.has(guildRank.toUpperCase()) ? 'chief' : 'recruit-captain';
}

export function isUniformVariant(v: unknown): v is UniformVariant {
  return typeof v === 'string' && (UNIFORM_VARIANTS as string[]).includes(v);
}

export interface Rgba {
  data: Uint8Array | Buffer;
  width: number;
  height: number;
}

// --- region geometry -------------------------------------------------------

interface Rect { x: number; y: number; w: number; h: number }

/** Origins of the 16x16 limb boxes in the modern 64x64 layout. */
const LIMB_BOXES = {
  rightArm: { x: 40, y: 16 },
  rightArmOverlay: { x: 40, y: 32 },
  leftArm: { x: 32, y: 48 },
  leftArmOverlay: { x: 48, y: 48 },
  rightLeg: { x: 0, y: 16 },
  rightLegOverlay: { x: 0, y: 32 },
  leftLeg: { x: 16, y: 48 },
  leftLegOverlay: { x: 0, y: 48 },
} as const;

/**
 * Faces inside a limb box, relative to its origin. Side faces are 4 wide on
 * both models; front/back/top/bottom shrink to 3 on slim arms and the faces
 * to their right shift left to close the gap.
 */
function limbFaces(width: 3 | 4): Record<'top' | 'bottom' | 'right' | 'front' | 'left' | 'back', Rect> {
  const d = 4; // depth (side faces) never changes
  return {
    top:    { x: d,             y: 0, w: width, h: 4 },
    bottom: { x: d + width,     y: 0, w: width, h: 4 },
    right:  { x: 0,             y: 4, w: d,     h: 12 },
    front:  { x: d,             y: 4, w: width, h: 12 },
    left:   { x: d + width,     y: 4, w: d,     h: 12 },
    back:   { x: d + width + d, y: 4, w: width, h: 12 },
  };
}

function px(img: Rgba, x: number, y: number): number {
  return (y * img.width + x) * CH;
}

function copyPixel(src: Rgba, sx: number, sy: number, dst: Rgba, dx: number, dy: number): void {
  const s = px(src, sx, sy);
  const d = px(dst, dx, dy);
  dst.data[d] = src.data[s];
  dst.data[d + 1] = src.data[s + 1];
  dst.data[d + 2] = src.data[s + 2];
  dst.data[d + 3] = src.data[s + 3];
}

function blank(width: number, height: number): Rgba {
  return { data: new Uint8Array(width * height * CH), width, height };
}

function copyRect(src: Rgba, sr: Rect, dst: Rgba, dx: number, dy: number, flipH = false): void {
  for (let y = 0; y < sr.h; y++) {
    for (let x = 0; x < sr.w; x++) {
      const sx = flipH ? sr.x + (sr.w - 1 - x) : sr.x + x;
      copyPixel(src, sx, sr.y + y, dst, dx + x, dy + y);
    }
  }
}

// --- legacy 64x32 → 64x64 -----------------------------------------------------

/**
 * Pre-1.8 skins are 64x32 with no left limbs and no limb overlays; the game
 * draws the left arm/leg as a mirror of the right. Do the same so the overlay
 * (which paints all four limbs) has something underneath.
 */
export function normaliseSkin(img: Rgba): Rgba {
  if (img.width !== SKIN_SIZE) {
    throw new Error(`Unexpected skin width ${img.width}`);
  }
  if (img.height === SKIN_SIZE) return img;
  if (img.height !== 32) {
    throw new Error(`Unexpected skin height ${img.height}`);
  }

  const out = blank(SKIN_SIZE, SKIN_SIZE);
  copyRect(img, { x: 0, y: 0, w: 64, h: 32 }, out, 0, 0);
  mirrorLimb(out, LIMB_BOXES.rightArm, LIMB_BOXES.leftArm);
  mirrorLimb(out, LIMB_BOXES.rightLeg, LIMB_BOXES.leftLeg);
  return out;
}

/**
 * Write a mirrored copy of one 16x16 limb box into another: every face is
 * flipped horizontally and the two side faces swap places, which is what a
 * left limb looks like when the model only has a right one.
 */
function mirrorLimb(img: Rgba, from: { x: number; y: number }, to: { x: number; y: number }): void {
  const f = limbFaces(4);
  const at = (r: Rect) => ({ x: from.x + r.x, y: from.y + r.y, w: r.w, h: r.h });
  copyRect(img, at(f.top), img, to.x + f.top.x, to.y + f.top.y, true);
  copyRect(img, at(f.bottom), img, to.x + f.bottom.x, to.y + f.bottom.y, true);
  copyRect(img, at(f.front), img, to.x + f.front.x, to.y + f.front.y, true);
  copyRect(img, at(f.back), img, to.x + f.back.x, to.y + f.back.y, true);
  copyRect(img, at(f.left), img, to.x + f.right.x, to.y + f.right.y, true);
  copyRect(img, at(f.right), img, to.x + f.left.x, to.y + f.left.y, true);
}

// --- classic → slim arms -------------------------------------------------------

/**
 * The uniforms are painted for 4px arms. A slim-model player's game reads
 * the arm faces from the 3px positions, so an unconverted overlay lands a
 * column off. Drop the outermost column of each 4-wide face and pack the
 * faces back together, on both arms and both arm overlays.
 */
export function toSlimArms(img: Rgba): Rgba {
  const out: Rgba = { data: Uint8Array.from(img.data), width: img.width, height: img.height };
  const wide = limbFaces(4);
  const slim = limbFaces(3);
  for (const box of [LIMB_BOXES.rightArm, LIMB_BOXES.rightArmOverlay, LIMB_BOXES.leftArm, LIMB_BOXES.leftArmOverlay]) {
    // clear the box, then re-lay each face at its slim position
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const o = px(out, box.x + x, box.y + y);
      out.data[o] = out.data[o + 1] = out.data[o + 2] = out.data[o + 3] = 0;
    }
    for (const face of ['top', 'bottom', 'right', 'front', 'left', 'back'] as const) {
      const s = wide[face];
      const d = slim[face];
      copyRect(img, { x: box.x + s.x, y: box.y + s.y, w: d.w, h: d.h }, out, box.x + d.x, box.y + d.y);
    }
  }
  return out;
}

// --- composite -----------------------------------------------------------------

/** Straight source-over; the overlays are hard-edged so no premultiply games. */
export function compositeUniform(base: Rgba, overlay: Rgba): Rgba {
  if (base.width !== overlay.width || base.height !== overlay.height) {
    throw new Error('Base and overlay must be the same size');
  }
  const out: Rgba = { data: Uint8Array.from(base.data), width: base.width, height: base.height };
  for (let i = 0; i < out.data.length; i += CH) {
    const a = overlay.data[i + 3] / 255;
    if (a === 0) continue;
    if (a === 1) {
      out.data[i] = overlay.data[i];
      out.data[i + 1] = overlay.data[i + 1];
      out.data[i + 2] = overlay.data[i + 2];
      out.data[i + 3] = 255;
      continue;
    }
    const ba = out.data[i + 3] / 255;
    const oa = a + ba * (1 - a);
    for (let c = 0; c < 3; c++) {
      out.data[i + c] = Math.round((overlay.data[i + c] * a + out.data[i + c] * ba * (1 - a)) / (oa || 1));
    }
    out.data[i + 3] = Math.round(oa * 255);
  }
  return out;
}

/**
 * Full pipeline: normalise the base, pick the overlay layout for the player's
 * arm model, composite.
 */
export function applyUniform(base: Rgba, overlay: Rgba, model: ArmModel): Rgba {
  const skin = normaliseSkin(base);
  const layer = model === 'slim' ? toSlimArms(overlay) : overlay;
  return compositeUniform(skin, layer);
}
