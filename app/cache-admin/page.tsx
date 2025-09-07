"use client";

import { useState, useEffect } from 'react';

interface CacheEntry {
  cached: boolean;
  timestamp: number | null;
  expiresAt?: number;
  expired?: boolean;
  fetchCount?: number;
  errorCount?: number;
  lastError?: string;
  dataSize?: number;
}

interface CacheStatistics {
  totalEntries: number;
  freshEntries: number;
  expiredEntries: number;
  lastUpdate: string | null;
}

interface CacheStatus {
  status: string;
  cache: {
    [key: string]: CacheEntry;
  };
  timestamp: number;
  source?: string;
  error?: string;
  statistics?: CacheStatistics;
}

export default function CacheAdminPage() {
  const [cacheStatus, setCacheStatus] = useState<CacheStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

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
      const response = await fetch('/api/cache/direct');
      if (response.ok) {
        const data = await response.json();
        setCacheStatus(data);
        setLastUpdate(new Date());
      } else {
        console.error('Failed to fetch cache status:', response.status);
      }
    } catch (error) {
      console.error('Failed to fetch cache status:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCacheStatus();
    // Auto-refresh status every 30 seconds
    const interval = setInterval(fetchCacheStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const clearCache = async () => {
    try {
      const response = await fetch('/api/cache/clear', { method: 'POST' });
      if (response.ok) {
        console.log('Cache cleared successfully');
        // Refresh the status after clearing
        await fetchCacheStatus();
      } else {
        console.error('Failed to clear cache:', response.status);
      }
    } catch (error) {
      console.error('Failed to clear cache:', error);
    }
  };

  const formatTimestamp = (timestamp: number | null) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    return `${date.toLocaleString()} (${date.toISOString()})`;
  };

  const formatDuration = (timestamp: number | null) => {
    if (!timestamp) return 'N/A';
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    
    if (minutes === 0) {
      return `${seconds}s ago`;
    } else if (minutes < 60) {
      return `${minutes}m ${seconds}s ago`;
    } else {
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      return `${hours}h ${remainingMinutes}m ago`;
    }
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
              <p className="text-sm opacity-75">🔄 Auto-refreshes every 30 seconds</p>
            </div>

            {/* Cache Status Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-8">
              {Object.entries(cacheStatus.cache).map(([key, entry]) => {
                const getIcon = (key: string) => {
                  switch (key) {
                    case 'territories': return '🗺️';
                    case 'guildData': return '🏰';
                    case 'lootpoolData': return '💰';
                    case 'aspectData': return '⚡';
                    default: return '📊';
                  }
                };

                const getTitle = (key: string) => {
                  switch (key) {
                    case 'territories': return 'Territories Cache';
                    case 'guildData': return 'Guild Data Cache';
                    case 'lootpoolData': return 'Lootpool Data Cache';
                    case 'aspectData': return 'Aspect Data Cache';
                    default: return `${key} Cache`;
                  }
                };

                return (
                  <div key={key} className={`border rounded-lg p-6 transition-colors ${
                    entry.cached 
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
                      {getIcon(key)} {getTitle(key)}
                    </h3>
                    <div className="space-y-3 pl-6">
                      <div className="flex items-start">
                        <span className={`w-2 h-2 rounded-full mr-4 -ml-6 mt-2 ${
                          entry.cached ? 'bg-green-500' : 'bg-red-500'
                        }`}></span>
                        <span className={darkMode ? 'text-gray-300' : 'text-gray-700'}>
                          <strong>Status:</strong> {entry.cached ? '✅ Cached' : '❌ Not cached'}
                        </span>
                      </div>
                      {entry.timestamp && (
                        <>
                          <div className="flex items-start">
                            <span className="w-2 h-2 rounded-full mr-4 -ml-6 mt-2 bg-blue-500"></span>
                            <span className={darkMode ? 'text-gray-300' : 'text-gray-700'}>
                              <strong>Last Updated:</strong> {formatDuration(entry.timestamp)}
                            </span>
                          </div>
                          {entry.expiresAt && (
                            <div className="flex items-start">
                              <span className={`w-2 h-2 rounded-full mr-4 -ml-6 mt-2 ${
                                entry.expired ? 'bg-red-500' : 'bg-green-500'
                              }`}></span>
                              <span className={darkMode ? 'text-gray-300' : 'text-gray-700'}>
                                <strong>Expires:</strong> {formatTimestamp(entry.expiresAt)}
                              </span>
                            </div>
                          )}
                          {entry.expired !== undefined && (
                            <div className="flex items-start">
                              <span className={`w-2 h-2 rounded-full mr-4 -ml-6 mt-2 ${
                                entry.expired ? 'bg-red-500' : 'bg-green-500'
                              }`}></span>
                              <span className={darkMode ? 'text-gray-300' : 'text-gray-700'}>
                                <strong>Expired:</strong> {entry.expired ? '❌ Yes' : '✅ No'}
                              </span>
                            </div>
                          )}
                          {entry.fetchCount !== undefined && (
                            <div className="flex items-start">
                              <span className="w-2 h-2 rounded-full mr-4 -ml-6 mt-2 bg-purple-500"></span>
                              <span className={darkMode ? 'text-gray-300' : 'text-gray-700'}>
                                <strong>Fetch Count:</strong> {entry.fetchCount}
                              </span>
                            </div>
                          )}
                          {entry.errorCount !== undefined && entry.errorCount > 0 && (
                            <div className="flex items-start">
                              <span className="w-2 h-2 rounded-full mr-4 -ml-6 mt-2 bg-red-500"></span>
                              <span className={darkMode ? 'text-gray-300' : 'text-gray-700'}>
                                <strong>Error Count:</strong> {entry.errorCount}
                              </span>
                            </div>
                          )}
                          {entry.dataSize !== undefined && (
                            <div className="flex items-start">
                              <span className="w-2 h-2 rounded-full mr-4 -ml-6 mt-2 bg-cyan-500"></span>
                              <span className={darkMode ? 'text-gray-300' : 'text-gray-700'}>
                                <strong>Data Size:</strong> {(entry.dataSize / 1024).toFixed(1)} KB
                              </span>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    {entry.lastError && (
                      <div className={`mt-4 p-3 rounded transition-colors ${
                        darkMode 
                          ? 'bg-red-900/20 border border-red-700'
                          : 'bg-red-50 border border-red-200'
                      }`}>
                        <span className={`text-sm ${
                          darkMode ? 'text-red-200' : 'text-red-700'
                        }`}>
                          <strong>Last Error:</strong> {entry.lastError}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Database Statistics */}
            {cacheStatus.statistics && (
              <div className={`p-6 rounded-lg border transition-colors ${
                darkMode 
                  ? 'bg-gray-800 border-gray-700'
                  : 'bg-white border-gray-200'
              }`}>
                <h2 className={`text-xl font-semibold mb-4 ${
                  darkMode ? 'text-white' : 'text-gray-900'
                }`}>
                  📊 Database Statistics
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className={`p-4 rounded transition-colors ${
                    darkMode 
                      ? 'bg-gray-700 border border-gray-600'
                      : 'bg-gray-100 border border-gray-200'
                  }`}>
                    <div className={`text-2xl font-bold ${darkMode ? 'text-green-400' : 'text-green-600'}`}>
                      {cacheStatus.statistics.totalEntries}
                    </div>
                    <div className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                      Total Entries
                    </div>
                  </div>
                  <div className={`p-4 rounded transition-colors ${
                    darkMode 
                      ? 'bg-gray-700 border border-gray-600'
                      : 'bg-gray-100 border border-gray-200'
                  }`}>
                    <div className={`text-2xl font-bold ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                      {cacheStatus.statistics.freshEntries}
                    </div>
                    <div className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                      Fresh Entries
                    </div>
                  </div>
                  <div className={`p-4 rounded transition-colors ${
                    darkMode 
                      ? 'bg-gray-700 border border-gray-600'
                      : 'bg-gray-100 border border-gray-200'
                  }`}>
                    <div className={`text-2xl font-bold ${darkMode ? 'text-red-400' : 'text-red-600'}`}>
                      {cacheStatus.statistics.expiredEntries}
                    </div>
                    <div className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                      Expired Entries
                    </div>
                  </div>
                  <div className={`p-4 rounded transition-colors ${
                    darkMode 
                      ? 'bg-gray-700 border border-gray-600'
                      : 'bg-gray-100 border border-gray-200'
                  }`}>
                    <div className={`text-sm font-medium ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                      Last Update
                    </div>
                    <div className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                      {cacheStatus.statistics.lastUpdate ? formatTimestamp(new Date(cacheStatus.statistics.lastUpdate).getTime()) : 'Never'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Additional Info */}
            <div className={`p-6 rounded-lg border transition-colors ${
              darkMode 
                ? 'bg-gray-800 border-gray-700'
                : 'bg-white border-gray-200'
            }`}>
              <h2 className={`text-xl font-semibold mb-4 ${
                darkMode ? 'text-white' : 'text-gray-900'
              }`}>
                🔧 System Information
              </h2>
              <div className="space-y-2">
                <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  <strong>Cache Source:</strong> {cacheStatus.source || 'Unknown'}
                </p>
                <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  <strong>Auto-refresh:</strong> Every 30 seconds
                </p>
                <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  <strong>Cache Strategy:</strong> PostgreSQL database with TTL expiration
                </p>
                <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  <strong>Current Browser Time:</strong> {new Date().toLocaleString()} ({new Date().toISOString()})
                </p>
                <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  <strong>Last Refresh:</strong> {lastUpdate ? formatTimestamp(lastUpdate.getTime()) : 'Never'}
                </p>
                {cacheStatus.error && (
                  <p className={`text-sm ${darkMode ? 'text-red-400' : 'text-red-600'}`}>
                    <strong>Error:</strong> {cacheStatus.error}
                  </p>
                )}
              </div>
              
              {/* Debug Links */}
              <div className="mt-4 pt-4 border-t">
                <h3 className={`text-sm font-semibold mb-2 ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                  Debug Tools
                </h3>
                <div className="flex flex-wrap gap-2">
                  <a 
                    href="/api/cache/debug" 
                    target="_blank"
                    className={`text-xs px-3 py-1 rounded transition-colors ${
                      darkMode 
                        ? 'bg-blue-800 hover:bg-blue-700 text-blue-200'
                        : 'bg-blue-100 hover:bg-blue-200 text-blue-800'
                    }`}
                  >
                    Raw DB Debug
                  </a>
                  <a 
                    href="/api/cache/direct" 
                    target="_blank"
                    className={`text-xs px-3 py-1 rounded transition-colors ${
                      darkMode 
                        ? 'bg-green-800 hover:bg-green-700 text-green-200'
                        : 'bg-green-100 hover:bg-green-200 text-green-800'
                    }`}
                  >
                    Direct Cache API
                  </a>
                  <button 
                    onClick={fetchCacheStatus}
                    className={`text-xs px-3 py-1 rounded transition-colors ${
                      darkMode 
                        ? 'bg-purple-800 hover:bg-purple-700 text-purple-200'
                        : 'bg-purple-100 hover:bg-purple-200 text-purple-800'
                    }`}
                  >
                    Force Refresh
                  </button>
                  <button 
                    onClick={clearCache}
                    className={`text-xs px-3 py-1 rounded transition-colors ${
                      darkMode 
                        ? 'bg-red-800 hover:bg-red-700 text-red-200'
                        : 'bg-red-100 hover:bg-red-200 text-red-800'
                    }`}
                  >
                    Clear All Cache
                  </button>
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
