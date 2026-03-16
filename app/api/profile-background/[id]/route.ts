import { NextRequest, NextResponse } from 'next/server';
import { getBackground } from '@/lib/background-cache';

export const dynamic = 'force-dynamic';

const RESPONSE_HEADERS = {
  'Content-Type': 'image/png',
  'Cache-Control': 'public, max-age=2592000, s-maxage=2592000',
};

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = params.id;

  // Validate: must be a positive integer
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: 'Invalid background ID' }, { status: 400 });
  }

  try {
    const entry = await getBackground(id);
    if (!entry) {
      return NextResponse.json({ error: 'Background not found' }, { status: 404 });
    }

    const ifNoneMatch = _request.headers.get('if-none-match');
    if (ifNoneMatch === entry.etag) {
      return new NextResponse(null, { status: 304, headers: { 'ETag': entry.etag } });
    }

    return new NextResponse(entry.bytes, {
      status: 200,
      headers: { ...RESPONSE_HEADERS, 'ETag': entry.etag },
    });
  } catch (error) {
    console.error('Background fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch background' }, { status: 500 });
  }
}
