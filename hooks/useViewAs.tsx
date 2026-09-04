"use client";

import { createContext, useContext } from 'react';

/**
 * Perspectives an exec can preview the site from.
 *
 * 'non-chronicler' exists because the Chronicle has its own permission axis:
 * a chronicler may never have been in the guild at all, so masking the exec
 * session tells you nothing about what the Chronicle looks like to an ordinary
 * reader. Without it, a chronicler previewing as 'non-member' still saw every
 * vouch button and editorial link.
 */
export type ViewAsMode = 'normal' | 'non-member' | 'below-angler' | 'angler' | 'non-chronicler';

export const ViewAsContext = createContext<ViewAsMode>('normal');

export function useViewAs(): ViewAsMode {
  return useContext(ViewAsContext);
}

/** True when the current preview should hide chronicler-only affordances. */
export function hidesChroniclerTools(mode: ViewAsMode): boolean {
  return mode === 'non-chronicler' || mode === 'non-member' || mode === 'below-angler' || mode === 'angler';
}
