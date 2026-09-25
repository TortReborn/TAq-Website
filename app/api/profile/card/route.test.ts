import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { requireGuildSession } = vi.hoisted(() => ({
  requireGuildSession: vi.fn(),
}));

vi.mock('@/lib/exec-auth', () => ({ requireGuildSession }));

import { GET } from './route';

const session = {
  discord_id: '1',
  discord_username: 'Tort',
  discord_avatar: '',
  uuid: '00000000-0000-0000-0000-000000000000',
  ign: 'Tort',
  rank: 'Starfish',
  role: 'member' as const,
  exp: 9999999999,
};

describe('profile card proxy', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('requires a guild session', async () => {
    requireGuildSession.mockResolvedValue(null);
    const response = await GET(new NextRequest('http://localhost/api/profile/card'));
    expect(response.status).toBe(401);
  });

  it('returns the PNG from Tort-API', async () => {
    requireGuildSession.mockResolvedValue(session);
    vi.stubEnv('TORT_API_URL', 'https://tort-api.example');
    vi.stubEnv('TORT_API_TOKEN', 'secret');
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'Content-Type': 'image/png' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(new NextRequest('http://localhost/api/profile/card?days=14'));

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(fetchMock).toHaveBeenCalledWith('https://tort-api.example/v1/cards/profile', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ player: session.uuid, days: 14 }),
      headers: expect.objectContaining({ Authorization: 'Bearer secret' }),
    }));
  });

  it('caps the requested period', async () => {
    requireGuildSession.mockResolvedValue(session);
    vi.stubEnv('TORT_API_URL', 'https://tort-api.example');
    vi.stubEnv('TORT_API_TOKEN', 'secret');
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Uint8Array([1]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await GET(new NextRequest('http://localhost/api/profile/card?days=99999'));

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ player: session.uuid, days: 3650 });
  });
});
