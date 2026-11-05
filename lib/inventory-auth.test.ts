import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { authorizeInventoryClient } from './inventory-auth';

const identity = { minecraftUuid: '12345678-1234-1234-1234-123456789abc', minecraftName: 'Scanner', canRead: true, canUpload: true };
const request = (token = 'test.payload.signature') => new NextRequest('https://example.test/api/inventory', {
  headers: { Authorization: `Bearer ${token}` },
});
afterEach(() => vi.unstubAllGlobals());

describe('inventory client verification', () => {
  it('rejects the old username bearer without contacting the service', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await expect(authorizeInventoryClient(request('Woealer'), 'upload')).rejects.toMatchObject({ status: 401 });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('uses verified identity and prevents shared caching', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json(identity)); vi.stubGlobal('fetch', fetch);
    await expect(authorizeInventoryClient(request(), 'upload')).resolves.toEqual({ uuid: identity.minecraftUuid, name: 'Scanner' });
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/inventory/session'), expect.objectContaining({ cache: 'no-store', redirect: 'error' }));
  });
  it('allows a reader to download but not upload', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => Response.json({ ...identity, canUpload: false })));
    await expect(authorizeInventoryClient(request(), 'read')).resolves.toMatchObject({ name: 'Scanner' });
    await expect(authorizeInventoryClient(request(), 'upload')).rejects.toMatchObject({ status: 403 });
  });
  it.each([401, 403, 500, 503])('fails closed on service status %i', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status })));
    await expect(authorizeInventoryClient(request(), 'upload')).rejects.toMatchObject({ status: status < 500 ? status : 503 });
  });
  it.each([null, {}, { ...identity, minecraftUuid: 'bad' }, { ...identity, canUpload: 'true' }])('rejects incomplete or malformed verification %j', async (body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body)));
    await expect(authorizeInventoryClient(request(), 'upload')).rejects.toBeInstanceOf(Error);
  });
  it('blocks uploads on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(authorizeInventoryClient(request(), 'upload')).rejects.toMatchObject({ status: 503 });
  });
});
