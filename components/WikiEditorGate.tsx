"use client";

import Link from "next/link";
import WikiEditor from "./WikiEditor";
import { WikiPagePayload } from "@/lib/wiki";
import { useExecSession } from "@/hooks/useExecSession";

/**
 * Editor gate: execs edit directly; any other linked guild account gets the
 * same editor in suggestion mode (queued for exec review); anonymous visitors
 * are asked to sign in.
 */
export default function WikiEditorGate({
  targetId,
  initial,
}: {
  targetId: number | null;
  initial: WikiPagePayload;
}) {
  const { isExec, authenticated, loading } = useExecSession();
  if (loading) {
    return <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading…</div>;
  }
  if (!authenticated) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
        <Link href="/exec/login" style={{ color: 'var(--accent-primary)' }}>Sign in</Link>
        {' '}with a linked guild account to suggest edits to the Chronicles.
      </div>
    );
  }
  return <WikiEditor targetId={targetId} initial={initial} mode={isExec ? 'direct' : 'suggest'} />;
}
