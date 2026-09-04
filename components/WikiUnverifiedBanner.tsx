"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { WikiVerification, WIKI_VALIDATIONS_REQUIRED } from "@/lib/wiki";
import { useWikiSession } from "@/hooks/useWikiSession";

/**
 * The unverified notice.
 *
 * Every article in the Chronicles was drafted from archived sources by an AI
 * pass. That is a reasonable way to get 180 pages written and a poor reason for
 * a reader to trust any one of them, so a page says so plainly until a person
 * has either edited it or vouched for it.
 *
 * The banner is honest rather than apologetic: it states what the page is, what
 * would clear it, and offers the reader the two useful actions — fix it, or say
 * it looks right. It disappears the moment either happens.
 */
export default function WikiUnverifiedBanner({
  slug,
  verification,
}: {
  slug: string;
  verification: WikiVerification;
}) {
  const { canReview, loading } = useWikiSession();
  const [state, setState] = useState<WikiVerification>(verification);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (state.verified) return null;

  const remaining = Math.max(0, WIKI_VALIDATIONS_REQUIRED - state.validations);

  const vouch = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/wiki/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Could not record that'); return; }
      setState(data.verification);
    } catch {
      setError('Network error');
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/wiki/validate?slug=${encodeURIComponent(slug)}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'Could not withdraw');
        return;
      }
      setState({
        ...state,
        validations: Math.max(0, state.validations - 1),
        viewerValidated: false,
        verified: false,
      });
    } catch {
      setError('Network error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="wiki-unverified" role="note">
      <AlertTriangle size={18} className="wiki-unverified__icon" aria-hidden />
      <div className="wiki-unverified__body">
        <strong className="wiki-unverified__title">This page has not been checked by a person.</strong>
        <p className="wiki-unverified__text">
          It was drafted from archived sources by an automated pass, and may be incomplete or
          wrong — particularly on treaties, dates and who was involved.{' '}
          <Link href={`/chronicles/${slug}/edit`} className="wiki-unverified__link">Correct it</Link>
          {' '}if you were there, or{' '}
          <Link href="/chronicles/admin" className="wiki-unverified__link">see everything awaiting review</Link>.
        </p>

        {!loading && canReview && (
          <div className="wiki-unverified__actions">
            {state.viewerValidated ? (
              <>
                <span className="wiki-unverified__vouched">
                  <Check size={14} aria-hidden /> You vouched for this revision
                </span>
                <button type="button" className="wiki-unverified__btn" onClick={withdraw} disabled={busy}>
                  Withdraw
                </button>
              </>
            ) : (
              <button type="button" className="wiki-unverified__btn wiki-unverified__btn--go" onClick={vouch} disabled={busy}>
                {busy ? <Loader2 size={14} className="wiki-unverified__spin" aria-hidden /> : <Check size={14} aria-hidden />}
                This matches what I know
              </button>
            )}
            <span className="wiki-unverified__count">
              {state.validations} of {WIKI_VALIDATIONS_REQUIRED}
              {remaining > 0 && ` — ${remaining} more clears this notice`}
            </span>
          </div>
        )}

        {state.validatedBy.length > 0 && (
          <p className="wiki-unverified__by">Vouched for by {state.validatedBy.join(', ')}.</p>
        )}
        {error && <p className="wiki-unverified__error">{error}</p>}
      </div>

      <style jsx>{`
        .wiki-unverified {
          display: flex;
          gap: 0.75rem;
          align-items: flex-start;
          background: color-mix(in srgb, #d97706 12%, var(--bg-card));
          border: 1px solid color-mix(in srgb, #d97706 45%, var(--border-color));
          border-left-width: 3px;
          border-radius: 0.5rem;
          padding: 0.85rem 1rem;
          margin-bottom: 1.5rem;
        }
        .wiki-unverified__body { flex: 1; min-width: 0; }
        .wiki-unverified__icon { color: #d97706; flex-shrink: 0; margin-top: 0.1rem; }
        .wiki-unverified__link { color: var(--accent-primary); text-decoration: underline; }
        .wiki-unverified__title {
          display: block;
          font-size: 0.9rem;
          color: var(--text-primary);
          margin-bottom: 0.25rem;
        }
        .wiki-unverified__text {
          margin: 0;
          font-size: 0.85rem;
          line-height: 1.5;
          color: var(--text-secondary);
        }
        .wiki-unverified__actions {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.6rem;
          margin-top: 0.7rem;
        }
        .wiki-unverified__btn {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          height: 30px;
          padding: 0 0.75rem;
          border-radius: 0.375rem;
          border: 1px solid var(--border-color);
          background: var(--bg-secondary);
          color: var(--text-primary);
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
        }
        .wiki-unverified__btn:disabled { opacity: 0.6; cursor: default; }
        .wiki-unverified__btn--go {
          background: #2e7d32;
          border-color: #2e7d32;
          color: #fff;
        }
        .wiki-unverified__vouched {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          font-size: 0.8rem;
          color: var(--text-secondary);
        }
        .wiki-unverified__count { font-size: 0.78rem; color: var(--text-secondary); }
        .wiki-unverified__by,
        .wiki-unverified__error {
          margin: 0.5rem 0 0;
          font-size: 0.78rem;
          color: var(--text-secondary);
        }
        .wiki-unverified__error { color: #ef5350; }
        .wiki-unverified__spin { animation: wiki-unverified-spin 1s linear infinite; }
        @keyframes wiki-unverified-spin { to { transform: rotate(360deg); } }
        @media (max-width: 640px) {
          .wiki-unverified { flex-direction: column; gap: 0.5rem; }
        }
      `}</style>
    </div>
  );
}
