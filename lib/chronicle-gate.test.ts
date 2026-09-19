import { describe, expect, it } from 'vitest';
import { CHRONICLE_RESTRICTED, canEnterChronicle } from './chronicle-gate';

// TAQ-90: while the Chronicle is under construction only reviewers (chroniclers
// and execs) may see any of it. These pin the rule so flipping the flag later
// is a deliberate act, not a drift.

describe('canEnterChronicle (under-construction gate)', () => {
  it('is currently restricted', () => {
    expect(CHRONICLE_RESTRICTED).toBe(true);
  });

  it('refuses anonymous visitors', () => {
    expect(canEnterChronicle(null)).toBe(false);
    expect(canEnterChronicle(undefined)).toBe(false);
  });

  it('refuses a signed-in account that cannot review', () => {
    // A non-guild Discord account, or a guild member below exec: signed in,
    // holds a principal, may normally suggest edits — but not while hidden.
    expect(canEnterChronicle({ canReview: false })).toBe(false);
  });

  it('admits anyone who can review: chroniclers and execs', () => {
    expect(canEnterChronicle({ canReview: true })).toBe(true);
  });
});
