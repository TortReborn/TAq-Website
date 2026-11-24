"use client";

/**
 * Application form editor (TAQ-217): the guild, community and Hammerhead
 * questions, edited like Bot Messages. A save is a revision and is live on
 * the next page load; each submission keeps a copy of the wording it was
 * asked in, so the bot and old applications are never relabelled.
 */

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import useSWR, { preload } from 'swr';
import { fetcher } from '@/hooks/fetcher';
import {
  FORM_LIMITS, FORM_NAMES, FORM_TYPES, LOCKED_IDS, answerTypes, newQuestionId,
  type ApplicationQuestion, type FormContent, type FormType, type HammerheadForm, type SimpleForm,
} from '@/lib/application-questions';
import type { FormRevisionMeta } from '@/lib/application-forms-db';
import { btnStyle, inputStyle, labelStyle, smallBtn } from '@/components/bot-panels/PanelEditor';
import { timeAgo } from '@/components/bot-panels/status';

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

function HammerheadEditor({ form, readOnly, onChange }: { form: HammerheadForm; readOnly: boolean; onChange: (f: HammerheadForm) => void }) {
  const setTask = (i: number, t: HammerheadForm['tasks'][number]) => onChange({ ...form, tasks: form.tasks.map((x, j) => (j === i ? t : x)) });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <section style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        <h2 style={sectionTitle}>Step 1 · General questions</h2>
        <QuestionList questions={form.general} formType="hammerhead" readOnly={readOnly} onChange={general => onChange({ ...form, general })} />
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        <h2 style={sectionTitle}>Step 2 · Task areas</h2>
        <div>
          <label style={labelStyle}>The question asking which areas they want (each area below is a choice)</label>
          <textarea value={form.task_label} readOnly={readOnly} rows={2} maxLength={FORM_LIMITS.label}
            onChange={e => onChange({ ...form, task_label: e.target.value })} style={{ ...inputStyle, resize: 'vertical' }} />
        </div>
        {form.tasks.map((t, i) => (
          <div key={i} style={{ ...card, display: 'flex', flexDirection: 'column', gap: '0.6rem', borderLeft: '3px solid #396aff' }}>
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

      <section style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        <h2 style={sectionTitle}>Step 3 · Final questions</h2>
        <QuestionList questions={form.final} formType="hammerhead" readOnly={readOnly} onChange={final => onChange({ ...form, final })} />
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------

/** Holds the editor's shape while a form loads, so switching forms doesn't jump. */
function FormSkeleton({ steps }: { steps: boolean }) {
  const bar = (width: string, height = '0.8rem', extra: React.CSSProperties = {}) =>
    <div className="skeleton" style={{ width, height, borderRadius: '0.25rem', ...extra }} />;
  return (
    <div aria-busy="true" aria-label="Loading the form" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {bar('18rem', '0.8rem', { maxWidth: '100%' })}
      <div style={{ display: 'flex', gap: '0.25rem', borderBottom: '1px solid var(--border-card)', paddingBottom: '0.35rem' }}>
        {bar('3.5rem', '1.6rem')}{bar('5.5rem', '1.6rem')}
      </div>
      <div className="appforms-edit">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', minWidth: 0 }}>
      {steps && bar('11rem', '0.8rem')}
      {[0, 1, 2].map(i => (
        <div key={i} style={{ ...card, padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>{bar('5rem')}{bar('3.5rem', '1.2rem')}</div>
          <div>{bar('4rem', '0.6rem', { marginBottom: '0.35rem' })}{bar('100%', '2.75rem', { borderRadius: '0.375rem' })}</div>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'end' }}>
            <div>{bar('3.5rem', '0.6rem', { marginBottom: '0.35rem' })}{bar('9rem', '2rem', { borderRadius: '0.375rem' })}</div>
            <div>{bar('5.5rem', '0.6rem', { marginBottom: '0.35rem' })}{bar('8rem', '2rem', { borderRadius: '0.375rem' })}</div>
            {bar('5rem', '1rem', { marginBottom: '0.5rem' })}
          </div>
          <div>{bar('12rem', '0.6rem', { marginBottom: '0.35rem', maxWidth: '100%' })}{bar('100%', '2rem', { borderRadius: '0.375rem' })}</div>
        </div>
      ))}
      </div>
      <div className="appforms-side" style={{ ...card, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {bar('7rem', '0.9rem')}{bar('9rem', '0.6rem')}
        <div>{bar('8rem', '0.6rem', { marginBottom: '0.35rem' })}{bar('100%', '4.5rem', { borderRadius: '0.375rem' })}</div>
        {bar('100%', '2rem', { borderRadius: '0.375rem' })}{bar('100%', '2rem', { borderRadius: '0.375rem' })}
      </div>
      </div>
    </div>
  );
}

function FormEditor({ type }: { type: FormType }) {
  const { data, error, isLoading, mutate } = useSWR<FormResponse>(`/api/exec/application-forms/${type}`, fetcher, { revalidateOnFocus: false });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState<number | null>(null);
  const [tab, setTab] = useState<'edit' | 'history'>('edit');

  const reset = (d: FormResponse) => setDraft({ content: d.live.content, baseRev: d.live.rev_number, restoredFrom: null });
  useEffect(() => { if (data && !draft) reset(data); }, [data, draft]);

  const dirty = useMemo(() => !!data && !!draft && JSON.stringify(draft.content) !== JSON.stringify(data.live.content), [data, draft]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  if (isLoading || (data && !draft)) return <FormSkeleton steps={type === 'hammerhead'} />;
  if (error || !data || !draft) return <div style={{ color: '#ef4444', padding: '1rem 0' }}>Error: {error?.message ?? 'no data'}</div>;

  const readOnly = !data.can_edit;
  const setContent = (content: FormContent) => { setDraft({ ...draft, content }); setSaved(null); setErrors([]); };

  const save = async () => {
    setSaving(true); setErrors([]);
    const res = await fetch(`/api/exec/application-forms/${type}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: draft.content, base_rev: draft.baseRev, restored_from: draft.restoredFrom, note }),
    });
    const body = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) return setErrors(body.errors?.length ? body.errors : [body.error || 'Failed to save']);
    const fresh = await mutate();
    if (fresh) reset(fresh);
    setNote(''); setSaved(body.rev_number);
  };

  const live = data.revisions[0];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
        {live
          ? <>Live: rev {live.rev_number} · {live.author_name ?? 'unknown'} · {timeAgo(live.created_at)}</>
          : <>Live: the original questions. Nobody has edited this form yet.</>}
      </div>

      <div style={{ display: 'flex', gap: '0.25rem', borderBottom: '1px solid var(--border-card)' }}>
        {(['edit', 'history'] as const).map(t => (
          <button key={t} type="button" onClick={() => setTab(t)} style={{
            ...btnStyle, borderRadius: '0.375rem 0.375rem 0 0', background: tab === t ? 'var(--bg-card-solid)' : 'transparent',
            color: tab === t ? 'var(--text-primary)' : 'var(--text-secondary)',
          }}>
            {t === 'edit' ? (readOnly ? 'View' : 'Edit') : `History (${data.revisions.length})`}
          </button>
        ))}
      </div>

      {tab === 'history' ? (
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
                  ? <span style={{ fontSize: '0.72rem', color: '#22c55e', fontWeight: 600 }}>Live</span>
                  : !readOnly && (
                    <button type="button" style={ghostBtn} onClick={() => {
                      setDraft({ content: r.content, baseRev: data.live.rev_number, restoredFrom: r.rev_number });
                      setNote(`Restore rev ${r.rev_number}`); setTab('edit'); setSaved(null); setErrors([]);
                    }}>Load into editor</button>
                  )}
              </div>
            ))}
        </div>
      ) : (
        <div className="appforms-edit">
          <div style={{ minWidth: 0 }}>
            {type === 'hammerhead'
              ? <HammerheadEditor form={draft.content as HammerheadForm} readOnly={readOnly} onChange={setContent} />
              : <QuestionList questions={(draft.content as SimpleForm).questions} formType={type} readOnly={readOnly}
                  onChange={questions => setContent({ questions })} />}
          </div>

          <aside className="appforms-side" style={{ ...card, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {readOnly ? (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                View only. Narwhals can edit these questions.
              </div>
            ) : (
              <>
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>Save changes</div>
                  <div style={{ fontSize: '0.75rem', marginTop: '0.2rem', color: dirty ? '#eab308' : 'var(--text-muted)' }}>
                    {dirty ? 'You have unsaved changes.' : 'No changes yet.'}
                  </div>
                </div>
                {draft.restoredFrom != null && dirty && (
                  <div style={{ fontSize: '0.8rem', color: '#eab308' }}>Showing rev {draft.restoredFrom}. Save to make it live again.</div>
                )}
                {errors.length > 0 && (
                  <ul style={{ margin: 0, paddingLeft: '1.1rem', color: '#ef4444', fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    {errors.map(e => <li key={e}>{e}</li>)}
                  </ul>
                )}
                <div>
                  <label style={labelStyle}>What changed? (optional)</label>
                  <textarea value={note} onChange={e => setNote(e.target.value)} maxLength={200} rows={3}
                    placeholder="e.g. Reworded the raid question" style={{ ...inputStyle, resize: 'vertical' }} />
                </div>
                <button type="button" disabled={!dirty || saving} onClick={save}
                  style={{ ...btnStyle, width: '100%', background: '#3b82f6', color: '#fff', opacity: dirty && !saving ? 1 : 0.5 }}>
                  {saving ? 'Saving…' : 'Save and make live'}
                </button>
                <button type="button" disabled={!dirty || saving} onClick={() => { reset(data); setNote(''); setErrors([]); }}
                  style={{ ...btnStyle, width: '100%', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', opacity: dirty && !saving ? 1 : 0.5 }}>
                  Discard changes
                </button>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {saved != null
                    ? <span style={{ color: '#22c55e' }}>Saved as rev {saved}. New applicants see it now.</span>
                    : 'Applications already sent keep the wording they were asked in.'}
                </div>
                {live && (
                  <button type="button" style={{ ...ghostBtn, background: 'transparent', border: 'none', padding: 0, textDecoration: 'underline', alignSelf: 'flex-start' }}
                    onClick={() => {
                      setDraft({ content: data.defaults, baseRev: data.live.rev_number, restoredFrom: null });
                      setNote('Back to the original questions'); setSaved(null); setErrors([]);
                    }}>
                    Start from the original questions
                  </button>
                )}
              </>
            )}
          </aside>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div>
        <Link href="/exec/bot-panels" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textDecoration: 'none' }}>← Bot Messages</Link>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0.25rem 0 0' }}>Application Forms</h1>
        <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          The questions on the website&apos;s application forms. A save is live for the next person who opens the form.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
        {FORM_TYPES.map(t => (
          <button key={t} type="button" onClick={() => router.replace(`/exec/application-forms?form=${t}`)} style={{
            ...btnStyle, background: t === type ? 'rgba(59, 130, 246, 0.15)' : 'var(--bg-card-solid)',
            color: t === type ? '#60a5fa' : 'var(--text-secondary)', border: '1px solid var(--border-card)',
          }}>
            {FORM_NAMES[t]}
          </button>
        ))}
      </div>

      <FormEditor key={type} type={type} />

      {/* Questions on the left, the save panel beside them; stacked on narrow screens. */}
      <style>{`
        .appforms-edit { display: grid; grid-template-columns: minmax(0, 1fr) 17rem; gap: 1rem; align-items: start; }
        .appforms-side { position: sticky; top: 6rem; }
        @media (max-width: 900px) {
          .appforms-edit { grid-template-columns: minmax(0, 1fr); }
          .appforms-side { position: static; }
        }
      `}</style>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div style={{ color: 'var(--text-secondary)', padding: '2rem' }}>Loading…</div>}>
      <ApplicationFormsPage />
    </Suspense>
  );
}
