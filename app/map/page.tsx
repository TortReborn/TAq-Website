"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { loadTerritories, Territory, coordToPixel } from "@/lib/utils";
import TerritoryOverlay from "@/components/TerritoryOverlay";
import LandViewOverlay from "@/components/LandViewOverlay";
import TerritoryInfoPanel from "@/components/TerritoryInfoPanel";
import TerritoryHoverPanel from "@/components/TerritoryHoverPanel";
import TradeRoutesOverlay from "@/components/TradeRoutesOverlay";
import GuildTerritoryCount from "@/components/GuildTerritoryCount";
import MapSettings from "@/components/MapSettings";
import MapModeSelector from "@/components/MapModeSelector";
import MapHistoryControls from "@/components/MapHistoryControls";
import { TerritoryVerboseData, TerritoryExternalsData } from "@/lib/connection-calculator";
import { useTerritoryPrecomputation } from "@/hooks/useTerritoryPrecomputation";
import {
  HistoryBounds,
  expandSnapshot,
  ParsedSnapshot,
  getNextSnapshot,
  getPrevSnapshot,
  findNearestSnapshot,
  binarySearchNearest,
  mergeSnapshots,
  ExchangeEventData,
  ExchangeStore,
  buildExchangeStore,
  buildSnapshotsInRange,
} from "@/lib/history-data";

