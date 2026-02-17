"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import type { ApplicationQuestion } from '@/lib/application-questions';

interface ApplicationFormProps {
  applicationType: 'guild' | 'community';
  questions: ApplicationQuestion[];
  title: string;
}

interface DiscordUser {
  discord_id: string;
  discord_username: string;
  discord_avatar: string;
  application_type: string;
}

type FormState = 'loading' | 'unauthenticated' | 'form' | 'submitting' | 'success' | 'error';

export default function ApplicationForm({ applicationType, questions, title }: ApplicationFormProps) {
  const searchParams = useSearchParams();
  const [formState, setFormState] = useState<FormState>('loading');
  const [user, setUser] = useState<DiscordUser | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string>('');
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [ignStatus, setIgnStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');
  const [ignData, setIgnData] = useState<{ username: string; uuid: string; statsUrl: string } | null>(null);
  const [ignCheckedValue, setIgnCheckedValue] = useState<string>('');
  const ignDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ignAbortRef = useRef<AbortController | null>(null);

  // Authenticate on mount
  useEffect(() => {
    async function authenticate() {
      const token = searchParams.get('token');

      if (token) {
        // Verify bot token
        try {
          const res = await fetch(`/api/auth/verify-token?token=${encodeURIComponent(token)}`);
          const data = await res.json();
          if (data.valid && data.user) {
            setUser(data.user);
            setFormState('form');
            // Remove token from URL without reload
            window.history.replaceState({}, '', window.location.pathname);
            return;
          }
        } catch { /* fall through */ }
      }

      // Check existing session
      try {
        const res = await fetch('/api/auth/session');
        const data = await res.json();
        if (data.authenticated && data.user) {
          setUser(data.user);
          setFormState('form');
          return;
        }
      } catch { /* fall through */ }

      setFormState('unauthenticated');
    }

    authenticate();
  }, [searchParams]);

  const validateField = useCallback((question: ApplicationQuestion, value: string): string => {
    const trimmed = value.trim();

    if (question.required && trimmed.length === 0) {
      return 'This field is required.';
    }

    if (trimmed.length > 0) {
      if (question.minLength && trimmed.length < question.minLength) {
        return `Must be at least ${question.minLength} characters.`;
      }
      if (question.maxLength && value.length > question.maxLength) {
        return `Must be ${question.maxLength} characters or less.`;
      }
    }

    return '';
  }, []);

  const validateIgn = useCallback(async (ign: string) => {
    const trimmed = ign.trim();
    if (!trimmed || trimmed === ignCheckedValue) return;

    // Abort any in-flight request
    if (ignAbortRef.current) ignAbortRef.current.abort();
    const controller = new AbortController();
    ignAbortRef.current = controller;

    setIgnStatus('checking');
    setIgnData(null);

    try {
      const res = await fetch(`/api/wynncraft/player?ign=${encodeURIComponent(trimmed)}`, {
        signal: controller.signal,
      });
      const data = await res.json();

      if (controller.signal.aborted) return;

      if (data.valid) {
        setIgnStatus('valid');
        setIgnData({ username: data.username, uuid: data.uuid, statsUrl: data.statsUrl });
        setIgnCheckedValue(trimmed);
        setAnswers(prev => ({
          ...prev,
          ...(data.username !== trimmed ? { ign: data.username } : {}),
          stats_link: data.statsUrl,
        }));
        setFieldErrors(prev => {
          const next = { ...prev };
          delete next['ign'];
          return next;
        });
      } else {
        setIgnStatus('invalid');
        setIgnCheckedValue(trimmed);
        setFieldErrors(prev => ({ ...prev, ign: data.error || 'Player not found.' }));
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      setIgnStatus('invalid');
      setIgnCheckedValue(trimmed);
      setFieldErrors(prev => ({ ...prev, ign: 'Could not verify player. Try again.' }));
    }
  }, [ignCheckedValue]);

  const handleChange = (questionId: string, value: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
    // Clear error on change
    if (fieldErrors[questionId]) {
      setFieldErrors(prev => {
        const next = { ...prev };
        delete next[questionId];
        return next;
      });
    }
    // Reset IGN validation when IGN changes and debounce re-check
    if (questionId === 'ign') {
      if (value.trim() !== ignCheckedValue) {
        setIgnStatus('idle');
        setIgnData(null);
        setIgnCheckedValue('');
        setAnswers(prev => {
          const next = { ...prev };
          delete next['stats_link'];
          return next;
        });
      }
      // Debounce: validate 2s after user stops typing
      if (ignDebounceRef.current) clearTimeout(ignDebounceRef.current);
      ignDebounceRef.current = setTimeout(() => {
        validateIgn(value);
      }, 1000);
    }
  };

  const handleSubmit = async () => {
    // Validate all fields
    const errors: Record<string, string> = {};
    for (const question of questions) {
      const error = validateField(question, answers[question.id] || '');
      if (error) errors[question.id] = error;
    }

    // Require valid IGN if the form has an IGN field
    const hasIgnField = questions.some(q => q.id === 'ign');
    if (hasIgnField && answers['ign']?.trim()) {
      if (ignStatus === 'idle' || ignStatus === 'checking') {
        errors['ign'] = 'Please wait for IGN verification to complete.';
      } else if (ignStatus === 'invalid') {
        errors['ign'] = errors['ign'] || 'This player was not found. Please check your IGN.';
      }
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      // Scroll to first error
      const firstErrorId = questions.find(q => errors[q.id])?.id;
      if (firstErrorId) {
        document.getElementById(`field-${firstErrorId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    setFormState('submitting');
    setSubmitError('');

    try {
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          application_type: applicationType,
          answers,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setFormState('success');
      } else if (res.status === 409) {
        setSubmitError('You already have a pending application of this type.');
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

  // Loading state
  if (formState === 'loading') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <div style={{
          width: '40px',
          height: '40px',
          border: '3px solid var(--border-color)',
          borderTopColor: 'var(--accent-primary)',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Unauthenticated state
  if (formState === 'unauthenticated') {
    return (
      <div style={{
        maxWidth: '600px',
        margin: '3rem auto',
        padding: '2rem',
        textAlign: 'center',
      }}>
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-card)',
          borderRadius: '1rem',
          padding: '3rem 2rem',
          backdropFilter: 'blur(12px)',
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔒</div>
          <h2 style={{
            fontSize: '1.5rem',
            fontWeight: '700',
            color: 'var(--text-primary)',
            marginBottom: '1rem',
          }}>
            Invalid or Expired Link
          </h2>
          <p style={{
            color: 'var(--text-secondary)',
            fontSize: '1rem',
            lineHeight: '1.6',
            marginBottom: '2rem',
          }}>
            This application link is no longer valid. Please go to the <strong>#applications</strong> channel
            in our Discord server and click the application button to get a new link.
          </p>
          <a
            href="https://discord.gg/njRpZwKVaa"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-block',
              padding: '12px 24px',
              background: 'linear-gradient(135deg, #5865f2 0%, #4752c4 100%)',
              color: 'white',
              textDecoration: 'none',
              borderRadius: '8px',
              fontWeight: '600',
              fontSize: '1rem',
              transition: 'all 0.3s ease',
            }}
          >
            Go to Discord
          </a>
        </div>
      </div>
    );
  }

  // Success state
  if (formState === 'success') {
    return (
      <div style={{
        maxWidth: '600px',
        margin: '3rem auto',
        padding: '2rem',
        textAlign: 'center',
      }}>
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-card)',
          borderRadius: '1rem',
          padding: '3rem 2rem',
          backdropFilter: 'blur(12px)',
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
          <h2 style={{
            fontSize: '1.5rem',
            fontWeight: '700',
            color: 'var(--text-primary)',
            marginBottom: '1rem',
          }}>
            Application Submitted!
          </h2>
          <p style={{
            color: 'var(--text-secondary)',
            fontSize: '1rem',
            lineHeight: '1.6',
          }}>
            We've received your {applicationType === 'guild' ? 'guild member' : 'community member'} application.
            We'll review it and get back to you soon in Discord.
          </p>
        </div>
      </div>
    );
  }

  // Form state
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
          background: 'linear-gradient(135deg, var(--color-ocean-400), var(--color-ocean-600))',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          marginBottom: '0.5rem',
          letterSpacing: '-0.02em',
        }}>
          {title}
        </h1>
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
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            marginBottom: '2rem',
          }}>
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
                {user.discord_username}
              </div>
            </div>
          </div>
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

        {/* Form fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {questions.map((question) => (
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
                <textarea
                  value={answers[question.id] || ''}
                  onChange={(e) => handleChange(question.id, e.target.value)}
                  onFocus={() => setFocusedField(question.id)}
                  onBlur={() => setFocusedField(null)}
                  placeholder={question.placeholder}
                  rows={2}
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
              ) : (
                <div style={{ position: 'relative', display: 'flex', gap: '0.5rem', alignItems: 'stretch' }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <input
                      type="text"
                      value={answers[question.id] || ''}
                      onChange={(e) => handleChange(question.id, e.target.value)}
                      onFocus={() => setFocusedField(question.id)}
                      onBlur={(e) => {
                        setFocusedField(null);
                        if (question.id === 'ign') {
                          if (ignDebounceRef.current) clearTimeout(ignDebounceRef.current);
                          validateIgn(e.target.value);
                        }
                      }}
                      placeholder={question.placeholder}
                      maxLength={question.maxLength}
                      style={{
                        width: '100%',
                        padding: question.id === 'ign' ? '0.75rem 2.25rem 0.75rem 1rem' : '0.75rem 1rem',
                        background: 'var(--bg-secondary)',
                        border: `1px solid ${fieldErrors[question.id] ? '#ef4444' : question.id === 'ign' && ignStatus === 'valid' ? '#22c55e' : focusedField === question.id ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                        borderRadius: '8px',
                        color: 'var(--text-primary)',
                        fontSize: '1rem',
                        fontFamily: 'inherit',
                        outline: 'none',
                        transition: 'border-color 0.2s ease',
                        boxSizing: 'border-box',
                      }}
                    />
                    {/* IGN status indicator */}
                    {question.id === 'ign' && ignStatus === 'checking' && (
                      <div style={{
                        position: 'absolute',
                        right: '10px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                      }}>
                        <div style={{
                          width: '18px',
                          height: '18px',
                          border: '2px solid var(--border-color)',
                          borderTopColor: 'var(--accent-primary)',
                          borderRadius: '50%',
                          animation: 'spin 0.8s linear infinite',
                        }} />
                      </div>
                    )}
                    {question.id === 'ign' && ignStatus === 'valid' && (
                      <div style={{
                        position: 'absolute',
                        right: '10px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: '#22c55e',
                        fontSize: '1.1rem',
                        lineHeight: 1,
                      }}>
                        &#10003;
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Character count for textareas */}
              {question.type === 'textarea' && question.maxLength && (
                <div style={{
                  textAlign: 'right',
                  fontSize: '0.75rem',
                  color: (answers[question.id]?.length || 0) > question.maxLength * 0.9
                    ? '#ef4444'
                    : 'var(--text-muted)',
                  marginTop: '0.25rem',
                }}>
                  {answers[question.id]?.length || 0} / {question.maxLength}
                </div>
              )}

              {/* Field error */}
              {fieldErrors[question.id] && (
                <div style={{
                  color: '#ef4444',
                  fontSize: '0.8rem',
                  marginTop: '0.35rem',
                }}>
                  {fieldErrors[question.id]}
                </div>
              )}

              {/* Stats link — auto-filled after IGN validation */}
              {question.id === 'ign' && ignData?.statsUrl && (
                <div style={{
                  marginTop: '0.5rem',
                  fontSize: '0.9rem',
                }}>
                  <a
                    href={ignData.statsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: 'var(--accent-primary)',
                      textDecoration: 'underline',
                      transition: 'opacity 0.2s ease',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.8'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
                  >
                    View stats page — please ensure it is public
                  </a>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Submit button */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={formState === 'submitting'}
          style={{
            width: '100%',
            marginTop: '2rem',
            padding: '14px 24px',
            background: formState === 'submitting'
              ? 'linear-gradient(135deg, #6b7280, #4b5563)'
              : 'linear-gradient(135deg, #5865f2 0%, #4752c4 100%)',
            color: 'white',
            border: 'none',
            borderRadius: '10px',
            fontSize: '1.05rem',
            fontWeight: '700',
            cursor: formState === 'submitting' ? 'not-allowed' : 'pointer',
            transition: 'all 0.3s ease',
            boxShadow: '0 2px 8px rgba(88, 101, 242, 0.3)',
          }}
          onMouseEnter={(e) => {
            if (formState !== 'submitting') {
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(88, 101, 242, 0.4)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(88, 101, 242, 0.3)';
          }}
        >
          {formState === 'submitting' ? 'Submitting...' : 'Submit Application'}
        </button>
      </div>
    </div>
  );
}
