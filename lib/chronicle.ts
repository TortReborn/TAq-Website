/**
 * Map Chronicle — community-maintained alliances and historical events,
 * shown on the map when the Chronicle layer is toggled on.
 *
 * Lifecycle: anyone with a linked guild account proposes an addition or an
 * edit → an exec approves or rejects it → approved entries render on the map.
 * Every change goes through the same submission queue, so the queue doubles
 * as the audit/revision history.
 *
 * This module is CLIENT-SAFE: pure types, validation and interval math only.
 * Database access lives in lib/chronicle-db.ts (server-only).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChronicleMembership {
  guild: string;
  /** ISO date (interpreted as UTC midnight) */
  joinedAt: string;
  /** ISO date, or null while still a member */
  leftAt: string | null;
}

export interface AlliancePayload {
  name: string;
  tag: string;
  color: string;
  description: string;
  memberships: ChronicleMembership[];
}

export type ChronicleEventType = 'war' | 'treaty' | 'founding' | 'disband' | 'other';

export interface EventPayload {
  eventType: ChronicleEventType;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string | null;
  guilds: string[];
  /** Alliance names involved (validated against approved alliances) */
  alliances: string[];
}

export interface ChronicleAlliance extends AlliancePayload {
  id: number;
}

export interface ChronicleEvent extends EventPayload {
  id: number;
}

export interface ChronicleData {
  alliances: ChronicleAlliance[];
  events: ChronicleEvent[];
}

export interface ChronicleSubmission {
  id: number;
  kind: 'alliance' | 'event';
  targetId: number | null;
  payload: AlliancePayload | EventPayload;
  note: string;
  status: 'pending' | 'approved' | 'rejected';
  submittedBy: string;
  submittedName: string;
  submittedAt: string;
  reviewedBy: string | null;
  reviewNote: string | null;
  reviewedAt: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Suggested colors — any #rrggbb hex is accepted, these are just the quick picks. */
export const CHRONICLE_PALETTE = [
  '#e53935', '#fb8c00', '#fdd835', '#43a047', '#00acc1', '#1e88e5',
  '#5e35b1', '#d81b60', '#8d6e63', '#00897b', '#7cb342', '#f4511e',
] as const;

/** Colors are constrained to 6-digit hex — never arbitrary CSS (no names, functions, or shorthand). */
export const CHRONICLE_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export const CHRONICLE_EVENT_TYPES: ChronicleEventType[] = ['war', 'treaty', 'founding', 'disband', 'other'];

export const CHRONICLE_LIMITS = {
  nameMax: 60,
  tagMax: 8,
  titleMax: 80,
  descriptionMax: 1000,
  noteMax: 300,
  membershipsMax: 40,
  eventGuildsMax: 16,
  eventAlliancesMax: 8,
  /** Pending submissions allowed per user at once */
  pendingPerUser: 5,
} as const;

/** Valid date window for chronicle timestamps */
export const CHRONICLE_MIN_MS = Date.UTC(2018, 0, 1);

// ---------------------------------------------------------------------------
// Validation (shape-level; guild-name existence is checked server-side)
// ---------------------------------------------------------------------------

type Valid<T> = { ok: true; value: T } | { ok: false; error: string };

/** Strip control characters and collapse runs of whitespace. */
function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  if (cleaned.length === 0 || cleaned.length > max) return null;
  return cleaned;
}

function cleanDate(value: unknown, { required }: { required: boolean }): string | null | 'invalid' {
  if (value === null || value === undefined || value === '') {
    return required ? 'invalid' : null;
  }
  if (typeof value !== 'string') return 'invalid';
  const ms = Date.parse(value);
  if (isNaN(ms)) return 'invalid';
  if (ms < CHRONICLE_MIN_MS || ms > Date.now() + 24 * 60 * 60 * 1000) return 'invalid';
  return new Date(ms).toISOString();
}

export function validateAlliancePayload(raw: unknown): Valid<AlliancePayload> {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'Invalid payload' };
  const p = raw as Record<string, unknown>;

  const name = cleanText(p.name, CHRONICLE_LIMITS.nameMax);
  if (!name) return { ok: false, error: `Name is required (max ${CHRONICLE_LIMITS.nameMax} chars)` };

  const tag = cleanText(p.tag, CHRONICLE_LIMITS.tagMax) ?? '';
  if (tag && !/^[A-Za-z0-9]{2,8}$/.test(tag)) return { ok: false, error: 'Tag must be 2–8 letters/digits' };

  const color = typeof p.color === 'string' ? p.color.trim().toLowerCase() : '';
  if (!CHRONICLE_COLOR_RE.test(color)) return { ok: false, error: 'Color must be a hex code like #1e88e5' };

  const description = cleanText(p.description, CHRONICLE_LIMITS.descriptionMax) ?? '';

  if (!Array.isArray(p.memberships) || p.memberships.length === 0) {
    return { ok: false, error: 'At least one member guild is required' };
  }
  if (p.memberships.length > CHRONICLE_LIMITS.membershipsMax) {
    return { ok: false, error: `Too many membership entries (max ${CHRONICLE_LIMITS.membershipsMax})` };
  }

  const memberships: ChronicleMembership[] = [];
  for (const m of p.memberships) {
    if (typeof m !== 'object' || m === null) return { ok: false, error: 'Invalid membership entry' };
    const mm = m as Record<string, unknown>;
    const guild = cleanText(mm.guild, CHRONICLE_LIMITS.nameMax);
    if (!guild) return { ok: false, error: 'Each membership needs a guild name' };
    const joinedAt = cleanDate(mm.joinedAt, { required: true });
    if (joinedAt === 'invalid' || joinedAt === null) return { ok: false, error: `Invalid join date for ${guild}` };
    const leftAt = cleanDate(mm.leftAt, { required: false });
    if (leftAt === 'invalid') return { ok: false, error: `Invalid leave date for ${guild}` };
    if (leftAt !== null && Date.parse(leftAt) <= Date.parse(joinedAt)) {
      return { ok: false, error: `${guild}: leave date must be after join date` };
    }
    memberships.push({ guild, joinedAt, leftAt });
  }

  return { ok: true, value: { name, tag, color, description, memberships } };
}

