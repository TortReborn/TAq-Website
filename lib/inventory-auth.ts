import { NextRequest } from 'next/server';
import { authorizeManagementClient } from '@/lib/management-client-auth';

export { ManagementClientAuthError as InventoryAuthError } from '@/lib/management-client-auth';

export function authorizeInventoryClient(request: NextRequest, permission: 'read' | 'upload') {
  return authorizeManagementClient(request, 'inventory', permission === 'upload' ? 'canUpload' : 'canRead');
}
