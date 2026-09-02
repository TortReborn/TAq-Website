import { test, expect } from '@playwright/test';
import { gotoMapFresh, waitForLiveTerritories } from './helpers';

/**
 * Performance budgets — generous enough for dev-server noise, tight enough to
 * catch regressions like an oversized map image or a blocking data path.
 */
test.describe('map page — performance budgets', () => {
  test('map image assets stay within size budgets', async ({ page }) => {
    const preview = await page.request.get('/images/map/fruma_map.preview.webp');
    expect(preview.ok()).toBe(true);
    expect((await preview.body()).length).toBeLessThan(500 * 1024);

    const full = await page.request.get('/images/map/fruma_map.v3.webp');
    expect(full.ok()).toBe(true);
    expect((await full.body()).length).toBeLessThan(6 * 1024 * 1024);
  });

  test('cold load renders the map and territories within budget', async ({ page }) => {
    await gotoMapFresh(page);

    const start = Date.now();
    await page.reload();
    // The low-res placeholder must paint the map long before the full image
    await expect(page.locator('img[src*="fruma_map.preview"]')).toBeVisible({ timeout: 5_000 });
    await waitForLiveTerritories(page);
    const elapsed = Date.now() - start;

    console.log(`cold map load → territories in ${elapsed}ms`);
    expect(elapsed).toBeLessThan(8_000);
  });
});
