"use client";

import { useState, useEffect } from 'react';

interface CacheStatus {
  status: string;
  cache: {
    territories: {
      cached: boolean;
      timestamp: number | null;
      expiresAt: number | null;
      expired: boolean | null;
    };
    guildData: {
      cached: boolean;
      timestamp: number | null;
      expiresAt: number | null;
      expired: boolean | null;
    };
    lootpoolData: {
      cached: boolean;
      timestamp: number | null;
      expiresAt: number | null;
      expired: boolean | null;
    };
    aspectData: {
      cached: boolean;
      timestamp: number | null;
      expiresAt: number | null;
      expired: boolean | null;
    };
    aspectClassData: {
      cached: boolean;
      timestamp: number | null;
      expiresAt: number | null;
      expired: boolean | null;
    };
  };
  timestamp: number;
}

export default function CacheAdminPage() {
  const [cacheStatus, setCacheStatus] = useState<CacheStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [darkMode, setDarkMode] = useState(false);

  // Check for dark mode
  useEffect(() => {
    const checkDarkMode = () => {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      setDarkMode(isDark);
    };
    
    checkDarkMode();
    
    // Watch for theme changes
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme']
    });
    
    return () => observer.disconnect();
  }, []);

  const fetchCacheStatus = async () => {
    try {
      const response = await fetch('/api/cache');
      if (response.ok) {
        const data = await response.json();
        setCacheStatus(data);
      }
    } catch (error) {
      console.error('Failed to fetch cache status:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCacheStatus();
    // Auto-refresh status every 5 seconds
    const interval = setInterval(fetchCacheStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const formatTimestamp = (timestamp: number | null) => {
    if (!timestamp) return 'Never';
    return new Date(timestamp).toLocaleString();
  };

  const formatDuration = (timestamp: number | null) => {
    if (!timestamp) return 'N/A';
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return `${minutes}m ${seconds}s ago`;
  };

  if (loading) {
    return (
      <div className={`min-h-screen transition-colors ${
        darkMode 
          ? 'bg-gray-900 text-white' 
          : 'bg-gray-100 text-gray-900'
      }`}>
        <div className="container mx-auto p-8 text-center">
          <h1 className={`text-3xl font-bold mb-4 ${
            darkMode ? 'text-white' : 'text-gray-900'
          }`}>
            Cache Administration
          </h1>
          <p className={darkMode ? 'text-gray-300' : 'text-gray-600'}>
            Loading cache status...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen transition-colors ${
      darkMode 
        ? 'bg-gray-900 text-white' 
        : 'bg-gray-100 text-gray-900'
    }`}>
      <div className="container mx-auto p-8 max-w-6xl font-mono">
        <h1 className={`text-3xl font-bold mb-8 ${
          darkMode ? 'text-white' : 'text-gray-900'
        }`}>
          📊 Cache Status Monitor
        </h1>
        
        {cacheStatus && (
          <div className="space-y-8">
            {/* System Status */}
            <div className={`p-6 rounded-lg border transition-colors ${
              cacheStatus.status === 'healthy' 
                ? darkMode 
                  ? 'bg-green-900/20 border-green-700 text-green-100'
                  : 'bg-green-50 border-green-200 text-green-800'
                : darkMode
                  ? 'bg-red-900/20 border-red-700 text-red-100'
                  : 'bg-red-50 border-red-200 text-red-800'
            }`}>
              <h2 className="text-xl font-semibold mb-3">
                System Status: {cacheStatus.status === 'healthy' ? '✅ Healthy' : '❌ Error'}
              </h2>
              <p className="mb-2">Last checked: {formatTimestamp(cacheStatus.timestamp)}</p>
              <p className="text-sm opacity-75">🔄 Auto-refreshes every 5 seconds</p>
            </div>

            {/* Cache Status Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-8">
              {/* Territories Cache */}
              <div className={`border rounded-lg p-6 transition-colors ${
                cacheStatus.cache.territories.cached 
                  ? darkMode 
                    ? 'bg-gray-800 border-gray-700'
                    : 'bg-white border-gray-200'
                  : darkMode
                    ? 'bg-yellow-900/20 border-yellow-700'
                    : 'bg-yellow-50 border-yellow-200'
              }`}>
                <h3 className={`text-lg font-semibold mb-4 ${
                  darkMode ? 'text-white' : 'text-gray-900'
                }`}>
                  🗺️ Territories Cache
                </h3>
                <div className="space-y-3 pl-6">
                  <div className="flex items-start">
                    <span className={`w-2 h-2 rounded-full mr-4 -ml-6 mt-2 ${
                      cacheStatus.cache.territories.cached ? 'bg-green-500' : 'bg-red-500'
                    }`}></span>
                    <span className={darkMode ? 'text-gray-300' : 'text-gray-700'}>
                      <strong>Status:</strong> {cacheStatus.cache.territories.cached ? '✅ Cached' : '❌ Not cached'}
                    </span>
                  </div>
                  {cacheStatus.cache.territories.timestamp && (
                    <>
                      <div className="flex items-start">
                        <span className="w-2 h-2 rounded-full mr-4 -ml-6 mt-2 bg-blue-500"></span>
                        <span className={darkMode ? 'text-gray-300' : 'text-gray-700'}>
                          <strong>Last Updated:</strong> {formatDuration(cacheStatus.cache.territories.timestamp)}
                        </span>
                      </div>
                      <div className="flex items-start">
                        <span className={`w-2 h-2 rounded-full mr-4 -ml-6 mt-2 ${
                          cacheStatus.cache.territories.expired ? 'bg-red-500' : 'bg-green-500'
                        }`}></span>
                        <span className={darkMode ? 'text-gray-300' : 'text-gray-700'}>
                          <strong>Expires:</strong> {formatTimestamp(cacheStatus.cache.territories.expiresAt)}
                        </span>
                      </div>
                      <div className="flex items-start">
                        <span className={`w-2 h-2 rounded-full mr-4 -ml-6 mt-2 ${
                          cacheStatus.cache.territories.expired ? 'bg-red-500' : 'bg-green-500'
                        }`}></span>
                        <span className={darkMode ? 'text-gray-300' : 'text-gray-700'}>
                          <strong>Expired:</strong> {cacheStatus.cache.territories.expired ? '❌ Yes' : '✅ No'}
                        </span>
                      </div>
                    </>
                  )}
                </div>
                <div className={`mt-4 p-3 rounded transition-colors ${
                  darkMode 
                    ? 'bg-gray-700 border border-gray-600'
                    : 'bg-gray-100 border border-gray-200'
                }`}>
                  <span className={`text-sm font-medium ${
                    darkMode ? 'text-gray-200' : 'text-gray-700'
                  }`}>
                    <strong>Auto-refresh:</strong> When stale (10+ seconds old)
                  </span>
                </div>
              </div>

              {/* Guild Data Cache */}
              <div className={`border rounded-lg p-6 transition-colors ${
                cacheStatus.cache.guildData.cached 
                  ? darkMode 
                    ? 'bg-gray-800 border-gray-700'
                    : 'bg-white border-gray-200'
                  : darkMode
                    ? 'bg-yellow-900/20 border-yellow-700'
                    : 'bg-yellow-50 border-yellow-200'
              }`}>
                <h3 className={`text-lg font-semibold mb-4 ${
                  darkMode ? 'text-white' : 'text-gray-900'
                }`}>
                  🏰 Guild Data Cache
                </h3>
                <div className="space-y-3 pl-6">
                  <div className="flex items-start">
                    <span className={`w-2 h-2 rounded-full mr-4 -ml-6 mt-2 ${
                      cacheStatus.cache.guildData.cached ? 'bg-green-500' : 'bg-red-500'
                    }`}></span>
                    <span className={darkMode ? 'text-gray-300' : 'text-gray-700'}>
                      <strong>Status:</strong> {cacheStatus.cache.guildData.cached ? '✅ Cached' : '❌ Not cached'}
                    </span>
                  </div>
                  {cacheStatus.cache.guildData.timestamp && (
                    <>
                      <div className="flex items-start">
                        <span className="w-2 h-2 rounded-full mr-4 -ml-6 mt-2 bg-blue-500"></span>
                        <span className={darkMode ? 'text-gray-300' : 'text-gray-700'}>
                          <strong>Last Updated:</strong> {formatDuration(cacheStatus.cache.guildData.timestamp)}
                        </span>
                      </div>
                      <div className="flex items-start">
                        <span className={`w-2 h-2 rounded-full mr-4 -ml-6 mt-2 ${
                          cacheStatus.cache.guildData.expired ? 'bg-red-500' : 'bg-green-500'
                        }`}></span>
                        <span className={darkMode ? 'text-gray-300' : 'text-gray-700'}>
                          <strong>Expires:</strong> {formatTimestamp(cacheStatus.cache.guildData.expiresAt)}
                        </span>
                      </div>
                      <div className="flex items-start">
                        <span className={`w-2 h-2 rounded-full mr-4 -ml-6 mt-2 ${
                          cacheStatus.cache.guildData.expired ? 'bg-red-500' : 'bg-green-500'
                        }`}></span>
                        <span className={darkMode ? 'text-gray-300' : 'text-gray-700'}>
                          <strong>Expired:</strong> {cacheStatus.cache.guildData.expired ? '❌ Yes' : '✅ No'}
                        </span>
                      </div>
                    </>
                  )}
                </div>
                <div className={`mt-4 p-3 rounded transition-colors ${
                  darkMode 
                    ? 'bg-gray-700 border border-gray-600'
                    : 'bg-gray-100 border border-gray-200'
                }`}>
                  <span className={`text-sm font-medium ${
                    darkMode ? 'text-gray-200' : 'text-gray-700'
                  }`}>
                    <strong>Auto-refresh:</strong> When stale (5+ minutes old)
                  </span>
                </div>
              </div>

              {/* Lootpool Data Cache */}
              <div className={`border rounded-lg p-6 transition-colors ${
                cacheStatus.cache.lootpoolData.cached 
                  ? darkMode 
                    ? 'bg-gray-800 border-gray-700'
                    : 'bg-white border-gray-200'
                  : darkMode
                    ? 'bg-yellow-900/20 border-yellow-700'
                    : 'bg-yellow-50 border-yellow-200'
              }`}>
                <h3 className={`text-lg font-semibold mb-4 ${
                  darkMode ? 'text-white' : 'text-gray-900'
                }`}>
                  💰 Lootpool Data Cache
                </h3>
                <div className="space-y-3 pl-6">
                  <div className="flex items-start">
                    <span className={`w-2 h-2 rounded-full mr-4 -ml-6 mt-2 ${
                      cacheStatus.cache.lootpoolData.cached ? 'bg-green-500' : 'bg-red-500'
                    }`}></span>
                    <span className={darkMode ? 'text-gray-300' : 'text-gray-700'}>
                      <strong>Status:</strong> {cacheStatus.cache.lootpoolData.cached ? '✅ Cached' : '❌ Not cached'}
                    </span>
                  </div>
                  {cacheStatus.cache.lootpoolData.timestamp && (
                    <>
                      <div className="flex items-start">
                        <span className="w-2 h-2 rounded-full mr-4 -ml-6 mt-2 bg-blue-500"></span>
                        <span className={darkMode ? 'text-gray-300' : 'text-gray-700'}>
                          <strong>Last Updated:</strong> {formatDuration(cacheStatus.cache.lootpoolData.timestamp)}
                        </span>
                      </div>
                      <div className="flex items-start">
                        <span className={`w-2 h-2 rounded-full mr-4 -ml-6 mt-2 ${
                          cacheStatus.cache.lootpoolData.expired ? 'bg-red-500' : 'bg-green-500'
                        }`}></span>
                        <span className={darkMode ? 'text-gray-300' : 'text-gray-700'}>
                          <strong>Expires:</strong> {formatTimestamp(cacheStatus.cache.lootpoolData.expiresAt)}
                        </span>
                      </div>
                      <div className="flex items-start">
                        <span className={`w-2 h-2 rounded-full mr-4 -ml-6 mt-2 ${
                          cacheStatus.cache.lootpoolData.expired ? 'bg-red-500' : 'bg-green-500'
                        }`}></span>
                        <span className={darkMode ? 'text-gray-300' : 'text-gray-700'}>
                          <strong>Expired:</strong> {cacheStatus.cache.lootpoolData.expired ? '❌ Yes' : '✅ No'}
                        </span>
                      </div>
                    </>
                  )}
                </div>
                <div className={`mt-4 p-3 rounded transition-colors ${
                  darkMode 
                    ? 'bg-gray-700 border border-gray-600'
                    : 'bg-gray-100 border border-gray-200'
                }`}>
                  <span className={`text-sm font-medium ${
                    darkMode ? 'text-gray-200' : 'text-gray-700'
                  }`}>
                    <strong>Auto-refresh:</strong> When stale (2+ minutes old)
                  </span>
                </div>
              </div>

              {/* Aspect Data Cache */}
              <div className={`border rounded-lg p-6 transition-colors ${
                cacheStatus.cache.aspectData.cached 
                  ? darkMode 
                    ? 'bg-gray-800 border-gray-700'
                    : 'bg-white border-gray-200'
                  : darkMode
                    ? 'bg-yellow-900/20 border-yellow-700'
                    : 'bg-yellow-50 border-yellow-200'
              }`}>
                <h3 className={`text-lg font-semibold mb-4 ${
                  darkMode ? 'text-white' : 'text-gray-900'
                }`}>
                  ⚡ Aspect Data Cache
                </h3>
                <div className="space-y-3 pl-6">
                  <div className="flex items-start">
                    <span className={`w-2 h-2 rounded-full mr-4 -ml-6 mt-2 ${
                      cacheStatus.cache.aspectData.cached ? 'bg-green-500' : 'bg-red-500'
                    }`}></span>
                    <span className={darkMode ? 'text-gray-300' : 'text-gray-700'}>
                      <strong>Status:</strong> {cacheStatus.cache.aspectData.cached ? '✅ Cached' : '❌ Not cached'}
                    </span>
                  </div>
                  {cacheStatus.cache.aspectData.timestamp && (
                    <>
                      <div className="flex items-start">
                        <span className="w-2 h-2 rounded-full mr-4 -ml-6 mt-2 bg-blue-500"></span>
                        <span className={darkMode ? 'text-gray-300' : 'text-gray-700'}>
                          <strong>Last Updated:</strong> {formatDuration(cacheStatus.cache.aspectData.timestamp)}
                        </span>
                      </div>
                      <div className="flex items-start">
                        <span className={`w-2 h-2 rounded-full mr-4 -ml-6 mt-2 ${
                          cacheStatus.cache.aspectData.expired ? 'bg-red-500' : 'bg-green-500'
                        }`}></span>
                        <span className={darkMode ? 'text-gray-300' : 'text-gray-700'}>
                          <strong>Expires:</strong> {formatTimestamp(cacheStatus.cache.aspectData.expiresAt)}
                        </span>
                      </div>
                      <div className="flex items-start">
                        <span className={`w-2 h-2 rounded-full mr-4 -ml-6 mt-2 ${
                          cacheStatus.cache.aspectData.expired ? 'bg-red-500' : 'bg-green-500'
                        }`}></span>
                        <span className={darkMode ? 'text-gray-300' : 'text-gray-700'}>
                          <strong>Expired:</strong> {cacheStatus.cache.aspectData.expired ? '❌ Yes' : '✅ No'}
                        </span>
                      </div>
                    </>
                  )}
                </div>
                <div className={`mt-4 p-3 rounded transition-colors ${
                  darkMode 
                    ? 'bg-gray-700 border border-gray-600'
                    : 'bg-gray-100 border border-gray-200'
                }`}>
                  <span className={`text-sm font-medium ${
                    darkMode ? 'text-gray-200' : 'text-gray-700'
                  }`}>
                    <strong>Auto-refresh:</strong> When stale (5+ minutes old)
                  </span>
                </div>
              </div>
            </div>

            {/* Information Panel */}
            <div className={`p-6 rounded-lg border transition-colors ${
              darkMode 
                ? 'bg-gray-800 border-gray-700'
                : 'bg-white border-gray-200'
            }`}>
              <h3 className={`text-lg font-semibold mb-4 ${
                darkMode ? 'text-white' : 'text-gray-900'
              }`}>
                ℹ️ PostgreSQL Cache Information
              </h3>
              <p className={`mb-4 ${
                darkMode ? 'text-gray-300' : 'text-gray-700'
              }`}>
                This dashboard shows real-time cache status from PostgreSQL. The system automatically:
              </p>
              <div className="space-y-3 pl-6">
                <div className="flex items-start">
                  <span className="w-2 h-2 rounded-full mr-4 -ml-6 mt-2 bg-green-500"></span>
                  <span className={darkMode ? 'text-gray-300' : 'text-gray-700'}>
                    <strong>Persistent cache</strong> - Data survives across all Vercel function instances
                  </span>
                </div>
                <div className="flex items-start">
                  <span className="w-2 h-2 rounded-full mr-4 -ml-6 mt-2 bg-blue-500"></span>
                  <span className={darkMode ? 'text-gray-300' : 'text-gray-700'}>
                    <strong>Automatic refresh</strong> - Fetches fresh data when cache expires
                  </span>
                </div>
                <div className="flex items-start">
                  <span className="w-2 h-2 rounded-full mr-4 -ml-6 mt-2 bg-purple-500"></span>
                  <span className={darkMode ? 'text-gray-300' : 'text-gray-700'}>
                    <strong>Stale data fallback</strong> - Returns expired data if API calls fail
                  </span>
                </div>
                <div className="flex items-start">
                  <span className="w-2 h-2 rounded-full mr-4 -ml-6 mt-2 bg-yellow-500"></span>
                  <span className={darkMode ? 'text-gray-300' : 'text-gray-700'}>
                    <strong>Error tracking</strong> - Monitors API failures and recovery
                  </span>
                </div>
                <div className="flex items-start">
                  <span className="w-2 h-2 rounded-full mr-4 -ml-6 mt-2 bg-indigo-500"></span>
                  <span className={darkMode ? 'text-gray-300' : 'text-gray-700'}>
                    Serves cached data to all users for optimal performance
                  </span>
                </div>
                <div className="flex items-start">
                  <span className="w-2 h-2 rounded-full mr-4 -ml-6 mt-2 bg-pink-500"></span>
                  <span className={darkMode ? 'text-gray-300' : 'text-gray-700'}>
                    Falls back to direct API calls if cache is unavailable
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
