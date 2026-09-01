"use client";

import { useMemo, useState } from "react";
import { X, Plus, Pencil, CornerDownLeft, Check } from "lucide-react";
import {
  AlliancePayload,
  ChronicleAlliance,
  ChronicleData,
  ChronicleEvent,
  ChronicleEventType,
  CHRONICLE_EVENT_TYPES,
  CHRONICLE_LIMITS,
  CHRONICLE_PALETTE,
  EventPayload,
  activeAlliancesAt,
  chronicleEventColor,
  validateAlliancePayload,
  validateEventPayload,
} from "@/lib/chronicle";
import { useExecSession } from "@/hooks/useExecSession";
import PickerField from "./PickerField";

interface ChroniclePanelProps {
  isOpen: boolean;
  onClose: () => void;
  data: ChronicleData | null;
  /** The moment the map is currently showing (history timestamp, or now in live mode) */
  timestampMs: number;
  /** Jump the history timeline to a date (absent in live mode) */
  onJumpToDate?: (date: Date) => void;
  availableGuilds: { name: string; prefix: string }[];
}

const DATE_FMT = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const fmtDate = (iso: string | null) => (iso ? DATE_FMT.format(new Date(iso)) : 'present');
const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : '');

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

type FormState =
  | { mode: 'closed' }
  | { mode: 'alliance'; targetId: number | null; initial: AlliancePayload }
  | { mode: 'event'; targetId: number | null; initial: EventPayload };

const EMPTY_ALLIANCE: AlliancePayload = {
  name: '', tag: '', color: CHRONICLE_PALETTE[5], description: '',
  memberships: [{ guild: '', joinedAt: '', leftAt: null }],
};
const EMPTY_EVENT: EventPayload = {
  eventType: 'war', title: '', description: '', startsAt: '', endsAt: null, guilds: [],
};

