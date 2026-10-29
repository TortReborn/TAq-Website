/**
 * Warning tracker (TAQ-79): shared by the API routes and the exec pages.
 * Spec: docs/specs/taq-79-warning-tracker.md
 */

export const WARNING_KINDS = [
  'note', 'soft', 'written', 'formal', 'dishonored_fish',
  'timeout', 'mute', 'demotion', 'kick', 'ban', 'blacklist',
] as const;

export type WarningKind = typeof WARNING_KINDS[number];

/** The kinds the profile badge counts. Everything else is history only. */
export const COUNTED_KINDS: readonly WarningKind[] = ['soft', 'written', 'formal'];

export const KIND_META: Record<WarningKind, { label: string; color: string; hint: string }> = {
  note:            { label: 'Note',            color: '#94a3b8', hint: 'An incident worth recording, no warning given' },
  soft:            { label: 'Soft',            color: '#eab308', hint: 'A verbal or casual warning' },
  written:         { label: 'Written',         color: '#f97316', hint: 'A written warning sent to the player' },
  formal:          { label: 'Formal',          color: '#ef4444', hint: 'A formal written warning' },
  dishonored_fish: { label: 'Dishonored Fish', color: '#a78bfa', hint: 'Gives the Dishonored Fish role in the main Discord' },
  timeout:         { label: 'Timeout',         color: '#64748b', hint: 'Record of a Discord timeout' },
  mute:            { label: 'Mute',            color: '#64748b', hint: 'Record of a mute' },
  demotion:        { label: 'Demotion',        color: '#64748b', hint: 'Record of a rank demotion' },
  kick:            { label: 'Kick',            color: '#475569', hint: 'Record that the player was kicked' },
  ban:             { label: 'Ban',             color: '#475569', hint: 'Record of a Discord ban' },
  blacklist:       { label: 'Blacklist',       color: '#475569', hint: 'Record of a blacklisting; the Blacklist page stays the source of truth' },
};

export function isWarningKind(value: unknown): value is WarningKind {
  return typeof value === 'string' && (WARNING_KINDS as readonly string[]).includes(value);
}

const BIGINT_MAX = BigInt('9223372036854775807');

/** A Discord user id (snowflake), or null/empty to clear. Returns the id, null, or an error. */
export function parseDiscordIdInput(value: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
    return { ok: true, value: null };
  }
  const invalid = { ok: false as const, error: 'A Discord id is 17 to 20 digits. Right-click the user in Discord and choose Copy User ID.' };
  if (typeof value !== 'string' || !/^\d{17,20}$/.test(value.trim())) return invalid;
  // Stored as BIGINT; a 20-digit value can still overflow it.
  if (BigInt(value.trim()) > BIGINT_MAX) return invalid;
  return { ok: true, value: value.trim() };
}

export const RULE_MAX = 500;
export const NOTES_MAX = 4000;
export const REVOKE_REASON_MAX = 500;

export interface WarningInput {
  ign: string;
  kind: WarningKind;
  rule: string;
  notes: string | null;
}

/** Validate a POST body for a new entry. Returns the cleaned input or an error message. */
export function parseWarningInput(body: unknown): { ok: true; value: WarningInput } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Invalid request body' };
  const { ign, kind, rule, notes } = body as Record<string, unknown>;

  if (typeof ign !== 'string' || !/^[A-Za-z0-9_]{1,16}$/.test(ign.trim())) {
    return { ok: false, error: 'Enter a valid Minecraft name' };
  }
  if (!isWarningKind(kind)) return { ok: false, error: 'Pick a type' };
  if (typeof rule !== 'string' || rule.trim().length === 0) return { ok: false, error: 'Rule broken is required' };
  if (rule.trim().length > RULE_MAX) return { ok: false, error: `Rule broken must be ${RULE_MAX} characters or fewer` };
  if (notes != null && typeof notes !== 'string') return { ok: false, error: 'Invalid notes' };
  const cleanNotes = typeof notes === 'string' && notes.trim() ? notes.trim() : null;
  if (cleanNotes && cleanNotes.length > NOTES_MAX) return { ok: false, error: `Notes must be ${NOTES_MAX} characters or fewer` };

  return { ok: true, value: { ign: ign.trim(), kind, rule: rule.trim(), notes: cleanNotes } };
}

export interface WarningCounts {
  /** Active soft + written + formal. The number on the badge. */
  total: number;
  soft: number;
  written: number;
  formal: number;
  dishonored: boolean;
}

/** Count a profile's active entries. Revoked entries never count. */
export function countWarnings(entries: { kind: string; revokedAt: string | null }[]): WarningCounts {
  const counts: WarningCounts = { total: 0, soft: 0, written: 0, formal: 0, dishonored: false };
  for (const e of entries) {
    if (e.revokedAt) continue;
    if (e.kind === 'soft' || e.kind === 'written' || e.kind === 'formal') {
      counts[e.kind]++;
      counts.total++;
    } else if (e.kind === 'dishonored_fish') {
      counts.dishonored = true;
    }
  }
  return counts;
}

// --- API shapes ---

export interface WarningProfileSummary {
  uuid: string;
  ign: string;
  counts: WarningCounts;
  entryCount: number;
  /** Entries of any kind that aren't revoked. Zero means everything on file was revoked. */
  activeEntryCount: number;
  lastIssuedAt: string;
}

export interface WarningAttachment {
  id: number;
  filename: string;
  contentType: string;
}

export interface WarningEntry {
  id: number;
  ign: string;
  kind: WarningKind;
  rule: string;
  notes: string | null;
  issuedBy: string;
  issuedByIgn: string | null;
  issuedAt: string;
  revokedAt: string | null;
  revokedBy: string | null;
  revokedByIgn: string | null;
  revokeReason: string | null;
  source: 'website' | 'discord' | 'backfill';
  sourceLink: string | null;
  attachments: WarningAttachment[];
}

export interface WarningProfile {
  uuid: string;
  ign: string;
  /** Typed in by exec for a player with no linked account. */
  discordId: string | null;
  /** From discord_links. The bot uses this one when both exist. */
  linkedDiscordId: string | null;
  threadUrl: string | null;
  legacyThreads: { url: string; title: string }[];
  counts: WarningCounts;
  entries: WarningEntry[];
}
