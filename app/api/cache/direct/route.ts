import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

export async function GET() {
  const client = await getPool().connect();
  
  try {
    // Query the cache_entries table directly
    const result = await client.query(`
      SELECT 
        cache_key,
        EXTRACT(EPOCH FROM created_at) * 1000 as timestamp,
        EXTRACT(EPOCH FROM expires_at) * 1000 as expires_at,
        expires_at > NOW() as is_fresh,
        fetch_count,
        error_count,
        last_error,
        data
      FROM cache_entries
      WHERE cache_key IN ('territories', 'guildData', 'lootpoolData', 'aspectData')
      ORDER BY cache_key
    `);

    const status: Record<string, any> = {};
    
    // Process existing cache entries
    for (const row of result.rows) {
      status[row.cache_key] = {
        cached: true,
        timestamp: Math.floor(row.timestamp),
        expiresAt: Math.floor(row.expires_at),
        expired: !row.is_fresh,
        fetchCount: row.fetch_count || 0,
        errorCount: row.error_count || 0,
        lastError: row.last_error,
        dataSize: JSON.stringify(row.data).length
      };
    }

    // Add missing keys as not cached
    const expectedKeys = ['territories', 'guildData', 'lootpoolData', 'aspectData'];
    for (const key of expectedKeys) {
      if (!status[key]) {
        status[key] = {
          cached: false,
          timestamp: null,
          expiresAt: null,
          expired: null,
          fetchCount: 0,
          errorCount: 0,
          lastError: null,
          dataSize: 0
        };
      }
    }

    // Get table statistics
    const statsResult = await client.query(`
      SELECT 
        COUNT(*) as total_entries,
        COUNT(CASE WHEN expires_at > NOW() THEN 1 END) as fresh_entries,
        COUNT(CASE WHEN expires_at <= NOW() THEN 1 END) as expired_entries,
        MAX(created_at) as last_update
      FROM cache_entries
    `);

    const stats = statsResult.rows[0];

    return NextResponse.json({
      status: 'healthy',
      cache: status,
      timestamp: Date.now(),
      source: 'PostgreSQL-Direct',
      statistics: {
        totalEntries: parseInt(stats.total_entries),
        freshEntries: parseInt(stats.fresh_entries),
        expiredEntries: parseInt(stats.expired_entries),
        lastUpdate: stats.last_update
      }
    });

  } catch (error) {
    console.error('Error getting direct cache status:', error);
    
    return NextResponse.json(
      { 
        status: 'error',
        error: 'Failed to get cache status from database',
        timestamp: Date.now(),
        source: 'PostgreSQL-Direct'
      },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
