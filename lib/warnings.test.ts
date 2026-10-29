import { describe, expect, it } from 'vitest';
import { countWarnings, isWarningKind, parseWarningInput, RULE_MAX } from './warnings';

describe('countWarnings', () => {
  it('counts only soft, written and formal toward the total', () => {
    const counts = countWarnings([
      { kind: 'soft', revokedAt: null },
      { kind: 'written', revokedAt: null },
      { kind: 'formal', revokedAt: null },
      { kind: 'note', revokedAt: null },
      { kind: 'kick', revokedAt: null },
      { kind: 'timeout', revokedAt: null },
    ]);
    expect(counts).toEqual({ total: 3, soft: 1, written: 1, formal: 1, dishonored: false });
  });

  it('skips revoked entries', () => {
    const counts = countWarnings([
      { kind: 'soft', revokedAt: '2026-10-01T00:00:00Z' },
      { kind: 'soft', revokedAt: null },
    ]);
    expect(counts.total).toBe(1);
    expect(counts.soft).toBe(1);
  });

  it('flags dishonored fish without counting it', () => {
    const counts = countWarnings([{ kind: 'dishonored_fish', revokedAt: null }]);
    expect(counts.dishonored).toBe(true);
    expect(counts.total).toBe(0);
  });

  it('drops the dishonored flag once every dishonored entry is revoked', () => {
    const counts = countWarnings([{ kind: 'dishonored_fish', revokedAt: '2026-10-01T00:00:00Z' }]);
    expect(counts.dishonored).toBe(false);
  });
});

describe('parseWarningInput', () => {
  const valid = { ign: '  Player_1 ', kind: 'written', rule: ' Slurs in guild chat ', notes: '  ' };

  it('trims fields and turns blank notes into null', () => {
    expect(parseWarningInput(valid)).toEqual({
      ok: true,
      value: { ign: 'Player_1', kind: 'written', rule: 'Slurs in guild chat', notes: null },
    });
  });

  it('rejects names Minecraft would not allow', () => {
    expect(parseWarningInput({ ...valid, ign: 'has space' }).ok).toBe(false);
    expect(parseWarningInput({ ...valid, ign: 'a'.repeat(17) }).ok).toBe(false);
  });

  it('rejects an unknown kind', () => {
    expect(parseWarningInput({ ...valid, kind: 'strike' }).ok).toBe(false);
  });

  it('requires a rule and caps its length', () => {
    expect(parseWarningInput({ ...valid, rule: '   ' }).ok).toBe(false);
    expect(parseWarningInput({ ...valid, rule: 'x'.repeat(RULE_MAX + 1) }).ok).toBe(false);
  });

  it('rejects a non-object body', () => {
    expect(parseWarningInput(null).ok).toBe(false);
    expect(parseWarningInput('nope').ok).toBe(false);
  });
});

describe('isWarningKind', () => {
  it('accepts every kind the database allows', () => {
    for (const k of ['note', 'soft', 'written', 'formal', 'dishonored_fish', 'timeout', 'mute', 'demotion', 'kick', 'ban', 'blacklist']) {
      expect(isWarningKind(k)).toBe(true);
    }
  });
});
