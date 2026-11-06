import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  guild: vi.fn(),
  query: vi.fn(),
}));

vi.mock('@/lib/exec-auth', () => ({ requireGuildSession: mocks.session }));
vi.mock('@/lib/db', () => ({
  getPool: () => ({
    connect: async () => ({ query: mocks.query, release: vi.fn() }),
  }),
}));
vi.mock('@/lib/db-cache-simple', () => ({
  default: {
    getGuildData: mocks.guild,
    getPlayerActivitySnapshots: async () => ({}),
  },
}));
vi.mock('@/lib/graid-raid-totals', () => ({ getAllTimeGraidRaidTotals: async () => new Map() }));

import { GET } from './route';

const PERSON = '11111111-1111-1111-1111-111111111111';
const GUILD_ACCOUNT = '22222222-2222-2222-2222-222222222222';

const request = () => new NextRequest('https://example.test/api/members/activity');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ discord_id: '1', rank: 'Starfish' });
  mocks.guild.mockResolvedValue({
    name: 'Guild',
    prefix: 'G',
    members: [
      { name: 'Person', uuid: PERSON, rank: 'RECRUIT', wars: 2, online: true, server: 'WC1', lastJoin: '2026-01-01' },
      { name: 'Account', uuid: GUILD_ACCOUNT, rank: 'RECRUIT' },
    ],
  });
  mocks.query.mockImplementation(async (sql: string) =>
    sql.includes('management_exceptions')
      ? { rows: [{ uuid: GUILD_ACCOUNT }] }
      : { rows: [{ uuid: PERSON, rank: 'Starfish', discord_id: '999', ign: 'Person' }] },
  );
});

describe('member activity', () => {
  it('refuses a request with no guild session', async () => {
    mocks.session.mockResolvedValue(null);
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(mocks.guild).not.toHaveBeenCalled();
  });

  it('never lets a shared cache store the response', async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('returns only the fields the leaderboard reads', async () => {
    const { members } = await (await GET(request())).json();
    expect(Object.keys(members[0]).sort()).toEqual([
      'contributed',
      'discordRank',
      'guildRankName',
      'online',
      'playtime',
      'raids',
      'shells',
      'timeFrames',
      'username',
      'uuid',
      'wars',
    ]);
    expect(JSON.stringify(members)).not.toContain('999');
  });

  it('leaves guild-owned accounts out', async () => {
    const { members } = await (await GET(request())).json();
    expect(members.map((m: { uuid: string }) => m.uuid)).toEqual([PERSON]);
  });
});
