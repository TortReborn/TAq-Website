import useSWR from 'swr';
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetcher } from './fetcher';
import type { Owned } from '@/lib/duel/deck';
import type { Lobby, MatchPayload } from '@/lib/duel/store';
import type { Action, CardDef, Element } from '@/lib/duel/types';

export interface DuelDeck {
  id: string;
  name: string;
  cards: string[];
  updatedAt: string;
}

export interface DuelsData extends Lobby {
  me: { ign: string; uuid: string };
  owned: Owned;
  memberCards: Record<string, CardDef>;
  decks: DuelDeck[];
  starters: { id: string; name: string; element: Element; cards: string[] }[];
}

/** Lobby data; refreshes every 10s so new challenges show up. */
export function useDuels(enabled: boolean) {
  const { data, error, isLoading, mutate } = useSWR<DuelsData>(enabled ? '/api/duels' : null, fetcher, {
    refreshInterval: 10_000,
    revalidateOnFocus: true,
  });
  return { data: data ?? null, loading: isLoading, error: error?.message ?? null, refresh: () => mutate() };
}

export async function duelPost<T = unknown>(url: string, body?: unknown, method = 'POST'): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.error || `HTTP ${res.status}`) as Error & { stale?: boolean };
    err.stale = !!json.stale;
    throw err;
  }
  return json as T;
}

/**
 * One match, kept fresh by polling with the version the client already has:
 * every 2s while waiting on the opponent, every 10s on your own turn (to
 * catch a concede or your own clock running out). The server answers
 * { unchanged } when nothing moved, so idle polling costs one indexed read.
 */
export function useDuelMatch(id: string) {
  const [match, setMatch] = useState<MatchPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [skew, setSkew] = useState(0);
  const versionRef = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const accept = useCallback((m: MatchPayload) => {
    versionRef.current = m.version;
    setSkew(Date.parse(m.now) - Date.now());
    setMatch(m);
  }, []);

  const poll = useCallback(async () => {
    try {
      const v = versionRef.current;
      const res = await fetch(`/api/duels/matches/${id}${v !== null ? `?v=${v}` : ''}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      if (json.match) accept(json.match);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id, accept]);

  useEffect(() => {
    let alive = true;
    const loop = async () => {
      await poll();
      if (!alive) return;
      const m = matchRef.current;
      const done = m && (m.status === 'finished' || m.status === 'cancelled');
      if (done) return;
      const wait = m && m.yourTurn ? 10_000 : 2_000;
      timer.current = setTimeout(loop, document.hidden ? Math.max(wait, 8_000) : wait);
    };
    loop();
    return () => {
      alive = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [poll]);

  const matchRef = useRef<MatchPayload | null>(null);
  matchRef.current = match;

  const send = useCallback(async (action: Action) => {
    if (!matchRef.current) return;
    setPending(true);
    try {
      const json = await duelPost<{ match: MatchPayload }>(`/api/duels/matches/${id}/action`, {
        version: matchRef.current.version,
        action,
      });
      accept(json.match);
      setError(null);
    } catch (e) {
      const err = e as Error & { stale?: boolean };
      setError(err.message);
      if (err.stale) await poll();
    } finally {
      setPending(false);
    }
  }, [id, accept, poll]);

  return { match, error, pending, send, skew, clearError: () => setError(null) };
}
