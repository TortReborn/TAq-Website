"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Eye, EyeOff, ImagePlus } from "lucide-react";
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
  mode = 'direct',
}: {
  targetId: number | null;
  initial: WikiPagePayload;
  /** 'direct' publishes immediately (exec); 'suggest' queues for review */
  mode?: 'direct' | 'suggest';
}) {
  const router = useRouter();
  const [form, setForm] = useState<WikiPagePayload>(initial);
  const [slugTouched, setSlugTouched] = useState(targetId !== null);
  const [note, setNote] = useState('');
  const [showPreview, setShowPreview] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggested, setSuggested] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [uploading, setUploading] = useState(false);

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

  // Unsaved-change tracking, so Cancel can warn before throwing work away.
  const dirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(initial) || note.trim() !== '',
    [form, initial, note],
  );

  const leave = () => {
    if (targetId === null) router.push('/chronicles');
    else router.push(`/chronicles/${initial.slug}`);
  };

  const cancel = () => {
    if (!dirty) { leave(); return; }
    setConfirmDiscard(true);
  };

  // Also catch tab close and browser navigation while there is unsaved work.
  useEffect(() => {
    if (!dirty || suggested) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty, suggested]);

  // Escape closes the discard dialog rather than leaving the page.
  useEffect(() => {
    if (!confirmDiscard) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setConfirmDiscard(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirmDiscard]);

  const save = async () => {
    setError(null);
    if (!validation.ok) { setError(validation.error); return; }
    setBusy(true);
    try {
      const endpoint = mode === 'direct' ? '/api/wiki/admin' : '/api/wiki/suggest';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId, payload: validation.value, note }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Save failed'); return; }
      if (mode === 'suggest') { setSuggested(true); return; }
      router.push(`/chronicles/${data.slug}`);
      router.refresh();
    } catch {
      setError('Network error');
    } finally {
      setBusy(false);
    }
  };

  const uploadImage = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/wiki/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Upload failed'); return; }
      insertSnippet(`\n![${file.name.replace(/\.[a-z]+$/i, '')}](${data.url})\n`, '');
    } catch {
      setError('Upload failed — network error');
    } finally {
      setUploading(false);
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
    // Inline reference: cite an archived source id (see data/sources/) so the
    // footnote resolves to a real title and link.
    ['Cite', () => insertSnippet('{{cite:', '}}')],
  ];

  // Live-data embeds: block directives, resolved when the article renders.
  // The editor preview shows a placeholder card in their place.
  const embedSnippets: Array<[string, string]> = [
    ['Alliance card', '\n{{alliance:Alliance Name}}\n'],
    ['War chart', '\n{{war-chart:Guild A|Guild B|2020-01-01|2020-06-01}}\n'],
    ['Map link', '\n{{map:2020-01-01|The map when it began}}\n'],
  ];

  if (suggested) {
    return (
      <div style={{ padding: '3.5rem 1rem', textAlign: 'center' }}>
        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
          Suggestion submitted
        </div>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          An exec will review it — approved changes appear with you credited as the author.
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '1.5rem 1rem 3rem' }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
        {targetId === null
          ? (mode === 'direct' ? 'New Chronicles page' : 'Suggest a new Chronicles page')
          : (mode === 'direct' ? `Editing: ${initial.title}` : `Suggest an edit: ${initial.title}`)}
      </h1>
      {mode === 'suggest' && (
        <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0 0 0.75rem' }}>
          Your changes go to the exec review queue; nothing publishes until approved.
        </p>
      )}

      {/* Metadata row */}
      <div className="wiki-editor-meta">
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

      <div className="wiki-editor-meta2">
        <div>
          <div style={labelStyle}>Lead image (shown at the top of the infobox)</div>
          <input
            style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '0.75rem' }}
            placeholder="/images/chronicles/media/example.webp"
            value={form.leadImage ?? ''}
            maxLength={WIKI_LIMITS.leadImageMax}
            onChange={(e) => set('leadImage', e.target.value)}
          />
        </div>
        <div>
          <div style={labelStyle}>Lead image caption</div>
          <input
            style={inputStyle}
            placeholder="What the image shows, dated where known"
            value={form.leadImageCaption ?? ''}
            maxLength={WIKI_LIMITS.leadImageCaptionMax}
            onChange={(e) => set('leadImageCaption', e.target.value)}
          />
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
        <div key={i} style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem', flexWrap: 'wrap', margin: '0.9rem 0 0.25rem' }}>
        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
          {toolbar.map(([label, fn]) => (
            <button key={label} type="button" onClick={fn}
              style={{ ...inputStyle, width: 'auto', padding: '0.25rem 0.55rem', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700 }}>
              {label}
            </button>
          ))}
          <select
            value=""
            onChange={(e) => {
              const snippet = embedSnippets.find(([label]) => label === e.target.value)?.[1];
              if (snippet) insertSnippet(snippet, '');
            }}
            style={{ ...inputStyle, width: 'auto', padding: '0 0.4rem', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700, height: 'auto' }}
            aria-label="Insert live-data embed"
          >
            <option value="" disabled>Embed…</option>
            {embedSnippets.map(([label]) => <option key={label} value={label}>{label}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
          <label style={{ ...inputStyle, width: 'auto', padding: '0.25rem 0.55rem', cursor: uploading ? 'wait' : 'pointer', fontSize: '0.72rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
            <ImagePlus size={13} /> {uploading ? 'Uploading…' : 'Image'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              style={{ display: 'none' }}
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadImage(f);
                e.target.value = '';
              }}
            />
          </label>
          <button type="button" onClick={() => setShowPreview(p => !p)}
            style={{ ...inputStyle, width: 'auto', padding: '0.25rem 0.55rem', cursor: 'pointer', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
            {showPreview ? <EyeOff size={13} /> : <Eye size={13} />} {showPreview ? 'Hide preview' : 'Show preview'}
          </button>
        </div>
      </div>
      <div className={showPreview ? 'wiki-editor-panes wiki-editor-panes--split' : 'wiki-editor-panes'}>
        <textarea
          id="wiki-body-input"
          style={{ ...inputStyle, minHeight: '28rem', resize: 'vertical', fontFamily: 'monospace', fontSize: '0.8rem', lineHeight: 1.5 }}
          value={form.body}
          onChange={(e) => set('body', e.target.value)}
          placeholder={'Markdown body. Wiki links: [[Page Title]] or [[page-slug|label]].\nCitations: {{cite:thread-237070|p3 #45}} renders a numbered superscript.\n\n## Section headings build the table of contents'}
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
      <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '0.9rem' }}>
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
          onClick={cancel}
          style={{
            ...inputStyle, width: 'auto', cursor: 'pointer', fontWeight: 600,
            background: 'transparent', color: 'var(--text-secondary)',
            opacity: busy ? 0.6 : 1, padding: '0.45rem 1rem',
          }}
        >
          Cancel
        </button>
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
          {busy
            ? 'Saving…'
            : mode === 'suggest'
              ? 'Submit suggestion'
              : targetId === null ? 'Create page' : 'Save changes'}
        </button>
      </div>
      {error && <div style={{ color: '#e57373', fontSize: '0.8rem', marginTop: '0.5rem' }}>{error}</div>}

      {confirmDiscard && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="wiki-discard-title"
          onClick={() => setConfirmDiscard(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 100, display: 'flex',
            alignItems: 'center', justifyContent: 'center', padding: '1rem',
            background: 'rgba(0,0,0,0.6)',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--bg-card)', border: '1px solid var(--border-color)',
              borderRadius: '0.5rem', padding: '1.25rem', maxWidth: '26rem', width: '100%',
            }}
          >
            <div id="wiki-discard-title" style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
              Discard your changes?
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
              {targetId === null
                ? 'This page has not been created yet. Leaving now loses everything you have written.'
                : 'Your edits to this page have not been saved, and leaving now loses them.'}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1.1rem' }}>
              <button
                type="button"
                autoFocus
                onClick={() => setConfirmDiscard(false)}
                style={{
                  ...inputStyle, width: 'auto', cursor: 'pointer', fontWeight: 600,
                  background: 'transparent', color: 'var(--text-secondary)', padding: '0.4rem 0.9rem',
                }}
              >
                Keep editing
              </button>
              <button
                type="button"
                onClick={leave}
                style={{
                  ...inputStyle, width: 'auto', cursor: 'pointer', fontWeight: 700,
                  background: '#b3261e', color: '#fff', border: 'none', padding: '0.4rem 1rem',
                }}
              >
                Discard changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
