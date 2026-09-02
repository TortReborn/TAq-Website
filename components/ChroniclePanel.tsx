"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { X, Plus, Pencil, CornerDownLeft, Check, Maximize2, Minimize2 } from "lucide-react";
import {
  AlliancePayload,
  ChronicleAlliance,
  ChronicleData,
  ChronicleEvent,
  ChronicleEventType,
  CHRONICLE_EVENT_TYPES,
  CHRONICLE_LIMITS,
  CHRONICLE_PALETTE,
  CHRONICLE_COLOR_RE,
  EventPayload,
  activeAlliancesAt,
  chronicleEventColor,
  eventTypeLabel,
  validateAlliancePayload,
  validateEventPayload,
} from "@/lib/chronicle";
import { useExecSession } from "@/hooks/useExecSession";
import PickerField from "./PickerField";
import { EVENT_LEADUP_MS } from "./HistoryTimeline";

interface ChroniclePanelProps {
  isOpen: boolean;
  onClose: () => void;
  data: ChronicleData | null;
  /** The moment the map is currently showing (history timestamp, or now in live mode) */
  timestampMs: number;
  /** Jump the history timeline to a date (absent in live mode) */
  onJumpToDate?: (date: Date) => void;
  availableGuilds: { name: string; prefix: string }[];
  /** Map container size — keeps the dragged panel inside the map */
  containerBounds?: { width: number; height: number };
}

// Date-only entries are stored as UTC midnight and displayed as bare dates
// (in UTC, so "2019-01-01" never shows as Dec 31). Entries with a
// time-of-day are entered and displayed in the viewer's local timezone.
const DATE_FMT = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const DATETIME_FMT = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const isDateOnly = (value: string, d: Date) =>
  value.endsWith('Z') && d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;
const fmtDate = (iso: string | null) => {
  if (!iso) return 'present';
  const d = new Date(iso);
  return isDateOnly(iso, d) ? DATE_FMT.format(d) : DATETIME_FMT.format(d);
};
/** Split a stored value into date/time input strings. Time is empty for date-only entries. */
const whenParts = (value: string | null): { date: string; time: string } => {
  if (!value) return { date: '', time: '' };
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return { date: value, time: '' };
  const d = new Date(value);
  if (isNaN(d.getTime())) return { date: value.slice(0, 10), time: '' };
  if (isDateOnly(value, d)) return { date: value.slice(0, 10), time: '' };
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
};
/** Compose input strings back into a value: bare date = UTC midnight, date+time = local instant. */
const composeWhen = (date: string, time: string): string => (date ? (time ? `${date}T${time}` : date) : '');

const inputStyle: React.CSSProperties = {
  height: '30px',
  boxSizing: 'border-box',
  padding: '0 0.5rem',
  borderRadius: '0.375rem',
  border: '1px solid var(--border-color)',
  background: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
  fontSize: '0.8rem',
  outline: 'none',
  width: '100%',
};

const smallBtn: React.CSSProperties = {
  height: '26px',
  padding: '0 0.5rem',
  borderRadius: '0.375rem',
  border: '1px solid var(--border-color)',
  background: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
  fontSize: '0.7rem',
  fontWeight: 600,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.25rem',
};

// ---------------------------------------------------------------------------
// Guild autocomplete — the full guild list is thousands of entries, so a
// native <datalist> is too heavy; this renders the top matches only.
// ---------------------------------------------------------------------------

