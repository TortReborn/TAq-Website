import { getPool } from './db';

interface CacheEntry<T> {
  cache_key: string;
  data: T;
  created_at: Date;
  expires_at: Date;
}

// Helper function to check if TEST_MODE is enabled
function isTestMode(): boolean {
  const testMode = process.env.TEST_MODE;
  if (!testMode) return false;
  const s = testMode.toLowerCase().trim();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

class SimpleDatabaseCache {
  private pool = getPool();
  private initialized = false;
  private rateLimitMap = new Map<string, { count: number; resetTime: number }>();
  
  // Rate limiting configuration
  private readonly RATE_LIMITS = {
    default: { maxRequests: 100, windowMs: 60000 }, // 100 requests per minute
    territories: { maxRequests: 50, windowMs: 60000 }, // 50 requests per minute for territories
    members: { maxRequests: 30, windowMs: 60000 }, // 30 requests per minute for members
    aspects: { maxRequests: 30, windowMs: 60000 }, // 30 requests per minute for aspects
    lootpools: { maxRequests: 30, windowMs: 60000 }, // 30 requests per minute for lootpools
    guildColors: { maxRequests: 20, windowMs: 60000 }, // 20 requests per minute for guild colors
  };

  // Initialize cache table if it doesn't exist (only once)
  async initializeTable(): Promise<void> {
    if (this.initialized) {
      return; // Already initialized
    }

    const client = await this.pool.connect();
    try {
      // Use IF NOT EXISTS for everything to prevent conflicts
      await client.query(`
        CREATE TABLE IF NOT EXISTS cache_entries (
          cache_key VARCHAR(50) PRIMARY KEY,
          data JSONB NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
          fetch_count INTEGER DEFAULT 1,
          last_error TEXT NULL,
          error_count INTEGER DEFAULT 0
        );
      `);
      
      // Create indexes only if they don't exist
      await client.query(`
        DO $$ 
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_cache_expires_at') THEN
            CREATE INDEX idx_cache_expires_at ON cache_entries (expires_at);
          END IF;
          
          IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_cache_created_at') THEN
            CREATE INDEX idx_cache_created_at ON cache_entries (created_at);
          END IF;
        END $$;
      `);
      
      this.initialized = true;
      console.log('🗄️ Cache table initialized successfully');
    } catch (error: any) {
      // Only log if it's not a "already exists" error
      if (!error?.message?.includes('already exists')) {
        console.error('❌ Failed to initialize cache table:', error);
      } else {
        this.initialized = true;
        console.log('🗄️ Cache table already exists, skipping initialization');
      }
    } finally {
      client.release();
    }
  }

  // Rate limiting check
  private checkRateLimit(key: string, requestId?: string): { allowed: boolean; remaining: number; resetTime: number } {
    // Skip rate limiting in TEST_MODE
    if (isTestMode()) {
      return {
        allowed: true,
        remaining: 999999,
        resetTime: Date.now() + 60000
      };
    }

    const config = this.RATE_LIMITS[key as keyof typeof this.RATE_LIMITS] || this.RATE_LIMITS.default;
    const now = Date.now();
    const rateLimitKey = `${key}:${requestId || 'global'}`;

    const current = this.rateLimitMap.get(rateLimitKey);

    if (!current || now > current.resetTime) {
      // Reset or initialize
      this.rateLimitMap.set(rateLimitKey, {
        count: 1,
        resetTime: now + config.windowMs
      });
      return {
        allowed: true,
        remaining: config.maxRequests - 1,
        resetTime: now + config.windowMs
      };
    }

    if (current.count >= config.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: current.resetTime
      };
    }

    current.count++;
    return {
      allowed: true,
      remaining: config.maxRequests - current.count,
      resetTime: current.resetTime
    };
  }

  // Get cached data regardless of expiration (database-only approach)
  async get<T>(key: string, requestId?: string, skipRateLimit = false): Promise<T | null> {
    // Check rate limit (skipped when the caller already checked its own bucket)
    if (!skipRateLimit) {
      const rateCheck = this.checkRateLimit('default', requestId);
      if (!rateCheck.allowed) {
        console.warn(`🚫 Rate limit exceeded for cache key: ${key}`);
        return null;
      }
    }

    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT data FROM cache_entries WHERE cache_key = $1`,
        [key]
      );

      if (result.rows.length === 0) {
        console.log(`❌ No cached data found for ${key}`);
        return null;
      }

      return result.rows[0].data as T;
    } catch (error) {
      console.error(`❌ Failed to get cache for ${key}:`, error);
      return null;
    } finally {
      client.release();
    }
  }

  // Get specific data types with rate limiting
  async getTerritories(requestId?: string) {
    const rateCheck = this.checkRateLimit('territories', requestId);
    if (!rateCheck.allowed) {
      console.warn('🚫 Rate limit exceeded for territories');
      return null;
    }
    return this.get('territories', requestId, true);
  }

  /**
   * Timestamp of the territories cache row without pulling the payload.
   * Used for ETag revalidation — a matching If-None-Match can be answered
   * with a 304 after transferring one timestamp instead of ~300KB of JSON.
   */
  async getTerritoriesTimestamp(): Promise<Date | null> {
    try {
      const result = await this.pool.query(
        `SELECT created_at FROM cache_entries WHERE cache_key = 'territories'`,
      );
      return result.rows.length > 0 ? new Date(result.rows[0].created_at) : null;
    } catch {
      return null;
    }
  }

  async getGuildData(requestId?: string) {
    const rateCheck = this.checkRateLimit('members', requestId);
    if (!rateCheck.allowed) {
      console.warn('🚫 Rate limit exceeded for guild data');
      return null;
    }
    return this.get('guildData', requestId);
  }

  async getAspectData(requestId?: string) {
    const rateCheck = this.checkRateLimit('aspects', requestId);
    if (!rateCheck.allowed) {
      console.warn('🚫 Rate limit exceeded for aspect data');
      return null;
    }
    return this.get('aspectData', requestId);
  }

  async getLootpoolData(requestId?: string) {
    const rateCheck = this.checkRateLimit('lootpools', requestId);
    if (!rateCheck.allowed) {
      console.warn('🚫 Rate limit exceeded for lootpool data');
      return null;
    }
    return this.get('lootpoolData', requestId);
  }

  // Get cache status for admin dashboard
  async getCacheStatus() {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT 
          cache_key,
          EXTRACT(EPOCH FROM created_at) * 1000 as timestamp,
          EXTRACT(EPOCH FROM expires_at) * 1000 as expires_at,
          expires_at > NOW() as is_fresh,
          fetch_count,
          error_count,
          last_error
        FROM cache_entries
        ORDER BY cache_key
      `);

      const status: Record<string, any> = {};
      
      for (const row of result.rows) {
        status[row.cache_key] = {
          cached: true,
          timestamp: Math.floor(row.timestamp),
          expiresAt: Math.floor(row.expires_at),
          expired: !row.is_fresh,
          fetchCount: row.fetch_count,
          errorCount: row.error_count,
          lastError: row.last_error,
          managedBy: 'External Bot'
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
            managedBy: 'External Bot'
          };
        }
      }

      return status;
    } catch (error) {
      console.error('❌ Failed to get cache status:', error);
      // Return empty status on error
      return {
        territories: { cached: false, timestamp: null, expiresAt: null, expired: null, managedBy: 'External Bot' },
        guildData: { cached: false, timestamp: null, expiresAt: null, expired: null, managedBy: 'External Bot' },
        lootpoolData: { cached: false, timestamp: null, expiresAt: null, expired: null, managedBy: 'External Bot' },
        aspectData: { cached: false, timestamp: null, expiresAt: null, expired: null, managedBy: 'External Bot' }
      };
    } finally {
      client.release();
    }
  }

  // Cleanup expired entries (can be called by admin or maintenance)
  async cleanupExpired(): Promise<number> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'DELETE FROM cache_entries WHERE expires_at < NOW()'
      );
      
      const deletedCount = result.rowCount || 0;
      if (deletedCount > 0) {
        console.log(`🧹 Cleaned up ${deletedCount} expired cache entries`);
      }
      
      return deletedCount;
    } catch (error) {
      console.error('❌ Failed to cleanup expired cache:', error);
      return 0;
    } finally {
      client.release();
    }
  }

  // Get rate limit status for monitoring
  getRateLimitStatus() {
    const now = Date.now();
    const status: Record<string, any> = {};
    
    for (const [key, data] of this.rateLimitMap.entries()) {
      if (now <= data.resetTime) {
        const [type, requestId] = key.split(':');
        const config = this.RATE_LIMITS[type as keyof typeof this.RATE_LIMITS] || this.RATE_LIMITS.default;
        
        status[key] = {
          requests: data.count,
          limit: config.maxRequests,
          remaining: Math.max(0, config.maxRequests - data.count),
          resetTime: data.resetTime,
          resetIn: Math.max(0, data.resetTime - now)
        };
      }
    }
    
    return status;
  }

  // Guild colors specific methods
  async getGuildColors(clientIP: string): Promise<any[] | null> {
    try {
      await this.initializeTable();

      const client = await this.pool.connect();
      try {
        const result = await client.query(
          'SELECT data FROM cache_entries WHERE cache_key = $1',
          ['guildColors']
        );

        if (result.rows.length > 0) {
          return result.rows[0].data;
        }

        return null;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error getting guild colors from cache:', error);
      return null;
    }
  }

  // Get player activity baselines for multiple time periods using datetime-based
  // snapshot lookup (matches the Discord bot's Helpers/database.py approach).
  // Period N finds the most recent snapshot on or before CURRENT_DATE - N days.
  async getPlayerActivitySnapshots(daysArray: number[], requestId?: string): Promise<Record<number, Record<string, { uuid: string; playtime: number; contributed: number; wars: number; raids: number; shells: number }>>> {
    const rateCheck = this.checkRateLimit('members', requestId);
    if (!rateCheck.allowed) {
      console.warn('🚫 Rate limit exceeded for player activity');
      return {};
    }

    const client = await this.pool.connect();
    try {
      // 1. Resolve every period to its target snapshot date in ONE round trip:
      //    the most recent snapshot on or before CURRENT_DATE - N days, falling
      //    back to the oldest available snapshot. Both subqueries are satisfied
      //    by the snapshot_date index, so this never scans the table.
      const dateResult = await client.query(
        `SELECT t.period,
                COALESCE(
                  (SELECT MAX(snapshot_date) FROM player_activity WHERE snapshot_date <= CURRENT_DATE - t.period),
                  (SELECT MIN(snapshot_date) FROM player_activity)
                )::text AS target_date
         FROM unnest($1::int[]) AS t(period)`,
        [daysArray]
      );

      const periodToDate = new Map<number, string>();
      const targetDatesSet = new Set<string>();
      const logParts: string[] = [];
      for (const row of dateResult.rows) {
        if (row.target_date) {
          periodToDate.set(Number(row.period), row.target_date);
          targetDatesSet.add(row.target_date);
          logParts.push(`${row.period}d→${row.target_date}`);
        }
      }

      if (targetDatesSet.size === 0) {
        console.log('📊 Player activity: no snapshots available');
        const empty: Record<number, Record<string, { uuid: string; playtime: number; contributed: number; wars: number; raids: number; shells: number }>> = {};
        for (const d of daysArray) empty[d] = {};
        return empty;
      }

      // 2. For each (target date, member) pair, find the snapshot closest to
      //    the target date (either direction — members who joined after the
      //    target date resolve to their earliest snapshot). The lateral picks
      //    the nearest neighbor on each side via two LIMIT 1 probes of the
      //    (uuid, snapshot_date) primary key, instead of the previous
      //    full-table DISTINCT ON sort per period. All dates go in one query.
      type SnapshotRow = { uuid: string; playtime: number; contributed: number; wars: number; raids: number; shells: number };

      const result = await client.query(
        `WITH uuids AS (SELECT DISTINCT uuid FROM player_activity)
         SELECT t.target_date::text AS target_date, c.uuid, c.playtime, c.contributed, c.wars, c.raids, c.shells
         FROM unnest($1::date[]) AS t(target_date)
         CROSS JOIN uuids u
         CROSS JOIN LATERAL (
           SELECT * FROM (
             (SELECT uuid, playtime, contributed, wars, raids, shells, snapshot_date
              FROM player_activity
              WHERE uuid = u.uuid AND snapshot_date <= t.target_date
              ORDER BY snapshot_date DESC LIMIT 1)
             UNION ALL
             (SELECT uuid, playtime, contributed, wars, raids, shells, snapshot_date
              FROM player_activity
              WHERE uuid = u.uuid AND snapshot_date > t.target_date
              ORDER BY snapshot_date ASC LIMIT 1)
           ) cand
           ORDER BY ABS(cand.snapshot_date - t.target_date) ASC, cand.snapshot_date DESC
           LIMIT 1
         ) c`,
        [Array.from(targetDatesSet)]
      );

      const byDate = new Map<string, Record<string, SnapshotRow>>();
      for (const row of result.rows) {
        let dateData = byDate.get(row.target_date);
        if (!dateData) {
          dateData = {};
          byDate.set(row.target_date, dateData);
        }
        dateData[row.uuid] = {
          uuid: row.uuid,
          playtime: row.playtime,
          contributed: row.contributed,
          wars: row.wars,
          raids: row.raids,
          shells: row.shells
        };
      }

      const snapshots: Record<number, Record<string, SnapshotRow>> = {};
      for (const period of daysArray) {
        const dateKey = periodToDate.get(period);
        // Copy so periods resolving to the same date don't share one object
        snapshots[period] = { ...((dateKey && byDate.get(dateKey)) || {}) };
      }

      const memberCounts = daysArray.map(p => {
        const count = Object.keys(snapshots[p]).length;
        return `${count} members`;
      });
      console.log(`📊 Player activity (datetime-based): ${logParts.map((l, i) => `${l}(${memberCounts[i]})`).join(', ')}`);

      return snapshots;
    } catch (error) {
      console.error('❌ Failed to get player activity snapshots:', error);
      return {};
    } finally {
      client.release();
    }
  }

  // Simple config/settings stored as cache_entries with far-future expiry
  async getSetting<T>(key: string, fallback: T): Promise<T> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT data FROM cache_entries WHERE cache_key = $1`,
        [key]
      );
      if (result.rows.length === 0) return fallback;
      return (result.rows[0].data as any)?.value ?? fallback;
    } catch (error) {
      console.error(`❌ Failed to get setting ${key}:`, error);
      return fallback;
    } finally {
      client.release();
    }
  }

  async setSetting<T>(key: string, value: T): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `INSERT INTO cache_entries (cache_key, data, expires_at)
         VALUES ($1, $2, '2099-12-31T23:59:59Z')
         ON CONFLICT (cache_key)
         DO UPDATE SET data = $2`,
        [key, JSON.stringify({ value })]
      );
    } catch (error) {
      console.error(`❌ Failed to set setting ${key}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  async setGuildColors(guilds: any[], clientIP: string): Promise<void> {
    try {
      await this.initializeTable();
      
      const client = await this.pool.connect();
      try {
        await client.query(
          `INSERT INTO cache_entries (cache_key, data, expires_at) 
           VALUES ('guildColors', $1, NOW() + INTERVAL '1 hour')
           ON CONFLICT (cache_key) 
           DO UPDATE SET data = $1, expires_at = NOW() + INTERVAL '1 hour'`,
          [JSON.stringify(guilds)]
        );
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error setting guild colors in cache:', error);
      // Don't throw - let the caller handle fallback
    }
  }
}

// Singleton instance
const simpleDatabaseCache = new SimpleDatabaseCache();

// Initialize on first import
let initPromise: Promise<void> | null = null;

const ensureInitialized = () => {
  if (!initPromise) {
    initPromise = simpleDatabaseCache.initializeTable().catch((error) => {
      console.error('Failed to initialize simple cache:', error);
      // Reset promise so it can be retried
      initPromise = null;
    });
  }
  return initPromise;
};

// Start initialization
ensureInitialized();

export default simpleDatabaseCache;
