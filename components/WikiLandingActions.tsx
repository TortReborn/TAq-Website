"use client";

import Link from "next/link";
import { useWikiSession } from "@/hooks/useWikiSession";

/**
 * Actions on the Chronicle landing header.
 *
 * The editorial desk is offered to anyone — a reader who wants to know what is
 * still unchecked should be able to find it — while creating a page needs
 * publish rights. Driven by the wiki session, not the exec session, so a
 * chronicler outside the guild sees their tools.
 */
export default function WikiLandingActions() {
  const { canPublish, canReview } = useWikiSession();
  const linkStyle = {
    fontSize: '0.82rem',
    color: 'var(--accent-primary)',
    textDecoration: 'none',
    fontWeight: 600,
  } as const;

  return (
    <span style={{ display: 'inline-flex', gap: '0.9rem', alignItems: 'center' }}>
      <Link href="/chronicle/admin" style={linkStyle}>
        {canReview ? 'Editorial desk' : 'What needs checking'}
      </Link>
      {canPublish && (
        <Link href="/chronicle/new" style={linkStyle}>
          + New page
        </Link>
      )}
    </span>
  );
}
