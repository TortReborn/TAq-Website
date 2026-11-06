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
      ? { rows: [{ uuid: UUID, rank: 'Starfish', ign: 'FromDatabase' }] }
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
        ? { rows: [{ uuid: UUID, rank: 'Angler', ign: 'FromDatabase' }] }
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
});
