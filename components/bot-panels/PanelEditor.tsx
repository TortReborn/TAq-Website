"use client";

/**
 * Form side of the bot panel editor. Fully controlled: every change hands a
 * new PanelContent to onChange, which the page keeps (and autosaves).
 */

import { useId, useRef, useState } from 'react';
import {
  BUTTON_STYLES, DEFAULT_EMBED_COLOR, DYNAMIC_SHELL_EXCHANGE, LAYOUT_BOX, LIMITS, embedLength, imageSrc,
  type PanelButton, type PanelContent, type PanelEmbed, type PanelMessage, type PanelRegistry,
} from '@/lib/bot-panels';
import MentionTextArea, { EmojiInput } from './MentionTextArea';
import { valuesToReadable } from '@/lib/panel-values';

// ---- shared styles (match the other exec pages) ----

export const inputStyle: React.CSSProperties = {
  background: 'var(--bg-primary)', border: '1px solid var(--border-card)',
  borderRadius: '0.375rem', padding: '0.45rem 0.65rem',
  color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none', width: '100%',
  colorScheme: 'dark', fontFamily: 'inherit',
};
export const btnStyle: React.CSSProperties = {
  padding: '0.45rem 0.9rem', borderRadius: '0.375rem', border: 'none',
  cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, transition: 'opacity 0.15s',
};
export const smallBtn: React.CSSProperties = { ...btnStyle, padding: '0.2rem 0.5rem', fontSize: '0.72rem' };
const ghostBtn: React.CSSProperties = { ...smallBtn, background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border-card)' };
const addBtn: React.CSSProperties = { ...smallBtn, background: 'rgba(34, 197, 94, 0.12)', color: '#22c55e' };
const dangerBtn: React.CSSProperties = { ...smallBtn, background: 'transparent', color: '#ef4444' };
export const labelStyle: React.CSSProperties = {
  fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.2rem', display: 'block',
};
const card: React.CSSProperties = {
  background: 'var(--bg-card)', border: '1px solid var(--border-card)', borderRadius: '0.5rem', padding: '0.75rem',
};
const summaryStyle: React.CSSProperties = {
  cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)',
  display: 'flex', alignItems: 'center', gap: '0.5rem', listStyle: 'none',
};

type Edit = (fn: (draft: PanelContent) => void) => void;

function move<T>(arr: T[], from: number, to: number) {
  if (to < 0 || to >= arr.length) return;
  const [x] = arr.splice(from, 1);
  arr.splice(to, 0, x);
}

function Counter({ value, limit }: { value: number; limit: number }) {
  const over = value > limit;
  if (value < limit * 0.8 && !over) return null;
  return <span style={{ fontSize: '0.68rem', color: over ? '#ef4444' : 'var(--text-muted)', marginLeft: 'auto' }}>{value}/{limit}</span>;
}

const textareaStyle: React.CSSProperties = {
  ...inputStyle, resize: 'vertical', lineHeight: 1.45, fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '0.8rem',
};

/** Pass `mentions` (the registry) where Discord renders role/channel mentions. */
function TextField({ label, value, onChange, limit, multiline, placeholder, rows = 4, mentions }: {
  label: string; value?: string; onChange: (v: string) => void; limit?: number;
  multiline?: boolean; placeholder?: string; rows?: number; mentions?: PanelRegistry | null;
}) {
  const id = useId();
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
        <label htmlFor={id} style={labelStyle}>{label}</label>
        {mentions !== undefined && <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>@ role · # channel · : emoji · {'{'} value</span>}
        {limit && <Counter value={(value ?? '').length} limit={limit} />}
      </div>
      {mentions !== undefined ? (
        <MentionTextArea id={id} value={value ?? ''} placeholder={placeholder} rows={rows} registry={mentions} onChange={onChange} style={textareaStyle} />
      ) : multiline ? (
        <textarea id={id} value={value ?? ''} placeholder={placeholder} rows={rows}
          onChange={e => onChange(e.target.value)} style={textareaStyle} />
      ) : (
        <input id={id} value={value ?? ''} placeholder={placeholder} onChange={e => onChange(e.target.value)} style={inputStyle} />
      )}
    </div>
  );
}

