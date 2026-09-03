"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Eye, EyeOff } from "lucide-react";
import WikiMarkdown from "./WikiMarkdown";
import {
  WIKI_LIMITS,
  WIKI_PAGE_TYPES,
  WIKI_TYPE_LABELS,
  WikiPagePayload,
  slugify,
  validateWikiPagePayload,
} from "@/lib/wiki";

/**
 * Bespoke split-pane wiki editor: metadata fields + markdown textarea with a
 * small formatting toolbar on the left, live rendered preview on the right.
 * Used by /chronicles/new and /chronicles/[slug]/edit (exec, Phase 1) and by
 * the suggestion flow later (Phase 2).
 */

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '0.45rem 0.6rem',
  borderRadius: '0.375rem',
  border: '1px solid var(--border-color)',
  background: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
  fontSize: '0.85rem',
  outline: 'none',
};

const labelStyle: React.CSSProperties = {
  fontSize: '0.7rem',
  fontWeight: 700,
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
  margin: '0.75rem 0 0.25rem',
};

export default function WikiEditor({
  targetId,
  initial,
}: {
  targetId: number | null;
  initial: WikiPagePayload;
}) {
  const router = useRouter();
  const [form, setForm] = useState<WikiPagePayload>(initial);
  const [slugTouched, setSlugTouched] = useState(targetId !== null);
  const [note, setNote] = useState('');
  const [showPreview, setShowPreview] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof WikiPagePayload>(key: K, value: WikiPagePayload[K]) =>
    setForm(f => ({ ...f, [key]: value }));

  const insertSnippet = (before: string, after = '') => {
    const ta = document.getElementById('wiki-body-input') as HTMLTextAreaElement | null;
    if (!ta) return;
    const { selectionStart: s, selectionEnd: e, value } = ta;
    const selected = value.slice(s, e) || 'text';
    const next = value.slice(0, s) + before + selected + after + value.slice(e);
    set('body', next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(s + before.length, s + before.length + selected.length);
    });
  };

  const validation = useMemo(() => validateWikiPagePayload(form), [form]);

  const save = async () => {
    setError(null);
    if (!validation.ok) { setError(validation.error); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/wiki/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId, payload: validation.value, note }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Save failed'); return; }
      router.push(`/chronicles/${data.slug}`);
      router.refresh();
    } catch {
      setError('Network error');
    } finally {
      setBusy(false);
    }
  };

  const toolbar: Array<[string, () => void]> = [
    ['B', () => insertSnippet('**', '**')],
    ['I', () => insertSnippet('*', '*')],
    ['H2', () => insertSnippet('\n## ', '\n')],
    ['H3', () => insertSnippet('\n### ', '\n')],
    ['[[link]]', () => insertSnippet('[[', ']]')],
    ['Table', () => insertSnippet('\n| Column | Column |\n| --- | --- |\n| ', ' | |\n')],
    ['Quote', () => insertSnippet('\n> ', '\n')],
  ];

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '1.5rem 1rem 3rem' }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.75rem' }}>
        {targetId === null ? 'New Chronicles page' : `Editing: ${initial.title}`}
      </h1>

      {/* Metadata row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 2fr) minmax(160px, 1.5fr) minmax(120px, 1fr)', gap: '0.75rem' }}>
        <div>
          <div style={labelStyle}>Title</div>
          <input
            style={inputStyle}
            value={form.title}
            maxLength={WIKI_LIMITS.titleMax}
            onChange={(e) => {
              const title = e.target.value;
              setForm(f => ({ ...f, title, slug: slugTouched ? f.slug : slugify(title) }));
            }}
          />
        </div>
        <div>
          <div style={labelStyle}>Slug (URL)</div>
          <input
            style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '0.78rem' }}
            value={form.slug}
            maxLength={WIKI_LIMITS.slugMax}
            onChange={(e) => { setSlugTouched(true); set('slug', e.target.value.toLowerCase()); }}
          />
        </div>
        <div>
          <div style={labelStyle}>Type</div>
          <select style={inputStyle} value={form.pageType} onChange={(e) => set('pageType', e.target.value as WikiPagePayload['pageType'])}>
            {WIKI_PAGE_TYPES.map(t => <option key={t} value={t}>{WIKI_TYPE_LABELS[t]}</option>)}
          </select>
        </div>
      </div>

      <div style={labelStyle}>Summary (the lede — one or two sentences shown above the article and in search)</div>
      <textarea
        style={{ ...inputStyle, minHeight: '3.2rem', resize: 'vertical' }}
        value={form.summary}
        maxLength={WIKI_LIMITS.summaryMax}
        onChange={(e) => set('summary', e.target.value)}
      />

      {/* Infobox rows */}
      <div style={labelStyle}>Infobox</div>
      {form.infobox.map((row, i) => (
        <div key={i} style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.35rem' }}>
          <input
            style={{ ...inputStyle, width: '11rem' }}
            placeholder="Label"
            value={row.label}
            maxLength={WIKI_LIMITS.infoboxLabelMax}
            onChange={(e) => set('infobox', form.infobox.map((r, j) => j === i ? { ...r, label: e.target.value } : r))}
          />
          <input
            style={inputStyle}
            placeholder="Value (wiki links work: [[the-federation|the Fed]])"
            value={row.value}
            maxLength={WIKI_LIMITS.infoboxValueMax}
            onChange={(e) => set('infobox', form.infobox.map((r, j) => j === i ? { ...r, value: e.target.value } : r))}
          />
          <button
            type="button"
            title="Remove row"
            onClick={() => set('infobox', form.infobox.filter((_, j) => j !== i))}
            style={{ ...inputStyle, width: 'auto', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          >
            <X size={13} />
          </button>
        </div>
      ))}
      {form.infobox.length < WIKI_LIMITS.infoboxRowsMax && (
        <button
          type="button"
          onClick={() => set('infobox', [...form.infobox, { label: '', value: '' }])}
          style={{ ...inputStyle, width: 'auto', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem' }}
        >
          <Plus size={13} /> Add infobox row
        </button>
      )}

      {/* Body: toolbar + split pane */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0.9rem 0 0.25rem' }}>
        <div style={{ display: 'flex', gap: '0.3rem' }}>
          {toolbar.map(([label, fn]) => (
            <button key={label} type="button" onClick={fn}
              style={{ ...inputStyle, width: 'auto', padding: '0.25rem 0.55rem', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700 }}>
              {label}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setShowPreview(p => !p)}
          style={{ ...inputStyle, width: 'auto', padding: '0.25rem 0.55rem', cursor: 'pointer', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
          {showPreview ? <EyeOff size={13} /> : <Eye size={13} />} {showPreview ? 'Hide preview' : 'Show preview'}
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: showPreview ? '1fr 1fr' : '1fr', gap: '0.75rem', alignItems: 'stretch' }}>
        <textarea
          id="wiki-body-input"
          style={{ ...inputStyle, minHeight: '28rem', resize: 'vertical', fontFamily: 'monospace', fontSize: '0.8rem', lineHeight: 1.5 }}
          value={form.body}
          onChange={(e) => set('body', e.target.value)}
          placeholder={'Markdown body. Wiki links: [[Page Title]] or [[page-slug|label]].\n\n## Section headings build the table of contents'}
        />
        {showPreview && (
          <div style={{
            border: '1px solid var(--border-color)', borderRadius: '0.375rem',
            padding: '0.75rem 1rem', overflowY: 'auto', maxHeight: '40rem', background: 'var(--bg-card)',
          }}>
            <WikiMarkdown body={form.body} />
          </div>
        )}
      </div>

      {/* Save row */}
      <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', marginTop: '0.9rem' }}>
        <input
          style={{ ...inputStyle, flex: 1 }}
          placeholder="Edit summary (what changed and why — shown in page history)"
          value={note}
          maxLength={WIKI_LIMITS.noteMax}
          onChange={(e) => setNote(e.target.value)}
        />
        <button
          type="button"
          disabled={busy}
          onClick={save}
          style={{
            ...inputStyle, width: 'auto', cursor: 'pointer', fontWeight: 700,
            background: 'var(--accent-primary)', color: 'var(--text-on-accent)', border: 'none',
            opacity: busy ? 0.6 : 1, padding: '0.45rem 1.2rem',
          }}
        >
          {busy ? 'Saving…' : targetId === null ? 'Create page' : 'Save changes'}
        </button>
      </div>
      {error && <div style={{ color: '#e57373', fontSize: '0.8rem', marginTop: '0.5rem' }}>{error}</div>}
    </div>
  );
}
