import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { PlayerLookupError, PlayerNotFoundError, resolveWarningPlayer, threadUrl } from './warnings-server';

/** A pool whose successive queries return the given row sets in order. */
function fakePool(...rowSets: any[][]) {
  const query = vi.fn();
  for (const rows of rowSets) query.mockResolvedValueOnce({ rows, rowCount: rows.length });
  return { pool: { query } as unknown as Pool, query };
}

function mojang(status: number, body?: unknown) {
  return vi.fn().mockResolvedValue({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  }) as unknown as typeof fetch;
}

describe('resolveWarningPlayer', () => {
  it('prefers discord_links and keeps the Discord id', async () => {
    const { pool, query } = fakePool([{ uuid: 'u-1', ign: 'Player', discord_id: '42' }]);
    const fetchImpl = mojang(200);
    expect(await resolveWarningPlayer(pool, 'PLAYER', fetchImpl)).toEqual({ uuid: 'u-1', ign: 'Player', discordId: '42' });
    expect(query.mock.calls[0][1]).toEqual(['player']);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('falls back to an existing warning profile', async () => {
    const { pool } = fakePool([], [{ uuid: 'u-2', ign: 'Gone', discord_id: null }]);
    const fetchImpl = mojang(200);
    expect(await resolveWarningPlayer(pool, 'gone', fetchImpl)).toEqual({ uuid: 'u-2', ign: 'Gone', discordId: null });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('asks Mojang last, dashes the uuid, and picks up a Discord id by uuid', async () => {
    const { pool, query } = fakePool([], [], [{ discord_id: '7' }]);
    const fetchImpl = mojang(200, { id: '0123456789abcdef0123456789abcdef', name: 'Fresh' });
    expect(await resolveWarningPlayer(pool, 'fresh', fetchImpl)).toEqual({
      uuid: '01234567-89ab-cdef-0123-456789abcdef', ign: 'Fresh', discordId: '7',
    });
    expect(query.mock.calls[2][1]).toEqual(['01234567-89ab-cdef-0123-456789abcdef']);
  });

  it('reports an unknown name as not found', async () => {
    const { pool } = fakePool([], []);
    await expect(resolveWarningPlayer(pool, 'nobody', mojang(404))).rejects.toBeInstanceOf(PlayerNotFoundError);
  });

  it('reports a Mojang outage as a lookup error, not a missing player', async () => {
    const { pool } = fakePool([], []);
    await expect(resolveWarningPlayer(pool, 'someone', mojang(503))).rejects.toBeInstanceOf(PlayerLookupError);
  });
});

describe('threadUrl', () => {
  it('links into the exec Discord, or null without a thread', () => {
    expect(threadUrl('123')).toBe('https://discord.com/channels/784795827808763904/123');
    expect(threadUrl(null)).toBeNull();
  });
});
