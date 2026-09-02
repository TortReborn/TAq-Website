import { test, expect } from '@playwright/test';
import { captureConsole, gotoMapFresh, waitForLiveTerritories } from './helpers';

test.describe('map page — chronicle layer', () => {
  test('chronicle API returns the approved dataset shape', async ({ page }) => {
    const res = await page.request.get('/api/chronicle');
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(Array.isArray(data.alliances)).toBe(true);
    expect(Array.isArray(data.events)).toBe(true);
  });

  test('submissions require a signed-in guild account', async ({ page }) => {
    const res = await page.request.post('/api/chronicle/submit', {
      data: { kind: 'event', targetId: null, payload: {}, note: '' },
    });
    expect(res.status()).toBe(401);
  });

  test('review queue is exec-gated', async ({ page }) => {
    const res = await page.request.get('/api/chronicle/review');
    expect(res.status()).toBe(401);
  });

  test('direct admin edits are exec-gated', async ({ page }) => {
    const res = await page.request.post('/api/chronicle/admin', {
      data: { kind: 'event', targetId: null, payload: {}, note: '' },
    });
    expect(res.status()).toBe(401);
  });

  test('direct admin deletes are exec-gated', async ({ page }) => {
    const res = await page.request.delete('/api/chronicle/admin', {
      data: { kind: 'event', targetId: 1 },
    });
    expect(res.status()).toBe(401);
  });

  test('toggle opens the panel with the sign-in hint for anonymous visitors', async ({ page }) => {
    const consoleCapture = captureConsole(page);
    await gotoMapFresh(page);
    await waitForLiveTerritories(page);

    await page.getByTestId('chronicle-toggle').click();
    await expect(page.getByTestId('chronicle-panel')).toBeVisible();
    await expect(page.getByTestId('chronicle-panel')).toContainText('Chronicle');
    // Anonymous visitors are invited to sign in rather than shown submit buttons
    await expect(page.getByTestId('chronicle-panel')).toContainText('Sign in');

    // Toggle off hides it again
    await page.getByTestId('chronicle-toggle').click();
    await expect(page.getByTestId('chronicle-panel')).toHaveCount(0);

    expect(consoleCapture.errors, consoleCapture.errors.join('\n')).toEqual([]);
  });
});
