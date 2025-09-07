import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

export async function DELETE() {
  const client = await getPool().connect();
  
  try {
    // Clear all cache entries
    const result = await client.query('DELETE FROM cache_entries');
    
    console.log(`🗑️ Cleared ${result.rowCount} cache entries`);
    
    return NextResponse.json({
      success: true,
      message: `Cleared ${result.rowCount} cache entries`,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('Error clearing cache:', error);
    
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to clear cache',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

export async function POST() {
  // Just an alias for DELETE for easier testing
  return DELETE();
}
