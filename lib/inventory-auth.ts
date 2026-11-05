import { NextRequest } from 'next/server';

const MANAGEMENT_API = 'https://taq-management-api-production.up.railway.app';

export class InventoryAuthError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export async function authorizeInventoryClient(request: NextRequest, permission: 'read' | 'upload') {
  const authorization = request.headers.get('authorization') ?? '';
  if (!/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(authorization)) {
    throw new InventoryAuthError(401, 'Minecraft verification required.');
  }
  let response: Response;
  try {
    response = await fetch(`${MANAGEMENT_API}/api/inventory/session`, {
      headers: { Authorization: authorization }, cache: 'no-store', signal: AbortSignal.timeout(5000),
      redirect: 'error',
    });
  } catch {
    throw new InventoryAuthError(503, 'Inventory verification is unavailable.');
  }
  if (response.status === 401 || response.status === 403) {
    throw new InventoryAuthError(response.status, 'Inventory access required.');
  }
  if (!response.ok) throw new InventoryAuthError(503, 'Inventory verification is unavailable.');
  let session: unknown;
  try { session = await response.json(); } catch {
    throw new InventoryAuthError(503, 'Inventory verification is unavailable.');
  }
  if (!session || typeof session !== 'object') throw new InventoryAuthError(503, 'Invalid inventory session.');
  const identity = session as Record<string, unknown>;
  if (typeof identity.minecraftUuid !== 'string' || !/^[0-9a-f-]{36}$/i.test(identity.minecraftUuid)
    || typeof identity.minecraftName !== 'string' || !/^[A-Za-z0-9_]{2,16}$/.test(identity.minecraftName)) {
    throw new InventoryAuthError(503, 'Invalid inventory session.');
  }
  if (identity.canRead !== true || permission === 'upload' && identity.canUpload !== true) {
    throw new InventoryAuthError(403, 'Inventory access required.');
  }
  return { uuid: identity.minecraftUuid, name: identity.minecraftName };
}
