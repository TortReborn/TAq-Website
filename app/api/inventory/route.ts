import { NextRequest } from 'next/server';
import { handleInventoryUpload } from '@/lib/inventory-upload';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  return handleInventoryUpload(request);
}
