import { test, expect } from '@playwright/test';
import { captureConsole, gotoMapFresh, waitForLiveTerritories } from './helpers';

test.describe('map page — live tab', () => {
  test('loads in live mode with territories rendered and no console errors', async ({ page }) => {
    const consoleCapture = captureConsole(page);
    await gotoMapFresh(page);

    // Map image and live mode selected by default
    await expect(page.locator('img[alt="Wynncraft Map"]')).toBeVisible();
    await expect(page.getByTestId('map-mode-live')).toBeVisible();

    // Territory overlays render from /api/territories
    await waitForLiveTerritories(page);

    // The history timeline panel must NOT be shown in live mode
    await expect(page.getByTestId('history-controls-panel')).toHaveCount(0);

    expect(consoleCapture.errors, `unexpected console errors:\n${consoleCapture.errors.join('\n')}`).toEqual([]);
  });

  test('emits data-loading instrumentation logs', async ({ page }) => {
    const consoleCapture = captureConsole(page);
    await gotoMapFresh(page);
    await waitForLiveTerritories(page);

    await expect
      .poll(() => consoleCapture.logs.some((l) => l.includes('[map:static]')), {
        message: 'static data timing log should appear',
      })
      .toBe(true);
    await expect
      .poll(() => consoleCapture.logs.some((l) => l.includes('[map:live] territory poll')), {
        message: 'live territory poll timing log should appear',
      })
      .toBe(true);
    await expect
      .poll(() => consoleCapture.logs.some((l) => l.includes('[map:bounds] history bounds ready')), {
        message: 'bounds log should appear (prefetched even in live mode)',
      })
      .toBe(true);
  });

  test('core API endpoints respond OK with expected shapes', async ({ page }) => {
    const [territoriesRes, boundsRes, colorsRes] = await Promise.all([
      page.request.get('/api/territories'),
      page.request.get('/api/map-history/bounds'),
      page.request.get('/api/guild-colors/cached'),
    ]);

    expect(territoriesRes.ok()).toBe(true);
    const territories = await territoriesRes.json();
    expect(Object.keys(territories).length).toBeGreaterThan(100);

    expect(boundsRes.ok()).toBe(true);
    const bounds = await boundsRes.json();
    expect(bounds.earliest).toBeTruthy();
    expect(bounds.latest).toBeTruthy();
    expect(Array.isArray(bounds.gaps)).toBe(true);
    // Server-Timing instrumentation is exposed for the browser devtools
    expect(boundsRes.headers()['server-timing']).toContain('total;dur=');

    expect(colorsRes.ok()).toBe(true);
    const colors = await colorsRes.json();
    expect(Object.keys(colors.guildColors ?? {}).length).toBeGreaterThan(0);
  });

  test('guild territory count panel and settings toggle work', async ({ page }) => {
    await gotoMapFresh(page);
    await waitForLiveTerritories(page);

    // Settings panel opens via the gear button and lists the overlay toggles
    await page.getByTitle('Map Settings').click();
    await expect(page.getByText('Territories', { exact: true })).toBeVisible();
    await expect(page.getByText('Trade Routes', { exact: true })).toBeVisible();
  });
});
