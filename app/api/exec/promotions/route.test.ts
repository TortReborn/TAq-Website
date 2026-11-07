import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  query: vi.fn(),
  clientQuery: vi.fn(),
}));

vi.mock('@/lib/exec-auth', () => ({
  requireExecSession: mocks.session,
  isNarwhalRank: (rank: string) => ['Narwhal', 'Hydra'].includes(rank),
}));
vi.mock('@/lib/db', () => ({
  getPool: () => ({
    query: mocks.query,
    connect: async () => ({ query: mocks.clientQuery, release: vi.fn() }),
  }),
}));
vi.mock('@/lib/db-cache-simple', () => ({ default: {} }));

import { POST } from './route';
import { POST as BULK } from './bulk/route';
import { splitStagedByMembership } from '@/lib/promotion-targets';

const UUID = '11111111-1111-4111-8111-111111111111';

function request(body: unknown) {
  return new NextRequest('https://example.test/api/exec/promotions', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

const entry = (overrides = {}) => ({
  uuid: UUID,
  ign: 'FromRequest',
  currentRank: 'Starfish',
  newRank: 'Angler',
  actionType: 'promote',
  ...overrides,
});

const inserts = (fn: typeof mocks.query) =>
  fn.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO promotion_queue'));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ discord_id: '1', ign: 'Queuer', rank: 'Hammerhead' });
  const respond = async (sql: string) =>
    String(sql).includes('FROM discord_links')
      ? { rows: [{ uuid: UUID, rank: 'Starfish', ign: 'FromDatabase', in_guild: true }] }
      : { rows: [], rowCount: 0 };
  mocks.query.mockImplementation(respond);
  mocks.clientQuery.mockImplementation(respond);
});

describe.each([
  ['single', (e: object) => POST(request(e)), mocks.query],
  ['bulk', (e: object) => BULK(request({ entries: [e] })), mocks.clientQuery],
] as const)('%s promotion queue', (_name, send, writer) => {
  it.each(['Hammerhead', 'Sailfish', 'Hydra'])('refuses promoting to %s from Hammerhead', async (newRank) => {
    const response = await send(entry({ newRank }));
    expect(response.status).toBe(403);
    expect(inserts(writer)).toHaveLength(0);
  });

  it('allows a promotion to a rank below your own', async () => {
    const response = await send(entry({ newRank: 'Swordfish' }));
    expect(response.status).toBe(200);
    expect(inserts(writer)).toHaveLength(1);
  });

  it('allows a demotion', async () => {
    mocks.query.mockImplementation(async (sql: string) =>
      String(sql).includes('FROM discord_links')
        ? { rows: [{ uuid: UUID, rank: 'Angler', ign: 'FromDatabase', in_guild: true }] }
        : { rows: [], rowCount: 0 },
    );
    const response = await send(entry({ currentRank: 'Angler', newRank: 'Starfish', actionType: 'demote' }));
    expect(response.status).toBe(200);
  });

  it('refuses when the request misstates the current rank', async () => {
    const response = await send(entry({ currentRank: 'Manatee' }));
    expect(response.status).toBe(409);
    expect(inserts(writer)).toHaveLength(0);
  });

  it('refuses a player with no linked account', async () => {
    mocks.query.mockResolvedValue({ rows: [], rowCount: 0 });
    const response = await send(entry());
    expect(response.status).toBe(404);
    expect(inserts(writer)).toHaveLength(0);
  });

  it('stores the name from the database, not the request', async () => {
    await send(entry());
    const params = inserts(writer)[0][1] as unknown[];
    expect(params[1]).toBe('FromDatabase');
    expect(params).not.toContain('FromRequest');
  });

  it('still queues a removal for a player who left the guild', async () => {
    mockTargets({ uuid: UUID, rank: 'Starfish', ign: 'FromDatabase', in_guild: false });
    const response = await send(entry({ newRank: null, actionType: 'remove' }));
    expect(response.status).toBe(200);
    expect(inserts(writer)).toHaveLength(1);
  });
});

function mockTargets(...rows: object[]) {
  mocks.query.mockImplementation(async (sql: string) =>
    String(sql).includes('FROM discord_links') ? { rows } : { rows: [], rowCount: 0 },
  );
}

describe('players who left the guild', () => {
  const LEFT = '22222222-2222-4222-8222-222222222222';

  it('refuses a single promotion', async () => {
    mockTargets({ uuid: UUID, rank: 'Starfish', ign: 'FromDatabase', in_guild: false });
    const response = await POST(request(entry()));
    expect(response.status).toBe(409);
    expect(inserts(mocks.query)).toHaveLength(0);
  });

  it('drops them from a bulk batch and queues the rest', async () => {
    mockTargets(
      { uuid: UUID, rank: 'Starfish', ign: 'Stayed', in_guild: true },
      { uuid: LEFT, rank: 'Starfish', ign: 'Left', in_guild: false },
    );
    const response = await BULK(request({ entries: [entry(), entry({ uuid: LEFT, ign: 'Left' })] }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ inserted: 1, departed: ['Left'] });
    const written = inserts(mocks.clientQuery);
    expect(written).toHaveLength(1);
    expect((written[0][1] as unknown[])[0]).toBe(UUID);
  });
});

describe('splitStagedByMembership', () => {
  const action = (uuid: string, actionType: string) => ({ uuid, actionType });

  it('drops rank changes for players no longer on the roster', () => {
    const { kept, departed } = splitStagedByMembership(
      [action('A', 'promote'), action('b', 'demote'), action('c', 'promote')],
      ['a', 'c'],
    );
    expect(kept.map(a => a.uuid)).toEqual(['A', 'c']);
    expect(departed.map(a => a.uuid)).toEqual(['b']);
  });

  it('keeps a removal for a player who left', () => {
    const { kept, departed } = splitStagedByMembership([action('b', 'remove')], ['a']);
    expect(kept).toHaveLength(1);
    expect(departed).toHaveLength(0);
  });
});
