import { describe, it, expect } from 'vitest';
import {
  applyUniform,
  compositeUniform,
  defaultVariantForGuildRank,
  normaliseSkin,
  toSlimArms,
  type Rgba,
} from './uniform';

function blank(width = 64, height = 64): Rgba {
  return { data: new Uint8Array(width * height * 4), width, height };
}

function set(img: Rgba, x: number, y: number, rgba: [number, number, number, number]) {
  img.data.set(rgba, (y * img.width + x) * 4);
}

function get(img: Rgba, x: number, y: number): [number, number, number, number] {
  const o = (y * img.width + x) * 4;
  return [img.data[o], img.data[o + 1], img.data[o + 2], img.data[o + 3]];
}

/** Paint a limb box with a unique colour per pixel so moves are traceable. */
function paintBox(img: Rgba, bx: number, by: number) {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) set(img, bx + x, by + y, [x, y, 1, 255]);
}

describe('defaultVariantForGuildRank', () => {
  it('gives the chief palette only to chief and owner', () => {
    expect(defaultVariantForGuildRank('chief')).toBe('chief');
    expect(defaultVariantForGuildRank('OWNER')).toBe('chief');
    expect(defaultVariantForGuildRank('strategist')).toBe('recruit-captain');
    expect(defaultVariantForGuildRank('captain')).toBe('recruit-captain');
    expect(defaultVariantForGuildRank('recruit')).toBe('recruit-captain');
    expect(defaultVariantForGuildRank(null)).toBe('recruit-captain');
  });
});

describe('compositeUniform', () => {
  it('lets the base show through transparent overlay pixels and replaces under opaque ones', () => {
    const base = blank();
    const overlay = blank();
    set(base, 10, 10, [200, 0, 0, 255]);
    set(base, 11, 10, [0, 200, 0, 255]);
    set(overlay, 11, 10, [0, 0, 250, 255]);

    const out = compositeUniform(base, overlay);
    expect(get(out, 10, 10)).toEqual([200, 0, 0, 255]);
    expect(get(out, 11, 10)).toEqual([0, 0, 250, 255]);
    // inputs untouched
    expect(get(base, 11, 10)).toEqual([0, 200, 0, 255]);
  });

  it('blends a semi-transparent overlay pixel', () => {
    const base = blank();
    const overlay = blank();
    set(base, 0, 0, [0, 0, 0, 255]);
    set(overlay, 0, 0, [255, 255, 255, 128]);
    const [r, , , a] = get(compositeUniform(base, overlay), 0, 0);
    expect(r).toBeGreaterThan(120);
    expect(r).toBeLessThan(136);
    expect(a).toBe(255);
  });

  it('refuses mismatched sizes', () => {
    expect(() => compositeUniform(blank(64, 32), blank())).toThrow();
  });
});

describe('normaliseSkin', () => {
  it('returns a 64x64 skin as-is', () => {
    const skin = blank();
    expect(normaliseSkin(skin)).toBe(skin);
  });

  it('mirrors right limbs into the left slots of a legacy 64x32 skin', () => {
    const legacy = blank(64, 32);
    paintBox(legacy, 40, 16); // right arm
    paintBox(legacy, 0, 16);  // right leg

    const out = normaliseSkin(legacy);
    expect(out.height).toBe(64);
    // top half copied verbatim
    expect(get(out, 40 + 5, 16 + 7)).toEqual([5, 7, 1, 255]);

    // left arm box at (32,48): front face (x 4..7) is the right arm's front, flipped
    // right arm front pixel x=4 (leftmost) lands at x=7 (rightmost)
    expect(get(out, 32 + 7, 48 + 6)).toEqual([4, 6, 1, 255]);
    expect(get(out, 32 + 4, 48 + 6)).toEqual([7, 6, 1, 255]);
    // side faces swap: the right arm's "left" face (x 8..11) becomes the left arm's "right" face (x 0..3), flipped
    expect(get(out, 32 + 0, 48 + 6)).toEqual([11, 6, 1, 255]);
    expect(get(out, 32 + 3, 48 + 6)).toEqual([8, 6, 1, 255]);
    // left leg box at (16,48) gets the same treatment
    expect(get(out, 16 + 7, 48 + 6)).toEqual([4, 6, 1, 255]);
  });

  it('rejects odd sizes', () => {
    expect(() => normaliseSkin(blank(32, 32))).toThrow();
    expect(() => normaliseSkin(blank(64, 48))).toThrow();
  });
});

describe('toSlimArms', () => {
  it('repacks each 4-wide arm face to 3 wide, dropping the outermost column, and leaves legs alone', () => {
    const img = blank();
    paintBox(img, 40, 16); // right arm
    paintBox(img, 0, 16);  // right leg, must not move

    const out = toSlimArms(img);

    // top face: was x 4..7, now x 4..6 holding the first three columns
    expect(get(out, 40 + 4, 16 + 1)).toEqual([4, 1, 1, 255]);
    expect(get(out, 40 + 6, 16 + 1)).toEqual([6, 1, 1, 255]);
    // bottom face: was x 8..11, now x 7..9
    expect(get(out, 40 + 7, 16 + 1)).toEqual([8, 1, 1, 255]);
    expect(get(out, 40 + 9, 16 + 1)).toEqual([10, 1, 1, 255]);
    // right side face unchanged (x 0..3)
    expect(get(out, 40 + 2, 16 + 8)).toEqual([2, 8, 1, 255]);
    // front: x 4..6
    expect(get(out, 40 + 6, 16 + 8)).toEqual([6, 8, 1, 255]);
    // left side: was x 8..11, now x 7..10 — full 4 wide
    expect(get(out, 40 + 7, 16 + 8)).toEqual([8, 8, 1, 255]);
    expect(get(out, 40 + 10, 16 + 8)).toEqual([11, 8, 1, 255]);
    // back: was x 12..15, now x 11..13
    expect(get(out, 40 + 11, 16 + 8)).toEqual([12, 8, 1, 255]);
    expect(get(out, 40 + 13, 16 + 8)).toEqual([14, 8, 1, 255]);
    // the vacated columns are cleared
    expect(get(out, 40 + 14, 16 + 8)).toEqual([0, 0, 0, 0]);
    expect(get(out, 40 + 15, 16 + 8)).toEqual([0, 0, 0, 0]);
    expect(get(out, 40 + 10, 16 + 1)).toEqual([0, 0, 0, 0]);

    // leg untouched
    expect(get(out, 0 + 15, 16 + 8)).toEqual([15, 8, 1, 255]);
    // input untouched
    expect(get(img, 40 + 15, 16 + 8)).toEqual([15, 8, 1, 255]);
  });
});

describe('applyUniform', () => {
  it('composites the slim-converted overlay for slim players', () => {
    const base = blank();
    const overlay = blank();
    // paint the right arm front face's last column (x=7) only; on slim that column is dropped
    for (let y = 4; y < 16; y++) set(overlay, 40 + 7, 16 + y, [9, 9, 9, 255]);
    // and x=6, which survives and stays put
    for (let y = 4; y < 16; y++) set(overlay, 40 + 6, 16 + y, [5, 5, 5, 255]);

    const classic = applyUniform(base, overlay, 'classic');
    expect(get(classic, 47, 20)).toEqual([9, 9, 9, 255]);

    const slim = applyUniform(base, overlay, 'slim');
    expect(get(slim, 46, 20)).toEqual([5, 5, 5, 255]);
    expect(get(slim, 47, 20)).toEqual([0, 0, 0, 0]); // slim left-side face column, overlay empty there
  });
});