async function uploadImage(file: File): Promise<string> {
  const form = new FormData();
  form.append('image', file);
  const res = await fetch('/api/exec/bot-panels/assets', { method: 'POST', body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return data.url;
}

function UploadButton({ onUploaded, label = 'Upload' }: { onUploaded: (url: string) => void; label?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <input ref={ref} type="file" accept="image/png,image/jpeg,image/gif,image/webp" style={{ display: 'none' }}
        onChange={async e => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          setBusy(true); setError(null);
          try { onUploaded(await uploadImage(file)); } catch (err: any) { setError(err.message); }
          setBusy(false);
        }} />
      <button type="button" onClick={() => ref.current?.click()} disabled={busy} style={{ ...ghostBtn, whiteSpace: 'nowrap' }}>
        {busy ? 'Uploading…' : label}
      </button>
      {error && <span style={{ fontSize: '0.7rem', color: '#ef4444' }}>{error}</span>}
    </>
  );
}

/** URL field that also takes an upload; shows a thumbnail of what it holds. */
function ImageField({ label, value, onChange }: { label: string; value?: string; onChange: (v: string) => void }) {
  const src = imageSrc(value);
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {src && <img src={src} alt="" style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />}
        <input value={value ?? ''} onChange={e => onChange(e.target.value)} placeholder="https://… or upload" style={inputStyle} />
        <UploadButton onUploaded={onChange} />
        {value && <button type="button" onClick={() => onChange('')} style={dangerBtn} aria-label={`Clear ${label}`}>✕</button>}
      </div>
    </div>
  );
}

function ColorField({ value, onChange }: { value?: number | null; onChange: (v: number | null) => void }) {
  const hex = value == null ? '' : `#${value.toString(16).padStart(6, '0')}`;
  // What's being typed; applied once it is a full #rrggbb, dropped on blur if not.
  const [typing, setTyping] = useState<string | null>(null);
  return (
    <div>
      <label style={labelStyle}>Colour</label>
      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
        <input type="color" value={hex || '#000000'} onChange={e => onChange(parseInt(e.target.value.slice(1), 16))}
          style={{ width: 36, height: 30, padding: 0, border: '1px solid var(--border-card)', borderRadius: 4, background: 'none', cursor: 'pointer' }} />
        <input value={typing ?? hex} placeholder="none" onBlur={() => setTyping(null)} onChange={e => {
          const v = e.target.value.trim().replace(/^#/, '');
          setTyping(e.target.value);
          if (!v) onChange(null);
          else if (/^[0-9a-f]{6}$/i.test(v)) onChange(parseInt(v, 16));
        }} style={{ ...inputStyle, width: '6.5rem', fontFamily: 'ui-monospace, monospace' }} />
        {value != null && <button type="button" onClick={() => onChange(null)} style={dangerBtn}>No colour</button>}
      </div>
    </div>
  );
}

function CardActions({ index, count, onMove, onDuplicate, onRemove, noun }: {
  index: number; count: number; onMove: (to: number) => void; onDuplicate?: () => void; onRemove: () => void; noun: string;
}) {
  return (
    <span style={{ marginLeft: 'auto', display: 'flex', gap: '0.25rem' }} onClick={e => e.preventDefault()}>
      <button type="button" style={ghostBtn} disabled={index === 0} onClick={() => onMove(index - 1)} aria-label={`Move ${noun} up`}>↑</button>
      <button type="button" style={ghostBtn} disabled={index === count - 1} onClick={() => onMove(index + 1)} aria-label={`Move ${noun} down`}>↓</button>
      {onDuplicate && <button type="button" style={ghostBtn} onClick={onDuplicate}>Duplicate</button>}
      <button type="button" style={dangerBtn} onClick={() => { if (confirm(`Remove this ${noun}?`)) onRemove(); }}>Remove</button>
    </span>
  );
}

// ---- Embed ----

function ExtrasGroup({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', paddingLeft: '0.6rem', borderLeft: '2px solid var(--border-card)' }}>
      <div>
        <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)' }}>{title}</div>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{hint}</div>
      </div>
      {children}
    </div>
  );
}