export function validateEventPayload(raw: unknown): Valid<EventPayload> {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'Invalid payload' };
  const p = raw as Record<string, unknown>;

  const eventType = typeof p.eventType === 'string' && (CHRONICLE_EVENT_TYPES as string[]).includes(p.eventType)
    ? (p.eventType as ChronicleEventType)
    : null;
  if (!eventType) return { ok: false, error: 'Invalid event type' };

  const title = cleanText(p.title, CHRONICLE_LIMITS.titleMax);
  if (!title) return { ok: false, error: `Title is required (max ${CHRONICLE_LIMITS.titleMax} chars)` };

  const description = cleanText(p.description, CHRONICLE_LIMITS.descriptionMax) ?? '';

  const startsAt = cleanDate(p.startsAt, { required: true });
  if (startsAt === 'invalid' || startsAt === null) return { ok: false, error: 'Invalid start date' };
  const endsAt = cleanDate(p.endsAt, { required: false });
  if (endsAt === 'invalid') return { ok: false, error: 'Invalid end date' };
  if (endsAt !== null && Date.parse(endsAt) <= Date.parse(startsAt)) {
    return { ok: false, error: 'End date must be after start date' };
  }

  if (!Array.isArray(p.guilds)) return { ok: false, error: 'Invalid guild list' };
  if (p.guilds.length > CHRONICLE_LIMITS.eventGuildsMax) {
    return { ok: false, error: `Too many guilds (max ${CHRONICLE_LIMITS.eventGuildsMax})` };
  }
  const guilds: string[] = [];
  for (const g of p.guilds) {
    const guild = cleanText(g, CHRONICLE_LIMITS.nameMax);
    if (!guild) return { ok: false, error: 'Invalid guild name in list' };
    if (!guilds.includes(guild)) guilds.push(guild);
  }

  // Alliances are optional participants (older payloads may omit the field)
  const rawAlliances = p.alliances ?? [];
  if (!Array.isArray(rawAlliances)) return { ok: false, error: 'Invalid alliance list' };
  if (rawAlliances.length > CHRONICLE_LIMITS.eventAlliancesMax) {
    return { ok: false, error: `Too many alliances (max ${CHRONICLE_LIMITS.eventAlliancesMax})` };
  }
  const alliances: string[] = [];
  for (const a of rawAlliances) {
    const alliance = cleanText(a, CHRONICLE_LIMITS.nameMax);
    if (!alliance) return { ok: false, error: 'Invalid alliance name in list' };
    if (!alliances.includes(alliance)) alliances.push(alliance);
  }

  return { ok: true, value: { eventType, title, description, startsAt, endsAt, guilds, alliances } };
}

// ---------------------------------------------------------------------------
// Interval math
// ---------------------------------------------------------------------------

/**
 * Guild → alliance color at a moment in time. A guild in several alliances at
 * once (data-entry overlap) gets the first match — approvers should prevent
 * real overlaps.
 */
export function allianceColorsAt(alliances: ChronicleAlliance[], tMs: number): Map<string, string> {
  const colors = new Map<string, string>();
  for (const alliance of alliances) {
    for (const m of alliance.memberships) {
      if (Date.parse(m.joinedAt) <= tMs && (m.leftAt === null || Date.parse(m.leftAt) > tMs)) {
        if (!colors.has(m.guild)) colors.set(m.guild, alliance.color);
      }
    }
  }
  return colors;
}

/** Alliances with at least one active membership at a moment in time. */
export function activeAlliancesAt(alliances: ChronicleAlliance[], tMs: number): ChronicleAlliance[] {
  return alliances.filter(a =>
    a.memberships.some(m => Date.parse(m.joinedAt) <= tMs && (m.leftAt === null || Date.parse(m.leftAt) > tMs))
  );
}

/** An alliance's lifetime as one span: first join → last leave (null = still active). */
export interface AllianceTimelineSpan {
  id: number;
  name: string;
  tag: string;
  color: string;
  startMs: number;
  endMs: number | null;
}

/** Collapse each alliance's memberships into a single timeline span, sorted by start. */
export function allianceTimelineSpans(alliances: ChronicleAlliance[]): AllianceTimelineSpan[] {
  const spans: AllianceTimelineSpan[] = [];
  for (const a of alliances) {
    if (a.memberships.length === 0) continue;
    let startMs = Infinity;
    let endMs: number | null = -Infinity;
    for (const m of a.memberships) {
      startMs = Math.min(startMs, Date.parse(m.joinedAt));
      if (endMs !== null) {
        endMs = m.leftAt === null ? null : Math.max(endMs, Date.parse(m.leftAt));
      }
    }
    spans.push({ id: a.id, name: a.name, tag: a.tag, color: a.color, startMs, endMs });
  }
  return spans.sort((x, y) => x.startMs - y.startMs);
}

/** Display label for an event type ("war" → "War") */
export function eventTypeLabel(type: ChronicleEventType): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

export function chronicleEventColor(type: ChronicleEventType): string {
  switch (type) {
    case 'war': return '#e53935';
    case 'treaty': return '#43a047';
    case 'founding': return '#1e88e5';
    case 'disband': return '#9e9e9e';
    default: return '#8e24aa';
  }
}
