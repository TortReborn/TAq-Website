import { getPool } from './db';

interface CacheEntry<T> {
  cache_key: string;
  data: T;
  created_at: Date;
  expires_at: Date;
  is_fresh: boolean;
}

class DatabaseCache {
  private pool = getPool();
  private initialized = false;

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

  // Get cached data if fresh, null if expired/missing
  async get<T>(key: string): Promise<T | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT data, expires_at > NOW() as is_fresh 
         FROM cache_entries 
         WHERE cache_key = $1`,
        [key]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      if (!row.is_fresh) {
        return null;
      }

      console.log(`✨ Serving ${key} from database cache`);
      return row.data as T;
    } catch (error) {
      console.error(`❌ Failed to get cache for ${key}:`, error);
      return null;
    } finally {
      client.release();
    }
  }

  // Get stale data (even if expired) for fallback
  async getStale<T>(key: string): Promise<T | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'SELECT data FROM cache_entries WHERE cache_key = $1',
        [key]
      );

      return result.rows.length > 0 ? result.rows[0].data as T : null;
    } catch (error) {
      console.error(`❌ Failed to get stale cache for ${key}:`, error);
      return null;
    } finally {
      client.release();
    }
  }

  // Set cache entry with TTL and update statistics
  async set<T>(key: string, data: T, ttlMs: number): Promise<void> {
    const client = await this.pool.connect();
    try {
      const expiresAt = new Date(Date.now() + ttlMs);
      
      await client.query(
        `INSERT INTO cache_entries (cache_key, data, expires_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (cache_key) 
         DO UPDATE SET 
           data = $2, 
           created_at = NOW(), 
           expires_at = $3,
           fetch_count = cache_entries.fetch_count + 1,
           last_error = NULL,
           error_count = 0`,
        [key, JSON.stringify(data), expiresAt]
      );

      console.log(`💾 Cached ${key} until ${expiresAt.toLocaleString()}`);
    } catch (error) {
      console.error(`❌ Failed to cache ${key}:`, error);
    } finally {
      client.release();
    }
  }

  // Record error in cache statistics
  async recordError(key: string, error: any): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `INSERT INTO cache_entries (cache_key, data, expires_at, last_error, error_count)
         VALUES ($1, '{}', NOW() - INTERVAL '1 day', $2, 1)
         ON CONFLICT (cache_key) 
         DO UPDATE SET 
           last_error = $2,
           error_count = cache_entries.error_count + 1`,
        [key, error.message || String(error)]
      );
    } catch (dbError) {
      console.error(`❌ Failed to record error for ${key}:`, dbError);
    } finally {
      client.release();
    }
  }

  // Get data with automatic refresh
  async getOrFetch<T>(
    key: string, 
    fetchFunction: () => Promise<T>, 
    ttlMs: number
  ): Promise<T | null> {
    try {
      // Try to get fresh data from cache
      const cached = await this.get<T>(key);
      if (cached) {
        return cached;
      }

      // Cache miss or expired - fetch fresh data
      console.log(`📡 Fetching fresh data for ${key}...`);
      const freshData = await fetchFunction();
      
      // Cache the fresh data
      await this.set(key, freshData, ttlMs);
      
      return freshData;
    } catch (error) {
      console.error(`❌ Failed to fetch ${key}:`, error);
      
      // Record the error
      await this.recordError(key, error);
      
      // Try to return stale data if available
      const staleData = await this.getStale<T>(key);
      if (staleData) {
        console.log(`🔄 Returning stale data for ${key}`);
        return staleData;
      }
      
      return null;
    }
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
          lastError: row.last_error
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
            lastError: null
          };
        }
      }

      return status;
    } catch (error) {
      console.error('❌ Failed to get cache status:', error);
      // Return empty status on error
      return {
        territories: { cached: false, timestamp: null, expiresAt: null, expired: null },
        guildData: { cached: false, timestamp: null, expiresAt: null, expired: null },
        lootpoolData: { cached: false, timestamp: null, expiresAt: null, expired: null },
        aspectData: { cached: false, timestamp: null, expiresAt: null, expired: null }
      };
    } finally {
      client.release();
    }
  }

  // Cleanup expired entries (run periodically)
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

  // Initialize Athena session for API calls
  private async initSessionAndGetCookies() {
    try {
      console.log('Initializing fresh session for Athena API...');
      const tokensResponse = await fetch('https://nori.fish/api/tokens', {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      
      const setCookieHeaders = tokensResponse.headers.getSetCookie?.() || [];
      let cookies = '';
      let csrfToken = '';
      
      if (setCookieHeaders.length > 0) {
        cookies = setCookieHeaders.map(cookie => cookie.split(';')[0]).join('; ');
      } else {
        const singleCookie = tokensResponse.headers.get('set-cookie');
        if (singleCookie) {
          cookies = singleCookie.split(';')[0];
        }
      }
      
      if (cookies) {
        const csrfMatch = cookies.match(/csrf_token=([^;,\s]+)/i) || cookies.match(/csrftoken=([^;,\s]+)/i);
        if (csrfMatch) {
          csrfToken = csrfMatch[1];
        }
      }
      
      return { cookies, csrfToken };
    } catch (error) {
      console.log('Session initialization failed:', error);
      return { cookies: '', csrfToken: '' };
    }
  }

  // API-specific methods with proper error handling
  async getTerritories() {
    return this.getOrFetch(
      'territories',
      async () => {
        const response = await fetch('https://api.wynncraft.com/v3/guild/list/territory', {
          headers: { 'User-Agent': 'Tort-Reborn-Graid-Event-Website/1.0' }
        });
        if (!response.ok) throw new Error(`Wynncraft API error: ${response.status} ${response.statusText}`);
        return response.json();
      },
      5000 // 5 seconds TTL for territories (high-frequency updates)
    );
  }

  async getGuildData() {
    return this.getOrFetch(
      'guildData',
      async () => {
        const response = await fetch('https://api.wynncraft.com/v3/guild/The Aquarium', {
          headers: { 'User-Agent': 'Tort-Reborn-Graid-Event-Website/1.0' }
        });
        if (!response.ok) throw new Error(`Wynncraft API error: ${response.status} ${response.statusText}`);
        return response.json();
      },
      300000 // 5 minutes TTL
    );
  }

  async getLootpoolData() {
    return this.getOrFetch(
      'lootpoolData',
      async () => {
        const { cookies, csrfToken } = await this.initSessionAndGetCookies();
        
        const headers: Record<string, string> = {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        };
        
        if (cookies) headers['Cookie'] = cookies;
        if (csrfToken) headers['X-CSRF-Token'] = csrfToken;

        const response = await fetch('https://nori.fish/api/lootpool', {
          method: 'GET',
          headers
        });
        
        if (!response.ok) throw new Error(`Athena API error: ${response.status} ${response.statusText}`);
        return response.json();
      },
      120000 // 2 minutes TTL
    );
  }

  async getAspectData() {
    return this.getOrFetch(
      'aspectData',
      async () => {
        const { cookies, csrfToken } = await this.initSessionAndGetCookies();
        
        const headers: Record<string, string> = {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        };
        
        if (cookies) headers['Cookie'] = cookies;
        if (csrfToken) headers['X-CSRF-Token'] = csrfToken;

        const response = await fetch('https://nori.fish/api/aspects', {
          method: 'GET',
          headers
        });
        
        if (!response.ok) throw new Error(`Athena API error: ${response.status} ${response.statusText}`);
        return response.json();
      },
      300000 // 5 minutes TTL
    );
  }

  // Manual refresh methods for admin/debugging
  async refreshTerritories() {
    await this.cleanupExpired();
    return await this.getTerritories();
  }

  async refreshGuildData() {
    await this.cleanupExpired();
    return await this.getGuildData();
  }

  async refreshLootpoolData() {
    await this.cleanupExpired();
    return await this.getLootpoolData();
  }

  async refreshAspectData() {
    await this.cleanupExpired();
    return await this.getAspectData();
  }
}

// Singleton instance
const dbCache = new DatabaseCache();

// Initialize on first import (but don't block and only once globally)
let initPromise: Promise<void> | null = null;

const ensureInitialized = () => {
  if (!initPromise) {
    initPromise = dbCache.initializeTable().catch((error) => {
      console.error('Failed to initialize cache:', error);
      // Reset promise so it can be retried
      initPromise = null;
    });
  }
  return initPromise;
};

// Start initialization
ensureInitialized();

export default dbCache;
