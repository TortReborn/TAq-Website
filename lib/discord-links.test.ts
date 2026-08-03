import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { lookupIgnByUuid, resolveUuidByIgn, resolveUuidsByIgns } from './discord-links';

function fakePool(rows: any[]) {
  const query = vi.fn().mockResolvedValue({ rows, rowCount: rows.length });
  return { pool: { query } as unknown as Pool, query };
}

describe('resolveUuidsByIgns', () => {
  it('returns an empty map without querying when no igns are given', async () => {
    const { pool, query } = fakePool([]);
    const result = await resolveUuidsByIgns(pool, []);
    expect(result.size).toBe(0);
    expect(query).not.toHaveBeenCalled();
  });

  it('keys results by lowercased ign and defaults unmatched igns to null', async () => {
    const { pool, query } = fakePool([{ key: 'alice', uuid: 'uuid-a' }]);
    const result = await resolveUuidsByIgns(pool, ['Alice', 'Bob']);
    expect(result.get('alice')).toBe('uuid-a');
    expect(result.get('bob')).toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1]).toEqual([['alice', 'bob']]);
  });

  it('deduplicates igns that differ only in case', async () => {
    const { pool, query } = fakePool([]);
    const result = await resolveUuidsByIgns(pool, ['Alice', 'ALICE', 'alice']);
    expect(result.size).toBe(1);
    expect(query.mock.calls[0][1]).toEqual([['alice']]);
  });

  it('keeps a null uuid when discord_links has a row without one', async () => {
    const { pool } = fakePool([{ key: 'alice', uuid: null }]);
    const result = await resolveUuidsByIgns(pool, ['Alice']);
    expect(result.get('alice')).toBeNull();
  });
});

describe('resolveUuidByIgn', () => {
  it('resolves a single ign regardless of case', async () => {
    const { pool } = fakePool([{ key: 'alice', uuid: 'uuid-a' }]);
    expect(await resolveUuidByIgn(pool, 'ALICE')).toBe('uuid-a');
  });

  it('returns null for an unknown ign', async () => {
    const { pool } = fakePool([]);
    expect(await resolveUuidByIgn(pool, 'Nobody')).toBeNull();
  });
});

describe('lookupIgnByUuid', () => {
  it('returns the best-link ign for a uuid', async () => {
    const { pool, query } = fakePool([{ ign: 'Alice' }]);
    expect(await lookupIgnByUuid(pool, 'uuid-a')).toBe('Alice');
    expect(query.mock.calls[0][1]).toEqual(['uuid-a']);
  });

  it('returns null when the uuid has no discord_links row', async () => {
    const { pool } = fakePool([]);
    expect(await lookupIgnByUuid(pool, 'uuid-a')).toBeNull();
  });
});
