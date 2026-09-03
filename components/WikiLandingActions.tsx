"use client";

import Link from "next/link";
import { useExecSession } from "@/hooks/useExecSession";

/** Exec-only "New page" action on the Chronicles landing header. */
export default function WikiLandingActions() {
  const { isExec } = useExecSession();
  if (!isExec) return null;
  return (
    <Link href="/chronicles/new" style={{ fontSize: '0.82rem', color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 600 }}>
      + New page
    </Link>
  );
}
