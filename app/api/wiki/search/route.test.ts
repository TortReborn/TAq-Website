import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ principal: vi.fn(), search: vi.fn(), enter: vi.fn() }));

vi.mock('@/lib/db', () => ({ getPool: () => ({}) }));
vi.mock('@/lib/wiki-db', () => ({ searchWikiPages: mocks.search }));
vi.mock('@/lib/wiki-auth', () => ({ resolveWikiPrincipal: mocks.principal }));
vi.mock('@/lib/chronicle-gate', () => ({ canEnterChronicle: mocks.enter }));

import { GET } from './route';
import { REDACTED_IDENTITIES } from '@/lib/wiki-redaction';

const NAME = REDACTED_IDENTITIES[0].names[0];
const ALIAS = REDACTED_IDENTITIES[0].alias;

const search = (q: string) => GET(new NextRequest(`https://example.test/api/wiki/search?q=${encodeURIComponent(q)}`));
const rows = [{ slug: 'kingdom-foxes', title: 'Kingdom Foxes', summary: `Led by ${NAME}` }];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.enter.mockReturnValue(true);
  mocks.principal.mockResolvedValue({ canReview: false });
  mocks.search.mockResolvedValue(rows);
});

describe('wiki search', () => {
  it('finds nothing for a reader searching a redacted name', async () => {
    const { results } = await (await search(NAME)).json();
    expect(results).toEqual([]);
  });

  it('redacts an ordinary search for that reader', async () => {
    const { results } = await (await search('foxes')).json();
    expect(results[0].summary).toBe(`Led by ${ALIAS}`);
  });

  it('shows a reviewer the record as written', async () => {
    mocks.principal.mockResolvedValue({ canReview: true });
    const { results } = await (await search(NAME)).json();
    expect(results).toEqual(rows);
  });

  it('stays closed to anyone the gate turns away', async () => {
    mocks.enter.mockReturnValue(false);
    expect((await search('foxes')).status).toBe(404);
    expect(mocks.search).not.toHaveBeenCalled();
  });
});
