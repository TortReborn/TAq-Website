// Seeded randomness. The generator state is one uint32 kept in the game state,
// so replaying the same actions from the same seed reproduces a game exactly,
// and the server never has to trust a client for a shuffle or a coin flip.

/** mulberry32 step: returns [value in [0,1), next state]. */
export function next(state: number): [number, number] {
  const s = (state + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, s];
}

/** FNV-1a, for stable per-card choices derived from a slug. */
export function hash(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A mutable wrapper for code that draws many numbers in a row. */
export class Rng {
  constructor(public state: number) {}
  float(): number {
    const [v, s] = next(this.state);
    this.state = s;
    return v;
  }
  int(n: number): number {
    return Math.floor(this.float() * n);
  }
  pick<T>(xs: readonly T[]): T {
    return xs[this.int(xs.length)];
  }
  shuffle<T>(xs: T[]): T[] {
    for (let i = xs.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [xs[i], xs[j]] = [xs[j], xs[i]];
    }
    return xs;
  }
}
