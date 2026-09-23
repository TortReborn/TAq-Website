/**
 * Every public write route counts against the shared (cross-instance) limiter,
 * and a request over the limit is turned away before the route does its real
 * work: no upstream fetch, no database, no image re-encode.
 *
 * Signed-in routes are keyed by Discord account and check sign-in first, so an
 * anonymous request is still a 401 and never spends anyone's budget; the one
 * anonymous route is keyed by client IP.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const limiter = vi.hoisted(() => ({
  allowed: true,
  calls: [] as Array<{ scope: string; client: string; limit: number }>,
}));
const touched = vi.hoisted(() => ({ db: 0, cache: 0 }));

vi.mock('@/lib/shared-rate-limit', () => ({
  clientIp: (request: NextRequest) => request.headers.get('x-forwarded-for') ?? 'unknown',
  consumeSharedRateLimit: async (scope: string, client: string, limit: number) => {
    limiter.calls.push({ scope, client, limit });
    return { allowed: limiter.allowed, count: limiter.allowed ? 1 : limit + 1, limit, resetTime: Date.now() + 60_000 };
  },
}));
vi.mock('@/lib/db', () => ({
  getPool: () => {
    touched.db++;
    throw new Error('database touched');
  },
}));
vi.mock('@/lib/db-cache-simple', () => ({
  default: {
    getGuildColors: async () => {
      touched.cache++;
      return null;
    },
    setGuildColors: async () => {},
  },
}));
vi.mock('@/lib/auth', () => ({ getSession: vi.fn(), clearSessionCookie: vi.fn() }));
vi.mock('@/lib/wiki-auth', () => ({ resolveWikiPrincipal: vi.fn() }));
vi.mock('@/lib/chronicle-gate', () => ({ canEnterChronicle: () => true }));
vi.mock('@/lib/wiki-db', () => ({
  countPendingWikiBy: vi.fn(),
  createWikiSubmission: vi.fn(),
  getWikiPage: vi.fn(),
  recordWikiImage: vi.fn(),
}));
vi.mock('@/lib/wiki-image-storage', () => ({ putWikiImage: vi.fn(), activeImageBackend: () => 's3' }));

const { getSession } = await import('@/lib/auth');
const { resolveWikiPrincipal } = await import('@/lib/wiki-auth');
const guildColors = await import('./guild-colors/route');
const applications = await import('./applications/route');
const wikiSuggest = await import('./wiki/suggest/route');
const wikiUpload = await import('./wiki/upload/route');

const ACCOUNT = '170719819715313665';
const IP = '203.0.113.9';

function post(path: string, body: unknown = {}): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', 'x-forwarded-for': IP },
  });
}

const signedIn = () => {
  vi.mocked(getSession).mockReturnValue({ discord_id: ACCOUNT } as never);
  vi.mocked(resolveWikiPrincipal).mockResolvedValue({ discordId: ACCOUNT, canPublish: false } as never);
};
const signedOut = () => {
  vi.mocked(getSession).mockReturnValue(null as never);
  vi.mocked(resolveWikiPrincipal).mockResolvedValue(null as never);
};

const fetchSpy = vi.spyOn(globalThis, 'fetch');

beforeEach(() => {
  limiter.allowed = true;
  limiter.calls = [];
  touched.db = 0;
  touched.cache = 0;
  fetchSpy.mockReset();
  fetchSpy.mockRejectedValue(new Error('upstream fetched'));
});

const signedInRoutes = [
  { name: 'applications', scope: 'applications', path: '/api/applications', POST: applications.POST },
  { name: 'wiki suggest', scope: 'wiki-suggest', path: '/api/wiki/suggest', POST: wikiSuggest.POST },
  { name: 'wiki upload', scope: 'wiki-upload', path: '/api/wiki/upload', POST: wikiUpload.POST },
];

describe.each(signedInRoutes)('$name', ({ scope, path, POST }) => {
  it('turns an account over the limit away before any real work', async () => {
    signedIn();
    limiter.allowed = false;
    const res = await POST(post(path));
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBeTruthy();
    expect(limiter.calls).toEqual([{ scope, client: `discord:${ACCOUNT}`, limit: expect.any(Number) }]);
    expect(touched.db).toBe(0);
  });

  it('still answers an anonymous request with 401, spending no budget', async () => {
    signedOut();
    const res = await POST(post(path));
    expect(res.status).toBe(401);
    expect(limiter.calls).toEqual([]);
  });

  it('lets an account under the limit through to the route', async () => {
    signedIn();
    const res = await POST(post(path));
    expect(res.status).not.toBe(429);
    expect(limiter.calls).toHaveLength(1);
  });
});

describe('guild colors (anonymous)', () => {
  it('turns a client over the limit away before the cache or the upstream fetch', async () => {
    limiter.allowed = false;
    const res = await guildColors.POST(post('/api/guild-colors', { guildNames: ['No Such Guild'] }));
    expect(res.status).toBe(429);
    expect(limiter.calls).toEqual([{ scope: 'guild-colors', client: IP, limit: expect.any(Number) }]);
    expect(touched.cache).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('lets a client under the limit through to the route', async () => {
    const res = await guildColors.POST(post('/api/guild-colors', { guildNames: ['No Such Guild'] }));
    expect(res.status).not.toBe(429);
    expect(touched.cache).toBe(1);
  });
});
