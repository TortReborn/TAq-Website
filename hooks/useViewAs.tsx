"use client";

import { createContext, useContext } from 'react';

export type ViewAsMode = 'normal' | 'non-member' | 'below-angler' | 'angler';

export const ViewAsContext = createContext<ViewAsMode>('normal');

export function useViewAs(): ViewAsMode {
  return useContext(ViewAsContext);
}
