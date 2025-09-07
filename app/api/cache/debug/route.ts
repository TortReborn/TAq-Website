import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

export async function GET() {
  const client = await getPool().connect();
  
  try {
    // Query all cache entries to see what's actually there
    const result = await client.query(`
      SELECT 
        cache_key,
        created_at,
        expires_at,
        expires_at > NOW() as is_fresh,
        EXTRACT(EPOCH FROM created_at) * 1000 as timestamp_ms,
        EXTRACT(EPOCH FROM expires_at) * 1000 as expires_at_ms,
        NOW() as current_db_time,
        EXTRACT(EPOCH FROM NOW()) * 1000 as current_db_time_ms,
        fetch_count,
        error_count,
        last_error,
        LENGTH(data::text) as data_length
      FROM cache_entries
      ORDER BY cache_key
    `);

    const currentJsTime = Date.now();
    const currentJsDate = new Date().toISOString();

    return NextResponse.json({
      message: 'Detailed timestamp debug info',
      currentJavaScriptTime: currentJsTime,
      currentJavaScriptDate: currentJsDate,
      totalRows: result.rows.length,
      entries: result.rows.map(row => ({
        cache_key: row.cache_key,
        created_at_raw: row.created_at,
        expires_at_raw: row.expires_at,
        current_db_time_raw: row.current_db_time,
        timestamp_ms: parseInt(row.timestamp_ms),
        expires_at_ms: parseInt(row.expires_at_ms),
        current_db_time_ms: parseInt(row.current_db_time_ms),
        is_fresh: row.is_fresh,
        age_seconds: Math.floor((currentJsTime - parseInt(row.timestamp_ms)) / 1000),
        age_minutes: Math.floor((currentJsTime - parseInt(row.timestamp_ms)) / 60000),
        db_js_time_diff_ms: currentJsTime - parseInt(row.current_db_time_ms),
        fetch_count: row.fetch_count,
        error_count: row.error_count,
        last_error: row.last_error,
        data_length: row.data_length
      }))
    });

  } catch (error) {
    console.error('Error in debug:', error);
    
    return NextResponse.json(
      { 
        error: 'Database error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
