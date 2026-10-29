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
  it('asks Mojang first, dashes the uuid, and takes the Discord id by uuid', async () => {
    const { pool, query } = fakePool([{ discord_id: '7' }]);
    const fetchImpl = mojang(200, { id: '0123456789abcdef0123456789abcdef', name: 'Fresh' });
    expect(await resolveWarningPlayer(pool, 'fresh', fetchImpl)).toEqual({
      uuid: '01234567-89ab-cdef-0123-456789abcdef', ign: 'Fresh', discordId: '7',
    });
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1]).toEqual(['01234567-89ab-cdef-0123-456789abcdef']);
  });

  it('never matches a cached name that Mojang says someone owns now', async () => {
    // A linked member used to be "Taken"; Mojang says a different account has it now.
    const { pool, query } = fakePool([]);
    const fetchImpl = mojang(200, { id: 'ffffffffffffffffffffffffffffffff', name: 'Taken' });
    expect(await resolveWarningPlayer(pool, 'taken', fetchImpl)).toEqual({
      uuid: 'ffffffff-ffff-ffff-ffff-ffffffffffff', ign: 'Taken', discordId: null,
    });
    expect(query.mock.calls.every(c => !String(c[0]).includes('LOWER(ign)'))).toBe(true);
  });

  it('falls back to a former name on file when nobody owns it now', async () => {
    const { pool, query } = fakePool([{ uuid: 'u-2', ign: 'Gone' }], [{ discord_id: '42' }]);
    expect(await resolveWarningPlayer(pool, 'GONE', mojang(404))).toEqual({ uuid: 'u-2', ign: 'Gone', discordId: '42' });
    expect(query.mock.calls[0][1]).toEqual(['gone']);
    expect(query.mock.calls[1][1]).toEqual(['u-2']);
  });

  it('reports an unknown name as not found', async () => {
    const { pool } = fakePool([]);
    await expect(resolveWarningPlayer(pool, 'nobody', mojang(404))).rejects.toBeInstanceOf(PlayerNotFoundError);
  });

  it('reports a Mojang outage as a lookup error and does not guess from the caches', async () => {
    const { pool, query } = fakePool();
    await expect(resolveWarningPlayer(pool, 'someone', mojang(503))).rejects.toBeInstanceOf(PlayerLookupError);
    expect(query).not.toHaveBeenCalled();
  });
});

describe('threadUrl', () => {
  it('links into the exec Discord, or null without a thread', () => {
    expect(threadUrl('123')).toBe('https://discord.com/channels/784795827808763904/123');
    expect(threadUrl(null)).toBeNull();
  });
});
