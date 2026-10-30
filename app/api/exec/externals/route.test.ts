import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { query, requireNarwhalSession } = vi.hoisted(() => ({
  query: vi.fn(),
  requireNarwhalSession: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ getPool: () => ({ query }) }));
vi.mock('@/lib/exec-auth', () => ({ requireNarwhalSession }));

import { POST } from './route';
import { PATCH } from './[type]/[id]/route';

const alliance = {
  guildName: 'Eden', guildPrefix: 'EDN', discordRoleId: '123456789012345678',
  displayRank: 'Horizon', enabled: true,
};

function request(body: Record<string, unknown>, method: string) {
  return new NextRequest('http://localhost/api/exec/externals', {
    method, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  requireNarwhalSession.mockResolvedValue({ ign: 'HR' });
  query.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (sql.includes('FROM rank_definitions')) {
      return { rows: ['Navigator', 'Horizon'].includes(String(params?.[0])) ? [{ '?column?': 1 }] : [] };
    }
    return { rows: [], rowCount: 1 };
  });
});

for (const method of ['POST', 'PATCH']) {
  const save = (body: Record<string, unknown>) => method === 'POST'
    ? POST(request({ action: 'createAlliance', ...body }, method))
    : PATCH(request(body, method), { params: Promise.resolve({ type: 'alliance', id: '2' }) });

  describe(`${method} alliance`, () => {
    it('requires Narwhal access before querying', async () => {
      requireNarwhalSession.mockResolvedValue(null);
      expect((await save(alliance)).status).toBe(403);
      expect(query).not.toHaveBeenCalled();
    });

    it.each(['Unknown', 'Narwhal'])('rejects non-ally rank %s before writing', async displayRank => {
      const response = await save({ ...alliance, displayRank });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'Choose a configured ally rank.' });
      expect(query).toHaveBeenCalledExactlyOnceWith(
        expect.stringContaining("kind = 'ally'"), [displayRank],
      );
    });

    it.each(['Horizon', 'Navigator'])('saves configured ally rank %s', async displayRank => {
      const response = await save({ ...alliance, displayRank });
      expect(response.status).toBe(200);
      const write = query.mock.calls.find(([sql]) => /(?:INSERT INTO|UPDATE) guild_alliances/.test(sql));
      expect(write).toBeDefined();
      expect(write![1][3]).toBe(displayRank);
    });

    it('validates and saves the default Navigator rank', async () => {
      expect((await save({ ...alliance, displayRank: '' })).status).toBe(200);
      expect(query).toHaveBeenCalledWith(expect.stringContaining('FROM rank_definitions'), ['Navigator']);
    });
  });
}
