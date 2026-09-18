import { describe, expect, it, vi } from 'vitest';

// The decision functions are pure; the DB lookup is exercised separately
// against the test database below. Mocking the db module keeps the import
// of exec-auth (which reads env at load) side-effect free here.
vi.mock('@/lib/db', () => ({ getPool: () => ({}) }));

const { rankCheckFromLookup, memberCheckFromLookup, EXEC_RANKS, safeRedirectPath } = await import('./exec-auth');

const ID = '500332699928494100';
const linked = (rank: string | null, inGuild: boolean) =>
  ({ linked: true as const, uuid: '11111111-1111-1111-1111-111111111111', ign: 'Kenji121', rank, inGuild });

describe('rankCheckFromLookup (exec API gate)', () => {
  it('rejects an account with no discord_links row', () => {
    expect(rankCheckFromLookup(ID, { linked: false })).toEqual({ ok: false, reason: 'not_linked', discord_id: ID });
  });

  it('rejects a former exec whose uuid is no longer on the roster, even with the rank still set', () => {
    // The audit found 8 such rows in prod: rank alone used to be the whole check.
    const result = rankCheckFromLookup(ID, linked('Narwhal', false));
    expect(result).toEqual({ ok: false, reason: 'not_in_guild', discord_id: ID, ign: 'Kenji121' });
  });

  it('rejects a current member below Hammerhead', () => {
    const result = rankCheckFromLookup(ID, linked('Piranha', true));
    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === 'rank_not_allowed') {
      expect(result.allowed).toEqual(EXEC_RANKS);
    } else {
      throw new Error('expected rank_not_allowed');
    }
  });

  it('rejects a current member with no rank on record', () => {
    const result = rankCheckFromLookup(ID, linked(null, true));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toBe('rank_not_allowed');
  });

  it('accepts a current member with an exec rank', () => {
    expect(rankCheckFromLookup(ID, linked('Hammerhead', true))).toEqual({
      ok: true, uuid: '11111111-1111-1111-1111-111111111111', ign: 'Kenji121', rank: 'Hammerhead',
    });
  });
});

describe('memberCheckFromLookup (any-member gate)', () => {
  it('rejects unlinked and off-roster accounts', () => {
    expect(memberCheckFromLookup(ID, { linked: false }).ok).toBe(false);
    expect(memberCheckFromLookup(ID, linked('Piranha', false)).ok).toBe(false);
  });

  it('derives the role from the rank', () => {
    expect(memberCheckFromLookup(ID, linked('Piranha', true))).toMatchObject({ ok: true, role: 'member', rank: 'Piranha' });
    expect(memberCheckFromLookup(ID, linked('Narwhal', true))).toMatchObject({ ok: true, role: 'exec' });
  });

  it('treats a member with no rank as a plain member with an empty rank', () => {
    expect(memberCheckFromLookup(ID, linked(null, true))).toMatchObject({ ok: true, role: 'member', rank: '' });
  });
});

describe('safeRedirectPath (post-login destination)', () => {
  it('keeps ordinary same-site paths, including query and hash', () => {
    expect(safeRedirectPath('/exec')).toBe('/exec');
    expect(safeRedirectPath('/chronicle/foo?x=1#top')).toBe('/chronicle/foo?x=1#top');
  });

  it('rejects anything that would leave the site', () => {
    // Each of these resolves off-site under `new URL(candidate, baseUrl)`.
    for (const bad of [
      'https://evil.example/',
      '//evil.example/exec',
      '/\\evil.example',
      'javascript:alert(1)',
      'exec',
      '',
      null,
      undefined,
    ]) {
      expect(safeRedirectPath(bad), String(bad)).toBeNull();
    }
  });
});
