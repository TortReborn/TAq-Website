/**
 * Values a bot panel can show by writing {{key}}: database settings edited on
 * the website. The bot fills them in at publish time (Tort-Reborn
 * Helpers/panel_values.py, keep the keys in sync); saving a value republishes
 * every posted panel that uses it. In the editor they read as {Label}.
 */

export interface PanelValueDef {
  key: string;
  label: string;
  /** Where the value is changed */
  editHref: string;
  editLabel: string;
}

export const PANEL_VALUES: PanelValueDef[] = [
  { key: 'shells_per_aspect', label: 'Shells per aspect', editHref: '/exec/shell-exchange', editLabel: 'Shell Exchange' },
  { key: 'max_aspects_per_conversion', label: 'Max aspects per conversion', editHref: '/exec/shell-exchange', editLabel: 'Shell Exchange' },
];

const BY_KEY = new Map(PANEL_VALUES.map(v => [v.key, v]));
const VALUE_RE = /\{\{\s*([a-z_]+)\s*\}\}/g;

export const isPanelValue = (key: string) => BY_KEY.has(key);

/** Keys a piece of stored text uses, known or not. */
export function valueKeysIn(text: string): string[] {
  return [...text.matchAll(VALUE_RE)].map(m => m[1]);
}

/** Every value key anywhere in a panel's content. */
export function contentValueKeys(content: unknown): string[] {
  return [...new Set(valueKeysIn(JSON.stringify(content ?? '')))];
}

/** Fill {{key}} with current values (preview); unknown keys stay as written. */
export function fillValues<T>(data: T, values: Record<string, string>): T {
  if (typeof data === 'string') return data.replace(VALUE_RE, (whole, key) => values[key] ?? whole) as T;
  if (Array.isArray(data)) return data.map(d => fillValues(d, values)) as T;
  if (data && typeof data === 'object') {
    return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, fillValues(v, values)])) as T;
  }
  return data;
}

/** Stored {{key}} -> {Label} for the editor. */
export function valuesToReadable(text: string): string {
  return text.replace(VALUE_RE, (whole, key) => {
    const def = BY_KEY.get(key);
    return def ? `{${def.label}}` : whole;
  });
}

/** {Label} -> stored {{key}}; anything that isn't a value's label is left alone. */
export function valuesFromReadable(text: string): string {
  return text.replace(/(?<!\{)\{([^{}\n]+)\}(?!\})/g, (whole, label: string) => {
    const def = PANEL_VALUES.find(v => v.label.toLowerCase() === label.trim().toLowerCase());
    return def ? `{{${def.key}}}` : whole;
  });
}
