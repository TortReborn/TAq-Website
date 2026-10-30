/**
 * Shells -> aspects conversion rate (cache_entries 'shellConversion'). Edited on
 * the Shell Exchange page; the bot reads it on every conversion and shows it in
 * the conversion popup. Panel text deliberately doesn't state it, so nothing goes stale.
 * Its own key, because the bot rewrites 'shellExchangeConfig' wholesale.
 * Defaults and limits match Tort-Reborn Helpers/database.py.
 */

import { getPool } from '@/lib/db';

export interface ShellConversion {
  shells_per_aspect: number;
  max_aspects_per_conversion: number;
}

export const SHELL_CONVERSION_DEFAULTS: ShellConversion = { shells_per_aspect: 3, max_aspects_per_conversion: 40 };
export const SHELL_CONVERSION_MAX = 10000;

const valid = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= SHELL_CONVERSION_MAX;

export function cleanShellConversion(data: Record<string, unknown> | null | undefined): ShellConversion {
  return {
    shells_per_aspect: valid(data?.shells_per_aspect) ? data!.shells_per_aspect as number : SHELL_CONVERSION_DEFAULTS.shells_per_aspect,
    max_aspects_per_conversion: valid(data?.max_aspects_per_conversion) ? data!.max_aspects_per_conversion as number : SHELL_CONVERSION_DEFAULTS.max_aspects_per_conversion,
  };
}

/** Problems with a submitted rate, worded for the form. */
export function shellConversionErrors(data: Record<string, unknown>): string[] {
  const errors: string[] = [];
  if (!valid(data.shells_per_aspect)) errors.push(`Shells per aspect must be a whole number from 1 to ${SHELL_CONVERSION_MAX}.`);
  if (!valid(data.max_aspects_per_conversion)) errors.push(`Max aspects per conversion must be a whole number from 1 to ${SHELL_CONVERSION_MAX}.`);
  return errors;
}

export async function getShellConversion(): Promise<ShellConversion> {
  const { rows } = await getPool().query(`SELECT data FROM cache_entries WHERE cache_key = 'shellConversion'`);
  const data = rows[0]?.data;
  return cleanShellConversion(typeof data === 'string' ? JSON.parse(data) : data);
}

export async function saveShellConversion(value: ShellConversion): Promise<void> {
  await getPool().query(
    `INSERT INTO cache_entries (cache_key, data, expires_at)
     VALUES ('shellConversion', $1, $2)
     ON CONFLICT (cache_key) DO UPDATE SET data = EXCLUDED.data, created_at = NOW()`,
    [JSON.stringify(value), new Date(0).toISOString()],
  );
}
