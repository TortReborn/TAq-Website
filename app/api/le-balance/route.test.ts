import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const database = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('@/lib/db', () => ({ getPool: () => database }));
import { GET, POST } from './route';

const identity = { minecraftUuid: '12345678-1234-1234-1234-123456789abc', minecraftName: 'VerifiedAccount', canRead: true, canWrite: true };
const body = { balance: 128, previous_balance: 64, action: '+1 stx', reason: 'Example', author: 'Operator', updated_by: 'Impostor' };
function request(method: 'GET' | 'POST', token = 'test.payload.signature') {
  return new NextRequest('https://example.test/api/le-balance', { method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
  });
}
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('LE_BALANCE_DISCORD_WEBHOOK_URL', ''); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('LE balance verification boundary', () => {
  it.each(['GET', 'POST'] as const)('rejects username-only %s before accessing balances', async (method) => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const response = await (method === 'GET' ? GET : POST)(request(method, 'GordLonner'));
    expect(response.status).toBe(401);
    expect(database.query).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([401, 403, 500, 503])('fails closed on verification status %i', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response('', { status })));
    for (const method of ['GET', 'POST'] as const) {
      expect((await (method === 'GET' ? GET : POST)(request(method))).status).toBe(status < 500 ? status : 503);
    }
    expect(database.query).not.toHaveBeenCalled();
  });
  it.each([null, {}, { ...identity, minecraftUuid: 'bad' }, { ...identity, canRead: 'true' }, { ...identity, canRead: false }])('rejects malformed or unauthorized identity %j', async (session) => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => Response.json(session)));
    expect((await GET(request('GET'))).status).toBeGreaterThanOrEqual(400);
    expect((await POST(request('POST'))).status).toBeGreaterThanOrEqual(400);
    expect(database.query).not.toHaveBeenCalled();
  });
  it('rejects writes when only read access is granted', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ...identity, canWrite: false })));
    expect((await POST(request('POST'))).status).toBe(403);
    expect(database.query).not.toHaveBeenCalled();
  });
  it('rejects a scanner response without LE write permission', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ...identity, canWrite: undefined, canUpload: true })));
    expect((await POST(request('POST'))).status).toBe(403);
    expect(database.query).not.toHaveBeenCalled();
  });
  it('blocks reads and writes on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect((await GET(request('GET'))).status).toBe(503);
    expect((await POST(request('POST'))).status).toBe(503);
    expect(database.query).not.toHaveBeenCalled();
  });
  it('reads the latest balance with a verified session and no shared caching', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json(identity)); vi.stubGlobal('fetch', fetch);
    database.query.mockResolvedValue({ rows: [{ balance: 128, created_at: '2026-01-01T00:00:00Z' }] });
    const response = await GET(request('GET'));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, balance: 128 });
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/le-balance/session'), expect.objectContaining({ cache: 'no-store', redirect: 'error' }));
  });
  it('records the verified account rather than a submitted identity claim', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(identity)));
    database.query.mockResolvedValue({ rows: [{ id: 1, created_at: '2026-01-01T00:00:00Z' }] });
    const response = await POST(request('POST'));
    expect(response.status).toBe(200);
    expect(database.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO le_balance_log'), [128, 64, '+1 stx', 'Example', 'VerifiedAccount', 'Operator']);
  });
});
