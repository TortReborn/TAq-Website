// Cache service for external API data
import { Territory } from './utils';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

interface GuildData {
  uuid: string;
  name: string;
  prefix: string;
  level: number;
  xpPercent: number;
  territories: number;
  wars: number;
  created: string;
  members: any;
  online: number;
  banner: any;
}

interface LootpoolData {
  [key: string]: any;
}

interface AspectData {
  [key: string]: any;
}

class DataCache {
  private territories: CacheEntry<Record<string, Territory>> | null = null;
  private guildData: CacheEntry<GuildData> | null = null;
  private lootpoolData: CacheEntry<LootpoolData> | null = null;
  private aspectData: CacheEntry<AspectData> | null = null;
  private refreshIntervals: Map<string, NodeJS.Timeout> = new Map();
  private failureCounts: Map<string, number> = new Map();
  private lastFailureTime: Map<string, number> = new Map();

  constructor() {
    // Start background refresh for territories (every 5 seconds)
    this.startBackgroundRefresh('territories', this.fetchTerritories.bind(this), 5000);
    
    // Start background refresh for guild data (every 5 minutes)
    this.startBackgroundRefresh('guild', this.fetchGuildData.bind(this), 300000);
    
    // Start background refresh for lootpool data (every 2 minutes)
    this.startBackgroundRefresh('lootpool', this.fetchLootpoolData.bind(this), 120000);
    
    // Start background refresh for aspect data (every 5 minutes)
    this.startBackgroundRefresh('aspects', this.fetchAspectData.bind(this), 300000);
  }

  private startBackgroundRefresh(key: string, fetchFunction: () => Promise<void>, interval: number) {
    // Initial fetch
    fetchFunction().catch((error) => this.handleFetchError(key, error));
    
    // Set up interval
    const intervalId = setInterval(() => {
      fetchFunction().catch((error) => this.handleFetchError(key, error));
    }, interval);
    
    this.refreshIntervals.set(key, intervalId);
  }

  private handleFetchError(key: string, error: any) {
    const failures = this.failureCounts.get(key) || 0;
    const lastFailure = this.lastFailureTime.get(key) || 0;
    const now = Date.now();
    
    // Reset failure count if it's been more than 1 hour since last failure
    if (now - lastFailure > 3600000) {
      this.failureCounts.set(key, 1);
    } else {
      this.failureCounts.set(key, failures + 1);
    }
    
    this.lastFailureTime.set(key, now);
    
    // Only log errors occasionally to reduce console noise
    const currentFailures = this.failureCounts.get(key) || 1;
    if (currentFailures === 1 || currentFailures % 10 === 0) {
      console.error(`❌ Failed to fetch ${key} (${currentFailures} failures):`, error.message || error);
    }
  }

