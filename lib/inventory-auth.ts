import { NextRequest } from 'next/server';

// Shared bearer-token auth for the machine-to-machine inventory endpoints hit by the
// taq-management-utils Minecraft mod (upload + catalog fetch). This is intentionally
// separate from the human exec-session auth in lib/exec-auth.ts.

const ALLOWED_UPLOADER = 'woealer';

export function readBearer(request: NextRequest): string {
  const header = request.headers.get('authorization') ?? '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

export function isAuthorizedInventoryClient(request: NextRequest): boolean {
  return readBearer(request).toLocaleLowerCase('en-US') === ALLOWED_UPLOADER;
}
