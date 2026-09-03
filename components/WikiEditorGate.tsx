"use client";

import Link from "next/link";
import WikiEditor from "./WikiEditor";
import { WikiPagePayload } from "@/lib/wiki";
import { useExecSession } from "@/hooks/useExecSession";

/** Exec gate for the wiki editor (Phase 2 opens a suggestion path for members). */
export default function WikiEditorGate({
  targetId,
  initial,
}: {
  targetId: number | null;
  initial: WikiPagePayload;
}) {
  const { isExec, loading } = useExecSession();
  if (loading) {
    return <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading…</div>;
  }
  if (!isExec) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
        Editing the Chronicles wiki requires exec access.{' '}
        <Link href="/exec/login" style={{ color: 'var(--accent-primary)' }}>Sign in</Link>
        {' '}— community edit suggestions are coming soon.
      </div>
    );
  }
  return <WikiEditor targetId={targetId} initial={initial} />;
}
