import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const pool = vi.hoisted(() => ({ connect: vi.fn() }));
vi.mock('@/lib/db', () => ({ getPool: () => pool }));
import { handleInventoryUpload } from './inventory-upload';

beforeEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });
const request = (token: string) => new NextRequest('https://example.test/api/inventory/sources', {
  method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ scanType: 'account_bank', consumables: { Example: 12 } }),
});
describe('inventory upload boundary', () => {
  it('rejects the old account-name token before opening a database connection', async () => {
    const response = await handleInventoryUpload(request('Woealer'));
    expect(response.status).toBe(401);
    expect(pool.connect).not.toHaveBeenCalled();
  });
  it('rejects authenticated readers without touching stock', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
      minecraftUuid: '12345678-1234-1234-1234-123456789abc', minecraftName: 'Chief', canRead: true, canUpload: false,
    })));
    expect((await handleInventoryUpload(request('test.payload.signature'))).status).toBe(403);
    expect(pool.connect).not.toHaveBeenCalled();
  });
  it('keeps stock unchanged when verification is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect((await handleInventoryUpload(request('test.payload.signature'))).status).toBe(503);
    expect(pool.connect).not.toHaveBeenCalled();
  });
});
