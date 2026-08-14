/**
 * Minimal declaration for react-dom/server, used only by _render-charts.tsx.
 *
 * The project ships @types/react but not @types/react-dom — nothing in the app
 * server-renders by hand, so the dependency would exist solely for one preview
 * script. This declares the single export that script uses instead.
 */
declare module 'react-dom/server' {
  import type { ReactElement } from 'react';
  export function renderToStaticMarkup(element: ReactElement): string;
}
