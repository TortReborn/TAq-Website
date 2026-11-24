"use client";

/**
 * Application form editor (TAQ-217): the guild, community and Hammerhead
 * questions, edited like Bot Messages. A save is a revision and is live on
 * the next page load; each submission keeps a copy of the wording it was
 * asked in, so the bot and old applications are never relabelled.
 */

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import useSWR, { preload } from 'swr';
import { fetcher } from '@/hooks/fetcher';
import {
  FORM_LIMITS, FORM_NAMES, FORM_TYPES, LOCKED_IDS, answerTypes, newQuestionId, normalizeForm,
  type ApplicationQuestion, type FormContent, type FormType, type HammerheadForm, type SimpleForm,
} from '@/lib/application-questions';
import type { FormRevisionMeta } from '@/lib/application-forms-db';
import { btnStyle, inputStyle, labelStyle, smallBtn } from '@/components/bot-panels/PanelEditor';
import { StatusBadge, timeAgo } from '@/components/bot-panels/status';
import FormPreview, { type PreviewFocus } from '@/components/application-forms/FormPreview';
import BackLink from '@/components/bot-panels/BackLink';

interface FormResponse {
  live: { content: FormContent; rev_number: number | null };
  revisions: (FormRevisionMeta & { content: FormContent })[];
  defaults: FormContent;
  can_edit: boolean;
}

interface Draft { content: FormContent; baseRev: number | null; restoredFrom: number | null }

const card: React.CSSProperties = { background: 'var(--bg-card-solid)', border: '1px solid var(--border-card)', borderRadius: '0.5rem', padding: '1rem' };
const ghostBtn: React.CSSProperties = { ...smallBtn, background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-card)' };
const addBtn: React.CSSProperties = { ...smallBtn, background: 'rgba(34, 197, 94, 0.12)', color: '#22c55e' };
const dangerBtn: React.CSSProperties = { ...smallBtn, background: 'transparent', color: '#ef4444' };
const sectionTitle: React.CSSProperties = { fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0 };

const TYPE_NAMES: Record<string, string> = { text: 'Short answer', textarea: 'Long answer', select: 'Dropdown' };
const DEFAULT_MAX = { text: 100, textarea: 1000 } as const;

