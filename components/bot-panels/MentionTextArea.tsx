"use client";

/**
 * Textarea that edits mentions the way Discord's message box does: type @ for
 * roles, # for channels, : for emojis or { for a database value and pick from
 * the list. The box shows @[Role] / #[channel] / :emoji: / {Value}; onChange
 * always gets the stored codes (<@&id>, {{key}}, ...).
 */

import { useEffect, useRef, useState } from 'react';
import { fromReadable, toReadable, type PanelRegistry } from '@/lib/bot-panels';
import { PANEL_VALUES } from '@/lib/panel-values';
import { usePanelValues } from './values';

type Option = { key: string; insert: string; name: string; detail?: string; color?: number; image?: string; glyph?: string };
type Query = { start: number; options: Option[] };

const MAX_OPTIONS = 8;

// ---- Emoji search: the server's custom emojis, then standard ones by their
// Discord-style names (gemoji), loaded on first use so pages without the
// editor never download the list. Bot messages don't expand :shortcodes:,
// so a standard emoji is inserted as the character itself.

type StandardEmoji = { emoji: string; names: string[]; tags: string[] };
let standardEmojis: StandardEmoji[] | null = null;
let standardLoad: Promise<StandardEmoji[]> | null = null;

function useStandardEmojis(): StandardEmoji[] | null {
  const [list, setList] = useState(standardEmojis);
  useEffect(() => {
    if (list) return;
    standardLoad ??= import('gemoji').then(m => (standardEmojis = m.gemoji));
    standardLoad.then(setList).catch(() => {});
  }, [list]);
  return list;
}

function emojiOptions(q: string, reg: PanelRegistry | null, standard: StandardEmoji[] | null): Option[] {
  const lq = q.toLowerCase();
  const custom = rank(reg?.emojis ?? [], q).map(x => ({
    key: x.id, insert: `<${x.animated ? 'a' : ''}:${x.name}:${x.id}>`, name: `:${x.name}:`, detail: x.server ?? undefined,
    image: `https://cdn.discordapp.com/emojis/${x.id}.${x.animated ? 'gif' : 'webp'}?size=32`,
  }));
  const score = (e: StandardEmoji) => e.names.some(n => n.startsWith(lq)) ? 0 : e.names.some(n => n.includes(lq)) ? 1 : e.tags.some(t => t.startsWith(lq)) ? 2 : 3;
  const std = lq ? (standard ?? []).map(e => ({ e, s: score(e) })).filter(x => x.s < 3).sort((a, b) => a.s - b.s) : [];
  return [
    ...custom,
    ...std.slice(0, MAX_OPTIONS).map(({ e }) => ({ key: e.emoji, insert: e.emoji, name: `:${e.names[0]}:`, glyph: e.emoji })),
  ].slice(0, MAX_OPTIONS);
}

function OptionList({ options, active, setActive, pick }: {
  options: Option[]; active: number; setActive: (i: number) => void; pick: (o: Option) => void;
}) {
  return (
    <div role="listbox" style={{
      position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 2, zIndex: 20, minWidth: '14rem',
      background: 'var(--bg-card-solid)', border: '1px solid var(--border-card)', borderRadius: '0.375rem',
      boxShadow: '0 6px 20px rgba(0,0,0,0.35)', padding: '0.25rem', maxHeight: '16rem', overflowY: 'auto',
    }}>
      {options.map((o, i) => (
        <div key={o.key} role="option" aria-selected={i === active}
          onMouseDown={e => { e.preventDefault(); pick(o); }}
          onMouseEnter={() => setActive(i)}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.3rem 0.5rem', borderRadius: '0.25rem',
            cursor: 'pointer', fontSize: '0.8rem', color: 'var(--text-primary)',
            background: i === active ? 'var(--bg-secondary)' : 'transparent',
          }}>
          {o.color != null && (
            <span style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, background: o.color ? `#${o.color.toString(16).padStart(6, '0')}` : '#99aab5' }} />
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {o.image && <img src={o.image} alt="" style={{ width: 20, height: 20, objectFit: 'contain' }} />}
          {o.glyph && <span style={{ width: 20, textAlign: 'center', fontSize: '1rem' }}>{o.glyph}</span>}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0, maxWidth: '70%' }}>{o.name}</span>
          {o.detail && <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{o.detail}</span>}
        </div>
      ))}
    </div>
  );
}

