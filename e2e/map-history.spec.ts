import { test, expect } from '@playwright/test';
import {
  captureConsole,
  gotoMapFresh,
  waitForLiveTerritories,
  switchToHistory,
  currentTimeLabel,
} from './helpers';

test.describe('map page — history tab', () => {
  test('first visit to history starts the intro tour; skip dismisses and persists', async ({ page }) => {
    await gotoMapFresh(page);
    await waitForLiveTerritories(page);
    // Simulate a first visit: the tour-complete flag is unset
    await page.evaluate(() => localStorage.removeItem('map_history_tour_complete'));

    await page.getByTestId('map-mode-history').click();
    const tooltip = page.getByTestId('tour-tooltip');
    await expect(tooltip).toContainText('Welcome to History view', { timeout: 10_000 });

    // Step through to the timeline highlight, then skip out
    await tooltip.getByRole('button', { name: 'Next' }).click();
    await expect(tooltip).toContainText('The timeline');
    await tooltip.getByRole('button', { name: 'Skip tour' }).click();
    await expect(tooltip).toHaveCount(0);

    // Completion is persisted — switching modes doesn't restart it
    expect(await page.evaluate(() => localStorage.getItem('map_history_tour_complete'))).toBe('true');
  });

  test('switching to history shows the timeline panel and renders territories', async ({ page }) => {
    const consoleCapture = captureConsole(page);
    await gotoMapFresh(page);
    await waitForLiveTerritories(page);

    await switchToHistory(page);

    // Playback controls are present
    await expect(page.getByTestId('playback-play')).toBeVisible();
    await expect(page.getByTestId('playback-step-back')).toBeVisible();
    await expect(page.getByTestId('playback-step-forward')).toBeVisible();
    await expect(page.getByTestId('timeline-thumb')).toBeVisible();

    // Territories render for the historical snapshot too
    await expect
      .poll(async () => page.locator('.map-container [data-territory-name]').count(), {
        timeout: 30_000,
        message: 'history territory overlays should render',
      })
      .toBeGreaterThan(100);

    expect(consoleCapture.errors, `unexpected console errors:\n${consoleCapture.errors.join('\n')}`).toEqual([]);
  });

  test('emits history data-loading instrumentation (snapshot, events, store)', async ({ page }) => {
    const consoleCapture = captureConsole(page);
    await gotoMapFresh(page);
    await waitForLiveTerritories(page);
    await switchToHistory(page);

    await expect
      .poll(() => consoleCapture.logs.some((l) => l.includes('[map:mode] switched to history')), {
        message: 'mode-switch log should appear',
      })
      .toBe(true);
    await expect
      .poll(() => consoleCapture.logs.some((l) => l.includes('[map:events] GET /api/map-history/events')), {
        timeout: 30_000,
        message: 'events chunk timing log should appear',
      })
      .toBe(true);
    await expect
      .poll(() => consoleCapture.logs.some((l) => l.includes('[map:store] merge event chunk into store')), {
        timeout: 30_000,
        message: 'store merge timing log should appear',
      })
      .toBe(true);
  });

  test('event chunk requests are canonical epoch-aligned cells (CDN-shareable URLs)', async ({ page }) => {
    const eventUrls: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/api/map-history/events')) eventUrls.push(req.url());
    });

    await gotoMapFresh(page);
    await waitForLiveTerritories(page);
    await switchToHistory(page);

    await expect.poll(() => eventUrls.length, { timeout: 30_000 }).toBeGreaterThan(0);
    // Must match the client's grid constants (app/map/page.tsx)
    const CHUNK_MS = 3 * 30 * 24 * 60 * 60 * 1000;
    const EPOCH_MS = Date.UTC(2018, 0, 1);
    for (const url of eventUrls) {
      const params = new URL(url).searchParams;
      const start = new Date(params.get('start')!);
      const end = new Date(params.get('end')!);
      expect(
        (start.getTime() - EPOCH_MS) % CHUNK_MS,
        `start=${params.get('start')} should sit on the canonical 90-day grid`,
      ).toBe(0);
      expect(
        end.getTime() - start.getTime(),
        `${url} should request exactly one grid cell`,
      ).toBe(CHUNK_MS);
    }
  });

  test('stepping forward/backward moves the current time', async ({ page }) => {
    await gotoMapFresh(page);
    await waitForLiveTerritories(page);
    await switchToHistory(page);

    const before = await currentTimeLabel(page);
    await page.getByTestId('playback-step-back').click();
    await expect.poll(() => currentTimeLabel(page)).not.toBe(before);

    const afterBack = await currentTimeLabel(page);
    await page.getByTestId('playback-step-forward').click();
    await expect.poll(() => currentTimeLabel(page)).not.toBe(afterBack);
  });

  test('keyboard shortcuts: arrows step, space toggles playback', async ({ page }) => {
    await gotoMapFresh(page);
    await waitForLiveTerritories(page);
    await switchToHistory(page);

    const before = await currentTimeLabel(page);
    await page.keyboard.press('ArrowLeft');
    await expect.poll(() => currentTimeLabel(page)).not.toBe(before);

    // Space starts playback (button title flips to Pause), space again stops it
    await page.keyboard.press(' ');
    await expect(page.getByTestId('playback-play')).toHaveAttribute('title', /Pause/);
    await page.keyboard.press(' ');
    await expect(page.getByTestId('playback-play')).toHaveAttribute('title', /Play/);
  });

  test('scrubbing the timeline track changes the current time', async ({ page }) => {
    await gotoMapFresh(page);
    await waitForLiveTerritories(page);
    await switchToHistory(page);

    const track = page.locator('[data-timeline-track]');
    await expect(track).toBeVisible();
    const box = (await track.boundingBox())!;

    // Pick a target ~60 days before the latest data, shifted out of any
    // logging gap — not required for the click to register anymore, but
    // landing outside gaps keeps the asserted territory state deterministic
    const bounds = await (await page.request.get('/api/map-history/bounds')).json();
    const earliest = new Date(bounds.earliest).getTime();
    const latest = new Date(bounds.latest).getTime();
    let target = latest - 60 * 24 * 60 * 60 * 1000;
    const gaps: Array<{ start: string; end: string }> = bounds.gaps ?? [];
    for (const gap of gaps) {
      const gs = new Date(gap.start).getTime();
      const ge = new Date(gap.end).getTime();
      if (target >= gs && target <= ge) target = ge + 24 * 60 * 60 * 1000;
    }
    const pct = (target - earliest) / (latest - earliest);
    // The track has 12px padding on each side; map the fraction to the usable width
    const x = 12 + pct * (box.width - 24);

    const before = await currentTimeLabel(page);
    await track.click({ position: { x, y: box.height / 2 } });
    await expect.poll(() => currentTimeLabel(page)).not.toBe(before);
  });

  test('right-clicking the track zooms to that season, reset returns to full range', async ({ page }) => {
    await gotoMapFresh(page);
    await waitForLiveTerritories(page);
    await switchToHistory(page);

    const track = page.locator('[data-timeline-track]');
    const box = (await track.boundingBox())!;

    // Right-click near the end of the track — always inside some season/off-season period
    await track.click({ button: 'right', position: { x: box.width * 0.9, y: box.height / 2 } });
    const resetButton = page.getByTestId('timeline-reset-zoom');
    await expect(resetButton).toBeVisible();

    await resetButton.click();
    await expect(resetButton).toHaveCount(0);
  });

  test('playback advances time and pauses again', async ({ page }) => {
    await gotoMapFresh(page);
    await waitForLiveTerritories(page);
    await switchToHistory(page);

    // Step back a few times so playback has room to advance
    for (let i = 0; i < 3; i++) await page.getByTestId('playback-step-back').click();

    const before = await currentTimeLabel(page);
    await page.getByTestId('playback-play').click();
    await expect.poll(() => currentTimeLabel(page), { timeout: 10_000 }).not.toBe(before);
    await page.getByTestId('playback-play').click(); // pause

    const paused = await currentTimeLabel(page);
    await page.waitForTimeout(1500);
    expect(await currentTimeLabel(page)).toBe(paused);
  });

  test('history mode persists across reloads and switching back to live works', async ({ page }) => {
    await gotoMapFresh(page);
    await waitForLiveTerritories(page);
    await switchToHistory(page);

    await page.reload();
    // Restored straight into history mode with the panel visible
    await expect(page.getByTestId('history-controls-panel')).toBeVisible({ timeout: 30_000 });

    // Switch back to live: panel goes away, live overlays come back
    await page.getByTestId('map-mode-live').click();
    await expect(page.getByTestId('history-controls-panel')).toHaveCount(0);
    await waitForLiveTerritories(page);
  });

  test('snapshot and events endpoints respond OK with expected shapes', async ({ page }) => {
    const boundsRes = await page.request.get('/api/map-history/bounds');
    expect(boundsRes.ok()).toBe(true);
    const bounds = await boundsRes.json();

    // Snapshot at the latest known time
    const snapRes = await page.request.get(
      `/api/map-history/snapshot?timestamp=${encodeURIComponent(bounds.latest)}`,
    );
    expect(snapRes.ok()).toBe(true);
    const snap = await snapRes.json();
    expect(Object.keys(snap.territories ?? {}).length).toBeGreaterThan(100);

    // A one-day event range ending at the latest time
    const end = new Date(bounds.latest).getTime();
    const start = end - 24 * 60 * 60 * 1000;
    const eventsRes = await page.request.get(
      `/api/map-history/events?start=${new Date(start).toISOString()}&end=${new Date(end).toISOString()}`,
    );
    expect(eventsRes.ok()).toBe(true);
    const events = await eventsRes.json();
    expect(Array.isArray(events.events)).toBe(true);
    expect(Array.isArray(events.territories)).toBe(true);
    expect(Array.isArray(events.initialState)).toBe(true);
    expect(eventsRes.headers()['server-timing']).toContain('total;dur=');
  });
});
