import { expect, Page, ConsoleMessage } from '@playwright/test';

/**
 * Console errors that are expected in the dev environment and not signals of
 * a map-page defect:
 *  - /api/auth/exec-session 401 — the anonymous visitor probe for exec login
 *  - React hydration warning for the data-theme attribute set by the theme script
 */
const IGNORED_CONSOLE_ERRORS = [
  /exec-session/,
  /Extra attributes from the server.*data-theme/s,
];

export interface ConsoleCapture {
  errors: string[];
  logs: string[];
}

/**
 * Start capturing console output. Call BEFORE page.goto().
 * `errors` excludes the known allowlist above; `logs` holds everything,
 * including the `[map:*]` instrumentation lines the map page emits.
 */
export function captureConsole(page: Page): ConsoleCapture {
  const capture: ConsoleCapture = { errors: [], logs: [] };
  page.on('console', (msg: ConsoleMessage) => {
    const text = msg.text();
    capture.logs.push(text);
    // For "Failed to load resource" errors the URL is only in msg.location()
    const textWithUrl = `${text} ${msg.location()?.url ?? ''}`;
    if (msg.type() === 'error' && !IGNORED_CONSOLE_ERRORS.some((re) => re.test(textWithUrl))) {
      capture.errors.push(textWithUrl.trim());
    }
  });
  page.on('pageerror', (err) => {
    capture.errors.push(`pageerror: ${err.message}`);
  });
  return capture;
}

/** Navigate to /map with a clean slate (no persisted viewport/mode/caches). */
export async function gotoMapFresh(page: Page): Promise<void> {
  await page.goto('/map');
  // Clear map-related persistence written by any earlier navigation, then
  // reload so the page boots from defaults (live mode, fitted viewport).
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
    return new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('map-history-cache');
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  });
  await page.goto('/map');
}

/** Wait until live-mode territory overlays are rendered on the map. */
export async function waitForLiveTerritories(page: Page): Promise<void> {
  await expect
    .poll(async () => page.locator('.map-container [data-territory-name]').count(), {
      timeout: 30_000,
      message: 'live territory overlays should render',
    })
    .toBeGreaterThan(100);
}

/** Switch to the history tab and wait for the timeline panel to be usable. */
export async function switchToHistory(page: Page): Promise<void> {
  await page.getByTestId('map-mode-history').click();
  await expect(page.getByTestId('history-controls-panel')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('timeline-current-time')).not.toHaveText('', { timeout: 30_000 });
}

/** Read the timeline's current timestamp label. */
export async function currentTimeLabel(page: Page): Promise<string> {
  return (await page.getByTestId('timeline-current-time').textContent()) ?? '';
}
