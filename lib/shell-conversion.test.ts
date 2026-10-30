import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ getPool: () => { throw new Error('no db in unit tests'); } }));

import { SHELL_CONVERSION_DEFAULTS, cleanShellConversion, shellConversionErrors } from './shell-conversion';

describe('shell conversion rate', () => {
  it('keeps valid whole numbers', () => {
    expect(cleanShellConversion({ shells_per_aspect: 5, max_aspects_per_conversion: 20 }))
      .toEqual({ shells_per_aspect: 5, max_aspects_per_conversion: 20 });
  });

  it('falls back to the defaults for anything else, like the bot does', () => {
    expect(cleanShellConversion(null)).toEqual(SHELL_CONVERSION_DEFAULTS);
    for (const bad of [0, -1, 10001, '5', 2.5, true, null]) {
      expect(cleanShellConversion({ shells_per_aspect: bad }).shells_per_aspect).toBe(3);
    }
  });

  it('words form errors per field', () => {
    expect(shellConversionErrors({ shells_per_aspect: 4, max_aspects_per_conversion: 25 })).toEqual([]);
    expect(shellConversionErrors({ shells_per_aspect: 0, max_aspects_per_conversion: 2.5 })).toEqual([
      'Shells per aspect must be a whole number from 1 to 10000.',
      'Max aspects per conversion must be a whole number from 1 to 10000.',
    ]);
  });
});
