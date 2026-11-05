import { NextRequest } from 'next/server';

const MANAGEMENT_API = 'https://taq-management-api-production.up.railway.app';

export class ManagementClientAuthError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export async function authorizeManagementClient(request: NextRequest, service: 'inventory' | 'le-balance',
  permission: 'canRead' | 'canUpload' | 'canWrite') {
  const label = service === 'inventory' ? 'Inventory' : 'Guild balance';
  const authorization = request.headers.get('authorization') ?? '';
  if (!/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(authorization)) {
    throw new ManagementClientAuthError(401, 'Minecraft verification required.');
  }
  let response: Response;
  try {
    response = await fetch(`${MANAGEMENT_API}/api/${service}/session`, {
      headers: { Authorization: authorization }, cache: 'no-store', signal: AbortSignal.timeout(5000),
      redirect: 'error',
    });
  } catch {
    throw new ManagementClientAuthError(503, `${label} verification is unavailable.`);
  }
  if (response.status === 401 || response.status === 403) {
    throw new ManagementClientAuthError(response.status, `${label} access required.`);
  }
  if (!response.ok) throw new ManagementClientAuthError(503, `${label} verification is unavailable.`);
  let session: unknown;
  try { session = await response.json(); } catch {
    throw new ManagementClientAuthError(503, `${label} verification is unavailable.`);
  }
  if (!session || typeof session !== 'object') throw new ManagementClientAuthError(503, `Invalid ${label.toLowerCase()} session.`);
  const identity = session as Record<string, unknown>;
  if (typeof identity.minecraftUuid !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identity.minecraftUuid)
    || typeof identity.minecraftName !== 'string' || !/^[A-Za-z0-9_]{2,16}$/.test(identity.minecraftName)) {
    throw new ManagementClientAuthError(503, `Invalid ${label.toLowerCase()} session.`);
  }
  if (identity.canRead !== true || identity[permission] !== true) {
    throw new ManagementClientAuthError(403, `${label} access required.`);
  }
  return { uuid: identity.minecraftUuid, name: identity.minecraftName };
}
