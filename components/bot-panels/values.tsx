"use client";

/** Current panel values (lib/panel-values.ts) for the editor's preview and autocomplete. */

import { createContext, useContext } from 'react';

export const PanelValuesContext = createContext<Record<string, string>>({});
export const usePanelValues = () => useContext(PanelValuesContext);