function SubmitForm({
  form,
  guilds,
  onDone,
  onCancel,
}: {
  form: Exclude<FormState, { mode: 'closed' }>;
  guilds: { name: string; prefix: string }[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const isAlliance = form.mode === 'alliance';
  const [alliance, setAlliance] = useState<AlliancePayload>(
    isAlliance ? (form.initial as AlliancePayload) : EMPTY_ALLIANCE,
  );
  const [event, setEvent] = useState<EventPayload>(
    !isAlliance ? (form.initial as EventPayload) : EMPTY_EVENT,
  );
  const [eventGuild, setEventGuild] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    setError(null);
    const payload = isAlliance
      ? { ...alliance, memberships: alliance.memberships.filter(m => m.guild.trim() !== '') }
      : event;
    const validated = isAlliance ? validateAlliancePayload(payload) : validateEventPayload(payload);
    if (!validated.ok) { setError(validated.error); return; }

    setBusy(true);
    try {
      const res = await fetch('/api/chronicle/submit', {
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
          Submitted for review
        </div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
          An exec will approve or reject it — approved entries appear on the map.
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
        {form.targetId !== null ? 'Suggest an edit' : isAlliance ? 'Suggest an alliance' : 'Suggest an event'}
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
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                {CHRONICLE_PALETTE.map(c => (
                  <button key={c} type="button" onClick={() => setAlliance(a => ({ ...a, color: c }))}
                    style={{
                      width: '20px', height: '20px', borderRadius: '4px', background: c, cursor: 'pointer',
                      border: alliance.color === c ? '2px solid var(--text-primary)' : '2px solid transparent',
                    }} />
                ))}
              </div>
            </div>
          </div>
          {label('Member guilds')}
          {alliance.memberships.map((m, i) => (
            <div key={i} style={{ display: 'flex', gap: '0.3rem', alignItems: 'center', marginBottom: '0.3rem' }}>
              <GuildInput value={m.guild} guilds={guilds}
                onChange={(v) => setAlliance(a => {
                  const ms = [...a.memberships]; ms[i] = { ...ms[i], guild: v }; return { ...a, memberships: ms };
                })} />
              <input type="date" title="Joined" style={{ ...inputStyle, width: '8.2rem' }} value={toDateInput(m.joinedAt)}
                onChange={(e) => setAlliance(a => {
                  const ms = [...a.memberships]; ms[i] = { ...ms[i], joinedAt: e.target.value }; return { ...a, memberships: ms };
                })} />
              <input type="date" title="Left (empty = still a member)" style={{ ...inputStyle, width: '8.2rem' }} value={toDateInput(m.leftAt)}
                onChange={(e) => setAlliance(a => {
                  const ms = [...a.memberships]; ms[i] = { ...ms[i], leftAt: e.target.value || null }; return { ...a, memberships: ms };
                })} />
              <button type="button" title="Remove" style={{ ...smallBtn, padding: '0 0.3rem' }}
                onClick={() => setAlliance(a => ({ ...a, memberships: a.memberships.filter((_, j) => j !== i) }))}>
                <X size={12} />
              </button>
            </div>
          ))}
          {alliance.memberships.length < CHRONICLE_LIMITS.membershipsMax && (
            <button type="button" style={smallBtn}
              onClick={() => setAlliance(a => ({ ...a, memberships: [...a.memberships, { guild: '', joinedAt: '', leftAt: null }] }))}>
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
                {CHRONICLE_EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
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
              <PickerField type="date" value={toDateInput(event.startsAt)} width="100%"
                onChange={(v) => setEvent(ev => ({ ...ev, startsAt: v }))} />
            </div>
            <div style={{ flex: 1 }}>
              {label('End (optional)')}
              <PickerField type="date" value={toDateInput(event.endsAt)} width="100%"
                onChange={(v) => setEvent(ev => ({ ...ev, endsAt: v || null }))} />
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
          {label('Description')}
          <textarea style={{ ...inputStyle, height: '56px', padding: '0.35rem 0.5rem', resize: 'vertical' }}
            value={event.description} maxLength={CHRONICLE_LIMITS.descriptionMax}
            placeholder="what happened?"
            onChange={(e) => setEvent(ev => ({ ...ev, description: e.target.value }))} />
        </>
      )}

      {label('Note to reviewers (optional)')}
      <input style={inputStyle} value={note} maxLength={CHRONICLE_LIMITS.noteMax}
        placeholder="sources, reasoning…" onChange={(e) => setNote(e.target.value)} />

      {error && (
        <div style={{ fontSize: '0.72rem', color: '#e57373', marginTop: '0.5rem' }}>{error}</div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
        <button type="button" disabled={busy} onClick={submit}
          style={{ ...smallBtn, background: 'var(--accent-primary)', color: 'var(--text-on-accent)', border: 'none', opacity: busy ? 0.6 : 1 }}>
          {busy ? 'Submitting…' : 'Submit for review'}
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
}: ChroniclePanelProps) {
  const { authenticated } = useExecSession();
  const [form, setForm] = useState<FormState>({ mode: 'closed' });
  const [expanded, setExpanded] = useState<string | null>(null);

  const active = useMemo(
    () => (data ? activeAlliancesAt(data.alliances, timestampMs) : []),
    [data, timestampMs],
  );
  const events = useMemo(
    () => (data ? [...data.events].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)) : []),
    [data],
  );

  if (!isOpen) return null;

  const editAlliance = (a: ChronicleAlliance) =>
    setForm({ mode: 'alliance', targetId: a.id, initial: { name: a.name, tag: a.tag, color: a.color, description: a.description, memberships: a.memberships.map(m => ({ ...m })) } });
  const editEvent = (e: ChronicleEvent) =>
    setForm({ mode: 'event', targetId: e.id, initial: { eventType: e.eventType, title: e.title, description: e.description, startsAt: e.startsAt, endsAt: e.endsAt, guilds: [...e.guilds] } });

  const isActiveEvent = (e: ChronicleEvent) =>
    Date.parse(e.startsAt) <= timestampMs && (e.endsAt === null ? Date.parse(e.startsAt) + 7 * 86400000 > timestampMs : Date.parse(e.endsAt) > timestampMs);

  const sectionTitle = (text: string) => (
    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0.75rem 0 0.35rem' }}>
      {text}
    </div>
  );

  return (
    <div
      data-testid="chronicle-panel"
      onMouseDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        right: '1rem',
        bottom: '4.25rem',
        width: '360px',
        maxWidth: 'calc(100vw - 2rem)',
        maxHeight: 'min(560px, calc(100% - 6rem))',
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
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.7rem 0.9rem 0.5rem' }}>
        <div>
          <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>Chronicle</div>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
            Alliances & events · {DATE_FMT.format(new Date(timestampMs))}
          </div>
        </div>
        <button type="button" onClick={onClose} title="Close"
          style={{ border: 'none', background: 'transparent', color: 'var(--text-primary)', opacity: 0.7, cursor: 'pointer', display: 'flex', padding: '0.25rem' }}>
          <X size={16} />
        </button>
      </div>

      {/* Body */}
      <div style={{ overflowY: 'auto', padding: '0 0.9rem 0.9rem' }}>
        {form.mode !== 'closed' ? (
          <SubmitForm
            form={form}
            guilds={availableGuilds}
            onDone={() => setForm({ mode: 'closed' })}
            onCancel={() => setForm({ mode: 'closed' })}
          />
        ) : (
          <>
            {sectionTitle(`Alliances at this time (${active.length})`)}
            {active.length === 0 && (
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                No known alliances at this point in time.
              </div>
            )}
            {active.map(a => (
              <div key={`a${a.id}`} style={{ marginBottom: '0.35rem' }}>
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
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                    {a.memberships.filter(m => Date.parse(m.joinedAt) <= timestampMs && (m.leftAt === null || Date.parse(m.leftAt) > timestampMs)).length} guilds
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
            ))}

            {sectionTitle(`Events (${events.length})`)}
            {events.length === 0 && (
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                No recorded events yet.
              </div>
            )}
            {events.map(e => (
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
                      <span style={{ color: chronicleEventColor(e.eventType), fontWeight: 700 }}>{e.eventType}</span>
                      {e.guilds.length > 0 && <> · {e.guilds.join(', ')}</>}
                    </div>
                    {e.description && <div style={{ color: 'var(--text-primary)', marginBottom: '0.35rem' }}>{e.description}</div>}
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      {onJumpToDate && (
                        <button type="button" style={smallBtn} onClick={() => onJumpToDate(new Date(e.startsAt))}>
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
            ))}

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
