/**
 * Every public write route counts against the shared (cross-instance) limiter,
 * and a request over the limit is turned away before the route does its real
 * work: no database, no image re-encode. The 429 advertises the limit that
 * actually refused it.
 *
 * The routes are keyed by Discord account, and whoever may not use a route is
 * turned away before the limiter, spending nobody's budget. The Chronicle gate
 * is the real one: while CHRONICLE_RESTRICTED is on, the wiki routes answer 404
 * to anyone who can't review, signed in or not.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { CHRONICLE_RESTRICTED } from '@/lib/chronicle-gate';

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

function principal(canReview: boolean) {
  return {
    discordId: ACCOUNT,
    name: 'Player',
    isExec: false,
    isChronicler: canReview,
    isGuildMember: true,
    canPublish: false,
    canReview,
  };
}

/** Someone the route lets through to the limiter: any Discord session for
 *  applications, a reviewer for the (restricted) wiki. */
const allowedIn = () => {
  vi.mocked(getSession).mockReturnValue({ discord_id: ACCOUNT } as never);
  vi.mocked(resolveWikiPrincipal).mockResolvedValue(principal(true) as never);
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

const ROUTES = [
  { name: 'applications', scope: 'applications', limit: 10, path: '/api/applications', POST: applications.POST, anonymous: 401 },
  { name: 'wiki suggest', scope: 'wiki-suggest', limit: 10, path: '/api/wiki/suggest', POST: wikiSuggest.POST, anonymous: CHRONICLE_RESTRICTED ? 404 : 401 },
  { name: 'wiki upload', scope: 'wiki-upload', limit: 15, path: '/api/wiki/upload', POST: wikiUpload.POST, anonymous: CHRONICLE_RESTRICTED ? 404 : 401 },
];

describe.each(ROUTES)('$name', ({ scope, limit, path, POST, anonymous }) => {
  it(`turns an account over ${limit}/min away before any real work, advertising ${limit}`, async () => {
    allowedIn();
    limiter.allowed = false;
    const res = await POST(post(path));
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBeTruthy();
    expect(res.headers.get('X-RateLimit-Limit')).toBe(String(limit));
    expect(limiter.calls).toEqual([{ scope, client: `discord:${ACCOUNT}`, limit }]);
    expect(touched.db).toBe(0);
  });

  it(`answers an anonymous request with ${anonymous}, spending no budget`, async () => {
    signedOut();
    const res = await POST(post(path));
    expect(res.status).toBe(anonymous);
    expect(limiter.calls).toEqual([]);
  });

  it('lets an account under the limit through to the route', async () => {
    allowedIn();
    const res = await POST(post(path));
    expect(res.status).not.toBe(429);
    expect(limiter.calls).toHaveLength(1);
  });
});

describe.runIf(CHRONICLE_RESTRICTED).each(ROUTES.filter((r) => r.path.startsWith('/api/wiki/')))(
  '$name while the Chronicle is restricted',
  ({ path, POST }) => {
    it('hides the route from a signed-in non-reviewer before the limiter', async () => {
      vi.mocked(resolveWikiPrincipal).mockResolvedValue(principal(false) as never);
      const res = await POST(post(path));
      expect(res.status).toBe(404);
      expect(limiter.calls).toEqual([]);
    });
  },
);
