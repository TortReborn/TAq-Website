import { NextRequest, NextResponse } from 'next/server';
import { resolveWikiPrincipal } from '@/lib/wiki-auth';
import { activeImageBackend } from '@/lib/wiki-image-storage';

export const dynamic = 'force-dynamic';

/**
 * Who the viewer is, as far as the Chronicle are concerned.
 *
 * Distinct from /api/auth/exec-session because that answers a guild question
 * (rank, in-guild, uuid) and returns unauthenticated for a chronicler who was
 * never in the guild. Anonymous visitors get 200 with authenticated:false —
 * a 401 here would put a console error on every anonymous article view.
 */
export async function GET(request: NextRequest) {
  const principal = await resolveWikiPrincipal(request);
  if (!principal) return NextResponse.json({ authenticated: false });
  return NextResponse.json({
    authenticated: true,
    user: {
      discordId: principal.discordId,
      name: principal.name,
      isExec: principal.isExec,
      isChronicler: principal.isChronicler,
      isGuildMember: principal.isGuildMember,
      canPublish: principal.canPublish,
      canReview: principal.canReview,
      canManageChroniclers: principal.canManageChroniclers,
    },
    // Which image store this deployment is actually wired to. Shown on the
    // editorial page because a mismatched WIKI_BLOB_ACCESS is otherwise
    // invisible until someone tries to upload and gets "access denied".
    ...(principal.canReview ? { imageBackend: activeImageBackend() } : {}),
  });
}