export default function MapPage() {
  // Store minimum scale in a ref
  const minScaleRef = useRef(0.1);
  
  // Touch state for mobile
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const [lastTouchDistance, setLastTouchDistance] = useState<number | null>(null);
  const [isTouching, setIsTouching] = useState(false);
  
  // Check if device is mobile
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  // Prevent browser zoom (Ctrl+wheel, pinch) in map view
  useEffect(() => {
    const preventZoom = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
      }
    };
    window.addEventListener("wheel", preventZoom, { passive: false });
    return () => window.removeEventListener("wheel", preventZoom);
  }, []);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [lastPanPoint, setLastPanPoint] = useState({ x: 0, y: 0 });
  const [mapDimensions, setMapDimensions] = useState({ width: 0, height: 0 });
  const [selectedTerritory, setSelectedTerritory] = useState<{ name: string; territory: Territory } | null>(null);
  const [hoveredTerritory, setHoveredTerritory] = useState<{ name: string; territory: Territory } | null>(null);
  const [showTerritories, setShowTerritories] = useState(true);
  const [showTimeOutlines, setShowTimeOutlines] = useState(true);
  const [showLandView, setShowLandView] = useState(false);
  const [showResourceOutlines, setShowResourceOutlines] = useState(false);
  const [showGuildNames, setShowGuildNames] = useState(true);
  const [showTradeRoutes, setShowTradeRoutes] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [territories, setTerritories] = useState<Record<string, Territory>>({});
  const [isLoadingTerritories, setIsLoadingTerritories] = useState(true);
  const [guildColors, setGuildColors] = useState<Record<string, string>>({});
  const [verboseData, setVerboseData] = useState<Record<string, TerritoryVerboseData> | null>(null);
  const [externalsData, setExternalsData] = useState<TerritoryExternalsData | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapImageRef = useRef<HTMLImageElement>(null);

  // History mode state
  const [viewMode, setViewMode] = useState<'live' | 'history'>('live');
  const [historyTimestamp, setHistoryTimestamp] = useState<Date | null>(null);
  const [loadedSnapshots, setLoadedSnapshots] = useState<ParsedSnapshot[]>([]);
  const [loadedWeekCenter, setLoadedWeekCenter] = useState<Date | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [historyBounds, setHistoryBounds] = useState<HistoryBounds | null>(null);
  const playbackIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Refs to hold current state for playback without re-creating intervals
  const historyTimestampRef = useRef<Date | null>(null);
  const loadedSnapshotsRef = useRef<ParsedSnapshot[]>([]);
  const loadedWeekCenterRef = useRef<Date | null>(null);

  // Bulk exchange data — loaded once on history enter, used for client-side reconstruction
  const exchangeStoreRef = useRef<ExchangeStore | null>(null);
  const exchangePromiseRef = useRef<Promise<ExchangeStore | null> | null>(null);

  // Precompute land view clusters in background (always running, even when not visible)
  const { landViewClusters } = useTerritoryPrecomputation({
    territories,
    verboseData,
    guildColors,
    enabled: true, // Always precompute for instant toggle
  });

  // Track hovered guild for land view tooltip
  const [hoveredGuildInfo, setHoveredGuildInfo] = useState<{ name: string; area: number } | null>(null);

  // Handle guild hover from LandViewOverlay
  const handleGuildHover = useCallback((guildName: string | null, landArea: number) => {
    if (guildName) {
      setHoveredGuildInfo({ name: guildName, area: landArea });
    } else {
      setHoveredGuildInfo(null);
    }
  }, []);

  // Format area for display (e.g., "1.2M m²" or "500K m²")
  const formatArea = (area: number): string => {
    if (area >= 1_000_000) {
      return `${(area / 1_000_000).toFixed(1)}M m²`;
    } else if (area >= 1_000) {
      return `${(area / 1_000).toFixed(0)}K m²`;
    }
    return `${area.toFixed(0)} m²`;
  };

  // Helper function to clamp scale between min and max values
  const clampScale = useCallback((value: number): number => {
    const minScale = minScaleRef.current;
    return Math.max(minScale, Math.min(213, value));
  }, []);

  // Load cached position and scale from localStorage
  useEffect(() => {
    const cachedPosition = localStorage.getItem('map-position');
    const cachedScale = localStorage.getItem('map-scale');
    const cachedShowTerritories = localStorage.getItem('mapShowTerritories');
    const cachedShowTimeOutlines = localStorage.getItem('mapShowTimeOutlines');

    if (cachedPosition) {
      try {
        const parsed = JSON.parse(cachedPosition);
        setPosition(parsed);
      } catch (error) {
        console.error('Failed to parse cached position:', error);
      }
    }

    if (cachedScale) {
      try {
        const parsed = parseFloat(cachedScale);
        if (!isNaN(parsed)) {
          setScale(clampScale(parsed));
        }
      } catch (error) {
        console.error('Failed to parse cached scale:', error);
      }
    }

    // Load map settings
    if (cachedShowTerritories !== null) {
      setShowTerritories(cachedShowTerritories === 'true');
    }
    if (cachedShowTimeOutlines !== null) {
      setShowTimeOutlines(cachedShowTimeOutlines === 'true');
    }
    const cachedShowLandView = localStorage.getItem('mapShowLandView');
    if (cachedShowLandView !== null) {
      setShowLandView(cachedShowLandView === 'true');
    }
    const cachedShowResourceOutlines = localStorage.getItem('mapShowResourceOutlines');
    if (cachedShowResourceOutlines !== null) {
      setShowResourceOutlines(cachedShowResourceOutlines === 'true');
    }
    const cachedShowGuildNames = localStorage.getItem('mapShowGuildNames');
    if (cachedShowGuildNames !== null) {
      setShowGuildNames(cachedShowGuildNames === 'true');
    }
    const cachedShowTradeRoutes = localStorage.getItem('mapShowTradeRoutes');
    if (cachedShowTradeRoutes !== null) {
      setShowTradeRoutes(cachedShowTradeRoutes === 'true');
    }
    const cachedViewMode = localStorage.getItem('mapViewMode');
    if (cachedViewMode === 'live' || cachedViewMode === 'history') {
      setViewMode(cachedViewMode);
    }

    setIsInitialized(true);
  }, [clampScale]);

  // Save position and scale to localStorage whenever they change
  useEffect(() => {
    if (isInitialized) {
      localStorage.setItem('map-position', JSON.stringify(position));
    }
  }, [position, isInitialized]);

  useEffect(() => {
    if (isInitialized) {
      localStorage.setItem('map-scale', scale.toString());
    }
  }, [scale, isInitialized]);

  // Save map settings to localStorage
  useEffect(() => {
    if (isInitialized) {
      localStorage.setItem('mapShowTerritories', String(showTerritories));
    }
  }, [showTerritories, isInitialized]);

  useEffect(() => {
    if (isInitialized) {
      localStorage.setItem('mapShowTimeOutlines', String(showTimeOutlines));
    }
  }, [showTimeOutlines, isInitialized]);

  useEffect(() => {
    if (isInitialized) {
      localStorage.setItem('mapShowLandView', String(showLandView));
    }
  }, [showLandView, isInitialized]);

  useEffect(() => {
    if (isInitialized) {
      localStorage.setItem('mapShowResourceOutlines', String(showResourceOutlines));
    }
  }, [showResourceOutlines, isInitialized]);

  useEffect(() => {
    if (isInitialized) {
      localStorage.setItem('mapShowGuildNames', String(showGuildNames));
    }
  }, [showGuildNames, isInitialized]);

  useEffect(() => {
    if (isInitialized) {
      localStorage.setItem('mapShowTradeRoutes', String(showTradeRoutes));
    }
  }, [showTradeRoutes, isInitialized]);

  useEffect(() => {
    if (isInitialized) {
      localStorage.setItem('mapViewMode', viewMode);
    }
  }, [viewMode, isInitialized]);

  // Load guild colors from cached database
  const loadGuildColorsData = async () => {
    try {
      const response = await fetch('/api/guild-colors/cached');
      if (response.ok) {
        const data = await response.json();
        return data.guildColors || {};
      }
      console.warn('Failed to load guild colors from cache');
      return {};
    } catch (error) {
      console.error('Error loading guild colors:', error);
      return {};
    }
  };

  // Load territories verbose data for connection calculations
  const loadVerboseData = async (): Promise<Record<string, TerritoryVerboseData>> => {
    try {
      const response = await fetch('/territories_verbose.json');
      if (response.ok) {
        return await response.json();
      }
      console.warn('Failed to load territories verbose data');
      return {};
    } catch (error) {
      console.error('Error loading territories verbose data:', error);
      return {};
    }
  };

  // Load territory externals data for HQ external calculations
  const loadExternalsData = async (): Promise<TerritoryExternalsData> => {
    try {
      const response = await fetch('/territory_externals.json');
      if (response.ok) {
        return await response.json();
      }
      console.warn('Failed to load territory externals data');
      return {};
    } catch (error) {
      console.error('Error loading territory externals data:', error);
      return {};
    }
  };

  // Load static data (guild colors, verbose data, externals) - needed for both modes
  useEffect(() => {
    let isMounted = true;

    const loadStaticData = async () => {
      try {
        const [guildColorData, verboseDataResult, externalsDataResult] = await Promise.all([
          loadGuildColorsData(),
          loadVerboseData(),
          loadExternalsData()
        ]);

        if (isMounted) {
          setGuildColors({ ...guildColorData });
          setVerboseData(verboseDataResult);
          setExternalsData(externalsDataResult);
          console.log('🎨 Loaded guild colors:', Object.keys(guildColorData).length, 'guilds');
          console.log('📊 Loaded verbose data:', Object.keys(verboseDataResult).length, 'territories');
          console.log('🔗 Loaded externals data:', Object.keys(externalsDataResult).length, 'territories');
        }
      } catch (error) {
        console.error('Failed to load static map data:', error);
      }
    };

    loadStaticData();
    return () => {
      isMounted = false;
    };
  }, []);

  // Load live territories from API cache (only in live mode)
  useEffect(() => {
    if (viewMode === 'history') return;

    let isMounted = true;

    const loadLiveData = async () => {
      setIsLoadingTerritories(true);
      try {
        const territoryData = await loadTerritories();

        if (isMounted) {
          setTerritories({ ...territoryData });
          console.log('🗺️ Updated territories data:', Object.keys(territoryData).length, 'territories');
        }
      } catch (error) {
        console.error('Failed to load live territory data:', error);
      } finally {
        if (isMounted) setIsLoadingTerritories(false);
      }
    };

    loadLiveData();
    const interval = setInterval(loadLiveData, 30000); // 30 seconds to match cache TTL
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [viewMode]);

  // Fetch history bounds on page load
  useEffect(() => {
    const fetchHistoryBounds = async () => {
      try {
        const response = await fetch('/api/map-history/bounds');
        if (response.ok) {
          const data = await response.json();
          if (data.earliest && data.latest) {
            setHistoryBounds({
              earliest: data.earliest,
              latest: data.latest,
              gaps: data.gaps,
            });
          }
        }
      } catch (error) {
        console.error('Failed to fetch history bounds:', error);
      }
    };
    fetchHistoryBounds();
  }, []);

  // -----------------------------------------------------------------------
  // Exchange data: load once, reconstruct snapshots client-side
  // -----------------------------------------------------------------------

  /** Fetch all exchange events if not already loaded. Returns the store. */
  const ensureExchangeData = useCallback(async (): Promise<ExchangeStore | null> => {
    if (exchangeStoreRef.current) return exchangeStoreRef.current;
    if (exchangePromiseRef.current) return exchangePromiseRef.current; // wait for in-flight

    const promise = (async () => {
      try {
        const response = await fetch('/api/map-history/exchanges');
        if (!response.ok) return null;
        const data: ExchangeEventData = await response.json();
        const store = buildExchangeStore(data);
        exchangeStoreRef.current = store;
        return store;
      } catch (error) {
        console.error('Failed to load exchange data:', error);
        return null;
      } finally {
        exchangePromiseRef.current = null;
      }
    })();

    exchangePromiseRef.current = promise;
    return promise;
  }, []);

  /**
   * Load snapshots around a date using client-side reconstruction
   * from the exchange data store.
   */
  const loadWeekSnapshots = useCallback(async (centerDate: Date, replace: boolean = false) => {
    setIsLoadingHistory(true);
    try {
      const store = await ensureExchangeData();
      if (!store) {
        console.error('Failed to load exchange data');
        return;
      }

      const HALF_WEEK_MS = 3.5 * 24 * 60 * 60 * 1000;
      const start = new Date(centerDate.getTime() - HALF_WEEK_MS);
      const end = new Date(centerDate.getTime() + HALF_WEEK_MS);
      const snapshots = buildSnapshotsInRange(store, start, end);

      if (replace) {
        setLoadedSnapshots(snapshots);
      } else {
        setLoadedSnapshots(prev => mergeSnapshots(prev, snapshots));
      }
      setLoadedWeekCenter(centerDate);

      if (replace && snapshots.length > 0) {
        const nearest = findNearestSnapshot(snapshots, centerDate);
        if (nearest) setHistoryTimestamp(nearest.timestamp);
      }
    } catch (error) {
      console.error('Failed to load snapshots:', error);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [ensureExchangeData]);

  // Keep refs in sync with state (for stable playback interval)
  useEffect(() => { historyTimestampRef.current = historyTimestamp; }, [historyTimestamp]);
  useEffect(() => { loadedSnapshotsRef.current = loadedSnapshots; }, [loadedSnapshots]);
  useEffect(() => { loadedWeekCenterRef.current = loadedWeekCenter; }, [loadedWeekCenter]);

  // Ref for loadWeekSnapshots so playback interval can call it without dependency churn
  const loadWeekSnapshotsRef = useRef(loadWeekSnapshots);
  useEffect(() => { loadWeekSnapshotsRef.current = loadWeekSnapshots; }, [loadWeekSnapshots]);

  // Load history data when restoring history mode from cache
  useEffect(() => {
    if (isInitialized && viewMode === 'history' && historyBounds && loadedSnapshots.length === 0) {
      const centerDate = new Date(historyBounds.latest);
      loadWeekSnapshots(centerDate, true);
    }
  }, [isInitialized, viewMode, historyBounds, loadedSnapshots.length, loadWeekSnapshots]);

  // Handle mode change
  const handleModeChange = useCallback((mode: 'live' | 'history') => {
    setViewMode(mode);
    if (mode === 'history') {
      // Stop playback when entering history mode
      setIsPlaying(false);
      // Load week around current time (or latest if bounds exist)
      const centerDate = historyBounds?.latest ? new Date(historyBounds.latest) : new Date();
      loadWeekSnapshots(centerDate, true); // replace: fresh entry
    } else {
      // Clear history state when returning to live
      setHistoryTimestamp(null);
      setLoadedSnapshots([]);
      setLoadedWeekCenter(null);
      setIsPlaying(false);
      exchangeStoreRef.current = null;
    }
  }, [historyBounds, loadWeekSnapshots]);

  // Handle timeline scrubbing — loads data when needed
  const handleTimeChange = useCallback((date: Date) => {
    setHistoryTimestamp(date);

    // Check if the scrubbed-to date has nearby loaded data
    const snaps = loadedSnapshotsRef.current;
    if (snaps.length > 0) {
      const idx = binarySearchNearest(snaps, date.getTime());
      if (idx >= 0) {
        const nearestGap = Math.abs(snaps[idx].timestamp.getTime() - date.getTime());
        if (nearestGap <= 30 * 60 * 1000) {
          // Data is nearby — check if we need to preload ahead
          const lastLoaded = snaps[snaps.length - 1].timestamp;
          const DAY_MS = 24 * 60 * 60 * 1000;
          if (lastLoaded.getTime() - date.getTime() < DAY_MS) {
            const nextCenter = new Date(lastLoaded.getTime() + 3.5 * DAY_MS);
            loadWeekSnapshots(nextCenter, false);
          }
          return;
        }
      }
    }

    // No nearby data — replace (not merge) since we're far from existing data.
    // Merging would create a discontinuous array with a multi-year gap,
    // causing playback to jump across the gap to a different era.
    loadWeekSnapshots(date, true);
  }, [loadWeekSnapshots]);

  // Handle date picker jump
  const handleJumpToDate = useCallback((date: Date) => {
    setHistoryTimestamp(date);
    // Always load a new week when jumping (replace for arbitrary jump)
    loadWeekSnapshots(date, true);
  }, [loadWeekSnapshots]);

  // Handle history refresh - re-fetch bounds and reload data
  const handleHistoryRefresh = useCallback(async () => {
    // Stop playback
    setIsPlaying(false);

    // Clear cached exchange data so it re-fetches
    exchangeStoreRef.current = null;

    try {
      // Re-fetch bounds
      const boundsResponse = await fetch('/api/map-history/bounds');
      if (boundsResponse.ok) {
        const boundsData = await boundsResponse.json();
        if (boundsData.earliest && boundsData.latest) {
          setHistoryBounds({
            earliest: boundsData.earliest,
            latest: boundsData.latest,
            gaps: boundsData.gaps,
          });

          // Load latest data — loadWeekSnapshots handles exchange vs bot range
          const latestDate = new Date(boundsData.latest);
          await loadWeekSnapshots(latestDate, true);
        }
      }
    } catch (error) {
      console.error('Failed to refresh history:', error);
    }
  }, [loadWeekSnapshots]);

  // Unified snapshot lookup — single binary search derives index + expanded territories.
  // Returns null for historyTerritories if the nearest snapshot is too far from the
  // requested timestamp (data not yet loaded for that time range).
  const MAX_SNAPSHOT_GAP_MS = 30 * 60 * 1000; // 30 minutes

  const { currentSnapshotIndex, historyTerritories } = useMemo(() => {
    if (viewMode !== 'history' || !historyTimestamp || loadedSnapshots.length === 0) {
      return { currentSnapshotIndex: -1, historyTerritories: null };
    }
    const idx = binarySearchNearest(loadedSnapshots, historyTimestamp.getTime());
    if (idx === -1) {
      return { currentSnapshotIndex: -1, historyTerritories: null };
    }
    const snapshot = loadedSnapshots[idx];

    // Don't show stale data — if the nearest snapshot is too far away,
    // return null so the UI shows a loading state instead
    const gap = Math.abs(snapshot.timestamp.getTime() - historyTimestamp.getTime());
    if (gap > MAX_SNAPSHOT_GAP_MS) {
      return { currentSnapshotIndex: -1, historyTerritories: null };
    }

    const expanded = expandSnapshot(snapshot.territories, verboseData, guildColors);
    return { currentSnapshotIndex: idx, historyTerritories: expanded };
  }, [viewMode, historyTimestamp, loadedSnapshots, verboseData, guildColors]);

  // Step forward/backward handlers
  const handleStepForward = useCallback(() => {
    const current = historyTimestamp || new Date();
    const next = getNextSnapshot(loadedSnapshots, current);
    if (next) {
      setHistoryTimestamp(next.timestamp);

      // Preload ahead when within 1 day of the end of loaded data
      if (loadedSnapshots.length > 0) {
        const lastLoaded = loadedSnapshots[loadedSnapshots.length - 1].timestamp;
        const DAY_MS = 24 * 60 * 60 * 1000;
        if (lastLoaded.getTime() - next.timestamp.getTime() < DAY_MS) {
          const nextCenter = new Date(lastLoaded.getTime() + 3.5 * DAY_MS);
          loadWeekSnapshots(nextCenter, false);
        }
      }
    }
  }, [loadedSnapshots, historyTimestamp, loadWeekSnapshots]);

  const handleStepBackward = useCallback(() => {
    const prev = getPrevSnapshot(loadedSnapshots, historyTimestamp || new Date());
    if (prev) {
      setHistoryTimestamp(prev.timestamp);
    }
  }, [loadedSnapshots, historyTimestamp]);

  // Jump to absolute start/end of the slider range
  const handleJumpToStart = useCallback(() => {
    if (!historyBounds) return;
    const start = new Date(historyBounds.earliest);
    setHistoryTimestamp(start);
    loadWeekSnapshots(start, true);
  }, [historyBounds, loadWeekSnapshots]);

  const handleJumpToEnd = useCallback(() => {
    if (!historyBounds) return;
    const end = new Date(historyBounds.latest);
    setHistoryTimestamp(end);
    loadWeekSnapshots(end, true);
  }, [historyBounds, loadWeekSnapshots]);

  // Skip a timestamp forward past any gap it falls inside.
  // Returns the gap's end if inside a gap, or the original time if not.
  const skipGapForward = useCallback((time: Date): Date => {
    const gaps = historyBounds?.gaps;
    if (!gaps || gaps.length === 0) return time;
    const ms = time.getTime();
    for (const gap of gaps) {
      const gapStart = new Date(gap.start).getTime();
      const gapEnd = new Date(gap.end).getTime();
      if (ms >= gapStart && ms <= gapEnd) {
        return new Date(gapEnd);
      }
    }
    return time;
  }, [historyBounds]);

  // Skip a timestamp backward past any gap it falls inside.
  const skipGapBackward = useCallback((time: Date): Date => {
    const gaps = historyBounds?.gaps;
    if (!gaps || gaps.length === 0) return time;
    const ms = time.getTime();
    for (const gap of gaps) {
      const gapStart = new Date(gap.start).getTime();
      const gapEnd = new Date(gap.end).getTime();
      if (ms >= gapStart && ms <= gapEnd) {
        return new Date(gapStart);
      }
    }
    return time;
  }, [historyBounds]);

  // Playback logic — stable interval that reads from refs to avoid
  // tearing down and recreating on every tick
  useEffect(() => {
    if (!isPlaying || viewMode !== 'history') return;

    const FAST_SPEED = -1;
    const isFast = playbackSpeed === FAST_SPEED;
    const intervalMs = isFast ? 100 : 1000 / playbackSpeed;
    const DAY_MS = 24 * 60 * 60 * 1000;

    const tick = () => {
      const currentTs = historyTimestampRef.current;
      const snapshots = loadedSnapshotsRef.current;

      if (!currentTs) return;

      if (isFast) {
        // Fast mode: jump forward 1 day per tick, skipping gaps
        let nextTime = new Date(currentTs.getTime() + DAY_MS);
        nextTime = skipGapForward(nextTime);
        const bounds = historyBounds;
        if (bounds && nextTime.getTime() > new Date(bounds.latest).getTime()) {
          setHistoryTimestamp(new Date(bounds.latest));
          setIsPlaying(false);
          return;
        }
        setHistoryTimestamp(nextTime);
        // Trigger snapshot loading around the new time
        loadWeekSnapshotsRef.current(nextTime, false);
        return;
      }

      if (snapshots.length === 0) return;

      const next = getNextSnapshot(snapshots, currentTs);
      if (next) {
        setHistoryTimestamp(next.timestamp);

        // Preload ahead when within 1 day of the end of loaded data
        const lastLoaded = snapshots[snapshots.length - 1].timestamp;
        if (lastLoaded.getTime() - next.timestamp.getTime() < DAY_MS) {
          const nextCenter = new Date(lastLoaded.getTime() + 3.5 * DAY_MS);
          loadWeekSnapshotsRef.current(nextCenter, false);
        }
      } else {
        setIsPlaying(false);
      }
    };

    playbackIntervalRef.current = setInterval(tick, intervalMs);

    return () => {
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current);
      }
    };
  }, [isPlaying, playbackSpeed, viewMode, historyBounds, skipGapForward]);

  // Determine which territories to display
  const displayTerritories = viewMode === 'history' && historyTerritories
    ? historyTerritories
    : territories;

  // Get snapshot timestamps for timeline snapping
  const snapshotTimestamps = useMemo(() => {
    return loadedSnapshots.map(s => s.timestamp);
  }, [loadedSnapshots]);

  // Prevent body scrolling and overscroll on this page
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';
    document.documentElement.style.overscrollBehavior = 'none';
    return () => {
      document.body.style.overflow = 'auto';
      document.body.style.overscrollBehavior = '';
      document.documentElement.style.overscrollBehavior = '';
    };
  }, []);

  // Initialize map to fit container when image loads
  const handleImageLoad = useCallback(() => {
    if (!mapImageRef.current || !containerRef.current) return;
    
    const img = mapImageRef.current;
    const containerRect = containerRef.current.getBoundingClientRect();
    
    // If image hasn't loaded yet, try again in a moment
    if (img.naturalWidth === 0 || img.naturalHeight === 0) {
      setTimeout(handleImageLoad, 100);
      return;
    }
    
    // Calculate scale to fit entire map in view
    const scaleX = containerRect.width / img.naturalWidth;
    const scaleY = containerRect.height / img.naturalHeight;
    const fitScale = Math.min(scaleX, scaleY);
    minScaleRef.current = fitScale;

    setMapDimensions({ width: img.naturalWidth, height: img.naturalHeight });

    // Only set initial position and scale if not cached or if cached values are invalid
    const hasValidCache = localStorage.getItem('map-position') && localStorage.getItem('map-scale');
    if (!hasValidCache || !isInitialized) {
      setScale(clampScale(fitScale));
      // Center the map
      const scaledWidth = img.naturalWidth * fitScale;
      const scaledHeight = img.naturalHeight * fitScale;
      setPosition({
        x: (containerRect.width - scaledWidth) / 2,
        y: (containerRect.height - scaledHeight) / 2
      });
    }
  }, [isInitialized]);

  // Handle mouse down for dragging
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left click
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    setLastPanPoint({ x: position.x, y: position.y });
    e.preventDefault();
  }, [position]);

  // Handle mouse move for dragging
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    
    const deltaX = e.clientX - dragStart.x;
    const deltaY = e.clientY - dragStart.y;
    
    setPosition({
      x: lastPanPoint.x + deltaX,
      y: lastPanPoint.y + deltaY
    });
  }, [isDragging, dragStart, lastPanPoint]);

  // Handle mouse up
  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Touch event handlers for mobile
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      // Single touch - start panning
      setIsTouching(true);
      setTouchStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
      setLastPanPoint({ x: position.x, y: position.y });
    } else if (e.touches.length === 2) {
      // Two touches - start pinch zoom
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const distance = Math.sqrt(
        Math.pow(touch2.clientX - touch1.clientX, 2) + 
        Math.pow(touch2.clientY - touch1.clientY, 2)
      );
      setLastTouchDistance(distance);
      setIsTouching(false); // Disable panning during pinch
    }
  }, [position]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1 && isTouching && touchStart) {
      // Single touch - pan
      const deltaX = e.touches[0].clientX - touchStart.x;
      const deltaY = e.touches[0].clientY - touchStart.y;
      
      setPosition({
        x: lastPanPoint.x + deltaX,
        y: lastPanPoint.y + deltaY
      });
    } else if (e.touches.length === 2 && lastTouchDistance && containerRef.current) {
      // Two touches - pinch zoom
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const distance = Math.sqrt(
        Math.pow(touch2.clientX - touch1.clientX, 2) + 
        Math.pow(touch2.clientY - touch1.clientY, 2)
      );
      
      const rect = containerRef.current.getBoundingClientRect();
      const centerX = (touch1.clientX + touch2.clientX) / 2 - rect.left;
      const centerY = (touch1.clientY + touch2.clientY) / 2 - rect.top;
      
      const zoomFactor = distance / lastTouchDistance;
      const newScale = clampScale(scale * zoomFactor);
      
      // Zoom towards pinch center
      const scaleChange = newScale / scale;
      setPosition({
        x: centerX - (centerX - position.x) * scaleChange,
        y: centerY - (centerY - position.y) * scaleChange
      });
      setScale(newScale);
      setLastTouchDistance(distance);
    }
  }, [isTouching, touchStart, lastPanPoint, lastTouchDistance, scale, position, clampScale]);

  const handleTouchEnd = useCallback(() => {
    setIsTouching(false);
    setTouchStart(null);
    setLastTouchDistance(null);
  }, []);

  // Handle wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!containerRef.current || !mapImageRef.current) return;
    
    e.preventDefault();
    
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = clampScale(scale * zoomFactor);

    // Zoom towards mouse position
    const scaleChange = newScale / scale;
    setPosition({
      x: mouseX - (mouseX - position.x) * scaleChange,
      y: mouseY - (mouseY - position.y) * scaleChange
    });
    setScale(newScale);
  }, [scale, position, clampScale]);

  // Zoom controls
  const zoomIn = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    
    const newScale = clampScale(scale * 1.2);
    const scaleChange = newScale / scale;
    
    setPosition({
      x: centerX - (centerX - position.x) * scaleChange,
      y: centerY - (centerY - position.y) * scaleChange
    });
    setScale(newScale);
  }, [scale, position, clampScale]);

  const zoomOut = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const newScale = clampScale(scale * 0.8);
    const scaleChange = newScale / scale;

    setPosition({
      x: centerX - (centerX - position.x) * scaleChange,
      y: centerY - (centerY - position.y) * scaleChange
    });
    setScale(newScale);
  }, [scale, position, clampScale]);

  const resetView = useCallback(() => {
    if (!containerRef.current || !mapImageRef.current) return;

    const img = mapImageRef.current;
    const containerRect = containerRef.current.getBoundingClientRect();

    // Calculate scale to fit entire map
    const scaleX = containerRect.width / img.naturalWidth;
    const scaleY = containerRect.height / img.naturalHeight;
    const fitScale = Math.min(scaleX, scaleY);

    // Center the map
    const scaledWidth = img.naturalWidth * fitScale;
    const scaledHeight = img.naturalHeight * fitScale;
    const newPosition = {
      x: (containerRect.width - scaledWidth) / 2,
      y: (containerRect.height - scaledHeight) / 2
    };

    setScale(clampScale(fitScale));
    setPosition(newPosition);
    setIsAnimating(true);
    setTimeout(() => setIsAnimating(false), 1000);
  }, [clampScale]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (mapImageRef.current?.complete) {
        handleImageLoad();
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [handleImageLoad]);

  // Additional effect to ensure proper initialization
  useEffect(() => {
    const timer = setTimeout(() => {
      if (mapImageRef.current?.complete && containerRef.current) {
        handleImageLoad();
      }
    }, 200);
    
    return () => clearTimeout(timer);
  }, [handleImageLoad]);


  // Territory interaction handlers
  const handleTerritoryClick = useCallback((name: string, territory: Territory) => {
    setSelectedTerritory({ name, territory });
  }, []);

  const handleTerritoryHover = useCallback((name: string, territory: Territory) => {
    setHoveredTerritory({ name, territory });
  }, []);

  const handleTerritoryLeave = useCallback(() => {
    setHoveredTerritory(null);
  }, []);

  // Handle guild click to zoom to guild territories
  const handleGuildZoom = useCallback((guildName: string) => {
    if (!containerRef.current) return;

    const guildTerritories = Object.values(territories).filter(
      territory => territory.guild.name === guildName
    );

    if (guildTerritories.length === 0) return;

    // Calculate bounding box of all guild territories
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    guildTerritories.forEach(territory => {
      const start = territory.location.start;
      const end = territory.location.end;
      minX = Math.min(minX, start[0], end[0]);
      minY = Math.min(minY, start[1], end[1]);
      maxX = Math.max(maxX, start[0], end[0]);
      maxY = Math.max(maxY, start[1], end[1]);
    });

    // Convert coordinates to pixels
    const topLeftPixel = coordToPixel([minX, minY]);
    const bottomRightPixel = coordToPixel([maxX, maxY]);

    // Calculate dimensions
    const boundingWidth = bottomRightPixel[0] - topLeftPixel[0];
    const boundingHeight = bottomRightPixel[1] - topLeftPixel[1];
    const boundingCenterX = (topLeftPixel[0] + bottomRightPixel[0]) / 2;
    const boundingCenterY = (topLeftPixel[1] + bottomRightPixel[1]) / 2;

    // Calculate scale to fit bounding box with some padding
    const containerRect = containerRef.current.getBoundingClientRect();
    const padding = 100; // pixels of padding around the territories
    const scaleX = (containerRect.width - padding * 2) / boundingWidth;
    const scaleY = (containerRect.height - padding * 2) / boundingHeight;
    const newScale = clampScale(Math.min(scaleX, scaleY));

    // Calculate position to center the bounding box
    const newPosition = {
      x: containerRect.width / 2 - boundingCenterX * newScale,
      y: containerRect.height / 2 - boundingCenterY * newScale
    };

    setScale(newScale);
    setPosition(newPosition);
    setIsAnimating(true);
    
    // Clear animation state after transition completes with a slight buffer
    setTimeout(() => {
      setIsAnimating(false);
    }, 2000); // Slightly longer than transition duration to avoid jerky end
  }, [territories, clampScale]);

  return (
    <main style={{
      position: 'fixed',
      top: '5.5rem',
      left: 0,
      width: '100vw',
      height: 'calc(100vh - 5.5rem)',
      overflow: 'hidden'
    }}>
      <div style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '0.25rem'
      }}>
        {/* Map Container */}
        <div 
          ref={containerRef}
          style={{
            width: 'calc(100vw - 0.5rem)',
            height: 'calc(100vh - 6rem)',
            border: '2px solid var(--border-color)',
            borderRadius: '0.5rem',
            overflow: 'hidden',
            position: 'relative',
            cursor: isDragging ? 'grabbing' : 'grab',
            background: 'var(--bg-card)'
            // Remove touchAction: 'none' to allow touch events in child components
          }}
          onMouseDown={(e) => {
            // Only handle mouse events if they're not from the guild territory panel
            if (!e.target || !(e.target as Element).closest('.guild-territory-count')) {
              handleMouseDown(e);
            }
          }}
          onMouseMove={(e) => {
            // Only handle mouse events if they're not from the guild territory panel
            if (!e.target || !(e.target as Element).closest('.guild-territory-count')) {
              handleMouseMove(e);
            }
          }}
          onMouseUp={(e) => {
            // Only handle mouse events if they're not from the guild territory panel
            if (!e.target || !(e.target as Element).closest('.guild-territory-count')) {
              handleMouseUp();
            }
          }}
          onMouseLeave={(e) => {
            // Only handle mouse events if they're not from the guild territory panel
            if (!e.target || !(e.target as Element).closest('.guild-territory-count')) {
              handleMouseUp();
            }
          }}
          onWheel={(e) => {
            // Only handle wheel events if they're not from the guild territory panel
            if (!e.target || !(e.target as Element).closest('.guild-territory-count')) {
              handleWheel(e);
            }
          }}
          onTouchStart={(e) => {
            // Only handle touch events if they're not from the guild territory panel
            if (!e.target || !(e.target as Element).closest('.guild-territory-count')) {
              handleTouchStart(e);
            }
          }}
          onTouchMove={(e) => {
            // Only handle touch events if they're not from the guild territory panel
            if (!e.target || !(e.target as Element).closest('.guild-territory-count')) {
              handleTouchMove(e);
            }
          }}
          onTouchEnd={(e) => {
            // Only handle touch events if they're not from the guild territory panel
            if (!e.target || !(e.target as Element).closest('.guild-territory-count')) {
              handleTouchEnd();
            }
          }}
        >
          {/* Map and Territory Overlays (both transformed together) */}
          <div
            style={{
              position: 'absolute',
              transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
              transformOrigin: '0 0',
              width: mapDimensions.width,
              height: mapDimensions.height,
              transition: isAnimating ? 'transform 0.8s cubic-bezier(0.25, 0.1, 0.25, 1)' : 'none',
            }}
          >
            <img
              ref={mapImageRef}
              src="/images/map/wynncraft_map.png"
              alt="Wynncraft Map"
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                imageRendering: 'crisp-edges',
                userSelect: 'none',
                pointerEvents: 'none',
                width: mapDimensions.width,
                height: mapDimensions.height,
              }}
              onLoad={handleImageLoad}
              draggable={false}
            />
            {/* Territory Overlays - positioned in map pixel coordinates */}
            {showTerritories && !showLandView && Object.entries(displayTerritories).map(([name, territory]) => (
              <TerritoryOverlay
                key={name}
                name={name}
                territory={territory}
                scale={scale}
                isDragging={isDragging}
                onClick={handleTerritoryClick}
                onMouseEnter={handleTerritoryHover}
                onMouseLeave={handleTerritoryLeave}
                guildColors={guildColors}
                showTimeOutlines={viewMode === 'live' && showTimeOutlines}
                showResourceOutlines={viewMode === 'live' && showResourceOutlines}
                showGuildNames={viewMode === 'live' || showGuildNames}
                verboseData={verboseData?.[name] ?? null}
              />
            ))}
            {/* Land View Overlay - merged guild territories */}
            {showTerritories && showLandView && viewMode === 'live' && (
              <LandViewOverlay
                territories={displayTerritories}
                verboseData={verboseData}
                guildColors={guildColors}
                scale={scale}
                precomputedClusters={landViewClusters}
                onHoverGuild={handleGuildHover}
              />
            )}
            {/* Trade routes - only show when enabled, territories are visible, and Land View is off */}
            {showTradeRoutes && showTerritories && !showLandView && <TradeRoutesOverlay />}
          </div>

          {/* History loading overlay - shown when loading history data (initial restore or scrubbing) */}
          {viewMode === 'history' && (!historyTerritories || Object.keys(historyTerritories).length === 0) && (isLoadingHistory || historyTimestamp) && (
            <div style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0, 0, 0, 0.4)',
              zIndex: 15,
              pointerEvents: 'none',
            }}>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '1.5rem 2rem',
                background: 'var(--bg-card)',
                borderRadius: '0.75rem',
                border: '1px solid var(--border-color)',
                boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
              }}>
                <div style={{
                  width: '24px',
                  height: '24px',
                  border: '3px solid var(--border-color)',
                  borderTopColor: 'var(--accent-primary)',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                }} />
                <span style={{
                  fontSize: '0.875rem',
                  color: 'var(--text-secondary)',
                  fontWeight: 500,
                }}>Loading territory data...</span>
              </div>
              <style>{`
                @keyframes spin {
                  from { transform: rotate(0deg); }
                  to { transform: rotate(360deg); }
                }
              `}</style>
            </div>
          )}

          {/* Guild Land Tooltip - shown when hovering over land view polygons */}
          {showLandView && hoveredGuildInfo && (
            <div
              style={{
                position: 'absolute',
                top: '1rem',
                left: '1rem',
                backgroundColor: 'var(--bg-card)',
                border: '2px solid var(--border-color)',
                borderRadius: '0.5rem',
                padding: '0.75rem 1rem',
                zIndex: 20,
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                pointerEvents: 'none',
                minWidth: '150px',
              }}
            >
              <div style={{
                fontWeight: 'bold',
                fontSize: '1rem',
                color: 'var(--text-primary)',
                marginBottom: '0.25rem',
              }}>
                {hoveredGuildInfo.name}
              </div>
              <div style={{
                fontSize: '0.875rem',
                color: 'var(--text-secondary)',
              }}>
                Land: {formatArea(hoveredGuildInfo.area)}
              </div>
            </div>
          )}

          {/* Territory Hover Panel - shown when hovering and no territory is selected */}
          {!selectedTerritory && (
            <TerritoryHoverPanel
              territory={hoveredTerritory}
              guildColors={guildColors}
              verboseData={hoveredTerritory ? verboseData?.[hoveredTerritory.name] ?? null : null}
            />
          )}

          {/* Territory Info Panel - shown when a territory is clicked */}
          <TerritoryInfoPanel
            selectedTerritory={selectedTerritory}
            onClose={() => setSelectedTerritory(null)}
            panelId="territory-info-panel"
            guildColors={guildColors}
            territories={territories}
            verboseData={verboseData}
            externalsData={externalsData}
          />
          
          <GuildTerritoryCount territories={displayTerritories} onGuildClick={handleGuildZoom} guildColors={guildColors} showLandView={showLandView} />

          {/* Zoom Controls */}
          <div style={{
            position: 'absolute',
            bottom: '1rem',
            left: '1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
            zIndex: 10
          }}>
            <button
              onClick={resetView}
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '0.5rem',
                border: '2px solid var(--border-color)',
                background: 'var(--bg-card)',
                color: 'var(--text-primary)',
                fontSize: '1.25rem',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--bg-secondary)';
                e.currentTarget.style.transform = 'scale(1.05)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--bg-card)';
                e.currentTarget.style.transform = 'scale(1)';
              }}
              title="Reset View"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </button>
            <button
              onClick={zoomIn}
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '0.5rem',
                border: '2px solid var(--border-color)',
                background: 'var(--bg-card)',
                color: 'var(--text-primary)',
                fontSize: '1.25rem',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
              }}
              onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => {
                e.currentTarget.style.background = 'var(--bg-secondary)';
                e.currentTarget.style.transform = 'scale(1.05)';
              }}
              onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => {
                e.currentTarget.style.background = 'var(--bg-card)';
                e.currentTarget.style.transform = 'scale(1)';
              }}
              title="Zoom In"
            >
              +
            </button>
            <button
              onClick={zoomOut}
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '0.5rem',
                border: '2px solid var(--border-color)',
                background: 'var(--bg-card)',
                color: 'var(--text-primary)',
                fontSize: '1.25rem',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--bg-secondary)';
                e.currentTarget.style.transform = 'scale(1.05)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--bg-card)';
                e.currentTarget.style.transform = 'scale(1)';
              }}
              title="Zoom Out"
            >
              −
            </button>
            
          </div>

          {/* Bottom Right Controls Container - Mode selector + Settings */}
          <div style={{
            position: 'absolute',
            bottom: '1rem',
            right: '1rem',
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: '0.5rem',
            zIndex: 15,
          }}>
            {/* Mode Selector - always to the left */}
            <MapModeSelector
              mode={viewMode}
              onModeChange={handleModeChange}
              historyAvailable={!!historyBounds}
            />

            {/* Settings Button or Panel */}
            {showSettings ? (
              <MapSettings
                isOpen={showSettings}
                onClose={() => setShowSettings(false)}
                viewMode={viewMode}
                showTerritories={showTerritories}
                onShowTerritoriesChange={setShowTerritories}
                showTimeOutlines={showTimeOutlines}
                onShowTimeOutlinesChange={setShowTimeOutlines}
                showLandView={showLandView}
                onShowLandViewChange={setShowLandView}
                showResourceOutlines={showResourceOutlines}
                onShowResourceOutlinesChange={setShowResourceOutlines}
                showGuildNames={showGuildNames}
                onShowGuildNamesChange={setShowGuildNames}
                showTradeRoutes={showTradeRoutes}
                onShowTradeRoutesChange={setShowTradeRoutes}
              />
            ) : (
              <button
                onClick={() => setShowSettings(true)}
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '0.5rem',
                  border: '2px solid var(--border-color)',
                  background: 'var(--bg-card)',
                  color: 'var(--text-primary)',
                  fontSize: '1.25rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--bg-secondary)';
                  e.currentTarget.style.transform = 'scale(1.05)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--bg-card)';
                  e.currentTarget.style.transform = 'scale(1)';
                }}
                title="Map Settings"
              >
                ⚙
              </button>
            )}
          </div>

        </div>

        {/* History Controls - Outside the overflow:hidden map container so tooltip isn't clipped */}
        {viewMode === 'history' && historyBounds && historyTimestamp && (
          <div
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              bottom: '1.25rem',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 15,
            }}
          >
            <MapHistoryControls
              earliest={new Date(historyBounds.earliest)}
              latest={new Date(historyBounds.latest)}
              current={historyTimestamp}
              onTimeChange={handleTimeChange}
              onJump={handleJumpToDate}
              isPlaying={isPlaying}
              speed={playbackSpeed}
              onPlayPause={() => setIsPlaying(prev => !prev)}
              onSpeedChange={setPlaybackSpeed}
              onStepForward={handleStepForward}
              onStepBackward={handleStepBackward}
              onJumpToStart={handleJumpToStart}
              onJumpToEnd={handleJumpToEnd}
              canStepForward={currentSnapshotIndex < loadedSnapshots.length - 1}
              canStepBackward={currentSnapshotIndex > 0}
              isLoading={isLoadingHistory}
              snapshots={snapshotTimestamps}
              onRefresh={handleHistoryRefresh}
              containerBounds={containerRef.current ? {
                width: containerRef.current.clientWidth,
                height: containerRef.current.clientHeight
              } : undefined}
              gaps={historyBounds.gaps?.map(g => ({
                start: new Date(g.start),
                end: new Date(g.end),
              }))}
            />
          </div>
        )}
      </div>
    </main>
  );
}