function move<T>(list: T[], i: number, by: number): T[] {
  const j = i + by;
  if (j < 0 || j >= list.length) return list;
  const out = [...list];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

const blankQuestion = (): ApplicationQuestion =>
  ({ id: newQuestionId(), label: '', type: 'textarea', required: false, maxLength: DEFAULT_MAX.textarea });

// ---------------------------------------------------------------------------

function QuestionCard({ q, n, formType, readOnly, onChange, onMove, onRemove, first, last }: {
  q: ApplicationQuestion; n: number; formType: FormType; readOnly: boolean;
  onChange: (q: ApplicationQuestion) => void; onMove: (by: number) => void; onRemove: () => void;
  first: boolean; last: boolean;
}) {
  const locked = q.id === LOCKED_IDS[formType];
  const setType = (type: ApplicationQuestion['type']) => {
    if (type === 'select') onChange({ ...q, type, options: q.options?.length ? q.options : ['', ''], maxLength: undefined, placeholder: undefined });
    else onChange({ ...q, type, options: undefined, maxLength: Math.min(q.maxLength ?? DEFAULT_MAX[type as 'text' | 'textarea'], FORM_LIMITS[type as 'text' | 'textarea']) });
  };

  return (
    <div style={{ ...card, padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Question {n}</span>
        {locked && (
          <span title="The bot reads this answer to name the application, so it can be reworded but not removed."
            style={{ fontSize: '0.68rem', padding: '0.1rem 0.4rem', borderRadius: '999px', background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa' }}>
            Used by the bot
          </span>
        )}
        {!readOnly && (
          <span style={{ marginLeft: 'auto', display: 'flex', gap: '0.25rem' }}>
            <button type="button" style={ghostBtn} disabled={first} onClick={() => onMove(-1)} aria-label="Move up">↑</button>
            <button type="button" style={ghostBtn} disabled={last} onClick={() => onMove(1)} aria-label="Move down">↓</button>
            {!locked && <button type="button" style={dangerBtn} onClick={onRemove}>Remove</button>}
          </span>
        )}
      </div>

      <div>
        <label style={labelStyle}>Question</label>
        <textarea value={q.label} readOnly={readOnly} rows={2} maxLength={FORM_LIMITS.label}
          onChange={e => onChange({ ...q, label: e.target.value })}
          style={{ ...inputStyle, resize: 'vertical' }} />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'end' }}>
        <div style={{ minWidth: '9rem' }}>
          <label style={labelStyle}>Answer</label>
          <select value={q.type} disabled={readOnly || locked} onChange={e => setType(e.target.value as ApplicationQuestion['type'])} style={inputStyle}>
            {answerTypes(formType).map(t => <option key={t} value={t}>{TYPE_NAMES[t]}</option>)}
          </select>
        </div>
        {q.type !== 'select' && (
          <div style={{ width: '8rem' }}>
            <label style={labelStyle}>Character limit</label>
            <input type="number" min={1} max={FORM_LIMITS[q.type as 'text' | 'textarea']} value={q.maxLength ?? ''} readOnly={readOnly}
              onChange={e => onChange({ ...q, maxLength: e.target.value === '' ? undefined : Number(e.target.value) })} style={inputStyle} />
          </div>
        )}
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', color: 'var(--text-primary)', paddingBottom: '0.5rem' }}>
          <input type="checkbox" checked={q.required} disabled={readOnly || locked} onChange={e => onChange({ ...q, required: e.target.checked })} />
          Required
        </label>
      </div>

      {q.type === 'select' ? (
        <div>
          <label style={labelStyle}>Choices, one per line</label>
          <textarea value={(q.options ?? []).join('\n')} readOnly={readOnly} rows={Math.max(2, (q.options ?? []).length)}
            onChange={e => onChange({ ...q, options: e.target.value.split('\n') })}
            style={{ ...inputStyle, resize: 'vertical' }} />
        </div>
      ) : (
        <div>
          <label style={labelStyle}>Hint shown in the empty box (optional)</label>
          <input value={q.placeholder ?? ''} readOnly={readOnly} maxLength={FORM_LIMITS.placeholder}
            onChange={e => onChange({ ...q, placeholder: e.target.value })} style={inputStyle} />
        </div>
      )}
    </div>
  );
}

function QuestionList({ questions, formType, readOnly, onChange, numberFrom = 1 }: {
  questions: ApplicationQuestion[]; formType: FormType; readOnly: boolean;
  onChange: (qs: ApplicationQuestion[]) => void; numberFrom?: number;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      {questions.map((q, i) => (
        <QuestionCard key={q.id} q={q} n={numberFrom + i} formType={formType} readOnly={readOnly}
          first={i === 0} last={i === questions.length - 1}
          onChange={nq => onChange(questions.map((x, j) => (j === i ? nq : x)))}
          onMove={by => onChange(move(questions, i, by))}
          onRemove={() => onChange(questions.filter((_, j) => j !== i))} />
      ))}
      {questions.length === 0 && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No questions.</div>}
      {!readOnly && questions.length < FORM_LIMITS.questions && (
        <div><button type="button" style={addBtn} onClick={() => onChange([...questions, blankQuestion()])}>+ Add question</button></div>
      )}
    </div>
  );
}

function HammerheadEditor({ form, readOnly, onChange, onFocusArea }: {
  form: HammerheadForm; readOnly: boolean; onChange: (f: HammerheadForm) => void;
  /** Tells the preview which step (and task area) is being edited */
  onFocusArea?: (step: number, task?: string) => void;
}) {
  const setTask = (i: number, t: HammerheadForm['tasks'][number]) => onChange({ ...form, tasks: form.tasks.map((x, j) => (j === i ? t : x)) });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <section onFocusCapture={() => onFocusArea?.(0)} style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        <h2 style={sectionTitle}>Step 1 · General questions</h2>
        <QuestionList questions={form.general} formType="hammerhead" readOnly={readOnly} onChange={general => onChange({ ...form, general })} />
      </section>

      <section onFocusCapture={() => onFocusArea?.(1)} style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        <h2 style={sectionTitle}>Step 2 · Task areas</h2>
        <div>
          <label style={labelStyle}>The question asking which areas they want (each area below is a choice)</label>
          <textarea value={form.task_label} readOnly={readOnly} rows={2} maxLength={FORM_LIMITS.label}
            onChange={e => onChange({ ...form, task_label: e.target.value })} style={{ ...inputStyle, resize: 'vertical' }} />
        </div>
        {form.tasks.map((t, i) => (
          <div key={i} onFocusCapture={() => onFocusArea?.(1, t.name)} style={{ ...card, display: 'flex', flexDirection: 'column', gap: '0.6rem', borderLeft: '3px solid #396aff' }}>
            <div style={{ display: 'flex', alignItems: 'end', gap: '0.5rem', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 12rem' }}>
                <label style={labelStyle}>Task area name</label>
                <input value={t.name} readOnly={readOnly} maxLength={FORM_LIMITS.taskName}
                  onChange={e => setTask(i, { ...t, name: e.target.value })} style={{ ...inputStyle, fontWeight: 600 }} />
              </div>
              {!readOnly && (
                <span style={{ display: 'flex', gap: '0.25rem', paddingBottom: '0.3rem' }}>
                  <button type="button" style={ghostBtn} disabled={i === 0} onClick={() => onChange({ ...form, tasks: move(form.tasks, i, -1) })} aria-label="Move area up">↑</button>
                  <button type="button" style={ghostBtn} disabled={i === form.tasks.length - 1} onClick={() => onChange({ ...form, tasks: move(form.tasks, i, 1) })} aria-label="Move area down">↓</button>
                  <button type="button" style={dangerBtn} onClick={() => onChange({ ...form, tasks: form.tasks.filter((_, j) => j !== i) })}>Remove area</button>
                </span>
              )}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Asked only when the applicant picks this area.</div>
            <QuestionList questions={t.questions} formType="hammerhead" readOnly={readOnly} onChange={questions => setTask(i, { ...t, questions })} />
          </div>
        ))}
        {!readOnly && form.tasks.length < FORM_LIMITS.tasks && (
          <div><button type="button" style={addBtn} onClick={() => onChange({ ...form, tasks: [...form.tasks, { name: '', questions: [blankQuestion()] }] })}>+ Add task area</button></div>
        )}
      </section>

      <section onFocusCapture={() => onFocusArea?.(2)} style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        <h2 style={sectionTitle}>Step 3 · Final questions</h2>
        <QuestionList questions={form.final} formType="hammerhead" readOnly={readOnly} onChange={final => onChange({ ...form, final })} />
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Layout matches the Bot Messages panel editor: a one-row header with the
// Edit/History toggle, the form on the left, and on the right a sticky column
// with the save strip on top and a live preview of the apply page under it.

const banner = (color: string): React.CSSProperties => ({
  padding: '0.65rem 0.8rem', borderRadius: '0.375rem', background: `${color}1a`,
  border: `1px solid ${color}4d`, color, fontSize: '0.83rem',
});

const skel = (width: string, height = '0.8rem', extra: React.CSSProperties = {}) =>
  <div className="skeleton" style={{ width, height, borderRadius: '0.25rem', ...extra }} />;

/** Question cards held in place while a form loads, so switching forms doesn't jump. */
function QuestionsSkeleton({ steps }: { steps: boolean }) {
  return (
    <div aria-busy="true" aria-label="Loading the form" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      {steps && skel('11rem', '0.8rem')}
      {[0, 1, 2].map(i => (
        <div key={i} style={{ ...card, padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>{skel('5rem')}{skel('3.5rem', '1.2rem')}</div>
          <div>{skel('4rem', '0.6rem', { marginBottom: '0.35rem' })}{skel('100%', '2.75rem', { borderRadius: '0.375rem' })}</div>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'end' }}>
            <div>{skel('3.5rem', '0.6rem', { marginBottom: '0.35rem' })}{skel('9rem', '2rem', { borderRadius: '0.375rem' })}</div>
            <div>{skel('5.5rem', '0.6rem', { marginBottom: '0.35rem' })}{skel('8rem', '2rem', { borderRadius: '0.375rem' })}</div>
            {skel('5rem', '1rem', { marginBottom: '0.5rem' })}
          </div>
          <div>{skel('12rem', '0.6rem', { marginBottom: '0.35rem', maxWidth: '100%' })}{skel('100%', '2rem', { borderRadius: '0.375rem' })}</div>
        </div>
      ))}
    </div>
  );
}

function PreviewSkeleton() {
  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border-card)' }}>{skel('11rem', '0.7rem')}</div>
      <div style={{ padding: '1.25rem 1rem', display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
        {skel('16rem', '1.6rem', { maxWidth: '100%' })}
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {[0, 1, 2].map(i => <div key={i}>{skel('60%', '0.8rem', { marginBottom: '0.4rem' })}{skel('100%', '2.4rem', { borderRadius: '8px' })}</div>)}
        </div>
      </div>
    </div>
  );
}

function FormEditor({ type, onSwitch }: { type: FormType; onSwitch: (t: FormType) => void }) {
  const { data, error, isLoading, mutate } = useSWR<FormResponse>(`/api/exec/application-forms/${type}`, fetcher, { revalidateOnFocus: false });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveErrors, setSaveErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState<number | null>(null);
  const [tab, setTab] = useState<'edit' | 'history'>('edit');
  const [focus, setFocus] = useState<PreviewFocus | null>(null);

  const reset = (d: FormResponse) => setDraft({ content: d.live.content, baseRev: d.live.rev_number, restoredFrom: null });
  useEffect(() => { if (data && !draft) reset(data); }, [data, draft]);

  const dirty = useMemo(() => !!data && !!draft && JSON.stringify(draft.content) !== JSON.stringify(data.live.content), [data, draft]);
  // Checked as you type, like Bot Messages; the server checks again on save.
  const validation = useMemo(() => (draft && dirty ? normalizeForm(type, draft.content).errors : []), [type, draft, dirty]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const loading = isLoading || (!!data && !draft);
  const ready = !loading && !error && !!data && !!draft;
  const canEdit = data?.can_edit ?? true;
  const readOnly = !canEdit;
  const live = data?.revisions[0];

  const setContent = (content: FormContent) => { if (draft) setDraft({ ...draft, content }); setSaved(null); setSaveErrors([]); };
  const load = (next: Draft, nextNote: string) => { setDraft(next); setNote(nextNote); setSaved(null); setSaveErrors([]); };

  const save = async () => {
    if (!draft) return;
    setSaving(true); setSaveErrors([]);
    const res = await fetch(`/api/exec/application-forms/${type}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: draft.content, base_rev: draft.baseRev, restored_from: draft.restoredFrom, note }),
    });
    const body = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) return setSaveErrors(body.errors?.length ? body.errors : [body.error || 'Failed to save']);
    const fresh = await mutate();
    if (fresh) reset(fresh);
    setNote(''); setSaved(body.rev_number);
  };

  const blocked = saving || !dirty || validation.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <BackLink />
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Application Forms</h1>
        <StatusBadge status="published" />
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.25rem', background: 'var(--bg-card)', padding: '0.25rem', borderRadius: '0.5rem' }}>
          {(['edit', 'history'] as const).map(t => (
            <button key={t} type="button" onClick={() => setTab(t)} disabled={!ready}
              style={{ ...btnStyle, background: tab === t ? '#3b82f6' : 'transparent', color: tab === t ? '#fff' : 'var(--text-secondary)' }}>
              {t === 'edit' ? (readOnly ? 'View' : 'Edit') : `History (${data?.revisions.length ?? 0})`}
            </button>
          ))}
        </div>
      </div>

      {error && <div style={banner('#ef4444')}>Couldn&apos;t load the form: {error.message}</div>}
      {data && readOnly && <div style={{ ...banner('#6b7280'), color: 'var(--text-secondary)' }}>View only. Only Narwhals can edit application forms.</div>}
      {draft?.restoredFrom != null && dirty && (
        <div style={banner('#a855f7')}>Restoring revision {draft.restoredFrom}. Save to make it live again; nothing in the history is lost.</div>
      )}

      {tab === 'history' && ready ? (
        <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
          {data.revisions.length === 0
            ? <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>No saves yet.</div>
            : data.revisions.map((r, i) => (
              <div key={r.rev_number} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', padding: '0.6rem 0.9rem', borderTop: i ? '1px solid var(--border-card)' : 'none', fontSize: '0.82rem', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)', minWidth: '3.5rem' }}>rev {r.rev_number}</span>
                <span style={{ color: 'var(--text-secondary)' }}>{r.author_name ?? 'unknown'} · {timeAgo(r.created_at)}</span>
                <span style={{ color: 'var(--text-primary)', flex: '1 1 10rem' }}>
                  {r.note || <span style={{ color: 'var(--text-muted)' }}>no note</span>}
                  {r.restored_from != null && <span style={{ color: 'var(--text-muted)' }}> (restored rev {r.restored_from})</span>}
                </span>
                {i === 0
                  ? <StatusBadge status="published" />
                  : !readOnly && (
                    <button type="button" style={ghostBtn} onClick={() => {
                      load({ content: r.content, baseRev: data.live.rev_number, restoredFrom: r.rev_number }, `Restore rev ${r.rev_number}`);
                      setTab('edit');
                    }}>Load into editor</button>
                  )}
              </div>
            ))}
        </div>
      ) : (
        <div className="appforms-grid">
          {/* Left: which form, then its questions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', minWidth: 0 }}>
            <div style={{ ...card, padding: '0.75rem' }}>
              <label style={labelStyle}>Form</label>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {FORM_TYPES.map(t => (
                  <button key={t} type="button" aria-pressed={t === type} onClick={() => { if (t !== type) onSwitch(t); }}
                    style={{ ...smallBtn, background: t === type ? '#3b82f6' : 'var(--bg-secondary)', color: t === type ? '#fff' : 'var(--text-secondary)' }}>
                    {FORM_NAMES[t]}
                  </button>
                ))}
              </div>
            </div>
            {!ready ? <QuestionsSkeleton steps={type === 'hammerhead'} />
              : type === 'hammerhead'
                ? <HammerheadEditor form={draft.content as HammerheadForm} readOnly={readOnly} onChange={setContent}
                    onFocusArea={(step, task) => setFocus(f => ({ step, task, n: (f?.n ?? 0) + 1 }))} />
                : <QuestionList questions={(draft.content as SimpleForm).questions} formType={type} readOnly={readOnly}
                    onChange={questions => setContent({ questions })} />}
          </div>

          {/* Right: sticky save strip + preview. Offsets match Bot Messages: they count from
              inside .exec-main's 2rem padding, and the column fits the 100vh - 80px area. */}
          <div className="appforms-side" style={{ position: 'sticky', top: '-1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: 'calc(100vh - 80px - 2rem)', minWidth: 0 }}>
            {canEdit && (
              <div style={{ ...card, padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <input value={note} onChange={e => setNote(e.target.value)} maxLength={200} disabled={!ready}
                  placeholder="What changed? (shown in the history)" style={inputStyle} />
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <button type="button" onClick={save} disabled={blocked}
                    style={{ ...btnStyle, background: '#3b82f6', color: '#fff', opacity: blocked ? 0.45 : 1 }}>
                    {saving ? 'Saving…' : 'Save and make live'}
                  </button>
                  {dirty && data && (
                    <button type="button" onClick={() => { reset(data); setNote(''); setSaveErrors([]); }}
                      style={{ ...btnStyle, background: 'transparent', color: 'var(--text-secondary)' }}>Discard</button>
                  )}
                  <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: saved != null && !dirty ? '#22c55e' : 'var(--text-muted)', textAlign: 'right' }}>
                    {saved != null && !dirty ? `Saved as rev ${saved}` : dirty ? 'Unsaved changes' : 'No changes'}
                  </span>
                </div>
                {validation.length > 0 && (
                  <ul style={{ margin: 0, paddingLeft: '1.1rem', color: '#ef4444', fontSize: '0.75rem' }}>
                    {validation.slice(0, 5).map(e => <li key={e}>{e}</li>)}
                    {validation.length > 5 && <li>…and {validation.length - 5} more</li>}
                  </ul>
                )}
                {saveErrors.length > 0 && (
                  <ul style={{ margin: 0, paddingLeft: '1.1rem', color: '#ef4444', fontSize: '0.75rem' }}>
                    {saveErrors.map(e => <li key={e}>{e}</li>)}
                  </ul>
                )}
                {live && ready && (
                  <button type="button" style={{ ...ghostBtn, background: 'transparent', border: 'none', padding: 0, textDecoration: 'underline', alignSelf: 'flex-start' }}
                    onClick={() => load({ content: data.defaults, baseRev: data.live.rev_number, restoredFrom: null }, 'Back to the original questions')}>
                    Start from the original questions
                  </button>
                )}
              </div>
            )}
            <div style={{ overflowY: 'auto', borderRadius: '0.5rem' }}>
              {ready ? <FormPreview type={type} content={draft.content} focus={focus} /> : <PreviewSkeleton />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ApplicationFormsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const requested = params.get('form');
  const type: FormType = (FORM_TYPES as string[]).includes(requested ?? '') ? requested as FormType : 'guild';

  // Fetch all three forms up front, so switching between them is usually instant.
  useEffect(() => {
    for (const t of FORM_TYPES) preload(`/api/exec/application-forms/${t}`, fetcher);
  }, []);

  return (
    <>
      <FormEditor key={type} type={type} onSwitch={t => router.replace(`/exec/application-forms?form=${t}`)} />
      {/* Two columns like Bot Messages; stacked below the same 1100px breakpoint. */}
      <style>{`
        .appforms-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 1rem; align-items: start; }
        @media (max-width: 1100px) {
          .appforms-grid { grid-template-columns: minmax(0, 1fr); }
          .appforms-side { position: static !important; max-height: none !important; }
        }
      `}</style>
    </>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div style={{ color: 'var(--text-secondary)', padding: '2rem' }}>Loading…</div>}>
      <ApplicationFormsPage />
    </Suspense>
  );
}
