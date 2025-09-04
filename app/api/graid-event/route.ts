import { NextResponse } from 'next/server';
import { fetchActiveEvent, fetchMostRecentEvent } from '@/lib/graid';

export async function GET() {
  try {
    const { event, rows } = await fetchActiveEvent();
    let fallback = null;
    if (!event) {
      fallback = await fetchMostRecentEvent();
    }

    const showEvent = event || fallback?.event;
    const showRows = event ? rows : fallback?.rows || [];
    const isFallback = !event && !!fallback?.event;

    return NextResponse.json({
      event: showEvent,
      rows: showRows,
      isFallback
    });
  } catch (error) {
    console.error('Error fetching graid event data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch event data' },
      { status: 500 }
    );
  }
}