/** Arrow keys move, Enter/Tab pick, Escape closes. Returns true when it used the key. */
function listKeys(e: React.KeyboardEvent, options: Option[], active: number, setActive: (f: (a: number) => number) => void, pick: (o: Option) => void, close: () => void) {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const n = options.length;
    setActive(a => (a + (e.key === 'ArrowDown' ? 1 : n - 1)) % n);
  } else if (e.key === 'Enter' || e.key === 'Tab') {
    e.preventDefault();
    pick(options[active]);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    close();
  }
}

function rank<T extends { name: string }>(items: T[], q: string): T[] {
  const lq = q.toLowerCase();
  const hits = items.filter(i => i.name.toLowerCase().includes(lq));
  return [...hits.filter(i => i.name.toLowerCase().startsWith(lq)), ...hits.filter(i => !i.name.toLowerCase().startsWith(lq))].slice(0, MAX_OPTIONS);
}

/** What the text just before the caret is asking for, if anything. */
function findQuery(before: string, reg: PanelRegistry, standard: StandardEmoji[] | null, values: Record<string, string>): Query | null {
  // {value, shown as {Label} and stored as {{key}}
  const v = /(?:^|[^{])\{([^{}\n]*)$/.exec(before);
  if (v) {
    const options: Option[] = rank(PANEL_VALUES.map(d => ({ ...d, name: d.label })), v[1]).map(d => ({
      key: d.key, insert: `{${d.label}}`, name: d.label,
      detail: values[d.key] != null ? `now ${values[d.key]}` : undefined,
    }));
    return options.length ? { start: before.length - v[1].length - 1, options } : null;
  }
  // @[name with spaces / #[name with spaces, then bare @name / #name, then :emoji
  const m = /(?:^|[^\w<])([@#])\[([^\]\n]*)$/.exec(before) ?? /(?:^|[^\w<])([@#])([^\s[\]<>@#]*)$/.exec(before);
  if (m) {
    const start = before.length - m[0].length + m[0].indexOf(m[1]);
    const options: Option[] = m[1] === '@'
      ? rank(reg.roles.filter(r => r.name !== '@everyone'), m[2]).map(r => ({ key: r.id, insert: `@[${r.name}]`, name: r.name, color: r.color }))
      : rank(reg.channels, m[2]).map(c => ({ key: c.id, insert: `#[${c.name}]`, name: c.name, detail: c.category ?? undefined }));
    return options.length ? { start, options } : null;
  }
  const e = /(?:^|[^\w<]):(\w{2,})$/.exec(before);
  if (e) {
    // The box shows custom emojis as :name: (stored as codes); standard ones go in as the character.
    const options = emojiOptions(e[1], reg, standard).map(o => ({ ...o, insert: o.glyph ?? o.name }));
    return options.length ? { start: before.length - e[1].length - 1, options } : null;
  }
  return null;
}

export default function MentionTextArea({ id, value, onChange, registry, rows, placeholder, style }: {
  id?: string; value: string; onChange: (stored: string) => void; registry: PanelRegistry | null;
  rows?: number; placeholder?: string; style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const pushed = useRef(value);
  const [text, setText] = useState(() => toReadable(value, registry));
  const [query, setQuery] = useState<Query | null>(null);
  const [active, setActive] = useState(0);
  const standard = useStandardEmojis();
  const values = usePanelValues();

  // Re-read the stored value when it changes from outside (undo, restore, discard)
  // or when the server list arrives; our own edits are already in `text`.
  useEffect(() => {
    if (value !== pushed.current) {
      pushed.current = value;
      setText(toReadable(value, registry));
    }
  }, [value, registry]);
  useEffect(() => { setText(toReadable(pushed.current, registry)); }, [registry]);

  const update = (next: string, caret: number) => {
    setText(next);
    const stored = fromReadable(next, registry);
    pushed.current = stored;
    onChange(stored);
    setQuery(registry ? findQuery(next.slice(0, caret), registry, standard, values) : null);
    setActive(0);
  };

  const pick = (opt: Option) => {
    const el = ref.current;
    if (!el || !query) return;
    const caret = el.selectionStart;
    const after = text.slice(caret);
    const insert = opt.insert + (after.startsWith(' ') ? '' : ' ');
    const next = text.slice(0, query.start) + insert + after;
    const pos = query.start + insert.length;
    update(next, pos);
    setQuery(null);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(pos, pos); });
  };

  return (
    <div style={{ position: 'relative' }}>
      <textarea id={id} ref={ref} value={text} rows={rows} placeholder={placeholder} style={style}
        onChange={e => update(e.target.value, e.target.selectionStart)}
        onKeyDown={e => query && listKeys(e, query.options, active, setActive, pick, () => setQuery(null))}
        onBlur={() => setQuery(null)} />
      {query && <OptionList options={query.options} active={active} setActive={setActive} pick={pick} />}
    </div>
  );
}

/**
 * Button emoji: search server and standard emojis by name (":dem" or "dem"),
 * or paste an emoji straight in. Stores the character or Discord's <:name:id>.
 */
export function EmojiInput({ value, onChange, registry, placeholder }: {
  value: string; onChange: (v: string) => void; registry: PanelRegistry | null; placeholder?: string;
}) {
  const standard = useStandardEmojis();
  const custom = /^<(a?):(\w+):(\d+)>$/.exec(value);
  const shown = custom ? `:${custom[2]}:` : value;
  const [text, setText] = useState<string | null>(null); // non-null while typing a search
  const [active, setActive] = useState(0);

  const search = text?.replace(/^:|:$/g, '') ?? '';
  const options = text != null && search ? emojiOptions(search, registry, standard) : [];

  const pick = (o: Option) => { onChange(o.insert); setText(null); };
  const type = (t: string) => {
    setActive(0);
    if (!t.trim()) { onChange(''); setText(null); return; }
    // Typing after the current emoji searches too, rather than gluing text onto it.
    if (text == null && shown && t.startsWith(shown)) t = t.slice(shown.length);
    if (/^:?\w*:?$/.test(t)) { setText(t); return; } // a name search; commit on pick
    onChange(t.trim()); setText(null);               // a pasted emoji or <:name:id> code
  };

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', ...inputBox }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {custom && text == null && <img src={`https://cdn.discordapp.com/emojis/${custom[3]}.${custom[1] ? 'gif' : 'webp'}?size=32`} alt="" style={{ width: 18, height: 18, marginLeft: 8 }} />}
        <input value={text ?? shown} placeholder={placeholder ?? 'Search or paste emoji'}
          onChange={e => type(e.target.value)}
          onFocus={e => e.target.select()}
          onKeyDown={e => options.length > 0 && listKeys(e, options, active, setActive, pick, () => setText(null))}
          onBlur={() => setText(null)}
          style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: '0.85rem', padding: '0.45rem 0.65rem', width: '100%', minWidth: 0, fontFamily: 'inherit' }} />
      </div>
      {options.length > 0 && <OptionList options={options} active={active} setActive={setActive} pick={pick} />}
      {options.length === 0 && search.length >= 2 && (
        <div style={{
          position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 2, zIndex: 20, minWidth: '14rem',
          background: 'var(--bg-card-solid)', border: '1px solid var(--border-card)', borderRadius: '0.375rem',
          padding: '0.45rem 0.6rem', fontSize: '0.75rem', color: 'var(--text-muted)',
        }}>
          No emoji called &ldquo;{search}&rdquo;. Custom emojis must be in a server the bot is in.
        </div>
      )}
    </div>
  );
}

const inputBox: React.CSSProperties = {
  background: 'var(--bg-primary)', border: '1px solid var(--border-card)', borderRadius: '0.375rem',
};
