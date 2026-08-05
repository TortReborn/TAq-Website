import { NextRequest } from 'next/server';

// Bearer-token auth for the mod's upload/catalog endpoints (separate from exec-auth.ts).

const ALLOWED_UPLOADER = 'woealer';

export function readBearer(request: NextRequest): string {
  const header = request.headers.get('authorization') ?? '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

export function isAuthorizedInventoryClient(request: NextRequest): boolean {
  return readBearer(request).toLocaleLowerCase('en-US') === ALLOWED_UPLOADER;
}
