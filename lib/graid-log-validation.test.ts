import { describe, expect, it } from 'vitest';
import {
  MAX_RAIDS_PER_SUBMISSION,
  resolveGraidLogMode,
  validateGraidLogBatch,
  validateGraidLogSubmission,
  validateGraidRaidType,
} from './graid-log-validation';

describe('resolveGraidLogMode', () => {
  it('respects an explicit group mode even with a single participant', () => {
    expect(resolveGraidLogMode('group', 1)).toBe('group');
  });

  it('respects an explicit individual mode', () => {
    expect(resolveGraidLogMode('individual', 1)).toBe('individual');
  });

  it('infers individual for a single participant when mode is missing', () => {
    expect(resolveGraidLogMode(undefined, 1)).toBe('individual');
  });

  it('infers group for multiple participants when mode is missing', () => {
    expect(resolveGraidLogMode(undefined, 3)).toBe('group');
    expect(resolveGraidLogMode('bogus', 4)).toBe('group');
  });
});

describe('validateGraidLogSubmission', () => {
  it('rejects missing, non-array, or empty participants', () => {
    for (const bad of [undefined, null, 'Alice', {}, []]) {
      const result = validateGraidLogSubmission(bad, 'group');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe('Participants are required.');
    }
  });

  it('rejects blank or non-string entries', () => {
    for (const bad of [['Alice', ''], ['Alice', '   '], ['Alice', 42], ['Alice', null]]) {
      const result = validateGraidLogSubmission(bad, 'group');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe('All participants must have a valid IGN.');
    }
  });

  it.each([
    [['Alice']],
    [['Alice', 'Bob']],
    [['Alice', 'Bob', 'Cara']],
    [['Alice', 'Bob', 'Cara', 'Dana']],
  ])('accepts a group raid with %j', participants => {
    const result = validateGraidLogSubmission(participants, 'group');
    expect(result).toEqual({ ok: true, mode: 'group', participants });
  });

  it('rejects a group raid with more than 4 participants', () => {
    const result = validateGraidLogSubmission(['A', 'B', 'C', 'D', 'E'], 'group');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('Group raids must have between 1 and 4 participants.');
  });

  it('rejects duplicate participants case-insensitively', () => {
    const result = validateGraidLogSubmission(['Alice', 'alice', 'Bob'], 'group');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('All participants must be different players.');
  });

  it('trims whitespace from participants', () => {
    const result = validateGraidLogSubmission(['  Alice ', 'Bob  '], 'group');
    expect(result).toEqual({ ok: true, mode: 'group', participants: ['Alice', 'Bob'] });
  });

  it('keeps a single-participant explicit group raid in group mode', () => {
    const result = validateGraidLogSubmission(['Alice'], 'group');
    expect(result).toEqual({ ok: true, mode: 'group', participants: ['Alice'] });
  });

  it('accepts an individual log with exactly 1 participant', () => {
    const result = validateGraidLogSubmission(['Alice'], 'individual');
    expect(result).toEqual({ ok: true, mode: 'individual', participants: ['Alice'] });
  });

  it('rejects an individual log with more than 1 participant', () => {
    const result = validateGraidLogSubmission(['Alice', 'Bob'], 'individual');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('Individual logs must have exactly 1 participant.');
  });

  it('infers individual mode for a single participant with no explicit mode', () => {
    const result = validateGraidLogSubmission(['Alice'], undefined);
    expect(result).toEqual({ ok: true, mode: 'individual', participants: ['Alice'] });
  });
});

describe('validateGraidRaidType', () => {
  it.each([
    ['NOTG', 'Nest of the Grootslangs'],
    ['TCC', 'The Canyon Colossus'],
    ['TNA', 'The Nameless Anomaly'],
    ['NOL', "Orphion's Nexus of Light"],
    ['WTP', 'The Wartorn Palace'],
  ])('resolves %s to its full name', (short, full) => {
    expect(validateGraidRaidType(short)).toEqual({ ok: true, fullRaidName: full });
  });

  it('resolves Unknown, empty, and missing types to null', () => {
    for (const type of ['Unknown', '', '  ', undefined, null]) {
      expect(validateGraidRaidType(type)).toEqual({ ok: true, fullRaidName: null });
    }
  });

  it('rejects unrecognized raid types', () => {
    const result = validateGraidRaidType('NOTG2');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('Invalid raid type');
  });
});

describe('validateGraidLogBatch', () => {
  it('rejects a missing, non-array, or empty batch', () => {
    for (const bad of [undefined, null, {}, 'NOTG', []]) {
      const result = validateGraidLogBatch(bad);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe('At least one raid is required.');
    }
  });

  it('rejects a batch above the size cap', () => {
    const raids = Array.from({ length: MAX_RAIDS_PER_SUBMISSION + 1 }, () => ({
      raidType: 'NOTG',
      participants: ['Alice'],
    }));
    const result = validateGraidLogBatch(raids);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(`${MAX_RAIDS_PER_SUBMISSION}`);
  });

  it('rejects non-object entries with their position', () => {
    const result = validateGraidLogBatch([{ raidType: 'NOTG', participants: ['Alice'] }, 'bogus']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('Raid 2: invalid entry.');
  });

  it('rejects the whole batch when one raid has a bad type', () => {
    const result = validateGraidLogBatch([
      { raidType: 'NOTG', participants: ['Alice'] },
      { raidType: 'XYZ', participants: ['Bob'] },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('Raid 2:');
  });

  it('rejects the whole batch when one raid has invalid participants', () => {
    const result = validateGraidLogBatch([
      { raidType: 'NOTG', participants: ['Alice'] },
      { raidType: 'TCC', participants: ['Bob', 'bob'] },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('Raid 2: All participants must be different players.');
  });

  it('validates a mixed batch, resolving types and trimming participants', () => {
    const result = validateGraidLogBatch([
      { raidType: 'NOTG', participants: [' Alice ', 'Bob'] },
      { raidType: 'Unknown', participants: ['Cara'] },
      { raidType: 'WTP', participants: ['Alice', 'Bob', 'Cara', 'Dana'] },
    ]);
    expect(result).toEqual({
      ok: true,
      raids: [
        { raidType: 'Nest of the Grootslangs', participants: ['Alice', 'Bob'], announce: true },
        { raidType: null, participants: ['Cara'], announce: true },
        { raidType: 'The Wartorn Palace', participants: ['Alice', 'Bob', 'Cara', 'Dana'], announce: true },
      ],
    });
  });

  it('allows the same raid to appear multiple times', () => {
    const raids = Array.from({ length: 3 }, () => ({ raidType: 'TNA', participants: ['Alice', 'Bob'] }));
    const result = validateGraidLogBatch(raids);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.raids).toHaveLength(3);
  });

  it('defaults announce to true and honors an explicit false', () => {
    const result = validateGraidLogBatch([
      { raidType: 'NOTG', participants: ['Alice'] },
      { raidType: 'TCC', participants: ['Bob'], announce: false },
      { raidType: 'TNA', participants: ['Cara'], announce: true },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.raids.map(r => r.announce)).toEqual([true, false, true]);
  });

  it('rejects a non-boolean announce flag', () => {
    const result = validateGraidLogBatch([
      { raidType: 'NOTG', participants: ['Alice'], announce: 'yes' },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('Raid 1: announce must be a boolean.');
  });
});
