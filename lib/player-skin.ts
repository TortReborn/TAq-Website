/**
 * Current skin for a Minecraft account, from Mojang's session server.
 *
 * The session server is the only source that also says which arm model the
 * player uploaded with ("slim" in the texture metadata; absent means
 * classic), and the uniform overlay has to be laid out for that model
 * (see lib/uniform.ts). It is rate-limited per IP, so answers are held in
 * process for a while: a member flipping between variants in the modal
 * must not cost a Mojang call each time.
 */

import type { ArmModel } from '@/lib/uniform';

export interface PlayerSkin {
  /** textures.minecraft.net URL of the raw 64x64 (or legacy 64x32) PNG. */
  url: string;
  model: ArmModel;
}

const SESSION_SERVER = 'https://sessionserver.mojang.com/session/minecraft/profile';
const CACHE_TTL_MS = 10 * 60 * 1000;

const cache = new Map<string, { skin: PlayerSkin | null; expires: number }>();

export class SkinLookupError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

interface TexturesPayload {
  textures?: {
    SKIN?: { url: string; metadata?: { model?: string } };
  };
}

/**
 * Resolve where the player's skin lives. Returns null for an account with
 * no custom skin (Steve/Alex); throws SkinLookupError when Mojang is
 * unreachable or rate-limiting, so the caller can say so rather than serve
 * a bare uniform on a default body.
 */
export async function lookupPlayerSkin(uuid: string): Promise<PlayerSkin | null> {
  const id = uuid.replace(/-/g, '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(id)) {
    throw new SkinLookupError('Invalid uuid', 400);
  }

  const hit = cache.get(id);
  if (hit && hit.expires > Date.now()) return hit.skin;

  const res = await fetch(`${SESSION_SERVER}/${id}`, { cache: 'no-store' });
  if (res.status === 429) {
    throw new SkinLookupError('Mojang is rate-limiting skin lookups, try again in a minute', 503);
  }
  if (res.status === 204 || res.status === 404) {
    throw new SkinLookupError('Mojang has no profile for this uuid', 404);
  }
  if (!res.ok) {
    throw new SkinLookupError(`Mojang session server returned ${res.status}`, 502);
  }

  const profile = await res.json() as { properties?: Array<{ name: string; value: string }> };
  const prop = profile.properties?.find(p => p.name === 'textures');
  let skin: PlayerSkin | null = null;
  if (prop) {
    const payload = JSON.parse(Buffer.from(prop.value, 'base64').toString('utf8')) as TexturesPayload;
    const tex = payload.textures?.SKIN;
    if (tex?.url) {
      skin = { url: tex.url, model: tex.metadata?.model === 'slim' ? 'slim' : 'classic' };
    }
  }

  cache.set(id, { skin, expires: Date.now() + CACHE_TTL_MS });
  return skin;
}

/** Fetch the skin PNG bytes. Texture URLs are content-addressed, so cache hard. */
export async function fetchSkinPng(url: string): Promise<Buffer> {
  if (!/^https?:\/\/textures\.minecraft\.net\/texture\/[0-9a-f]+$/.test(url)) {
    throw new SkinLookupError('Unexpected skin texture host', 502);
  }
  const res = await fetch(url, { next: { revalidate: 60 * 60 * 24 } });
  if (!res.ok) {
    throw new SkinLookupError(`Skin texture fetch returned ${res.status}`, 502);
  }
  return Buffer.from(await res.arrayBuffer());
}
