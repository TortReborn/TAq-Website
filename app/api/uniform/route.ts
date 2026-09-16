import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { fetchSkinPng, lookupPlayerSkin, SkinLookupError } from '@/lib/player-skin';
import { applyUniform, SKIN_SIZE, type Rgba, type UniformVariant } from '@/lib/uniform';
import { verifyUniformToken } from '@/lib/uniform-token';

export const dynamic = 'force-dynamic';

/**
 * TAQ-89: the composited uniform skin, as a 64x64 PNG. Cookie-less on
 * purpose so the link can be pasted to someone helping (a Chief, a skin
 * editor), but only reachable with a token the profile route signed
 * (lib/uniform-token.ts).
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('t');
  const payload = token && verifyUniformToken(token);
  if (!payload) {
    return NextResponse.json({ error: 'Invalid or expired link' }, { status: 403 });
  }

  try {
    const skin = await lookupPlayerSkin(payload.u);
    if (!skin) {
      return NextResponse.json({ error: 'No custom skin on this account' }, { status: 404 });
    }
    const model = payload.m ?? skin.model;

    const [base, overlay] = await Promise.all([
      fetchSkinPng(skin.url).then(decode),
      loadOverlay(payload.v),
    ]);
    const out = applyUniform(base, overlay, model);

    const png = await sharp(Buffer.from(out.data.buffer, out.data.byteOffset, out.data.byteLength), {
      raw: { width: out.width, height: out.height, channels: 4 },
    }).png().toBuffer();

    return new NextResponse(png, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': `inline; filename="taq-uniform-${payload.v}.png"`,
        // The link is per-member and the underlying skin can change any time.
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    if (error instanceof SkinLookupError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Uniform render error:', error);
    return NextResponse.json({ error: 'Failed to build the uniform skin' }, { status: 500 });
  }
}

async function decode(png: Buffer): Promise<Rgba> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

const overlayCache = new Map<UniformVariant, Promise<Rgba>>();

function loadOverlay(variant: UniformVariant): Promise<Rgba> {
  let p = overlayCache.get(variant);
  if (!p) {
    p = readFile(path.join(process.cwd(), 'public', 'images', 'uniform', `${variant}.png`))
      .then(decode)
      .then(img => {
        if (img.width !== SKIN_SIZE || img.height !== SKIN_SIZE) {
          throw new Error(`Uniform overlay ${variant} is ${img.width}x${img.height}, expected 64x64`);
        }
        return img;
      });
    overlayCache.set(variant, p);
    p.catch(() => overlayCache.delete(variant));
  }
  return p;
}
