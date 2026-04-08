import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
export async function GET() { return NextResponse.json({ error: 'Moved to /api/exec/guild-raids' }, { status: 301 }); }
export async function DELETE() { return NextResponse.json({ error: 'Moved to /api/exec/guild-raids' }, { status: 301 }); }
