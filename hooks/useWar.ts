import type { useDuelMatch } from './useDuels';
import type { WarAction, WarView } from '@/lib/duel/war/client';

/** Everything the war board needs from the match it is showing. */
export interface WarController {
  view: WarView | null;
  mode: 'practice' | 'friendly';
  /** When the round's clock runs out, in server-corrected local ms. */
  deadline: number | null;
  opponentLockedIn: boolean;
  pending: boolean;
  error: string | null;
  send: (a: WarAction) => Promise<void>;
  clearError: () => void;
}

/** A war stored on the server, from the same polling hook as the duel. */
export function serverWar(m: ReturnType<typeof useDuelMatch>): WarController {
  const match = m.match;
  return {
    view: match?.warView ?? null,
    mode: match?.mode === 'friendly' ? 'friendly' : 'practice',
    deadline: match?.deadline ? Date.parse(match.deadline) - m.skew : null,
    opponentLockedIn: !!match?.opponentLockedIn,
    pending: m.pending,
    error: m.error,
    // The server takes war actions on the same endpoint as duel actions.
    send: a => m.send(a as unknown as Parameters<typeof m.send>[0]),
    clearError: m.clearError,
  };
}
