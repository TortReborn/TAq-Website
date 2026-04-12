"use client";

import { useState, useEffect, useCallback } from 'react';
import {
  HAMMERHEAD_GENERAL_QUESTIONS,
  HAMMERHEAD_TASK_SELECTOR,
  HAMMERHEAD_SECTION_QUESTIONS,
  HAMMERHEAD_FINAL_QUESTIONS,
  HAMMERHEAD_TASK_OPTIONS,
} from '@/lib/application-questions';
import type { ApplicationQuestion } from '@/lib/application-questions';
import { RANK_HIERARCHY } from '@/lib/rank-constants';
import { useViewAs } from '@/hooks/useViewAs';

interface ExecUser {
  discord_id: string;
  discord_username: string;
  discord_avatar: string;
  ign: string;
  rank: string;
  role: 'exec' | 'member';
}

type FormState = 'loading' | 'unauthenticated' | 'insufficient_rank' | 'already_exec' | 'form' | 'submitting' | 'success' | 'error';

const ANGLER_INDEX = RANK_HIERARCHY.indexOf('Angler');
const HAMMERHEAD_INDEX = RANK_HIERARCHY.indexOf('Hammerhead');
const TOTAL_STEPS = 3;

export default function HammerheadApplicationForm() {
  const viewAs = useViewAs();
  const isPreviewMode = viewAs === 'angler';
  const [formState, setFormState] = useState<FormState>('loading');
  const [user, setUser] = useState<ExecUser | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string>('');
  const [focusedField, setFocusedField] = useState<string | null>(null);

  // Authenticate on mount
  useEffect(() => {
    async function authenticate() {
      try {
        const res = await fetch('/api/auth/exec-session');
        const data = await res.json();
        if (data.authenticated && data.user) {
          const u = data.user as ExecUser;
          const rankIdx = RANK_HIERARCHY.indexOf(u.rank);

          // In preview mode (View as Angler+), skip rank gating
          if (isPreviewMode) {
            setUser({ ...u, rank: 'Angler', role: 'member' });
            setAnswers(prev => ({
              ...prev,
              hh_ign_rank: `${u.ign}, Angler+`,
            }));
            setFormState('form');
            return;
          }

          if (rankIdx < ANGLER_INDEX) {
            setUser(u);
            setFormState('insufficient_rank');
            return;
          }
          if (rankIdx >= HAMMERHEAD_INDEX) {
            setUser(u);
            setFormState('already_exec');
            return;
          }

          setUser(u);
          // Pre-fill IGN+rank
          setAnswers(prev => ({
            ...prev,
            hh_ign_rank: `${u.ign}, ${u.rank}`,
          }));
          setFormState('form');
          return;
        }
      } catch { /* fall through */ }

      setFormState('unauthenticated');
    }

    authenticate();
  }, [isPreviewMode]);

  const validateField = useCallback((question: ApplicationQuestion, value: string | string[] | undefined): string => {
    if (question.type === 'checkbox') {
      if (question.required && (!Array.isArray(value) || value.length === 0)) {
        return 'Please select at least one option.';
      }
      return '';
    }

    if (question.type === 'select') {
      const strVal = typeof value === 'string' ? value : '';
      if (question.required && strVal.trim().length === 0) {
        return 'Please select an option.';
      }
      if (strVal && question.options && !question.options.includes(strVal)) {
        return 'Invalid selection.';
      }
      return '';
    }

    const strVal = typeof value === 'string' ? value : '';
    const trimmed = strVal.trim();

    if (question.required && trimmed.length === 0) {
      return 'This field is required.';
    }

    if (trimmed.length > 0 && question.maxLength && strVal.length > question.maxLength) {
      return `Must be ${question.maxLength} characters or less.`;
    }

    return '';
  }, []);

  const validateStep = useCallback((step: number): boolean => {
    const errors: Record<string, string> = {};
    let questions: ApplicationQuestion[] = [];

    if (step === 0) {
      questions = HAMMERHEAD_GENERAL_QUESTIONS;
    } else if (step === 1) {
      // Validate task selector
      const taskError = validateField(HAMMERHEAD_TASK_SELECTOR, selectedTasks);
      if (taskError) errors[HAMMERHEAD_TASK_SELECTOR.id] = taskError;

      // Validate questions for selected tasks only
      for (const task of selectedTasks) {
        const sectionQs = HAMMERHEAD_SECTION_QUESTIONS[task];
        if (sectionQs) questions.push(...sectionQs);
      }
    } else if (step === 2) {
      questions = HAMMERHEAD_FINAL_QUESTIONS;
    }

    for (const q of questions) {
      const error = validateField(q, answers[q.id]);
      if (error) errors[q.id] = error;
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(prev => ({ ...prev, ...errors }));
      // Scroll to first error
      const allIds = step === 1
        ? [HAMMERHEAD_TASK_SELECTOR.id, ...selectedTasks.flatMap(t => (HAMMERHEAD_SECTION_QUESTIONS[t] || []).map(q => q.id))]
        : questions.map(q => q.id);
      const firstErrorId = allIds.find(id => errors[id]);
      if (firstErrorId) {
        document.getElementById(`field-${firstErrorId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return false;
    }

    return true;
  }, [answers, selectedTasks, validateField]);

  const handleChange = (questionId: string, value: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
    if (fieldErrors[questionId]) {
      setFieldErrors(prev => {
        const next = { ...prev };
        delete next[questionId];
        return next;
      });
    }
  };

  const handleTaskToggle = (task: string) => {
    setSelectedTasks(prev => {
      const next = prev.includes(task)
        ? prev.filter(t => t !== task)
        : [...prev, task];
      setAnswers(a => ({ ...a, hh_tasks: next }));
      return next;
    });
    if (fieldErrors[HAMMERHEAD_TASK_SELECTOR.id]) {
      setFieldErrors(prev => {
        const next = { ...prev };
        delete next[HAMMERHEAD_TASK_SELECTOR.id];
        return next;
      });
    }
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, TOTAL_STEPS - 1));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleBack = () => {
    setCurrentStep(prev => Math.max(prev - 1, 0));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async () => {
    if (isPreviewMode) return; // Block submission in preview mode
    if (!validateStep(currentStep)) return;

    setFormState('submitting');
    setSubmitError('');

    try {
      const res = await fetch('/api/applications/hammerhead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: { ...answers, hh_tasks: selectedTasks } }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setFormState('success');
      } else if (res.status === 409) {
        setSubmitError('You already have a pending Hammerhead application.');
        setFormState('form');
      } else {
        setSubmitError(data.error || 'Something went wrong. Please try again.');
        setFormState('form');
      }
    } catch {
      setSubmitError('Network error. Please check your connection and try again.');
      setFormState('form');
    }
  };

  const avatarUrl = user?.discord_avatar
    ? `https://cdn.discordapp.com/avatars/${user.discord_id}/${user.discord_avatar}.png?size=64`
    : `https://cdn.discordapp.com/embed/avatars/0.png`;

  // --- Render helpers ---

  const renderQuestion = (question: ApplicationQuestion) => (
    <div key={question.id} id={`field-${question.id}`}>
      <label style={{
        display: 'block',
        color: 'var(--text-primary)',
        fontWeight: '600',
        marginBottom: '0.5rem',
        fontSize: '0.95rem',
      }}>
        {question.label}
        {question.required && (
          <span style={{ color: '#ef4444', marginLeft: '4px' }}>*</span>
        )}
      </label>

      {question.type === 'textarea' ? (
        <>
          <textarea
            value={(answers[question.id] as string) || ''}
            onChange={(e) => handleChange(question.id, e.target.value)}
            onFocus={() => setFocusedField(question.id)}
            onBlur={() => setFocusedField(null)}
            placeholder={question.placeholder}
            rows={3}
            maxLength={question.maxLength}
            style={{
              width: '100%',
              padding: '0.75rem 1rem',
              background: 'var(--bg-secondary)',
              border: `1px solid ${fieldErrors[question.id] ? '#ef4444' : focusedField === question.id ? 'var(--accent-primary)' : 'var(--border-color)'}`,
              borderRadius: '8px',
              color: 'var(--text-primary)',
              fontSize: '1rem',
              fontFamily: 'inherit',
              resize: 'vertical',
              outline: 'none',
              transition: 'border-color 0.2s ease',
              boxSizing: 'border-box',
            }}
          />
          {question.maxLength && (
            <div style={{
              textAlign: 'right',
              fontSize: '0.75rem',
              color: ((answers[question.id] as string)?.length || 0) > question.maxLength * 0.9
                ? '#ef4444'
                : 'var(--text-muted)',
              marginTop: '0.25rem',
            }}>
              {(answers[question.id] as string)?.length || 0} / {question.maxLength}
            </div>
          )}
        </>
      ) : question.type === 'select' ? (
        <select
          value={(answers[question.id] as string) || ''}
          onChange={(e) => handleChange(question.id, e.target.value)}
          onFocus={() => setFocusedField(question.id)}
          onBlur={() => setFocusedField(null)}
          style={{
            width: '100%',
            padding: '0.75rem 1rem',
            background: 'var(--bg-secondary)',
            border: `1px solid ${fieldErrors[question.id] ? '#ef4444' : focusedField === question.id ? 'var(--accent-primary)' : 'var(--border-color)'}`,
            borderRadius: '8px',
            color: (answers[question.id] as string) ? 'var(--text-primary)' : 'var(--text-muted)',
            fontSize: '1rem',
            fontFamily: 'inherit',
            outline: 'none',
            transition: 'border-color 0.2s ease',
            boxSizing: 'border-box',
            cursor: 'pointer',
            appearance: 'none',
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23888' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 12px center',
            paddingRight: '2.5rem',
          }}
        >
          <option value="">Select an option...</option>
          {question.options?.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      ) : (
        <input
          type="text"
          value={(answers[question.id] as string) || ''}
          onChange={(e) => handleChange(question.id, e.target.value)}
          onFocus={() => setFocusedField(question.id)}
          onBlur={() => setFocusedField(null)}
          placeholder={question.placeholder}
          maxLength={question.maxLength}
          style={{
            width: '100%',
            padding: '0.75rem 1rem',
            background: 'var(--bg-secondary)',
            border: `1px solid ${fieldErrors[question.id] ? '#ef4444' : focusedField === question.id ? 'var(--accent-primary)' : 'var(--border-color)'}`,
            borderRadius: '8px',
            color: 'var(--text-primary)',
            fontSize: '1rem',
            fontFamily: 'inherit',
            outline: 'none',
            transition: 'border-color 0.2s ease',
            boxSizing: 'border-box',
          }}
        />
      )}

      {fieldErrors[question.id] && (
        <div style={{
          color: '#ef4444',
          fontSize: '0.8rem',
          marginTop: '0.35rem',
        }}>
          {fieldErrors[question.id]}
        </div>
      )}
    </div>
  );

  // --- State screens ---

  if (formState === 'loading') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <div style={{
          width: '40px',
          height: '40px',
          border: '3px solid var(--border-color)',
          borderTopColor: '#396aff',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (formState === 'unauthenticated') {
    return (
      <div style={{ maxWidth: '600px', margin: '3rem auto', padding: '2rem', textAlign: 'center' }}>
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-card)',
          borderRadius: '1rem',
          padding: '3rem 2rem',
          backdropFilter: 'blur(12px)',
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>&#x1F512;</div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '1rem' }}>
            Login Required
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', lineHeight: '1.6', marginBottom: '2rem' }}>
            You need to be logged in to submit a Hammerhead application.
            Please log in with your Discord account.
          </p>
          <a
            href="/login?redirect=%2Fapply%2Fhammerhead"
            style={{
              display: 'inline-block',
              padding: '12px 24px',
              background: 'linear-gradient(135deg, #396aff 0%, #2050d4 100%)',
              color: 'white',
              textDecoration: 'none',
              borderRadius: '8px',
              fontWeight: '600',
              fontSize: '1rem',
            }}
          >
            Log In
          </a>
        </div>
      </div>
    );
  }

  if (formState === 'insufficient_rank') {
    return (
      <div style={{ maxWidth: '600px', margin: '3rem auto', padding: '2rem', textAlign: 'center' }}>
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-card)',
          borderRadius: '1rem',
          padding: '3rem 2rem',
          backdropFilter: 'blur(12px)',
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>&#x26A0;&#xFE0F;</div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '1rem' }}>
            Insufficient Rank
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', lineHeight: '1.6' }}>
            You must be <strong>Angler</strong> or <strong>Swordfish</strong> rank to apply for Hammerhead.
            Your current rank is <strong>{user?.rank}</strong>.
          </p>
        </div>
      </div>
    );
  }

  if (formState === 'already_exec') {
    return (
      <div style={{ maxWidth: '600px', margin: '3rem auto', padding: '2rem', textAlign: 'center' }}>
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-card)',
          borderRadius: '1rem',
          padding: '3rem 2rem',
          backdropFilter: 'blur(12px)',
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>&#x2139;&#xFE0F;</div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '1rem' }}>
            Already Exec
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', lineHeight: '1.6' }}>
            You are already <strong>{user?.rank}</strong> rank and do not need to apply for Hammerhead.
          </p>
        </div>
      </div>
    );
  }

  if (formState === 'success') {
    return (
      <div style={{ maxWidth: '600px', margin: '3rem auto', padding: '2rem', textAlign: 'center' }}>
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-card)',
          borderRadius: '1rem',
          padding: '3rem 2rem',
          backdropFilter: 'blur(12px)',
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>&#x2705;</div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '1rem' }}>
            Application Submitted!
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', lineHeight: '1.6' }}>
            Your Hammerhead application has been received and will be reviewed by the exec team.
            We'll get back to you soon.
          </p>
        </div>
      </div>
    );
  }

  // --- Form rendering ---

  const stepLabels = ['General', 'Task Areas', 'Final'];

  return (
    <div style={{
      maxWidth: '750px',
      margin: '2rem auto',
      padding: '0 1rem 3rem',
    }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        textarea::-webkit-scrollbar { width: 8px; }
        textarea::-webkit-scrollbar-track { background: var(--bg-secondary); border-radius: 4px; }
        textarea::-webkit-scrollbar-thumb { background: var(--border-color); border-radius: 4px; }
        textarea::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }
        textarea { scrollbar-width: thin; scrollbar-color: var(--border-color) var(--bg-secondary); }
      `}</style>

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h1 style={{
          fontSize: 'clamp(1.75rem, 4vw, 2.5rem)',
          fontWeight: '800',
          background: 'linear-gradient(135deg, #396aff, #2050d4)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          marginBottom: '0.5rem',
          letterSpacing: '-0.02em',
        }}>
          Hammerhead Application
        </h1>
      </div>

      {/* Progress bar */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          {stepLabels.map((label, i) => (
            <div key={label} style={{
              fontSize: '0.8rem',
              fontWeight: i === currentStep ? '700' : '400',
              color: i <= currentStep ? '#396aff' : 'var(--text-muted)',
              transition: 'all 0.3s ease',
            }}>
              {label}
            </div>
          ))}
        </div>
        <div style={{
          height: '4px',
          background: 'var(--bg-secondary)',
          borderRadius: '2px',
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: `${((currentStep + 1) / TOTAL_STEPS) * 100}%`,
            background: 'linear-gradient(90deg, #396aff, #2050d4)',
            borderRadius: '2px',
            transition: 'width 0.4s ease',
          }} />
        </div>
        <div style={{
          textAlign: 'center',
          marginTop: '0.5rem',
          fontSize: '0.85rem',
          color: 'var(--text-muted)',
        }}>
          Step {currentStep + 1} of {TOTAL_STEPS}
        </div>
      </div>

      {/* Form card */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-card)',
        borderRadius: '1rem',
        padding: '2rem',
        backdropFilter: 'blur(12px)',
      }}>
        {/* Discord identity */}
        {user && (
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '2rem' }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.75rem 1.25rem',
              background: 'var(--bg-secondary)',
              borderRadius: '0.75rem',
              border: '1px solid var(--border-color)',
            }}>
              <img
                src={avatarUrl}
                alt="Discord avatar"
                width={40}
                height={40}
                style={{ borderRadius: '50%' }}
              />
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Applying as</div>
                <div style={{ color: 'var(--text-primary)', fontWeight: '600', fontSize: '1rem' }}>
                  {user.discord_username} ({user.ign})
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Preview mode banner */}
        {isPreviewMode && (
          <div style={{
            padding: '0.75rem 1rem',
            background: 'rgba(251, 191, 36, 0.1)',
            border: '1px solid rgba(251, 191, 36, 0.3)',
            borderRadius: '0.5rem',
            color: '#fbbf24',
            marginBottom: '1.5rem',
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            Preview mode — you can browse the form but submission is disabled.
          </div>
        )}

        {/* Submit error banner */}
        {submitError && (
          <div style={{
            padding: '1rem',
            background: 'rgba(220, 38, 38, 0.1)',
            border: '1px solid rgba(220, 38, 38, 0.3)',
            borderRadius: '0.5rem',
            color: '#ef4444',
            marginBottom: '1.5rem',
            fontSize: '0.9rem',
          }}>
            {submitError}
          </div>
        )}

        {/* Step 0: General Questions */}
        {currentStep === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {HAMMERHEAD_GENERAL_QUESTIONS.map(renderQuestion)}
          </div>
        )}

        {/* Step 1: Task Selection + Conditional Sections */}
        {currentStep === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Task selector */}
            <div id={`field-${HAMMERHEAD_TASK_SELECTOR.id}`}>
              <label style={{
                display: 'block',
                color: 'var(--text-primary)',
                fontWeight: '600',
                marginBottom: '0.75rem',
                fontSize: '0.95rem',
              }}>
                {HAMMERHEAD_TASK_SELECTOR.label}
                <span style={{ color: '#ef4444', marginLeft: '4px' }}>*</span>
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {HAMMERHEAD_TASK_OPTIONS.map(task => {
                  const isSelected = selectedTasks.includes(task);
                  return (
                    <button
                      key={task}
                      type="button"
                      onClick={() => handleTaskToggle(task)}
                      style={{
                        padding: '0.6rem 1.2rem',
                        borderRadius: '8px',
                        border: `2px solid ${isSelected ? '#396aff' : 'var(--border-color)'}`,
                        background: isSelected ? 'rgba(57, 106, 255, 0.15)' : 'var(--bg-secondary)',
                        color: isSelected ? '#396aff' : 'var(--text-primary)',
                        fontWeight: isSelected ? '700' : '500',
                        fontSize: '0.9rem',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        fontFamily: 'inherit',
                      }}
                    >
                      {isSelected ? '\u2713 ' : ''}{task}
                    </button>
                  );
                })}
              </div>
              {fieldErrors[HAMMERHEAD_TASK_SELECTOR.id] && (
                <div style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '0.35rem' }}>
                  {fieldErrors[HAMMERHEAD_TASK_SELECTOR.id]}
                </div>
              )}
            </div>

            {/* Conditional sections */}
            {selectedTasks.map(task => {
              const questions = HAMMERHEAD_SECTION_QUESTIONS[task];
              if (!questions) return null;
              return (
                <div key={task} style={{
                  borderTop: '1px solid var(--border-color)',
                  paddingTop: '1.5rem',
                  marginTop: '0.5rem',
                }}>
                  <h3 style={{
                    fontSize: '1.1rem',
                    fontWeight: '700',
                    color: '#396aff',
                    marginBottom: '1.25rem',
                  }}>
                    {task}
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {questions.map(renderQuestion)}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Step 2: Final Questions */}
        {currentStep === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {HAMMERHEAD_FINAL_QUESTIONS.map(renderQuestion)}
          </div>
        )}

        {/* Navigation buttons */}
        <div style={{
          display: 'flex',
          justifyContent: currentStep === 0 ? 'flex-end' : 'space-between',
          marginTop: '2rem',
          gap: '1rem',
        }}>
          {currentStep > 0 && (
            <button
              type="button"
              onClick={handleBack}
              style={{
                padding: '14px 24px',
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: '10px',
                fontSize: '1rem',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                fontFamily: 'inherit',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--border-color)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--bg-secondary)';
              }}
            >
              Back
            </button>
          )}

          {currentStep < TOTAL_STEPS - 1 ? (
            <button
              type="button"
              onClick={handleNext}
              style={{
                padding: '14px 24px',
                background: 'linear-gradient(135deg, #396aff 0%, #2050d4 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                fontSize: '1rem',
                fontWeight: '700',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                boxShadow: '0 2px 8px rgba(57, 106, 255, 0.3)',
                fontFamily: 'inherit',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(57, 106, 255, 0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(57, 106, 255, 0.3)';
              }}
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={formState === 'submitting' || isPreviewMode}
              style={{
                padding: '14px 24px',
                background: formState === 'submitting' || isPreviewMode
                  ? 'linear-gradient(135deg, #6b7280, #4b5563)'
                  : 'linear-gradient(135deg, #396aff 0%, #2050d4 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                fontSize: '1.05rem',
                fontWeight: '700',
                cursor: formState === 'submitting' || isPreviewMode ? 'not-allowed' : 'pointer',
                transition: 'all 0.3s ease',
                boxShadow: isPreviewMode ? 'none' : '0 2px 8px rgba(57, 106, 255, 0.3)',
                fontFamily: 'inherit',
                opacity: isPreviewMode ? 0.6 : 1,
              }}
              onMouseEnter={(e) => {
                if (formState !== 'submitting' && !isPreviewMode) {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(57, 106, 255, 0.4)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = isPreviewMode ? 'none' : '0 2px 8px rgba(57, 106, 255, 0.3)';
              }}
            >
              {isPreviewMode ? 'Submission Disabled (Preview)' : formState === 'submitting' ? 'Submitting...' : 'Submit Application'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
