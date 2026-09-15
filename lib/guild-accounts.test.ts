import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { guildAccountUuids, uuidKey, withoutGuildAccounts } from './guild-accounts';

const WOEALER = '11111111-1111-1111-1111-111111111111';

describe('guild accounts (TAQ-88)', () => {
  it('reads only guild_account rows and keys them dashless', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ uuid: WOEALER }] });
    const set = await guildAccountUuids({ query } as unknown as Pool);
    expect(query.mock.calls[0][1]).toEqual(['guild_account']);
    expect(set.has(uuidKey(WOEALER))).toBe(true);
    expect(set.has(WOEALER)).toBe(false);
  });

  it('filters guild accounts out of a member list regardless of uuid dash format', () => {
    const members = [{ uuid: WOEALER, name: 'Woealer' }, { uuid: '22222222222222222222222222222222', name: 'Human' }];
    const out = withoutGuildAccounts(members, new Set([uuidKey(WOEALER)]));
    expect(out.map(m => m.name)).toEqual(['Human']);
  });

  it('is a no-op when there are no guild accounts', () => {
    const members = [{ uuid: WOEALER }];
    expect(withoutGuildAccounts(members, new Set())).toBe(members);
  });
});
