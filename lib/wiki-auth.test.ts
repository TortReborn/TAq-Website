import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Who may do what in the Chronicle.
 *
 * The rule this pins down is the one that is easy to regress by tightening a
 * guard somewhere else: reading and suggesting need only a Discord account,
 * while publishing and reviewing need exec or chronicler. A change that makes
 * an unlinked signer-in resolve to null would take the wiki back to being
 * guild-only, and nothing else in the suite would notice.
 */

const SECRET = 'test-secret-for-wiki-auth';
process.env.EXEC_SESSION_SECRET = SECRET;
delete process.env.TEST_MODE;

const chroniclers = new Set<string>();
const links = new Map<string, { uuid: string; ign: string; rank: string }>();
const roster = new Set<string>();

vi.mock('@/lib/db', () => ({ getPool: () => ({}) }));
vi.mock('@/lib/wiki-db', () => ({
  isChronicler: async (_pool: unknown, id: string) => chroniclers.has(id),
}));
vi.mock('@/lib/exec-auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/exec-auth')>();
  return {
    ...actual,
    checkDiscordLink: async (id: string) => {
      const row = links.get(id);
      if (!row) return { ok: false as const, reason: 'not_linked' as const, discord_id: id };
      return {
        ok: true as const,
        ...row,
        role: actual.EXEC_RANKS.includes(row.rank) ? ('exec' as const) : ('member' as const),
      };
    },
    checkGuildMembership: async (uuid: string) => roster.has(uuid),
  };
});

const { setExecSessionCookie } = await import('@/lib/exec-auth');
const { setWikiSessionCookie, resolveWikiPrincipal } = await import('@/lib/wiki-auth');

/** Mint a real signed cookie the same way the OAuth callback does. */
function requestWith(mint: (res: NextResponse) => void): NextRequest {
  const res = NextResponse.next();
  mint(res);
  const cookie = res.cookies
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
  return new NextRequest('https://example.test/chronicle', { headers: { cookie } });
}

const wikiSessionFor = (discordId: string) =>
  requestWith((res) =>
    setWikiSessionCookie(res, {
      discord_id: discordId,
      discord_username: 'outsider',
      discord_avatar: '',
    }),
  );

const execSessionFor = (discordId: string, rank: string, uuid = 'uuid-1') =>
  requestWith((res) =>
    setExecSessionCookie(res, {
      discord_id: discordId,
      discord_username: 'member',
      discord_avatar: '',
      uuid,
      ign: 'Someign',
      rank,
      role: 'member',
    }),
  );

beforeEach(() => {
  chroniclers.clear();
  links.clear();
  roster.clear();
});

describe('resolveWikiPrincipal', () => {
  it('returns null for an anonymous visitor', async () => {
    const req = new NextRequest('https://example.test/chronicle');
    expect(await resolveWikiPrincipal(req)).toBeNull();
  });

  it('admits a signed-in Discord account that is in neither discord_links nor the roster', async () => {
    const p = await resolveWikiPrincipal(wikiSessionFor('900'));
    expect(p).not.toBeNull();
    expect(p!.discordId).toBe('900');
    expect(p!.isGuildMember).toBe(false);
  });

  it('gives that account no rights beyond suggesting', async () => {
    const p = await resolveWikiPrincipal(wikiSessionFor('900'));
    expect(p!.canPublish).toBe(false);
    expect(p!.canReview).toBe(false);
    expect(p!.canManageChroniclers).toBe(false);
    expect(p!.isExec).toBe(false);
    expect(p!.isChronicler).toBe(false);
  });

  it('lets a chronicler outside the guild publish and review', async () => {
    chroniclers.add('900');
    const p = await resolveWikiPrincipal(wikiSessionFor('900'));
    expect(p!.isChronicler).toBe(true);
    expect(p!.canPublish).toBe(true);
    expect(p!.canReview).toBe(true);
    // Widening the trusted set stays with the guild.
    expect(p!.canManageChroniclers).toBe(false);
  });

  it('gives an exec the full set, and attributes them by in-game name', async () => {
    links.set('100', { uuid: 'uuid-1', ign: 'Thundderr', rank: 'Hydra' });
    roster.add('uuid-1');
    const p = await resolveWikiPrincipal(execSessionFor('100', 'Hydra'));
    expect(p!.name).toBe('Thundderr');
    expect(p!.isExec).toBe(true);
    expect(p!.isGuildMember).toBe(true);
    expect(p!.canPublish).toBe(true);
    expect(p!.canManageChroniclers).toBe(true);
  });

  it('lets a rank-and-file guild member suggest but not publish', async () => {
    links.set('200', { uuid: 'uuid-2', ign: 'Minnow', rank: 'Starfish' });
    roster.add('uuid-2');
    const p = await resolveWikiPrincipal(execSessionFor('200', 'Starfish', 'uuid-2'));
    expect(p!.isGuildMember).toBe(true);
    expect(p!.canPublish).toBe(false);
    expect(p!.canReview).toBe(false);
  });

  it('keeps someone who has left the guild able to suggest, without their old rank', async () => {
    // Cookie says Hydra; discord_links and the roster no longer know them.
    const p = await resolveWikiPrincipal(execSessionFor('100', 'Hydra'));
    expect(p).not.toBeNull();
    expect(p!.isExec).toBe(false);
    expect(p!.isGuildMember).toBe(false);
    expect(p!.canPublish).toBe(false);
  });

  it('keeps a departed member their chronicler rights, which guild rank never granted', async () => {
    chroniclers.add('100');
    const p = await resolveWikiPrincipal(execSessionFor('100', 'Hydra'));
    expect(p!.isChronicler).toBe(true);
    expect(p!.canPublish).toBe(true);
    expect(p!.isExec).toBe(false);
  });

  it('ignores a wiki cookie signed with the wrong secret', async () => {
    const good = wikiSessionFor('900').cookies.get('chronicler_session')!.value;
    const [payload] = good.split('.');
    const req = new NextRequest('https://example.test/chronicle', {
      headers: { cookie: `chronicler_session=${payload}.forgedsignature` },
    });
    expect(await resolveWikiPrincipal(req)).toBeNull();
  });
});