function GuildInput({
  value,
  onChange,
  guilds,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  guilds: { name: string; prefix: string }[];
  placeholder?: string;
}) {
  const [focused, setFocused] = useState(false);
  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (q.length < 2) return [];
    return guilds
      .filter(g => g.name.toLowerCase().includes(q) || g.prefix.toLowerCase() === q)
      .slice(0, 8);
  }, [value, guilds]);
  const exact = guilds.some(g => g.name === value);

  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
      <input
        type="text"
        value={value}
        placeholder={placeholder ?? 'Guild name'}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        style={{
          ...inputStyle,
          borderColor: value && !exact ? 'var(--accent-primary)' : 'var(--border-color)',
        }}
      />
      {focused && matches.length > 0 && !exact && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          zIndex: 60,
          background: 'var(--bg-card-solid)',
          border: '1px solid var(--border-color)',
          borderRadius: '0.375rem',
          overflow: 'hidden',
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        }}>
          {matches.map(g => (
            <button
              key={g.name}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onChange(g.name); }}
              style={{
                display: 'block',
                width: '100%',
                padding: '0.3rem 0.5rem',
                border: 'none',
                background: 'transparent',
                color: 'var(--text-primary)',
                fontSize: '0.75rem',
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              {g.name} {g.prefix && <span style={{ opacity: 0.6 }}>[{g.prefix}]</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Submission form
// ---------------------------------------------------------------------------

export type FormState =
  | { mode: 'closed' }
  | { mode: 'alliance'; targetId: number | null; initial: AlliancePayload }
  | { mode: 'event'; targetId: number | null; initial: EventPayload };

const EMPTY_ALLIANCE: AlliancePayload = {
  name: '', tag: '', color: CHRONICLE_PALETTE[5], description: '',
  memberships: [{ guild: '', joinedAt: '', leftAt: null }],
};

/** Form-only grouping: one block per guild, each holding any number of stints. */
type MemberDraft = { guild: string; stints: { joinedAt: string; leftAt: string | null }[] };

function toMemberDrafts(memberships: AlliancePayload['memberships']): MemberDraft[] {
  const drafts: MemberDraft[] = [];
  for (const m of memberships) {
    const existing = m.guild.trim() !== '' ? drafts.find(d => d.guild === m.guild) : undefined;
    if (existing) existing.stints.push({ joinedAt: m.joinedAt, leftAt: m.leftAt });
    else drafts.push({ guild: m.guild, stints: [{ joinedAt: m.joinedAt, leftAt: m.leftAt }] });
  }
  return drafts.length > 0 ? drafts : [{ guild: '', stints: [{ joinedAt: '', leftAt: null }] }];
}

function fromMemberDrafts(drafts: MemberDraft[]): AlliancePayload['memberships'] {
  return drafts
    .filter(d => d.guild.trim() !== '')
    .flatMap(d => d.stints.map(s => ({ guild: d.guild, joinedAt: s.joinedAt, leftAt: s.leftAt })));
}
const EMPTY_EVENT: EventPayload = {
  eventType: 'war', title: '', description: '', startsAt: '', endsAt: null, guilds: [], alliances: [],
};

export function SubmitForm({
  form,
  guilds,
  allianceNames,
  onDone,
  onCancel,
  direct = false,
}: {
  form: Exclude<FormState, { mode: 'closed' }>;
  guilds: { name: string; prefix: string }[];
  /** Approved alliance names, offered as event participants */
  allianceNames: string[];
  onDone: () => void;
  onCancel: () => void;
  /** Exec direct-edit mode: publishes immediately instead of queueing for review */
  direct?: boolean;
}) {
  const isAlliance = form.mode === 'alliance';
  const [alliance, setAlliance] = useState<AlliancePayload>(
    isAlliance ? (form.initial as AlliancePayload) : EMPTY_ALLIANCE,
  );
  const [members, setMembers] = useState<MemberDraft[]>(() =>
    isAlliance ? toMemberDrafts((form.initial as AlliancePayload).memberships) : [],
  );
  const [event, setEvent] = useState<EventPayload>(
    !isAlliance ? (form.initial as EventPayload) : EMPTY_EVENT,
  );
  const totalStints = members.reduce((n, d) => n + d.stints.length, 0);
  const [eventGuild, setEventGuild] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    setError(null);
    const payload = isAlliance
      ? { ...alliance, memberships: fromMemberDrafts(members) }
      : event;
    const validated = isAlliance ? validateAlliancePayload(payload) : validateEventPayload(payload);
    if (!validated.ok) { setError(validated.error); return; }

    setBusy(true);
    try {
      const res = await fetch(direct ? '/api/chronicle/admin' : '/api/chronicle/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: form.mode, targetId: form.targetId, payload: validated.value, note }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError(body.error ?? `Submission failed (${res.status})`); return; }
      setSent(true);
    } catch {
      setError('Network error — please try again');
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div style={{ textAlign: 'center', padding: '1rem 0' }}>
        <Check size={22} style={{ color: 'var(--accent-primary)' }} />
        <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', marginTop: '0.4rem' }}>
          {direct ? 'Published' : 'Submitted for review'}
        </div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
          {direct
            ? 'The change is live on the map.'
            : 'An exec will approve or reject it — approved entries appear on the map.'}
        </div>
        <button type="button" style={{ ...smallBtn, marginTop: '0.75rem' }} onClick={onDone}>Done</button>
      </div>
    );
  }

  const label = (text: string) => (
    <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-secondary)', margin: '0.5rem 0 0.2rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
      {text}
    </div>
  );

  return (
    <div>
      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
        {direct
          ? (form.targetId !== null ? `Edit ${form.mode}` : `New ${form.mode}`)
          : form.targetId !== null ? 'Suggest an edit' : isAlliance ? 'Suggest an alliance' : 'Suggest an event'}
      </div>

      {isAlliance ? (
        <>
          {label('Name')}
          <input style={inputStyle} value={alliance.name} maxLength={CHRONICLE_LIMITS.nameMax}
            onChange={(e) => setAlliance(a => ({ ...a, name: e.target.value }))} />
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <div style={{ width: '6rem' }}>
              {label('Tag')}
              <input style={inputStyle} value={alliance.tag} maxLength={CHRONICLE_LIMITS.tagMax}
                placeholder="optional" onChange={(e) => setAlliance(a => ({ ...a, tag: e.target.value }))} />
            </div>
            <div style={{ flex: 1 }}>
              {label('Color')}
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
                {CHRONICLE_PALETTE.map(c => (
                  <button key={c} type="button" onClick={() => setAlliance(a => ({ ...a, color: c }))}
                    style={{
                      width: '20px', height: '20px', borderRadius: '4px', background: c, cursor: 'pointer',
                      border: alliance.color === c ? '2px solid var(--text-primary)' : '2px solid transparent',
                    }} />
                ))}
                {/* Custom color — any hex, via the native picker or typed directly */}
                <label title="Custom color" style={{
                  position: 'relative', width: '20px', height: '20px', borderRadius: '4px', cursor: 'pointer',
                  background: (CHRONICLE_PALETTE as readonly string[]).includes(alliance.color)
                    ? 'conic-gradient(#e53935, #fdd835, #43a047, #1e88e5, #d81b60, #e53935)'
                    : alliance.color,
                  border: !(CHRONICLE_PALETTE as readonly string[]).includes(alliance.color)
                    ? '2px solid var(--text-primary)' : '2px solid transparent',
                }}>
                  <input type="color" value={CHRONICLE_COLOR_RE.test(alliance.color) ? alliance.color : '#1e88e5'}
                    onChange={(e) => setAlliance(a => ({ ...a, color: e.target.value }))}
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }} />
                </label>
                <input value={alliance.color} maxLength={7} spellCheck={false}
                  onChange={(e) => setAlliance(a => ({ ...a, color: e.target.value.trim().toLowerCase() }))}
                  style={{
                    ...inputStyle, width: '4.6rem', fontFamily: 'monospace', fontSize: '0.72rem',
                    padding: '0.25rem 0.35rem', marginBottom: 0,
                    borderColor: CHRONICLE_COLOR_RE.test(alliance.color) ? 'var(--border-color)' : '#e57373',
                  }} />
              </div>
            </div>
          </div>
          {label('Member guilds')}
          {members.map((d, i) => (
            <div key={i} style={{
              marginBottom: '0.4rem',
              padding: '0.4rem',
              border: '1px solid var(--border-color)',
              borderRadius: '0.375rem',
            }}>
              <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '0.3rem' }}>
                <GuildInput value={d.guild} guilds={guilds}
                  onChange={(v) => setMembers(ds => {
                    const next = [...ds]; next[i] = { ...next[i], guild: v }; return next;
                  })} />
                <button type="button" title="Remove guild" style={{ ...smallBtn, height: '30px', padding: '0 0.4rem' }}
                  onClick={() => setMembers(ds => ds.filter((_, j) => j !== i))}>
                  <X size={12} />
                </button>
              </div>
              {d.stints.map((s, si) => {
                const setStint = (patch: (cur: { joinedAt: string; leftAt: string | null }) => { joinedAt: string; leftAt: string | null }) =>
                  setMembers(ds => {
                    const next = [...ds];
                    const stints = [...next[i].stints];
                    stints[si] = patch(stints[si]);
                    next[i] = { ...next[i], stints };
                    return next;
                  });
                const joined = whenParts(s.joinedAt);
                const left = whenParts(s.leftAt);
                return (
                  <div key={si} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', marginTop: si > 0 ? '0.3rem' : 0 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', marginBottom: '2px' }}>Joined</div>
                      <PickerField type="date" width="100%" value={joined.date}
                        onChange={(v) => setStint(cur => ({ ...cur, joinedAt: composeWhen(v, joined.time) }))} />
                      <div style={{ marginTop: '2px' }}>
                        <PickerField type="time" width="100%" value={joined.time}
                          onChange={(v) => setStint(cur => ({ ...cur, joinedAt: composeWhen(joined.date, v) }))} />
                      </div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', marginBottom: '2px' }}>Left (empty = current)</div>
                      <PickerField type="date" width="100%" value={left.date}
                        onChange={(v) => setStint(cur => ({ ...cur, leftAt: composeWhen(v, left.time) || null }))} />
                      <div style={{ marginTop: '2px' }}>
                        <PickerField type="time" width="100%" value={left.time}
                          onChange={(v) => setStint(cur => ({ ...cur, leftAt: composeWhen(left.date, v) || null }))} />
                      </div>
                    </div>
                    {d.stints.length > 1 && (
                      <button type="button" title="Remove stint" style={{ ...smallBtn, height: '30px', padding: '0 0.4rem' }}
                        onClick={() => setMembers(ds => {
                          const next = [...ds];
                          next[i] = { ...next[i], stints: next[i].stints.filter((_, sj) => sj !== si) };
                          return next;
                        })}>
                        <X size={12} />
                      </button>
                    )}
                  </div>
                );
              })}
              {totalStints < CHRONICLE_LIMITS.membershipsMax && (
                <button type="button" title="Add another stint (the guild left and rejoined later)"
                  style={{ ...smallBtn, marginTop: '0.35rem', fontSize: '0.68rem' }}
                  onClick={() => setMembers(ds => {
                    const next = [...ds];
                    next[i] = { ...next[i], stints: [...next[i].stints, { joinedAt: '', leftAt: null }] };
                    return next;
                  })}>
                  <Plus size={12} /> Add stint
                </button>
              )}
            </div>
          ))}
          {totalStints < CHRONICLE_LIMITS.membershipsMax && (
            <button type="button" style={smallBtn}
              onClick={() => setMembers(ds => [...ds, { guild: '', stints: [{ joinedAt: '', leftAt: null }] }])}>
              <Plus size={12} /> Add guild
            </button>
          )}
          {label('Description')}
          <textarea style={{ ...inputStyle, height: '56px', padding: '0.35rem 0.5rem', resize: 'vertical' }}
            value={alliance.description} maxLength={CHRONICLE_LIMITS.descriptionMax}
            placeholder="optional context"
            onChange={(e) => setAlliance(a => ({ ...a, description: e.target.value }))} />
        </>
      ) : (
        <>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <div style={{ width: '7rem' }}>
              {label('Type')}
              <select style={{ ...inputStyle, cursor: 'pointer' }} value={event.eventType}
                onChange={(e) => setEvent(ev => ({ ...ev, eventType: e.target.value as ChronicleEventType }))}>
                {CHRONICLE_EVENT_TYPES.map(t => <option key={t} value={t}>{eventTypeLabel(t)}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              {label('Title')}
              <input style={inputStyle} value={event.title} maxLength={CHRONICLE_LIMITS.titleMax}
                onChange={(e) => setEvent(ev => ({ ...ev, title: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <div style={{ flex: 1 }}>
              {label('Start')}
              <PickerField type="date" value={whenParts(event.startsAt).date} width="100%"
                onChange={(v) => setEvent(ev => ({ ...ev, startsAt: composeWhen(v, whenParts(ev.startsAt).time) }))} />
              <div style={{ marginTop: '2px' }}>
                <PickerField type="time" value={whenParts(event.startsAt).time} width="100%"
                  onChange={(v) => setEvent(ev => ({ ...ev, startsAt: composeWhen(whenParts(ev.startsAt).date, v) }))} />
              </div>
            </div>
            <div style={{ flex: 1 }}>
              {label('End (optional)')}
              <PickerField type="date" value={whenParts(event.endsAt).date} width="100%"
                onChange={(v) => setEvent(ev => ({ ...ev, endsAt: composeWhen(v, whenParts(ev.endsAt).time) || null }))} />
              <div style={{ marginTop: '2px' }}>
                <PickerField type="time" value={whenParts(event.endsAt).time} width="100%"
                  onChange={(v) => setEvent(ev => ({ ...ev, endsAt: composeWhen(whenParts(ev.endsAt).date, v) || null }))} />
              </div>
            </div>
          </div>
          {label('Involved guilds')}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginBottom: '0.3rem' }}>
            {event.guilds.map(g => (
              <span key={g} style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.2rem',
                padding: '0.1rem 0.4rem', borderRadius: '0.75rem',
                background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
                fontSize: '0.72rem', color: 'var(--text-primary)',
              }}>
                {g}
                <button type="button" style={{ border: 'none', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 0, display: 'flex' }}
                  onClick={() => setEvent(ev => ({ ...ev, guilds: ev.guilds.filter(x => x !== g) }))}>
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '0.3rem' }}>
            <GuildInput value={eventGuild} guilds={guilds} onChange={setEventGuild} placeholder="Add a guild…" />
            <button type="button" style={smallBtn}
              onClick={() => {
                const g = eventGuild.trim();
                if (g && !event.guilds.includes(g) && event.guilds.length < CHRONICLE_LIMITS.eventGuildsMax) {
                  setEvent(ev => ({ ...ev, guilds: [...ev.guilds, g] }));
                  setEventGuild('');
                }
              }}>
              <CornerDownLeft size={12} /> Add
            </button>
          </div>
          {allianceNames.length > 0 && (
            <>
              {label('Involved alliances')}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                {allianceNames.map(name => {
                  const selected = event.alliances.includes(name);
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setEvent(ev => ({
                        ...ev,
                        alliances: selected
                          ? ev.alliances.filter(a => a !== name)
                          : ev.alliances.length < CHRONICLE_LIMITS.eventAlliancesMax
                            ? [...ev.alliances, name]
                            : ev.alliances,
                      }))}
                      style={{
                        padding: '0.15rem 0.5rem',
                        borderRadius: '0.75rem',
                        border: `1px solid ${selected ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                        background: selected ? 'var(--accent-primary)' : 'var(--bg-secondary)',
                        color: selected ? 'var(--text-on-accent)' : 'var(--text-primary)',
                        fontSize: '0.72rem',
                        cursor: 'pointer',
                      }}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
            </>
          )}
          {label('Description')}
          <textarea style={{ ...inputStyle, height: '56px', padding: '0.35rem 0.5rem', resize: 'vertical' }}
            value={event.description} maxLength={CHRONICLE_LIMITS.descriptionMax}
            placeholder="what happened?"
            onChange={(e) => setEvent(ev => ({ ...ev, description: e.target.value }))} />
        </>
      )}

      {label(direct ? 'Audit note (optional)' : 'Note to reviewers (optional)')}
      <input style={inputStyle} value={note} maxLength={CHRONICLE_LIMITS.noteMax}
        placeholder="sources, reasoning…" onChange={(e) => setNote(e.target.value)} />

      {error && (
        <div style={{ fontSize: '0.72rem', color: '#e57373', marginTop: '0.5rem' }}>{error}</div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
        <button type="button" disabled={busy} onClick={submit}
          style={{ ...smallBtn, background: 'var(--accent-primary)', color: 'var(--text-on-accent)', border: 'none', opacity: busy ? 0.6 : 1 }}>
          {busy ? (direct ? 'Publishing…' : 'Submitting…') : direct ? 'Publish' : 'Submit for review'}
        </button>
        <button type="button" style={smallBtn} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export default function ChroniclePanel({
  isOpen,
  onClose,
  data,
  timestampMs,
  onJumpToDate,
  availableGuilds,
  containerBounds,
}: ChroniclePanelProps) {
  const { authenticated } = useExecSession();
  const [form, setForm] = useState<FormState>({ mode: 'closed' });
  const [expanded, setExpanded] = useState<string | null>(null);
  // Expanded view: a wider two-column browse of ALL alliances and events,
  // regardless of the shown timestamp. The compact view stays the default.
  const [expandedView, setExpandedView] = useState(false);

  useEffect(() => {
    setExpandedView(localStorage.getItem('chronicleExpandedView') === 'true');
  }, []);
  useEffect(() => {
    localStorage.setItem('chronicleExpandedView', String(expandedView));
  }, [expandedView]);

  // Free-floating like the timeline panel: drag by the header, offset from
  // the bottom-right anchor, clamped to the map and persisted.
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });

  useEffect(() => {
    const cached = localStorage.getItem('chroniclePanelPosition');
    if (cached) {
      try { setPosition(JSON.parse(cached)); } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('chroniclePanelPosition', JSON.stringify(position));
  }, [position]);

  const clampPosition = useCallback((x: number, y: number) => {
    const panel = panelRef.current;
    if (!panel || !containerBounds) return { x, y };
    const { offsetWidth: w, offsetHeight: h } = panel;
    // Anchor: right 1rem (16px), bottom 4.25rem (68px)
    const minX = 24 + w - containerBounds.width; // left edge ≥ 8px
    const maxX = 8;                              // right edge ≤ width - 8px
    const minY = 76 + h - containerBounds.height; // top edge ≥ 8px
    const maxY = 60;                              // bottom edge ≤ height - 8px
    return {
      x: Math.max(Math.min(minX, maxX), Math.min(maxX, x)),
      y: Math.max(Math.min(minY, maxY), Math.min(maxY, y)),
    };
  }, [containerBounds]);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY, posX: position.x, posY: position.y };
  }, [position]);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      setPosition(clampPosition(
        dragStartRef.current.posX + (e.clientX - dragStartRef.current.x),
        dragStartRef.current.posY + (e.clientY - dragStartRef.current.y),
      ));
    };
    const onUp = () => setIsDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isDragging, clampPosition]);

  // Re-clamp when the container resizes OR the panel itself changes size
  // (expanded view, the submit form, expanded rows) so it can't be pushed
  // out of bounds by growing while parked near an edge. Layout effect, not
  // useEffect: after paint, the grown panel overflows the border for one
  // visible frame before snapping back — a flicker when parked on an edge.
  useLayoutEffect(() => {
    if (isDragging || !isOpen) return;
    setPosition(prev => {
      const next = clampPosition(prev.x, prev.y);
      return next.x === prev.x && next.y === prev.y ? prev : next;
    });
  }, [containerBounds, clampPosition, isDragging, isOpen, expandedView, form.mode, expanded]);

  const active = useMemo(
    () => (data ? activeAlliancesAt(data.alliances, timestampMs) : []),
    [data, timestampMs],
  );
  const events = useMemo(
    () => (data ? [...data.events].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)) : []),
    [data],
  );

  // Compact view is scoped to the shown moment: only events running at, or
  // within ~2 months of, the current time. The expanded view lists all.
  const EVENT_NEAR_MS = 60 * 86400000;
  const nearbyEvents = useMemo(
    () => events.filter(e => {
      const start = Date.parse(e.startsAt);
      const end = e.endsAt ? Date.parse(e.endsAt) : start;
      return start <= timestampMs + EVENT_NEAR_MS && end >= timestampMs - EVENT_NEAR_MS;
    }),
    [events, timestampMs, EVENT_NEAR_MS],
  );

  if (!isOpen) return null;

  const editAlliance = (a: ChronicleAlliance) =>
    setForm({ mode: 'alliance', targetId: a.id, initial: { name: a.name, tag: a.tag, color: a.color, description: a.description, memberships: a.memberships.map(m => ({ ...m })) } });
  const editEvent = (e: ChronicleEvent) =>
    setForm({ mode: 'event', targetId: e.id, initial: { eventType: e.eventType, title: e.title, description: e.description, startsAt: e.startsAt, endsAt: e.endsAt, guilds: [...e.guilds], alliances: [...(e.alliances ?? [])] } });

  const isActiveEvent = (e: ChronicleEvent) =>
    Date.parse(e.startsAt) <= timestampMs && (e.endsAt === null ? Date.parse(e.startsAt) + 7 * 86400000 > timestampMs : Date.parse(e.endsAt) > timestampMs);

  const sectionTitle = (text: string) => (
    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0.75rem 0 0.35rem' }}>
      {text}
    </div>
  );

  const isActiveAlliance = (a: ChronicleAlliance) =>
    a.memberships.some(m => Date.parse(m.joinedAt) <= timestampMs && (m.leftAt === null || Date.parse(m.leftAt) > timestampMs));

  /** Overall lifespan of an alliance: earliest join → latest leave (or present) */
  const allianceSpan = (a: ChronicleAlliance) => {
    let min = Infinity;
    let open = false;
    let max = -Infinity;
    for (const m of a.memberships) {
      min = Math.min(min, Date.parse(m.joinedAt));
      if (m.leftAt === null) open = true;
      else max = Math.max(max, Date.parse(m.leftAt));
    }
    return `${fmtDate(new Date(min).toISOString())} → ${open ? 'present' : fmtDate(new Date(max).toISOString())}`;
  };

  const renderAlliance = (a: ChronicleAlliance, showSpan: boolean) => (
    <div key={`a${a.id}`} style={{ marginBottom: '0.35rem', opacity: showSpan && !isActiveAlliance(a) ? 0.65 : 1 }}>
      <div
        onClick={() => setExpanded(expanded === `a${a.id}` ? null : `a${a.id}`)}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.45rem', cursor: 'pointer',
          padding: '0.35rem 0.5rem', borderRadius: '0.375rem', background: 'var(--bg-secondary)',
        }}
      >
        <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: a.color, flexShrink: 0 }} />
        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {a.name}{a.tag ? ` [${a.tag}]` : ''}
        </span>
        <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
          {showSpan
            ? allianceSpan(a)
            : `${a.memberships.filter(m => Date.parse(m.joinedAt) <= timestampMs && (m.leftAt === null || Date.parse(m.leftAt) > timestampMs)).length} guilds`}
        </span>
      </div>
      {expanded === `a${a.id}` && (
        <div style={{ padding: '0.4rem 0.5rem 0.2rem', fontSize: '0.73rem', color: 'var(--text-secondary)' }}>
          {a.description && <div style={{ marginBottom: '0.35rem', color: 'var(--text-primary)' }}>{a.description}</div>}
          {a.memberships.map((m, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
              <span>{m.guild}</span>
              <span style={{ whiteSpace: 'nowrap' }}>{fmtDate(m.joinedAt)} → {fmtDate(m.leftAt)}</span>
            </div>
          ))}
          {authenticated && (
            <button type="button" style={{ ...smallBtn, marginTop: '0.4rem' }} onClick={() => editAlliance(a)}>
              <Pencil size={11} /> Suggest edit
            </button>
          )}
        </div>
      )}
    </div>
  );

  const renderEvent = (e: ChronicleEvent) => (
    <div key={`e${e.id}`} style={{ marginBottom: '0.35rem' }}>
      <div
        onClick={() => setExpanded(expanded === `e${e.id}` ? null : `e${e.id}`)}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.45rem', cursor: 'pointer',
          padding: '0.35rem 0.5rem', borderRadius: '0.375rem',
          background: 'var(--bg-secondary)',
          outline: isActiveEvent(e) ? `1px solid ${chronicleEventColor(e.eventType)}` : 'none',
        }}
      >
        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: chronicleEventColor(e.eventType), flexShrink: 0 }} />
        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {e.title}
        </span>
        <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
          {fmtDate(e.startsAt)}{e.endsAt ? ` → ${fmtDate(e.endsAt)}` : ''}
        </span>
      </div>
      {expanded === `e${e.id}` && (
        <div style={{ padding: '0.4rem 0.5rem 0.2rem', fontSize: '0.73rem', color: 'var(--text-secondary)' }}>
          <div style={{ marginBottom: '0.25rem' }}>
            <span style={{ color: chronicleEventColor(e.eventType), fontWeight: 700 }}>{eventTypeLabel(e.eventType)}</span>
            {(e.alliances ?? []).length > 0 && <> · Alliances: {e.alliances.join(', ')}</>}
            {e.guilds.length > 0 && <> · {e.guilds.join(', ')}</>}
          </div>
          {e.description && <div style={{ color: 'var(--text-primary)', marginBottom: '0.35rem' }}>{e.description}</div>}
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            {onJumpToDate && (
              <button type="button" style={smallBtn} onClick={() => onJumpToDate(new Date(Date.parse(e.startsAt) - EVENT_LEADUP_MS))}>
                Jump to start
              </button>
            )}
            {authenticated && (
              <button type="button" style={smallBtn} onClick={() => editEvent(e)}>
                <Pencil size={11} /> Suggest edit
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div
      ref={panelRef}
      data-testid="chronicle-panel"
      data-map-ui=""
      onMouseDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        right: '1rem',
        bottom: '4.25rem',
        transform: `translate(${position.x}px, ${position.y}px)`,
        width: expandedView ? '700px' : '360px',
        maxWidth: 'calc(100vw - 2rem)',
        maxHeight: expandedView ? 'min(640px, calc(100% - 6rem))' : 'min(560px, calc(100% - 6rem))',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-card-solid)',
        border: '1px solid var(--border-color)',
        borderRadius: '0.75rem',
        boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
        zIndex: 30,
        overflow: 'hidden',
      }}
    >
      {/* Header — drag handle */}
      <div
        onMouseDown={handleDragStart}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.7rem 0.9rem 0.5rem',
          cursor: isDragging ? 'grabbing' : 'grab',
          userSelect: 'none',
        }}
      >
        <div>
          <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>Chronicle</div>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
            Alliances & events · {DATE_FMT.format(new Date(timestampMs))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.25rem' }}>
          <button
            type="button"
            data-testid="chronicle-expand"
            onClick={() => setExpandedView(prev => !prev)}
            onMouseDown={(e) => e.stopPropagation()}
            title={expandedView ? 'Compact view (at shown time)' : 'Expanded view (all alliances & events)'}
            style={{ border: 'none', background: 'transparent', color: 'var(--text-primary)', opacity: 0.7, cursor: 'pointer', display: 'flex', padding: '0.25rem' }}
          >
            {expandedView ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
          <button type="button" onClick={onClose} title="Close"
            onMouseDown={(e) => e.stopPropagation()}
            style={{ border: 'none', background: 'transparent', color: 'var(--text-primary)', opacity: 0.7, cursor: 'pointer', display: 'flex', padding: '0.25rem' }}>
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ overflowY: 'auto', padding: '0 0.9rem 0.9rem' }}>
        {form.mode !== 'closed' ? (
          <SubmitForm
            form={form}
            guilds={availableGuilds}
            allianceNames={(data?.alliances ?? []).map(a => a.name)}
            onDone={() => setForm({ mode: 'closed' })}
            onCancel={() => setForm({ mode: 'closed' })}
          />
        ) : (
          <>
            {expandedView ? (
              /* Expanded: everything, side by side */
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {sectionTitle(`All alliances (${data?.alliances.length ?? 0})`)}
                  {(data?.alliances.length ?? 0) === 0 && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>No alliances recorded yet.</div>
                  )}
                  {(data?.alliances ?? []).map(a => renderAlliance(a, true))}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {sectionTitle(`All events (${events.length})`)}
                  {events.length === 0 && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>No recorded events yet.</div>
                  )}
                  {events.map(renderEvent)}
                </div>
              </div>
            ) : (
              /* Compact: scoped to the shown moment */
              <>
                {sectionTitle(`Alliances at this time (${active.length})`)}
                {active.length === 0 && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    No known alliances at this point in time.
                  </div>
                )}
                {active.map(a => renderAlliance(a, false))}

                {sectionTitle(`Events near this time (${nearbyEvents.length})`)}
                {nearbyEvents.length === 0 && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    No events near this point in time.
                  </div>
                )}
                {nearbyEvents.map(renderEvent)}
              </>
            )}

            {/* Footer: contribute */}
            <div style={{ marginTop: '0.9rem', paddingTop: '0.6rem', borderTop: '1px solid var(--border-color)' }}>
              {authenticated ? (
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="button" data-testid="chronicle-suggest-alliance" style={smallBtn}
                    onClick={() => setForm({ mode: 'alliance', targetId: null, initial: { ...EMPTY_ALLIANCE, memberships: [{ guild: '', joinedAt: '', leftAt: null }] } })}>
                    <Plus size={12} /> Alliance
                  </button>
                  <button type="button" data-testid="chronicle-suggest-event" style={smallBtn}
                    onClick={() => setForm({ mode: 'event', targetId: null, initial: { ...EMPTY_EVENT, guilds: [] } })}>
                    <Plus size={12} /> Event
                  </button>
                  <span style={{ fontSize: '0.66rem', color: 'var(--text-secondary)', alignSelf: 'center' }}>
                    Reviewed by execs before appearing
                  </span>
                </div>
              ) : (
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                  <a href="/exec/login" style={{ color: 'var(--accent-primary)' }}>Sign in</a> with a linked guild account to suggest additions or edits.
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
