import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  createPanel: vi.fn(), createRevision: vi.fn(), getPanel: vi.fn(), getPanelTemplate: vi.fn(), getRegistry: vi.fn(),
  getTemplateTest: vi.fn(), listPanels: vi.fn(), messageOwner: vi.fn(), requestRegistryRefresh: vi.fn(),
  requestTemplateTest: vi.fn(), setPanelArchived: vi.fn(),
}));
const { requireExecSession } = vi.hoisted(() => ({ requireExecSession: vi.fn() }));

vi.mock('@/lib/bot-panels-db', () => ({
  ...db,
  PanelArchived: class extends Error {},
  RevisionConflict: class extends Error {},
}));
vi.mock('@/lib/panel-values-db', () => ({ getPanelValues: vi.fn(async () => ({})) }));
vi.mock('@/lib/s3', () => ({ getS3: vi.fn() }));
vi.mock('@/lib/exec-auth', () => {
  const narwhal = ['Narwhal', 'Hydra', '✫✪✫ Hydra - Leader'];
  const isNarwhalRank = (rank?: string | null) => !!rank && narwhal.includes(rank);
  return {
    requireExecSession,
    isNarwhalRank,
    requireNarwhalSession: async (request: NextRequest) => {
      const session = await requireExecSession(request);
      return session && isNarwhalRank(session.rank) ? session : null;
    },
  };
});

import { GET as listGet, POST as createPost } from './route';
import { GET as panelGet, POST as revisionPost } from './[slug]/route';
import { POST as archivePost } from './[slug]/archive/route';
import { POST as testPost } from './[slug]/test/route';
import { POST as registryPost } from './registry/route';
import { POST as assetPost } from './assets/route';
import { POST as shellPublishPost } from '../shell-exchange/publish/route';

const slugParams = { params: Promise.resolve({ slug: 'guild-info' }) };
const shellPanel = {
  panel: { message_ids: ['123456789012345678'], channel_id: '223456789012345678' },
  latest: { rev_number: 4, content: { messages: [{ content: 'rates' }] }, channel_id: '323456789012345678' },
  revisions: [],
};

function request(body: unknown = {}) {
  return new NextRequest('http://localhost/api/exec/bot-panels', {
    method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
  });
}

function signedInAs(rank: string) {
  requireExecSession.mockResolvedValue({ discord_id: '1', discord_username: 'someone', ign: 'Someone', rank });
}

const writes: [string, () => Promise<Response>][] = [
  ['create a panel', () => createPost(request({ name: 'Rules' }))],
  ['publish a revision', () => revisionPost(request({ content: { messages: [{ content: 'hi' }] }, channel_id: '123456789012345678' }), slugParams)],
  ['archive a panel', () => archivePost(request({ archived: true }), slugParams)],
  ['send a template test', () => testPost(request({ content: { messages: [{ content: 'hi' }] } }), slugParams)],
  ['refresh the registry', () => registryPost(request())],
  ['upload an image', () => assetPost(request())],
];

beforeEach(() => {
  vi.resetAllMocks();
  db.listPanels.mockResolvedValue([]);
  db.getRegistry.mockResolvedValue(null);
  db.getPanel.mockResolvedValue({ panel: {}, latest: null, revisions: [] });
  db.getPanelTemplate.mockResolvedValue(null);
  db.createPanel.mockResolvedValue(true);
  db.createRevision.mockResolvedValue(5);
  db.setPanelArchived.mockResolvedValue('ok');
});

describe.each(['Hammerhead', 'Sailfish', 'Dolphin'])('%s', rank => {
  beforeEach(() => signedInAs(rank));

  it.each(writes)('cannot %s', async (_name, write) => {
    expect((await write()).status).toBe(403);
    for (const fn of [db.createPanel, db.createRevision, db.setPanelArchived, db.requestTemplateTest, db.requestRegistryRefresh]) {
      expect(fn).not.toHaveBeenCalled();
    }
  });

  it('can read, marked as not editable', async () => {
    const list = await listGet(request());
    expect(list.status).toBe(200);
    expect((await list.json()).can_edit).toBe(false);

    const panel = await panelGet(request(), slugParams);
    expect(panel.status).toBe(200);
    expect((await panel.json()).can_edit).toBe(false);
  });

  it('can republish the shell exchange, with the stored content only', async () => {
    db.getPanel.mockResolvedValue(shellPanel);
    const res = await shellPublishPost(request({ content: { messages: [{ content: 'not this' }] } }));
    expect(res.status).toBe(201);
    expect(db.createRevision).toHaveBeenCalledWith('shell-exchange', expect.objectContaining({
      content: shellPanel.latest.content, channelId: shellPanel.latest.channel_id, baseRev: 4, force: false, adoptMessageIds: null,
    }));
  });
});

describe.each(['Narwhal', 'Hydra', '✫✪✫ Hydra - Leader'])('%s', rank => {
  beforeEach(() => {
    signedInAs(rank);
    db.getPanelTemplate.mockResolvedValue('welcome_dm'); // only a template takes a test send
  });

  it.each(writes.filter(([name]) => name !== 'upload an image'))('can %s', async (_name, write) => {
    expect((await write()).status).toBeLessThan(300);
  });

  it('can get past the upload gate', async () => {
    // The empty JSON body isn't multipart, so reaching the parser is the proof.
    expect((await assetPost(request())).status).toBe(400);
  });

  it('reads as editable', async () => {
    expect((await (await listGet(request())).json()).can_edit).toBe(true);
    expect((await (await panelGet(request(), slugParams)).json()).can_edit).toBe(true);
  });
});

describe('without an exec session', () => {
  beforeEach(() => requireExecSession.mockResolvedValue(null));

  it('nothing is readable or writable', async () => {
    expect((await listGet(request())).status).toBe(401);
    expect((await panelGet(request(), slugParams)).status).toBe(401);
    expect((await shellPublishPost(request())).status).toBe(401);
    for (const [, write] of writes) expect((await write()).status).toBe(403);
  });
});

describe('shell exchange republish', () => {
  beforeEach(() => signedInAs('Hammerhead'));

  it('does nothing for a panel that was never posted', async () => {
    db.getPanel.mockResolvedValue({ ...shellPanel, panel: { message_ids: [], channel_id: null } });
    const res = await shellPublishPost(request());
    expect(await res.json()).toEqual({ rev_number: null });
    expect(db.createRevision).not.toHaveBeenCalled();
  });

  it('refuses a panel with no content', async () => {
    db.getPanel.mockResolvedValue({ ...shellPanel, latest: null });
    expect((await shellPublishPost(request())).status).toBe(400);
  });
});
