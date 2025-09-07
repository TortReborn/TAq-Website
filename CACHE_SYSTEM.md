# Cache System Configuration Summary

## Database Cache TTLs (Time To Live)
- **Territories**: 5 seconds
- **Guild Data**: 5 minutes (300 seconds)  
- **Lootpool Data**: 2 minutes (120 seconds)
- **Aspect Data**: 5 minutes (300 seconds)

## Frontend Refresh Intervals
- **Map Page (territories)**: 5 seconds ✅ matches cache TTL
- **Members Page (guild data)**: 5 minutes ✅ matches cache TTL  
- **Lootpools Page (aspects)**: 2 minutes ✅ matches cache TTL
- **Cache Admin**: 30 seconds ✅ frequent monitoring

## Cache Behavior
1. **Page Load**: Always calls API, which checks database cache first
2. **Cache Hit**: Returns cached data if fresh (not expired)
3. **Cache Miss/Expired**: Fetches from external API, updates cache with new TTL
4. **Interval Refresh**: Frontend pages refresh on intervals to check for updates
5. **Error Fallback**: Returns stale data if external API fails

## Cache Flow Example (Territories)
1. User visits `/map` → Frontend calls `/api/territories`
2. API calls `dbCache.getTerritories()` → Checks database for fresh data
3. If cache expired (> 5 seconds old) → Fetches from Wynncraft API
4. Updates database with fresh data + 5 second TTL
5. Returns data to frontend
6. Frontend refreshes every 5 seconds, repeating the process

This ensures users always get the freshest data while minimizing API calls through intelligent caching.
