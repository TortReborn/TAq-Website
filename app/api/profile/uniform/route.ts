import { NextRequest, NextResponse } from 'next/server';
import { getBaseUrl, requireGuildSession } from '@/lib/exec-auth';
import { lookupPlayerSkin, SkinLookupError } from '@/lib/player-skin';
import { defaultVariantForGuildRank, UNIFORM_VARIANTS, type ArmModel } from '@/lib/uniform';
import { mintUniformToken } from '@/lib/uniform-token';
import { getGuildRosterRank } from '@/lib/guild-roster';

export const dynamic = 'force-dynamic';

/**
 * TAQ-89: everything the "Wear the uniform" modal needs — the member's arm
 * model (so the preview can draw the right silhouette), which variant their
 * guild tier wears, and a signed public PNG link per variant that both the
 * preview and the minecraft.net hand-off use.
 *
 * ?model=slim|classic overrides what Mojang reports, for the rare skin
 * uploaded with the wrong model flag.
 */
export async function GET(request: NextRequest) {
  const session = await requireGuildSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const uuid = session.uuid.replace(/-/g, '').toLowerCase();
  const modelParam = request.nextUrl.searchParams.get('model');
  const override: ArmModel | undefined = modelParam === 'slim' || modelParam === 'classic' ? modelParam : undefined;

  try {
    const [skin, guildRank] = await Promise.all([
      lookupPlayerSkin(uuid),
      getGuildRosterRank(uuid),
    ]);
    if (!skin) {
      return NextResponse.json(
        { error: 'Mojang reports no custom skin on your account. Upload a skin first, then come back.' },
        { status: 404 },
      );
    }

    const model = override ?? skin.model;
    const base = getBaseUrl();
    const links = Object.fromEntries(UNIFORM_VARIANTS.map(v => {
      const token = mintUniformToken({ u: uuid, v, m: override });
      return [v, `${base}/api/uniform?t=${encodeURIComponent(token)}`];
    }));

    return NextResponse.json({
      ign: session.ign,
      model,
      detectedModel: skin.model,
      guildRank,
      defaultVariant: defaultVariantForGuildRank(guildRank),
      links,
    });
  } catch (error) {
    if (error instanceof SkinLookupError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Uniform info error:', error);
    return NextResponse.json({ error: 'Failed to look up your skin' }, { status: 500 });
  }
}
