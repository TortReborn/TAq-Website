"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { WikiPageSummary, WIKI_TYPE_LABELS } from "@/lib/wiki";

/** Debounced search box with a grouped results dropdown. */
export default function WikiSearchBox({ autoFocus = false }: { autoFocus?: boolean }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<WikiPageSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (query.trim().length < 2) { setResults([]); setLoading(false); return; }
    setLoading(true);
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/wiki/search?q=${encodeURIComponent(query.trim())}`);
        const data = await res.json();
        setResults(Array.isArray(data.results) ? data.results : []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [query]);

  return (
    <div style={{ position: "relative", width: "100%", maxWidth: "34rem" }}>
      <div style={{ position: "relative" }}>
        <Search size={16} style={{ position: "absolute", left: "0.7rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)" }} />
        <input
          autoFocus={autoFocus}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Search the Chronicle…"
          style={{
            width: "100%", boxSizing: "border-box",
            padding: "0.6rem 0.9rem 0.6rem 2.3rem",
            borderRadius: "0.5rem", border: "1px solid var(--border-color)",
            background: "var(--bg-card)", color: "var(--text-primary)",
            fontSize: "0.9rem", outline: "none",
          }}
        />
      </div>
      {open && query.trim().length >= 2 && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 40,
          marginTop: "0.25rem", background: "var(--bg-card-solid, var(--bg-card))",
          border: "1px solid var(--border-color)", borderRadius: "0.5rem",
          overflow: "hidden", boxShadow: "0 6px 20px rgba(0,0,0,0.4)",
        }}>
          {loading && <div style={{ padding: "0.6rem 0.9rem", fontSize: "0.8rem", color: "var(--text-secondary)" }}>Searching…</div>}
          {!loading && results.length === 0 && (
            <div style={{ padding: "0.6rem 0.9rem", fontSize: "0.8rem", color: "var(--text-secondary)" }}>No pages found.</div>
          )}
          {!loading && results.map(r => (
            <Link key={r.slug} href={`/chronicle/${r.slug}`} style={{
              display: "flex", alignItems: "baseline", gap: "0.5rem",
              padding: "0.45rem 0.9rem", textDecoration: "none",
              borderBottom: "1px solid var(--border-color)",
            }}>
              <span style={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--text-primary)" }}>{r.title}</span>
              <span style={{ fontSize: "0.65rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                {WIKI_TYPE_LABELS[r.pageType]}
              </span>
              {r.summary && (
                <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.summary}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
