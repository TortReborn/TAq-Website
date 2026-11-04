import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { requireExecSession } from '@/lib/exec-auth';
import { getS3 } from '@/lib/s3';
import { isScreenshotKey, screenshotKey } from '@/lib/tomes';

export const dynamic = 'force-dynamic';

const TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };
const CONTENT_TYPES = Object.fromEntries(Object.entries(TYPES).map(([type, ext]) => [ext, type]));
// The client compresses before sending, one file per request, so the
// platform's 4.5 MB body cap holds.
const MAX_FILE_SIZE = 4 * 1024 * 1024;

// POST (form: file) — store one screenshot; a give then passes on its key
export async function POST(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const file = (await request.formData()).get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    const ext = TYPES[file.type];
    if (!ext) return NextResponse.json({ error: `"${file.name}" isn't an image. Use PNG, JPEG, GIF or WebP.` }, { status: 400 });
    if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: `"${file.name}" is over 4 MB` }, { status: 400 });

    const key = screenshotKey(randomUUID(), ext);
    const { client, bucket } = getS3();
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: Buffer.from(await file.arrayBuffer()), ContentType: file.type }));
    return NextResponse.json({ key });
  } catch (error) {
    console.error('Tome screenshot upload error:', error);
    return NextResponse.json({ error: 'Failed to upload the screenshot' }, { status: 500 });
  }
}

// GET ?key= — screenshots are only ever served through here, behind exec auth
export async function GET(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const key = request.nextUrl.searchParams.get('key');
  if (!isScreenshotKey(key)) return NextResponse.json({ error: 'Not a tome screenshot' }, { status: 400 });
  try {
    const { client, bucket } = getS3();
    const resp = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const bytes = await resp.Body?.transformToByteArray();
    if (!bytes) return NextResponse.json({ error: 'Failed to read the screenshot' }, { status: 500 });
    return new NextResponse(new Uint8Array(bytes), {
      headers: { 'Content-Type': CONTENT_TYPES[key.split('.').pop()!], 'Cache-Control': 'private, max-age=3600' },
    });
  } catch (error) {
    console.error('Tome screenshot fetch error:', error);
    return NextResponse.json({ error: 'Screenshot not found' }, { status: 404 });
  }
}
