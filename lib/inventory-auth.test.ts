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

describe('choosing the verifying service', () => {
  const tokenFrom = (claims: unknown) => `e30.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;
  const OLD_SESSION = 'https://taq-management-api-production.up.railway.app/api/inventory/session';
  const VERGE_SESSION = 'https://verge-api-production-aead.up.railway.app/v1/inventory/session';

  it.each([
    ['a Verge token', tokenFrom({ iss: 'verge-api' }), VERGE_SESSION],
    ['an old service token', tokenFrom({ iss: 'taq-management-api' }), OLD_SESSION],
    ['an unknown issuer', tokenFrom({ iss: 'someone-else' }), OLD_SESSION],
    ['no issuer', tokenFrom({}), OLD_SESSION],
    ['a null payload', tokenFrom(null), OLD_SESSION],
    ['an unreadable payload', 'test.payload.signature', OLD_SESSION],
  ])('sends %s to the right service', async (_, token, url) => {
    const fetch = vi.fn().mockResolvedValue(Response.json(identity)); vi.stubGlobal('fetch', fetch);
    await authorizeInventoryClient(request(token), 'read');
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0][0]).toBe(url);
  });
  it('forwards the token unchanged', async () => {
    const token = tokenFrom({ iss: 'verge-api' });
    const fetch = vi.fn().mockResolvedValue(Response.json(identity)); vi.stubGlobal('fetch', fetch);
    await authorizeInventoryClient(request(token), 'read');
    expect(fetch.mock.calls[0][1].headers).toEqual({ Authorization: `Bearer ${token}` });
  });
  it.each([401, 403])('grants nothing to a claimed Verge issuer that the service refuses with %i', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status })));
    await expect(authorizeInventoryClient(request(tokenFrom({ iss: 'verge-api' })), 'read')).rejects.toMatchObject({ status });
  });
});