  private async fetchTerritories(): Promise<void> {
    const response = await fetch('https://api.wynncraft.com/v3/guild/list/territory', {
      headers: {
        'User-Agent': 'Tort-Reborn-Graid-Event-Website/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`Wynncraft API error: ${response.status} ${response.statusText}`);
    }

    const territories = await response.json();
    
    this.territories = {
      data: territories,
      timestamp: Date.now(),
      expiresAt: Date.now() + (5 * 60 * 1000) // 5 minutes TTL
    };

    // Only log success if we had previous failures
    const failures = this.failureCounts.get('territories') || 0;
    if (failures > 0) {
      console.log('✅ Territories cache recovered successfully');
      this.failureCounts.set('territories', 0);
    }
  }

  private async fetchGuildData(): Promise<void> {
    const response = await fetch('https://api.wynncraft.com/v3/guild/The Aquarium', {
      headers: {
        'User-Agent': 'Tort-Reborn-Graid-Event-Website/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`Wynncraft API error: ${response.status} ${response.statusText}`);
    }

    const guildData = await response.json();
    
    this.guildData = {
      data: guildData,
      timestamp: Date.now(),
      expiresAt: Date.now() + (10 * 60 * 1000) // 10 minutes TTL
    };

    // Only log success if we had previous failures
    const failures = this.failureCounts.get('guild') || 0;
    if (failures > 0) {
      console.log('✅ Guild data cache recovered successfully');
      this.failureCounts.set('guild', 0);
    }
  }

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

  private async fetchLootpoolData(): Promise<void> {
    const { cookies, csrfToken } = await this.initSessionAndGetCookies();
    
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };
    
    if (cookies) {
      headers['Cookie'] = cookies;
    }
    
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }

    const response = await fetch('https://nori.fish/api/lootpool', {
      method: 'GET',
      headers
    });

    if (!response.ok) {
      throw new Error(`Athena API error: ${response.status} ${response.statusText}`);
    }

    const lootpoolData = await response.json();
    
    this.lootpoolData = {
      data: lootpoolData,
      timestamp: Date.now(),
      expiresAt: Date.now() + (5 * 60 * 1000) // 5 minutes TTL
    };

    // Only log success if we had previous failures
    const failures = this.failureCounts.get('lootpool') || 0;
    if (failures > 0) {
      console.log('✅ Lootpool data cache recovered successfully');
      this.failureCounts.set('lootpool', 0);
    }
  }

  private async fetchAspectData(): Promise<void> {
    const sessionCookies = await this.initSession();
    
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    };
    
    if (sessionCookies) {
      headers['Cookie'] = sessionCookies.split(';')[0];
    }

    const response = await fetch('https://nori.fish/api/aspects', {
      method: 'GET',
      headers
    });

    if (!response.ok) {
      throw new Error(`Athena API error: ${response.status} ${response.statusText}`);
    }

    const aspectData = await response.json();
    
    this.aspectData = {
      data: aspectData,
      timestamp: Date.now(),
      expiresAt: Date.now() + (10 * 60 * 1000) // 10 minutes TTL
    };

    // Only log success if we had previous failures
    const failures = this.failureCounts.get('aspects') || 0;
    if (failures > 0) {
      console.log('✅ Aspect data cache recovered successfully');
      this.failureCounts.set('aspects', 0);
    }
  }

  private async initSession() {
    try {
      const tokensResponse = await fetch('https://nori.fish/api/tokens', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      
      const cookies = tokensResponse.headers.get('set-cookie') || '';
      return cookies;
    } catch (error) {
      console.log('Token initialization failed, continuing without session');
      return '';
    }
  }

  getTerritories(): Record<string, Territory> | null {
    if (!this.territories) {
      console.log('📭 No territories in cache');
      return null;
    }

    if (Date.now() > this.territories.expiresAt) {
      console.log('⏰ Territories cache expired');
      // Don't return null immediately, return stale data and trigger refresh
      this.fetchTerritories().catch((error) => this.handleFetchError('territories', error));
      return this.territories.data;
    }

    console.log('✨ Serving territories from cache');
    return this.territories.data;
  }

  getGuildData(): GuildData | null {
    if (!this.guildData) {
      console.log('📭 No guild data in cache');
      return null;
    }

    if (Date.now() > this.guildData.expiresAt) {
      console.log('⏰ Guild data cache expired');
      // Don't return null immediately, return stale data and trigger refresh
      this.fetchGuildData().catch((error) => this.handleFetchError('guild', error));
      return this.guildData.data;
    }

    console.log('✨ Serving guild data from cache');
    return this.guildData.data;
  }

  getLootpoolData(): LootpoolData | null {
    if (!this.lootpoolData) {
      console.log('📭 No lootpool data in cache');
      return null;
    }

    if (Date.now() > this.lootpoolData.expiresAt) {
      console.log('⏰ Lootpool data cache expired');
      this.fetchLootpoolData().catch((error) => this.handleFetchError('lootpool', error));
      return this.lootpoolData.data;
    }

    console.log('✨ Serving lootpool data from cache');
    return this.lootpoolData.data;
  }

  getAspectData(): AspectData | null {
    if (!this.aspectData) {
      console.log('📭 No aspect data in cache');
      return null;
    }

    if (Date.now() > this.aspectData.expiresAt) {
      console.log('⏰ Aspect data cache expired');
      this.fetchAspectData().catch((error) => this.handleFetchError('aspects', error));
      return this.aspectData.data;
    }

    console.log('✨ Serving aspect data from cache');
    return this.aspectData.data;
  }

  getCacheStatus() {
    return {
      territories: {
        cached: !!this.territories,
        timestamp: this.territories?.timestamp || null,
        expiresAt: this.territories?.expiresAt || null,
        expired: this.territories ? Date.now() > this.territories.expiresAt : null
      },
      guildData: {
        cached: !!this.guildData,
        timestamp: this.guildData?.timestamp || null,
        expiresAt: this.guildData?.expiresAt || null,
        expired: this.guildData ? Date.now() > this.guildData.expiresAt : null
      },
      lootpoolData: {
        cached: !!this.lootpoolData,
        timestamp: this.lootpoolData?.timestamp || null,
        expiresAt: this.lootpoolData?.expiresAt || null,
        expired: this.lootpoolData ? Date.now() > this.lootpoolData.expiresAt : null
      },
      aspectData: {
        cached: !!this.aspectData,
        timestamp: this.aspectData?.timestamp || null,
        expiresAt: this.aspectData?.expiresAt || null,
        expired: this.aspectData ? Date.now() > this.aspectData.expiresAt : null
      }
    };
  }

  // Manual refresh methods for development/debugging
  async refreshTerritories(): Promise<void> {
    await this.fetchTerritories();
  }

  async refreshGuildData(): Promise<void> {
    await this.fetchGuildData();
  }

  async refreshLootpoolData(): Promise<void> {
    await this.fetchLootpoolData();
  }

  async refreshAspectData(): Promise<void> {
    await this.fetchAspectData();
  }

  // Cleanup method
  destroy() {
    this.refreshIntervals.forEach((interval) => {
      clearInterval(interval);
    });
    this.refreshIntervals.clear();
  }
}

// Singleton instance
const cache = new DataCache();

export default cache;
