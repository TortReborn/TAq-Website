import type { useDuelMatch } from './useDuels';
import type { GridAction, GridView } from '@/lib/duel/grid/client';

/** Everything the Warfront board needs from the match it is showing. */
export interface GridController {
  view: GridView | null;
  mode: 'practice' | 'friendly';
  /** When the current turn's (or the mulligan's) clock runs out, in server-corrected local ms. */
  deadline: number | null;
  pending: boolean;
  error: string | null;
  send: (a: GridAction) => Promise<void>;
  clearError: () => void;
}

/** A Warfront match stored on the server, from the same polling hook as the duel. */
export function serverGrid(m: ReturnType<typeof useDuelMatch>): GridController {
  const match = m.match;
  return {
    view: match?.gridView ?? null,
    mode: match?.mode === 'friendly' ? 'friendly' : 'practice',
    deadline: match?.deadline ? Date.parse(match.deadline) - m.skew : null,
    pending: m.pending,
    error: m.error,
    // The server takes grid actions on the same endpoint as duel actions.
    send: a => m.send(a as unknown as Parameters<typeof m.send>[0]),
    clearError: m.clearError,
  };
}
