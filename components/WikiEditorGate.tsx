"use client";

import Link from "next/link";
import WikiEditor from "./WikiEditor";
import { WikiPagePayload } from "@/lib/wiki";
import { useWikiSession } from "@/hooks/useWikiSession";

/**
 * Editor gate.
 *
 * Execs and chroniclers edit directly; any other linked guild account gets the
 * same editor in suggestion mode, queued for review; anonymous visitors are
 * asked to sign in.
 *
 * Gated on the wiki session rather than the exec session, because a chronicler
 * may never have been in the guild — the exec session reports those people as
 * unauthenticated, which is right everywhere else on the site and wrong here.
 */
export default function WikiEditorGate({
  targetId,
  initial,
}: {
  targetId: number | null;
  initial: WikiPagePayload;
}) {
  const { authenticated, canPublish, loading } = useWikiSession();

  if (loading) {
    return <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading…</div>;
  }

  if (!authenticated) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
        <Link href="/exec/login" style={{ color: 'var(--accent-primary)' }}>Sign in with Discord</Link>
        {' '}to edit the Chronicle.
        <div style={{ marginTop: '0.6rem', fontSize: '0.8rem' }}>
          You do not need to be in the guild — ask an exec to add you as a chronicler and
          sign in with the same Discord account.
        </div>
      </div>
    );
  }

  return (
    <WikiEditor
      targetId={targetId}
      initial={initial}
      mode={canPublish ? 'direct' : 'suggest'}
    />
  );
}
