/**
 * Every public write route counts against the shared (cross-instance) limiter,
 * and a request over the limit is turned away before the route does its real
 * work: no database, no image re-encode.
 *
 * The routes are keyed by Discord account and check sign-in first, so an
 * anonymous request is still a 401 and never spends anyone's budget.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const limiter = vi.hoisted(() => ({
  allowed: true,
  calls: [] as Array<{ scope: string; client: string; limit: number }>,
}));
const touched = vi.hoisted(() => ({ db: 0 }));

vi.mock('@/lib/shared-rate-limit', () => ({
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
const applications = await import('./applications/route');
const wikiSuggest = await import('./wiki/suggest/route');
const wikiUpload = await import('./wiki/upload/route');

const ACCOUNT = '170719819715313665';

function post(path: string): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    body: '{}',
    headers: { 'content-type': 'application/json' },
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

beforeEach(() => {
  limiter.allowed = true;
  limiter.calls = [];
  touched.db = 0;
});

describe.each([
  { name: 'applications', scope: 'applications', path: '/api/applications', POST: applications.POST },
  { name: 'wiki suggest', scope: 'wiki-suggest', path: '/api/wiki/suggest', POST: wikiSuggest.POST },
  { name: 'wiki upload', scope: 'wiki-upload', path: '/api/wiki/upload', POST: wikiUpload.POST },
])('$name', ({ scope, path, POST }) => {
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
