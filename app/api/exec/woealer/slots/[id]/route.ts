import { NextRequest, NextResponse } from 'next/server';
import { requireNarwhalSession } from '@/lib/exec-auth';
import { getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireNarwhalSession(request);
  if (!session) return NextResponse.json({ error: 'Narwhal access required.' }, { status: 403 });

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid Woealer slot.' }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  const label = typeof body.label === 'string' && body.label.trim() ? body.label.trim() : null;
  if (!label) {
    return NextResponse.json({ error: 'A slot label is required.' }, { status: 400 });
  }

  try {
    const result = await getPool().query(
      `UPDATE woealer_slots
       SET label = $1, contents = $2, updated_at = NOW(), updated_by = $3
       WHERE id = $4`,
      [label, typeof body.contents === 'string' ? body.contents.trim() : '', session.ign, id]
    );
    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Slot not found.' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Woealer slot update error:', error);
    return NextResponse.json({ error: 'Failed to update the slot.' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireNarwhalSession(request);
  if (!session) return NextResponse.json({ error: 'Narwhal access required.' }, { status: 403 });

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid Woealer slot.' }, { status: 400 });
  }

  try {
    const result = await getPool().query(`DELETE FROM woealer_slots WHERE id = $1`, [id]);
    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Slot not found.' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Woealer slot delete error:', error);
    return NextResponse.json({ error: 'Failed to delete the slot.' }, { status: 500 });
  }
}
