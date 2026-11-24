"use client";

/**
 * The apply page as an applicant sees it, drawn from the editor's draft
 * (TAQ-217), in the way Bot Messages previews a Discord message. Mirrors
 * ApplicationForm and HammerheadApplicationForm; typing and picking areas
 * work, so limits and conditional areas can be tried, but nothing is sent.
 */

import { useEffect, useState } from 'react';
import {
  taskSelector, type ApplicationQuestion, type FormContent, type FormType, type HammerheadForm, type SimpleForm,
} from '@/lib/application-questions';

const TITLES: Record<FormType, string> = {
  guild: 'Guild Member Application',
  community: 'Community Member Application',
  hammerhead: 'Hammerhead Application',
};
const STEPS = ['General', 'Task Areas', 'Final'];
const HH_BLUE = '#396aff';

const field: React.CSSProperties = {
  width: '100%', padding: '0.6rem 0.8rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
  borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.9rem', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
};

/** The Hammerhead step (and task area) being edited; `n` changes on every focus so a repeat still applies. */
export interface PreviewFocus { step: number; task?: string; n: number }

export default function FormPreview({ type, content, focus }: { type: FormType; content: FormContent; focus?: PreviewFocus | null }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<string[] | null>(null);
  const hh = type === 'hammerhead' ? content as HammerheadForm : null;
  // Until someone picks, show the first area so its questions are visible.
  const tasks = hh ? (picked ?? hh.tasks.slice(0, 1).map(t => t.name)).filter(n => hh.tasks.some(t => t.name === n)) : [];

  // Follow the editor: show the step being edited, and pick the task area if it isn't picked.
  useEffect(() => {
    if (!focus) return;
    setStep(focus.step);
    if (focus.task) setPicked(p => {
      // Before anyone has picked, show just the area being edited.
      const current = p ?? [];
      return current.includes(focus.task!) ? current : [...current, focus.task!];
    });
  }, [focus?.n]);

  const question = (q: ApplicationQuestion) => {
    const value = answers[q.id] ?? '';
    const set = (v: string) => setAnswers(a => ({ ...a, [q.id]: v }));
    return (
      <div key={q.id}>
        <div style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: '0.4rem', fontSize: '0.88rem' }}>
          {q.label || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>(no wording yet)</span>}
          {q.required && <span style={{ color: '#ef4444', marginLeft: '4px' }}>*</span>}
        </div>
        {q.type === 'textarea' ? (
          <>
            <textarea value={value} onChange={e => set(e.target.value)} placeholder={q.placeholder} rows={3} maxLength={q.maxLength}
              style={{ ...field, resize: 'vertical' }} />
            {q.maxLength ? (
              <div style={{ textAlign: 'right', fontSize: '0.7rem', marginTop: '0.2rem', color: value.length > q.maxLength * 0.9 ? '#ef4444' : 'var(--text-muted)' }}>
                {value.length} / {q.maxLength}
              </div>
            ) : null}
          </>
        ) : q.type === 'select' ? (
          <select value={value} onChange={e => set(e.target.value)} style={{ ...field, color: value ? 'var(--text-primary)' : 'var(--text-muted)', cursor: 'pointer' }}>
            <option value="">Select an option...</option>
            {(q.options ?? []).filter(o => o.trim()).map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : (
          <input value={value} onChange={e => set(e.target.value)} placeholder={q.placeholder} maxLength={q.maxLength} style={field} />
        )}
      </div>
    );
  };

  const list = (qs: ApplicationQuestion[]) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>{qs.map(question)}</div>
  );

  const titleColour = type === 'hammerhead'
    ? `linear-gradient(135deg, ${HH_BLUE}, #2050d4)`
    : 'linear-gradient(135deg, var(--color-ocean-400), var(--color-ocean-600))';
  const button = type === 'hammerhead' ? `linear-gradient(135deg, ${HH_BLUE} 0%, #2050d4 100%)` : 'linear-gradient(135deg, #5865f2 0%, #4752c4 100%)';

  return (
    <div style={{ background: 'var(--bg-card-solid)', border: '1px solid var(--border-card)', borderRadius: '0.5rem', overflow: 'hidden' }}>
      <div style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border-card)', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
        <span>Preview: what applicants see</span>
        <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>Nothing here is sent</span>
      </div>

      <div style={{ padding: '1.25rem 1rem' }}>
        <div style={{
          textAlign: 'center', fontSize: '1.5rem', fontWeight: 800, marginBottom: '1rem', letterSpacing: '-0.02em',
          background: titleColour, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
        }}>
          {TITLES[type]}
        </div>

        {hh && (
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
              {STEPS.map((label, i) => (
                <button key={label} type="button" onClick={() => setStep(i)} style={{
                  background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: '0.75rem', fontWeight: i === step ? 700 : 400, color: i <= step ? HH_BLUE : 'var(--text-muted)',
                }}>{label}</button>
              ))}
            </div>
            <div style={{ height: '4px', background: 'var(--bg-secondary)', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${((step + 1) / STEPS.length) * 100}%`, background: `linear-gradient(90deg, ${HH_BLUE}, #2050d4)`, transition: 'width 0.3s ease' }} />
            </div>
          </div>
        )}

        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)', borderRadius: '0.75rem', padding: '1.1rem' }}>
          {!hh && list((content as SimpleForm).questions)}

          {hh && step === 0 && list(hh.general)}

          {hh && step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
              <div>
                <div style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: '0.6rem', fontSize: '0.88rem' }}>
                  {taskSelector(hh).label}<span style={{ color: '#ef4444', marginLeft: '4px' }}>*</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                  {hh.tasks.map(t => {
                    const on = tasks.includes(t.name);
                    return (
                      <button key={t.name || '(unnamed)'} type="button"
                        onClick={() => setPicked(on ? tasks.filter(n => n !== t.name) : [...tasks, t.name])}
                        style={{
                          padding: '0.45rem 0.9rem', borderRadius: '8px', fontFamily: 'inherit', fontSize: '0.82rem', cursor: 'pointer',
                          border: `2px solid ${on ? HH_BLUE : 'var(--border-color)'}`, background: on ? 'rgba(57, 106, 255, 0.15)' : 'var(--bg-secondary)',
                          color: on ? HH_BLUE : 'var(--text-primary)', fontWeight: on ? 700 : 500,
                        }}>
                        {on ? '✓ ' : ''}{t.name || '(unnamed area)'}
                      </button>
                    );
                  })}
                </div>
              </div>
              {hh.tasks.filter(t => tasks.includes(t.name)).map(t => (
                <div key={t.name} style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: HH_BLUE, marginBottom: '0.9rem' }}>{t.name}</div>
                  {list(t.questions)}
                </div>
              ))}
            </div>
          )}

          {hh && step === 2 && (hh.final.length ? list(hh.final)
            : <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No final questions.</div>)}

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem' }}>
            {hh && step > 0 && (
              <button type="button" onClick={() => setStep(step - 1)} style={{ flex: 1, padding: '0.6rem', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>
                Back
              </button>
            )}
            <button type="button" onClick={() => { if (hh && step < 2) setStep(step + 1); }} style={{
              flex: 2, padding: '0.7rem', borderRadius: '10px', border: 'none', background: button, color: '#fff',
              fontWeight: 700, fontFamily: 'inherit', cursor: hh && step < 2 ? 'pointer' : 'default',
            }}>
              {hh && step < 2 ? 'Next' : 'Submit Application'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