/** One-line summary text: mentions become names, markdown and custom emoji drop out. */
function plainHeading(text: string, registry: PanelRegistry | null): string {
  return valuesToReadable(text)
    .replace(/<@&(\d+)>/g, (_, id) => `@${registry?.roles.find(r => r.id === id)?.name ?? 'role'}`)
    .replace(/<#(\d+)>/g, (_, id) => `#${registry?.channels.find(c => c.id === id)?.name ?? 'channel'}`)
    .replace(/<a?:\w+:\d+>/g, '')
    .replace(/[*_~`]/g, '')
    .trim();
}

function EmbedEditor({ embed, mi, ei, count, edit, registry }: {
  embed: PanelEmbed; mi: number; ei: number; count: number; edit: Edit; registry: PanelRegistry | null;
}) {
  const set = (fn: (e: PanelEmbed) => void) => edit(d => fn(d.messages[mi].embeds![ei]));
  const fields = embed.fields ?? [];
  const extrasSet = [
    embed.author?.name && 'author line',
    embed.thumbnail && 'thumbnail',
    embed.image && 'large image',
    embed.footer?.text && 'footer',
  ].filter(Boolean) as string[];
  // Open on load when something is set; fixed afterwards so clearing a field doesn't snap it shut.
  const [extrasOpen] = useState(extrasSet.length > 0);
  const heading = plainHeading(embed.title || embed.fields?.[0]?.name || embed.description?.split('\n').find(l => l.trim()) || '', registry) || 'Untitled';

  return (
    <details open={count === 1} style={{ ...card, background: 'var(--bg-secondary)', borderLeft: `4px solid ${embed.color == null ? 'var(--border-card)' : `#${embed.color.toString(16).padStart(6, '0')}`}` }}>
      <summary style={summaryStyle}>
        <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>Embed {ei + 1}</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '16rem', fontWeight: 500 }}>{heading}</span>
        <Counter value={embedLength(embed)} limit={LIMITS.embedTotal} />
        <CardActions index={ei} count={count} noun="embed"
          onMove={to => edit(d => move(d.messages[mi].embeds!, ei, to))}
          onDuplicate={() => edit(d => d.messages[mi].embeds!.splice(ei + 1, 0, structuredClone(embed)))}
          onRemove={() => edit(d => { d.messages[mi].embeds!.splice(ei, 1); })} />
      </summary>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginTop: '0.75rem' }}>
        <ColorField value={embed.color} onChange={v => set(e => { e.color = v; })} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          <TextField label="Title" value={embed.title} limit={LIMITS.title} onChange={v => set(e => { e.title = v; })} />
          <TextField label="Title link" value={embed.url} placeholder="https://…" onChange={v => set(e => { e.url = v; })} />
        </div>
        <TextField label="Description" multiline rows={6} value={embed.description} limit={LIMITS.description} mentions={registry}
          onChange={v => set(e => { e.description = v; })} />

        <div>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.35rem' }}>
            <span style={labelStyle}>Fields</span>
            <button type="button" style={{ ...addBtn, marginLeft: 'auto' }} disabled={fields.length >= LIMITS.fields}
              onClick={() => set(e => { (e.fields ??= []).push({ name: '', value: '', inline: false }); })}>+ Field</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {fields.map((f, fi) => (
              <div key={fi} style={{ ...card, padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Field {fi + 1}</span>
                  <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'flex', gap: 4, alignItems: 'center' }}>
                    <input type="checkbox" checked={!!f.inline} onChange={ev => set(e => { e.fields![fi].inline = ev.target.checked; })} /> Inline
                  </label>
                  <CardActions index={fi} count={fields.length} noun="field"
                    onMove={to => set(e => move(e.fields!, fi, to))}
                    onRemove={() => set(e => { e.fields!.splice(fi, 1); })} />
                </div>
                <TextField label="Name" value={f.name} limit={LIMITS.fieldName} onChange={v => set(e => { e.fields![fi].name = v; })} />
                <TextField label="Value" multiline rows={3} value={f.value} limit={LIMITS.fieldValue} mentions={registry} onChange={v => set(e => { e.fields![fi].value = v; })} />
              </div>
            ))}
          </div>
        </div>

        <details open={extrasOpen}>
          <summary style={{ ...summaryStyle, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            Optional extras: author line, pictures, footer
            <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>{extrasSet.length ? `· using ${extrasSet.join(', ')}` : '· none set'}</span>
          </summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.6rem' }}>
            <ExtrasGroup title="Author line" hint="A small line with an optional icon, shown above the title.">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <TextField label="Text" value={embed.author?.name} limit={LIMITS.author} onChange={v => set(e => { (e.author ??= {}).name = v; })} />
                <TextField label="Link (makes the text clickable)" value={embed.author?.url} placeholder="https://…" onChange={v => set(e => { (e.author ??= {}).url = v; })} />
              </div>
              <ImageField label="Icon (small round picture before the text)" value={embed.author?.icon_url} onChange={v => set(e => { (e.author ??= {}).icon_url = v; })} />
            </ExtrasGroup>
            <ExtrasGroup title="Pictures" hint="Separate from the banners above the embeds: these sit inside this embed's box.">
              <ImageField label="Thumbnail (small, top right beside the text)" value={embed.thumbnail} onChange={v => set(e => { e.thumbnail = v; })} />
              <ImageField label="Large image (full width, under the text)" value={embed.image} onChange={v => set(e => { e.image = v; })} />
            </ExtrasGroup>
            <ExtrasGroup title="Footer" hint="Small grey text at the very bottom of the embed.">
              <TextField label="Text" value={embed.footer?.text} limit={LIMITS.footer} onChange={v => set(e => { (e.footer ??= {}).text = v; })} />
              <ImageField label="Icon (small round picture before the text)" value={embed.footer?.icon_url} onChange={v => set(e => { (e.footer ??= {}).icon_url = v; })} />
            </ExtrasGroup>
          </div>
        </details>
      </div>
    </details>
  );
}

// ---- Buttons ----

// The colours Discord draws, which is how people pick them.
const STYLE_NAMES: Record<string, string> = { primary: 'Blurple', secondary: 'Grey', success: 'Green', danger: 'Red' };

function ButtonEditor({ button, onChange, onRemove, registry }: {
  button: PanelButton; onChange: (b: PanelButton) => void; onRemove: () => void; registry: PanelRegistry | null;
}) {
  const groups = new Map<string, NonNullable<PanelRegistry>['actions']>();
  for (const a of registry?.actions ?? []) groups.set(a.group, [...(groups.get(a.group) ?? []), a]);
  const action = button.kind === 'action' ? registry?.actions.find(a => a.key === button.action) : undefined;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '7.5rem minmax(0, 1fr) 10rem auto', gap: '0.35rem', alignItems: 'center', padding: '0.4rem', background: 'var(--bg-primary)', borderRadius: '0.375rem' }}>
      <select value={button.kind} style={inputStyle}
        onChange={e => onChange(e.target.value === 'link'
          ? { kind: 'link', label: button.label, emoji: button.emoji, url: '' }
          : { kind: 'action', action: registry?.actions[0]?.key ?? '', label: button.label, emoji: button.emoji })}>
        <option value="link">Link</option>
        <option value="action">Bot button</option>
      </select>
      {button.kind === 'link' ? (
        <input value={button.url} placeholder="https://…" onChange={e => onChange({ ...button, url: e.target.value })} style={{ ...inputStyle, gridColumn: 'span 2' }} />
      ) : (
        <>
          <select value={button.action} onChange={e => onChange({ ...button, action: e.target.value })} style={inputStyle}>
            {!action && <option value={button.action}>{button.action || 'Choose…'}</option>}
            {[...groups].map(([group, actions]) => (
              <optgroup key={group} label={group}>
                {actions.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
              </optgroup>
            ))}
          </select>
          <select value={button.style ?? ''} onChange={e => onChange({ ...button, style: (e.target.value || undefined) as any })} style={inputStyle} aria-label="Button colour">
            <option value="">{action ? `${STYLE_NAMES[action.style]} (default)` : 'Default'}</option>
            {BUTTON_STYLES.map(s => <option key={s} value={s}>{STYLE_NAMES[s]}</option>)}
          </select>
        </>
      )}
      <button type="button" onClick={onRemove} style={dangerBtn} aria-label="Remove button">✕</button>
      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Label / emoji</span>
      <input value={button.label ?? ''} placeholder={button.kind === 'action' ? action?.label ?? 'Label' : 'Label'} maxLength={LIMITS.buttonLabel}
        onChange={e => onChange({ ...button, label: e.target.value })} style={inputStyle} />
      <EmojiInput value={button.emoji ?? ''} registry={registry} onChange={v => onChange({ ...button, emoji: v })}
        placeholder={button.kind === 'action' && action?.emoji ? `${action.emoji} (default)` : undefined} />
    </div>
  );
}

function RowsEditor({ message, mi, edit, registry }: { message: PanelMessage; mi: number; edit: Edit; registry: PanelRegistry | null }) {
  const rows = message.rows ?? [];
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.35rem' }}>
        <span style={labelStyle}>Buttons</span>
        <button type="button" style={{ ...addBtn, marginLeft: 'auto' }} disabled={rows.length >= LIMITS.rows}
          onClick={() => edit(d => { (d.messages[mi].rows ??= []).push([{ kind: 'link', label: '', url: '' }]); })}>+ Row</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {rows.map((row, ri) => (
          <div key={ri} style={{ ...card, padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Row {ri + 1}</span>
              <span style={{ marginLeft: 'auto', display: 'flex', gap: '0.25rem' }}>
                <button type="button" style={addBtn} disabled={row.length >= LIMITS.buttonsPerRow}
                  onClick={() => edit(d => { d.messages[mi].rows![ri].push({ kind: 'link', label: '', url: '' }); })}>+ Button</button>
                <button type="button" style={ghostBtn} disabled={ri === 0} onClick={() => edit(d => move(d.messages[mi].rows!, ri, ri - 1))} aria-label="Move row up">↑</button>
                <button type="button" style={ghostBtn} disabled={ri === rows.length - 1} onClick={() => edit(d => move(d.messages[mi].rows!, ri, ri + 1))} aria-label="Move row down">↓</button>
                <button type="button" style={dangerBtn} onClick={() => edit(d => { d.messages[mi].rows!.splice(ri, 1); })}>Remove row</button>
              </span>
            </div>
            {row.map((b, bi) => (
              <ButtonEditor key={bi} button={b} registry={registry}
                onChange={nb => edit(d => { d.messages[mi].rows![ri][bi] = nb; })}
                onRemove={() => edit(d => {
                  d.messages[mi].rows![ri].splice(bi, 1);
                  if (!d.messages[mi].rows![ri].length) d.messages[mi].rows!.splice(ri, 1);
                })} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Message ----

/** An embed's text as plain lines, for moving a message into a single box. */
function embedText(e: PanelEmbed): string {
  return [
    e.title && `**${e.title}**`,
    e.description,
    ...(e.fields ?? []).map(f => `**${f.name}**\n${f.value}`),
    e.footer?.text && `-# ${e.footer.text}`,
  ].filter(Boolean).join('\n\n');
}

function MessageEditor({ message, mi, count, edit, registry, onFocus }: {
  message: PanelMessage; mi: number; count: number; edit: Edit; registry: PanelRegistry | null; onFocus: (i: number) => void;
}) {
  const embeds = message.embeds ?? [];
  const images = message.images ?? [];
  const box = message.layout === LAYOUT_BOX;

  // Embeds -> box: their text joins the box text and the first one's colour is kept.
  // Box -> embeds: the text becomes one embed. Images and buttons carry over.
  const setStyle = (toBox: boolean) => {
    if (toBox === box) return;
    if (toBox && embeds.some(e => e.image || e.thumbnail || e.author?.icon_url || e.footer?.icon_url)
      && !window.confirm('Embed images (thumbnails, large images, icons) are dropped in a single box. Upload them as images instead. Switch anyway?')) return;
    edit(d => {
      const m = d.messages[mi];
      if (toBox) {
        m.layout = LAYOUT_BOX;
        m.color = m.embeds?.[0]?.color ?? registry?.default_color ?? DEFAULT_EMBED_COLOR;
        m.content = [m.content, ...(m.embeds ?? []).map(embedText)].filter(Boolean).join('\n\n');
        delete m.embeds;
      } else {
        m.embeds = m.content ? [{ description: m.content, color: m.color ?? null }] : [];
        delete m.content; delete m.layout; delete m.color;
      }
    });
  };

  return (
    <details open style={card} onFocusCapture={() => onFocus(mi)} onMouseEnter={() => onFocus(mi)}>
      <summary style={summaryStyle}>
        Message {mi + 1}
        <span style={{ fontWeight: 400, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          {[box ? 'single box' : embeds.length && `${embeds.length} embed${embeds.length > 1 ? 's' : ''}`, images.length && `${images.length} image${images.length > 1 ? 's' : ''}`, message.rows?.length && 'buttons'].filter(Boolean).join(' · ')}
        </span>
        <CardActions index={mi} count={count} noun="message"
          onMove={to => edit(d => move(d.messages, mi, to))}
          onDuplicate={() => edit(d => d.messages.splice(mi + 1, 0, { ...structuredClone(message), dynamic: undefined }))}
          onRemove={() => edit(d => { d.messages.splice(mi, 1); })} />
      </summary>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginTop: '0.75rem' }}>
        <div>
          <span style={labelStyle}>Style</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'inline-flex', gap: '0.2rem', background: 'var(--bg-primary)', padding: '0.2rem', borderRadius: '0.4rem', border: '1px solid var(--border-card)' }}>
              {([[false, 'Embeds'], [true, 'Single box']] as const).map(([b, label]) => (
                <button key={label} type="button" onClick={() => setStyle(b)} aria-pressed={box === b}
                  style={{ ...smallBtn, background: box === b ? '#3b82f6' : 'transparent', color: box === b ? '#fff' : 'var(--text-secondary)' }}>
                  {label}
                </button>
              ))}
            </div>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              {box ? 'One box: text, then each image at full width, then buttons.' : 'Classic boxes with a title, text, fields and images.'}
              {' '}Changing a posted message's style reposts it.
            </span>
          </div>
        </div>

        {box ? (
          <>
            <TextField label="Text" multiline rows={8} value={message.content} limit={LIMITS.boxText} mentions={registry}
              placeholder="Markdown works: **bold**, # headings, - lists. Mentions never ping." onChange={v => edit(d => { d.messages[mi].content = v; })} />
            <ColorField value={message.color} onChange={v => edit(d => { d.messages[mi].color = v; })} />
          </>
        ) : (
          <TextField label="Message text (above everything else)" multiline rows={2} value={message.content} limit={LIMITS.content} mentions={registry}
            placeholder="Optional. Mentions here never ping." onChange={v => edit(d => { d.messages[mi].content = v; })} />
        )}

        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
            <span style={labelStyle}>{box ? 'Images (full width, under the text)' : 'Images (banners shown above the embeds)'}</span>
            <span style={{ marginLeft: 'auto' }}>
              {images.length < LIMITS.images && <UploadButton label="+ Upload image" onUploaded={url => edit(d => { (d.messages[mi].images ??= []).push(url); })} />}
            </span>
          </div>
          {images.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {images.map((url, i) => (
                <div key={i} style={{ position: 'relative' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imageSrc(url) ?? undefined} alt="" style={{ maxHeight: 64, maxWidth: 260, borderRadius: 4, display: 'block' }} />
                  <span style={{ position: 'absolute', top: 2, right: 2, display: 'flex', gap: 2 }}>
                    {i > 0 && <button type="button" style={{ ...ghostBtn, padding: '0 4px' }} onClick={() => edit(d => move(d.messages[mi].images!, i, i - 1))} aria-label="Move image left">←</button>}
                    <button type="button" style={{ ...smallBtn, padding: '0 5px', background: 'rgba(0,0,0,0.7)', color: '#fff' }}
                      onClick={() => edit(d => { d.messages[mi].images!.splice(i, 1); })} aria-label="Remove image">✕</button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {!box && <div>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.35rem' }}>
            <span style={labelStyle}>Embeds</span>
            <button type="button" style={{ ...addBtn, marginLeft: 'auto' }} disabled={embeds.length >= LIMITS.embeds}
              onClick={() => edit(d => { (d.messages[mi].embeds ??= []).push({ color: registry?.default_color ?? DEFAULT_EMBED_COLOR, description: '' }); })}>+ Embed</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {embeds.map((e, ei) => <EmbedEditor key={ei} embed={e} mi={mi} ei={ei} count={embeds.length} edit={edit} registry={registry} />)}
          </div>
        </div>}

        <RowsEditor message={message} mi={mi} edit={edit} registry={registry} />

        <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          <input type="checkbox" checked={message.dynamic === DYNAMIC_SHELL_EXCHANGE}
            onChange={ev => edit(d => {
              d.messages.forEach(m => { delete m.dynamic; });
              if (ev.target.checked) d.messages[mi].dynamic = DYNAMIC_SHELL_EXCHANGE;
            })} />
          Add the shell exchange rate images after this message&apos;s {box ? 'images' : 'embeds'}
        </label>
      </div>
    </details>
  );
}

export default function PanelEditor({ content, onChange, registry, onFocus }: {
  content: PanelContent;
  onChange: (next: PanelContent) => void;
  registry: PanelRegistry | null;
  onFocus: (messageIndex: number) => void;
}) {
  const edit: Edit = fn => {
    const draft = structuredClone(content);
    fn(draft);
    onChange(draft);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {content.messages.map((m, mi) => (
        <MessageEditor key={mi} message={m} mi={mi} count={content.messages.length} edit={edit} registry={registry} onFocus={onFocus} />
      ))}
      <button type="button" style={{ ...addBtn, alignSelf: 'flex-start', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
        disabled={content.messages.length >= LIMITS.messages}
        onClick={() => edit(d => { d.messages.push({ embeds: [{ color: registry?.default_color ?? DEFAULT_EMBED_COLOR, description: '' }] }); })}>
        + Message
      </button>
    </div>
  );
}
