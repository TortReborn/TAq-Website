"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Globe, Home, Plus, Minus, Flag, Settings, BookOpen, HelpCircle } from "lucide-react";
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
import FactionPanel from "@/components/FactionPanel";
import ChroniclePanel from "@/components/ChroniclePanel";
import { ChronicleData, allianceColorsAt, chronicleEventColor } from "@/lib/chronicle";
import { TimelineEventMarker } from "@/components/HistoryTimeline";
import ConflictFinder from "@/components/ConflictFinder";
import OnboardingTour from "@/components/OnboardingTour";
import { useOnboardingTour } from "@/hooks/useOnboardingTour";
import MAP_TOUR_STEPS from "@/lib/map-tour-steps";
import { TerritoryVerboseData, TerritoryExternalsData } from "@/lib/connection-calculator";
import { useTerritoryPrecomputation } from "@/hooks/useTerritoryPrecomputation";
import { useSeasons } from "@/hooks/useSeasons";
import {
  HistoryBounds,
  expandSnapshot,
  ParsedSnapshot,
  ExchangeStore,
  buildExchangeStore,
  buildSnapshotAt,
  RangedExchangeEventData,
  buildExchangeStoreFromRanged,
  combineRangedEventData,
  mergeExchangeStores,
  InitialOwnerMap,
  buildInitialOwnerMap,
} from "@/lib/history-data";
import { loadCachedHistory, saveHistoryCache, clearHistoryCache } from "@/lib/history-cache";
import { shouldRenderTerritory, shouldRenderTradeRoute } from "@/lib/retired-territories";
import { ROL_UPDATE_CUTOFF_MS } from "@/lib/territory-abbreviations";
import { mapLog, mapError, mapTime, timedFetch } from "@/lib/map-logger";

// ---------------------------------------------------------------------------
// Old Realm of Light underlay (history mode, pre-Jan-2021 only).
//
// The original RoL region was deleted in the Jan 2021 rework; its territory
// boxes are drawn from archived coordinates, shifted south so they fit the
// current map image. This art (a period render of the old island, blue
// background keyed out) is drawn beneath those boxes, and a page-background
// cover hides the current map's NEW RoL inset art for those timestamps.
// World-coord boxes: [east/north] → [west/south].
// ---------------------------------------------------------------------------
const OLD_ROL_ART_RECT = (() => {
  const [x1, y1] = coordToPixel([105, -6631]);
  const [x2, y2] = coordToPixel([-1495, -5981]);
  return { left: Math.min(x1, x2), top: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
})();
const NEW_ROL_COVER_RECT = (() => {
  const [x1, y1] = coordToPixel([-400, -6634]);
  const [x2, y2] = coordToPixel([-1560, -5620]);
  return { left: Math.min(x1, x2), top: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
})();

/**
 * Merge fresh territory data into the previous record, reusing the previous
 * object for any territory whose content is unchanged. Preserved identities
 * let memoized overlays skip re-rendering on the periodic live poll.
 */
function mergePreservingIdentity(
  prev: Record<string, Territory>,
  next: Record<string, Territory>,
): Record<string, Territory> {
  const nextKeys = Object.keys(next);
  // Never wipe the map on a transient fetch failure (empty payload)
  if (nextKeys.length === 0) return prev;
  let changed = Object.keys(prev).length !== nextKeys.length;
  const out: Record<string, Territory> = {};
  for (const name of nextKeys) {
    const p = prev[name];
    const n = next[name];
    if (p && JSON.stringify(p) === JSON.stringify(n)) {
      out[name] = p;
    } else {
      out[name] = n;
      changed = true;
    }
  }
  return changed ? out : prev;
}

export function MapPageContent({ initialMode }: { initialMode?: 'live' | 'history' } = {}) {
  // Store minimum scale in a ref
  const minScaleRef = useRef(0.1);
  
  // Touch state for mobile
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const lastTouchDistanceRef = useRef<number | null>(null);
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

    // Safari (iOS and macOS) ignores `touch-action: none` for pinch and instead
    // fires these non-standard gesture events, zooming the whole page. They are
    // the only way to stop it, and they must be non-passive to be preventable.
    const preventGesture = (e: Event) => e.preventDefault();
    document.addEventListener("gesturestart", preventGesture, { passive: false });
    document.addEventListener("gesturechange", preventGesture, { passive: false });
    document.addEventListener("gestureend", preventGesture, { passive: false });

    return () => {
      window.removeEventListener("wheel", preventZoom);
      document.removeEventListener("gesturestart", preventGesture);
      document.removeEventListener("gesturechange", preventGesture);
      document.removeEventListener("gestureend", preventGesture);
    };
  }, []);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [lastPanPoint, setLastPanPoint] = useState({ x: 0, y: 0 });

  // Latest transform lives in refs; state is flushed at most once per animation
  // frame so pan/zoom doesn't re-render the tree once per raw input event.
  const scaleRef = useRef(1);
  const positionRef = useRef({ x: 0, y: 0 });
  const transformRafRef = useRef<number | null>(null);
  const applyTransform = useCallback((pos: { x: number; y: number } | null, scl: number | null) => {
    if (pos) positionRef.current = pos;
    if (scl !== null) scaleRef.current = scl;
    if (transformRafRef.current === null) {
      transformRafRef.current = requestAnimationFrame(() => {
        transformRafRef.current = null;
        setPosition(positionRef.current);
        setScale(scaleRef.current);
      });
    }
  }, []);
  useEffect(() => () => {
    if (transformRafRef.current !== null) {
      cancelAnimationFrame(transformRafRef.current);
      // Must clear the ref, not just cancel. Under StrictMode's mount/unmount/
      // remount the same ref object survives, so leaving a stale id here makes
      // applyTransform's `=== null` guard permanently false and every pan, zoom
      // and region-jump silently stops updating.
      transformRafRef.current = null;
    }
    if (animTimeoutRef.current) {
      clearTimeout(animTimeoutRef.current);
      animTimeoutRef.current = null;
    }
  }, []);

  // ── Animated transforms (region/guild zoom, reset view) ────────────────
  // One tracked timeout for the whole animation lifecycle. Each animated jump
  // previously scheduled its own untracked setTimeout(…, 2000) against a 0.8s
  // transition, so a second jump within that window let the FIRST timeout turn
  // the transition off mid-flight — the map snapped to its target instantly or
  // partway through the motion. The oversized window also left the transition
  // active long after the motion ended, so panning/zooming right after a jump
  // rubber-banded and then snapped.
  const animTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startAnimatedTransform = useCallback((pos: { x: number; y: number }, scl: number) => {
    if (animTimeoutRef.current) clearTimeout(animTimeoutRef.current);
    setIsAnimating(true);
    applyTransform(pos, scl);
    // Just past the 0.8s transition — manual control returns as soon as the
    // motion actually finishes
    animTimeoutRef.current = setTimeout(() => {
      setIsAnimating(false);
      animTimeoutRef.current = null;
    }, 850);
  }, [applyTransform]);

  // Direct user input takes over immediately: kill the transition so pans and
  // wheel zooms track the pointer 1:1 instead of easing toward it
  const cancelAnimation = useCallback(() => {
    if (animTimeoutRef.current) {
      clearTimeout(animTimeoutRef.current);
      animTimeoutRef.current = null;
    }
    setIsAnimating(false);
  }, []);
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
  const [opaqueFill, setOpaqueFill] = useState(false);
  const [showFactions, setShowFactions] = useState(false);
  // Chronicle layer — community-maintained alliances & events (see lib/chronicle).
  // One toggle drives everything: the panel, the alliance coloring and the
  // timeline event markers.
  const [showChronicle, setShowChronicle] = useState(false);
  const [chronicleData, setChronicleData] = useState<ChronicleData | null>(null);
  const [showConflictFinder, setShowConflictFinder] = useState(false);
  const [conflictBounds, setConflictBounds] = useState<{ start: Date; end: Date } | null>(null);
  const [isConflictFocused, setIsConflictFocused] = useState(false);
  const [factions, setFactions] = useState<Record<string, { name: string; color: string; guilds: string[] }>>({});
  const [territories, setTerritories] = useState<Record<string, Territory>>({});
  const [isLoadingTerritories, setIsLoadingTerritories] = useState(true);
  const [guildColors, setGuildColors] = useState<Record<string, string>>({});
  const [verboseData, setVerboseData] = useState<Record<string, TerritoryVerboseData> | null>(null);
  const [externalsData, setExternalsData] = useState<TerritoryExternalsData | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [showRegionMenu, setShowRegionMenu] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapImageRef = useRef<HTMLImageElement>(null);

  // Container dimensions tracked as state so children get a stable object
  // (reading containerRef.current during render produced a new object per render)
  const [containerSize, setContainerSize] = useState<{ width: number; height: number } | undefined>(undefined);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const width = el.clientWidth;
      const height = el.clientHeight;
      setContainerSize(prev => (prev && prev.width === width && prev.height === height) ? prev : { width, height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // History mode state
  const [viewMode, setViewMode] = useState<'live' | 'history'>(initialMode ?? 'live');

  // Guild seasons for history-timeline context. Fetched eagerly: the payload is
  // tiny and server-cached for 1h, and fetching it up front takes one request
  // out of the already-busy moment when the user switches to the history tab.
  const seasons = useSeasons(true);
  const [historyTimestamp, setHistoryTimestamp] = useState<Date | null>(null);

  // First-visit tour of the history view's controls (replayable via ? button)
  const tour = useOnboardingTour(viewMode === 'history', MAP_TOUR_STEPS, 'map_history_tour_complete');

  // (Re)fetch chronicle data each time the layer is opened, so exec edits and
  // deletions show up without a page reload; existing data stays while loading
  useEffect(() => {
    if (!showChronicle) return;
    let cancelled = false;
    timedFetch('static', '/api/chronicle')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setChronicleData(data);
      })
      .catch((error) => mapError('static', 'Failed to load chronicle data', error));
    return () => { cancelled = true; };
  }, [showChronicle]);

  // The moment the chronicle should describe: the history cursor, or "now" live
  const chronicleTimeMs = useMemo(() => {
    if (viewMode === 'history' && historyTimestamp) return historyTimestamp.getTime();
    return Date.now();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, historyTimestamp, showChronicle]);

  // Chronicle events → timeline markers
  const chronicleEventMarkers = useMemo<TimelineEventMarker[]>(() => {
    if (!showChronicle || !chronicleData) return [];
    return chronicleData.events.map((e) => ({
      id: e.id,
      title: e.title,
      color: chronicleEventColor(e.eventType),
      startMs: Date.parse(e.startsAt),
      endMs: e.endsAt ? Date.parse(e.endsAt) : null,
    }));
  }, [showChronicle, chronicleData]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [historyBounds, setHistoryBounds] = useState<HistoryBounds | null>(null);
  const playbackIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Exchange store — incrementally populated from /api/map-history/events chunks.
  // buildSnapshotAt(store, timestamp) reconstructs any snapshot in <1ms.
  const exchangeStoreRef = useRef<ExchangeStore | null>(null);
  const [storeVersion, setStoreVersion] = useState(0); // bumped when store changes to trigger useMemo
  // In-flight full-timeline load (Conflict Finder) — deduped across calls
  const fullLoadPromiseRef = useRef<Promise<ExchangeStore | null> | null>(null);
  // Initial owner map — defenders from each territory's first exchange (backfill early data)
  const initialOwnerMapRef = useRef<InitialOwnerMap | null>(null);

  // Initial snapshot for instant first paint (before event store is ready)
  const [initialSnapshot, setInitialSnapshot] = useState<ParsedSnapshot | null>(null);

  // Refs for playback stability (avoid re-creating intervals)
  const historyTimestampRef = useRef<Date | null>(null);

  // Background fetching — tracks loaded event ranges
  const eventRangesRef = useRef<Array<[number, number]>>([]); // [startMs, endMs][]
  const [loadedRanges, setLoadedRanges] = useState<Array<[number, number]>>([]);
  const bgAbortRef = useRef<AbortController | null>(null);
  // True while the background gap-filling loop is running — lets loadEvents
  // skip restarting it on every scrub tick
  const bgActiveRef = useRef(false);

  // All known guilds from guild_prefixes table (fetched once on mount)
  const [allKnownGuilds, setAllKnownGuilds] = useState<{ name: string; prefix: string }[]>([]);

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

  // Fetch all known guilds from guild_prefixes table (once on mount)
  useEffect(() => {
    fetch('/api/guilds/list')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.guilds) {
          const list: { name: string; prefix: string }[] = [];
          for (let i = 0; i < data.guilds.length; i++) {
            list.push({ name: data.guilds[i], prefix: data.prefixes[i] || '' });
          }
          setAllKnownGuilds(list);
        }
      })
      .catch((err) => console.error('Failed to fetch guild list:', err));
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
        applyTransform(parsed, null);
      } catch (error) {
        console.error('Failed to parse cached position:', error);
      }
    }

    if (cachedScale) {
      try {
        const parsed = parseFloat(cachedScale);
        if (!isNaN(parsed)) {
          applyTransform(null, clampScale(parsed));
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
    // Only restore cached view mode if no initialMode was provided via URL
    if (!initialMode) {
      const cachedViewMode = localStorage.getItem('mapViewMode');
      if (cachedViewMode === 'live' || cachedViewMode === 'history') {
        setViewMode(cachedViewMode);
      }
    }
    const cachedOpaqueFill = localStorage.getItem('mapOpaqueFill');
    if (cachedOpaqueFill !== null) {
      setOpaqueFill(cachedOpaqueFill === 'true');
    }
    const cachedShowChronicle = localStorage.getItem('mapShowChronicle');
    if (cachedShowChronicle !== null) {
      setShowChronicle(cachedShowChronicle === 'true');
    }
    setIsInitialized(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clampScale, applyTransform]);

  // Save position and scale to localStorage, debounced — these change every
  // frame during pan/zoom and synchronous writes per frame add jank
  useEffect(() => {
    if (!isInitialized) return;
    const timer = setTimeout(() => {
      localStorage.setItem('map-position', JSON.stringify(position));
      localStorage.setItem('map-scale', scale.toString());
    }, 300);
    return () => clearTimeout(timer);
  }, [position, scale, isInitialized]);

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

  useEffect(() => {
    if (isInitialized) {
      localStorage.setItem('mapOpaqueFill', String(opaqueFill));
    }
  }, [opaqueFill, isInitialized]);

  useEffect(() => {
    if (isInitialized) {
      localStorage.setItem('mapShowChronicle', String(showChronicle));
    }
  }, [showChronicle, isInitialized]);


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
      // ?v= busts stale browser copies when the file's contents change
      const response = await fetch('/territories_verbose.json?v=4');
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
      const doneStatic = mapTime('static', 'guild colors + verbose + externals');
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
          doneStatic({
            guildColors: Object.keys(guildColorData).length,
            verboseTerritories: Object.keys(verboseDataResult).length,
            externalsTerritories: Object.keys(externalsDataResult).length,
          });
        }
      } catch (error) {
        mapError('static', 'Failed to load static map data', error);
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
      const doneLive = mapTime('live', 'territory poll');
      try {
        const territoryData = await loadTerritories();

        if (isMounted) {
          setTerritories(prev => mergePreservingIdentity(prev, territoryData));
          doneLive({ territories: Object.keys(territoryData).length });
        }
      } catch (error) {
        mapError('live', 'Failed to load live territory data', error);
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
        const response = await timedFetch('bounds', '/api/map-history/bounds');
        if (response.ok) {
          const data = await response.json();
          if (data.earliest && data.latest) {
            setHistoryBounds({
              earliest: data.earliest,
              latest: data.latest,
              gaps: data.gaps,
              initialOwners: data.initialOwners,
            });
            mapLog('bounds', 'history bounds ready', {
              earliest: data.earliest,
              latest: data.latest,
              gaps: data.gaps?.length ?? 0,
              initialOwners: data.initialOwners ? Object.keys(data.initialOwners).length : 0,
            });
          }
        }
      } catch (error) {
        mapError('bounds', 'Failed to fetch history bounds', error);
      }
    };
    fetchHistoryBounds();
  }, []);

  // -----------------------------------------------------------------------
  // Event-based history loading with client-side reconstruction
  // -----------------------------------------------------------------------
  const CHUNK_MS = 3 * 30 * 24 * 60 * 60 * 1000; // 90 days per chunk cell
  const HALF_CHUNK_MS = CHUNK_MS / 2;
  const STEP_MS = 10 * 60 * 1000; // 10 minutes — snapshot interval
  // Canonical chunk grid: 90-day cells anchored at a fixed epoch. Every
  // request covers exactly one whole cell, so every client asks for identical
  // URLs — the CDN can then serve historical cells to first-time visitors
  // without touching the database (the events route marks fully-past ranges
  // immutable). The cell containing "now" naturally stays on a stable URL too;
  // its 1h cache lifetime bounds how stale the timeline tip can get.
  const CHUNK_EPOCH_MS = Date.UTC(2018, 0, 1);
  const cellStart = (ms: number) => CHUNK_EPOCH_MS + Math.floor((ms - CHUNK_EPOCH_MS) / CHUNK_MS) * CHUNK_MS;

  // One-time cache restoration shared by loadEvents and ensureExchangeData
  const cacheRestorePromiseRef = useRef<Promise<void> | null>(null);

  /** Check if a date range is already fully covered by loaded event ranges */
  const isRangeCovered = useCallback((startMs: number, endMs: number): boolean => {
    for (const [rStart, rEnd] of eventRangesRef.current) {
      if (rStart <= startMs && rEnd >= endMs) return true;
    }
    return false;
  }, []);

  /** Record a loaded event range (merge overlapping) */
  const recordRange = useCallback((startMs: number, endMs: number) => {
    const ranges = eventRangesRef.current;
    ranges.push([startMs, endMs]);
    ranges.sort((a, b) => a[0] - b[0]);
    const merged: Array<[number, number]> = [ranges[0]];
    for (let i = 1; i < ranges.length; i++) {
      const last = merged[merged.length - 1];
      if (ranges[i][0] <= last[1]) {
        last[1] = Math.max(last[1], ranges[i][1]);
      } else {
        merged.push(ranges[i]);
      }
    }
    eventRangesRef.current = merged;
    setLoadedRanges([...merged]);
  }, []);

  const restoreCacheOnce = useCallback((): Promise<void> => {
    if (!cacheRestorePromiseRef.current) {
      cacheRestorePromiseRef.current = (async () => {
        const doneRestore = mapTime('cache', 'restore history cache');
        try {
          const cached = await loadCachedHistory();
          if (!cached) {
            doneRestore({ hit: false });
          }
          if (cached) {
            // Restore the store from cached data (non-empty segments)
            exchangeStoreRef.current = buildExchangeStore(cached.exchangeData);

            // Mark non-empty ranges as covered (these never need re-fetching)
            for (const [s, e] of cached.dataRanges) {
              recordRange(s, e);
            }
            setStoreVersion(v => v + 1);
            doneRestore({ hit: true, ranges: cached.dataRanges.length });

            // Note: empty ranges are NOT recorded — they'll be re-fetched
            // by the background fetcher, which checks for uncovered ranges.
          }
        } catch (e) {
          mapError('cache', 'Failed to restore history cache', e);
        }
      })();
    }
    return cacheRestorePromiseRef.current;
  }, [recordRange]);

  /** Fetch exchange events for a date range from /api/map-history/events */
  // Data-mapping version, appended to chunk URLs purely as a cache buster.
  // Historical chunks are cached as immutable by the CDN and browser, so any
  // change to server-side name canonicalization (which alters chunk payloads)
  // must bump this to re-key every cached copy.
  // v2: old Realm of Light territories un-aliased from Light Forest.
  const EVENTS_DATA_VERSION = 2;

  const fetchEventRange = useCallback(async (
    startDate: Date,
    endDate: Date,
    signal?: AbortSignal,
  ): Promise<RangedExchangeEventData> => {
    const response = await timedFetch(
      'events',
      `/api/map-history/events?start=${startDate.toISOString()}&end=${endDate.toISOString()}&dv=${EVENTS_DATA_VERSION}`,
      signal ? { signal } : undefined,
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }, []);

  /**
   * Find all uncovered gaps within [boundsStart, boundsEnd] given the
   * current loaded ranges.  Returns an array of [start, end] gaps sorted
   * by start time.
   *
   * `extraRanges` — additional ranges to treat as covered (fetched chunks
   * whose store merge is still batched and not yet recorded).
   */
  const findUncoveredGaps = useCallback((
    boundsStart: number,
    boundsEnd: number,
    extraRanges?: Array<[number, number]>,
  ): Array<[number, number]> => {
    let ranges = eventRangesRef.current;
    if (extraRanges && extraRanges.length > 0) {
      const combined = [...ranges, ...extraRanges].sort((a, b) => a[0] - b[0]);
      const merged: Array<[number, number]> = [[combined[0][0], combined[0][1]]];
      for (let i = 1; i < combined.length; i++) {
        const last = merged[merged.length - 1];
        if (combined[i][0] <= last[1]) {
          last[1] = Math.max(last[1], combined[i][1]);
        } else {
          merged.push([combined[i][0], combined[i][1]]);
        }
      }
      ranges = merged;
    }
    if (ranges.length === 0) return [[boundsStart, boundsEnd]];

    const gaps: Array<[number, number]> = [];

    // Gap before the first loaded range
    if (ranges[0][0] > boundsStart) {
      gaps.push([boundsStart, ranges[0][0]]);
    }

    // Gaps between loaded ranges
    for (let i = 0; i < ranges.length - 1; i++) {
      const gapStart = ranges[i][1];
      const gapEnd = ranges[i + 1][0];
      if (gapEnd > gapStart) {
        gaps.push([gapStart, gapEnd]);
      }
    }

    // Gap after the last loaded range
    if (ranges[ranges.length - 1][1] < boundsEnd) {
      gaps.push([ranges[ranges.length - 1][1], boundsEnd]);
    }

    return gaps;
  }, []);

  /**
   * Background-fetch event chunks to progressively fill the entire timeline.
   * Expands outward from the current cursor position, alternating between
   * the nearest gap forward and the nearest gap backward so data loads
   * evenly in both directions from where the user is looking.
   */
  const startBackgroundFetch = useCallback(() => {
    // A loop is already draining the gap list — it re-derives the gaps on
    // every iteration, so it will pick up any newly relevant range on its own.
    // Restarting here (the old behavior) aborted the in-flight chunk request
    // on every scrub tick, so background loading never finished while the
    // user was interacting and each abandoned request still cost the server
    // a full range query.
    if (bgActiveRef.current) return;

    const abort = new AbortController();
    bgAbortRef.current = abort;
    bgActiveRef.current = true;

    (async () => {
      const bounds = historyBounds;
      if (!bounds) return;
      const boundsStart = new Date(bounds.earliest).getTime();
      const boundsEnd = new Date(bounds.latest).getTime();
      mapLog('events', 'background fetch started');

      // Merge batching: each store merge rebuilds the whole store on the main
      // thread (~hundreds of ms once the store is large), so merging per chunk
      // stalled rendering ~37 times during the initial fill. Fetched chunks
      // accumulate here and merge/record/persist in batches instead.
      const pendingData: RangedExchangeEventData[] = [];
      const pendingRanges: Array<[number, number]> = [];
      const FLUSH_AFTER = 4;
      const flushPending = () => {
        if (pendingData.length === 0) return;
        const doneMerge = mapTime('store', `merge ${pendingData.length} chunk(s) into store`);
        // Combine the batch first (cheap — chunks are small), then pay the
        // full-store merge cost once instead of once per chunk
        const combined = pendingData.length === 1 ? pendingData[0] : combineRangedEventData(pendingData);
        if (exchangeStoreRef.current) {
          exchangeStoreRef.current = mergeExchangeStores(exchangeStoreRef.current, combined);
        } else {
          exchangeStoreRef.current = buildExchangeStoreFromRanged(combined);
        }
        doneMerge();
        for (const [s, e] of pendingRanges) recordRange(s, e);
        pendingData.length = 0;
        pendingRanges.length = 0;
        setStoreVersion(v => v + 1);
        if (exchangeStoreRef.current) {
          saveHistoryCache(exchangeStoreRef.current.data, eventRangesRef.current, bounds.gaps);
        }
      };

      // Alternate: true = try forward first, false = try backward first
      let preferForward = true;

      while (!abort.signal.aborted) {
        const cursorMs = historyTimestampRef.current?.getTime() ?? (boundsStart + boundsEnd) / 2;
        // Pending (fetched-but-unmerged) ranges count as covered so the loop
        // doesn't re-fetch a batched chunk
        const gaps = findUncoveredGaps(boundsStart, boundsEnd, pendingRanges);
        if (gaps.length === 0) break; // fully loaded

        // Split gaps into forward (start >= cursor) and backward (end <= cursor),
        // plus any gap that straddles the cursor
        let forwardGap: [number, number] | null = null;
        let backwardGap: [number, number] | null = null;

        // Find nearest gap forward from cursor
        for (const gap of gaps) {
          if (gap[1] > cursorMs) {
            forwardGap = gap;
            break;
          }
        }
        // Find nearest gap backward from cursor
        for (let i = gaps.length - 1; i >= 0; i--) {
          if (gaps[i][0] < cursorMs) {
            backwardGap = gaps[i];
            break;
          }
        }

        // Pick which direction to fetch, alternating
        let chosenGap: [number, number] | null = null;
        if (preferForward && forwardGap) {
          chosenGap = forwardGap;
        } else if (!preferForward && backwardGap) {
          chosenGap = backwardGap;
        } else {
          // Fallback to whichever exists
          chosenGap = forwardGap ?? backwardGap;
        }

        if (!chosenGap) break;
        preferForward = !preferForward; // alternate next iteration

        // Fetch the whole canonical grid cell at the near edge of the gap —
        // forward gaps advance from their start, backward gaps from their end.
        // Whole cells keep URLs identical across users for CDN reuse; any
        // already-covered overlap within the cell is merged away harmlessly.
        const isForward = chosenGap[0] >= cursorMs || (chosenGap === forwardGap);
        const chunkStart = isForward ? cellStart(chosenGap[0]) : cellStart(chosenGap[1] - 1);
        const chunkEnd = chunkStart + CHUNK_MS;

        try {
          const data = await fetchEventRange(
            new Date(chunkStart), new Date(chunkEnd), abort.signal,
          );
          if (abort.signal.aborted) {
            // Merge what already arrived before exiting
            pendingData.push(data);
            pendingRanges.push([chunkStart, chunkEnd]);
            break;
          }

          pendingData.push(data);
          pendingRanges.push([chunkStart, chunkEnd]);
          if (pendingData.length >= FLUSH_AFTER) flushPending();
        } catch (err: unknown) {
          if (err instanceof Error && err.name === 'AbortError') break;
          mapError('events', 'Background event fetch failed', err);
          await new Promise(r => setTimeout(r, 5000));
        }
      }
      flushPending();
      if (!abort.signal.aborted && findUncoveredGaps(boundsStart, boundsEnd).length === 0) {
        mapLog('events', 'background fetch complete — full timeline loaded');
      }
    })().finally(() => {
      bgActiveRef.current = false;
    });
  }, [historyBounds, findUncoveredGaps, recordRange, fetchEventRange]);

  /**
   * Load exchange events around a center date. Fetches a 3-month window,
   * builds/merges the ExchangeStore, then starts background expansion.
   * Never touches historyTimestamp — that's only set by explicit user actions.
   */
  const loadEvents = useCallback(async (centerDate: Date) => {
    // Try restoring from persistent cache on first call
    await restoreCacheOnce();

    // Grid cells overlapping [center - 45d, center + 45d] — one or two cells
    const windowStart = centerDate.getTime() - HALF_CHUNK_MS;
    const windowEnd = centerDate.getTime() + HALF_CHUNK_MS;
    const cells: number[] = [];
    for (let c = cellStart(windowStart); c < windowEnd; c += CHUNK_MS) cells.push(c);
    const uncovered = cells.filter((c) => !isRangeCovered(c, c + CHUNK_MS));

    if (uncovered.length === 0) {
      // Range is covered, but still start background fetch
      // to fill in any remaining gaps (including re-checking empty ranges)
      setTimeout(() => startBackgroundFetch(), 0);
      return;
    }

    setIsLoadingHistory(true);
    try {
      await Promise.all(uncovered.map(async (c) => {
        const data = await fetchEventRange(new Date(c), new Date(c + CHUNK_MS));

        recordRange(c, c + CHUNK_MS);

        const doneMerge = mapTime('store', 'merge event chunk into store');
        if (exchangeStoreRef.current) {
          exchangeStoreRef.current = mergeExchangeStores(exchangeStoreRef.current, data);
        } else {
          exchangeStoreRef.current = buildExchangeStoreFromRanged(data);
        }
        doneMerge();
        setStoreVersion(v => v + 1);
      }));

      // Save to persistent cache
      if (exchangeStoreRef.current && historyBounds) {
        saveHistoryCache(
          exchangeStoreRef.current.data,
          eventRangesRef.current,
          historyBounds.gaps,
        );
      }

      setTimeout(() => startBackgroundFetch(), 0);
    } catch (error) {
      mapError('events', 'Failed to load events', error);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [isRangeCovered, fetchEventRange, recordRange, startBackgroundFetch, historyBounds, restoreCacheOnce]);

  /**
   * Ensure the ENTIRE history timeline is loaded into the shared exchange
   * store (the Conflict Finder analyzes all-time data). Fetches uncovered
   * chunks through /api/map-history/events with limited concurrency and
   * merges them in as they arrive — same store history mode scrubs against.
   */
  const ensureExchangeData = useCallback(async (): Promise<ExchangeStore | null> => {
    if (fullLoadPromiseRef.current) return fullLoadPromiseRef.current;

    const promise = (async (): Promise<ExchangeStore | null> => {
      try {
        // Resolve bounds (normally already fetched on mount)
        let bounds = historyBounds;
        if (!bounds) {
          const res = await fetch('/api/map-history/bounds');
          if (!res.ok) return null;
          const data = await res.json();
          if (!data.earliest || !data.latest) return null;
          bounds = {
            earliest: data.earliest,
            latest: data.latest,
            gaps: data.gaps,
            initialOwners: data.initialOwners,
          };
          setHistoryBounds(bounds);
        }

        await restoreCacheOnce();

        const boundsStart = new Date(bounds.earliest).getTime();
        const boundsEnd = new Date(bounds.latest).getTime();

        // Pause the alternating background fetcher so the same chunks aren't
        // fetched twice; nothing remains for it once the full load finishes.
        bgAbortRef.current?.abort();

        const gaps = findUncoveredGaps(boundsStart, boundsEnd);
        // Whole canonical grid cells covering each gap (deduped) so the URLs
        // match what the map's own loading uses and the CDN can serve them
        const cellSet = new Set<number>();
        for (const [gapStart, gapEnd] of gaps) {
          for (let s = cellStart(gapStart); s < gapEnd; s += CHUNK_MS) {
            cellSet.add(s);
          }
        }
        const chunks: Array<[number, number]> = [...cellSet].sort((a, b) => a - b).map((s) => [s, s + CHUNK_MS]);

        const CONCURRENCY = 4;
        let next = 0;
        const worker = async () => {
          while (next < chunks.length) {
            const [chunkStart, chunkEnd] = chunks[next++];
            const data = await fetchEventRange(new Date(chunkStart), new Date(chunkEnd));
            if (exchangeStoreRef.current) {
              exchangeStoreRef.current = mergeExchangeStores(exchangeStoreRef.current, data);
            } else {
              exchangeStoreRef.current = buildExchangeStoreFromRanged(data);
            }
            recordRange(chunkStart, chunkEnd);
            setStoreVersion(v => v + 1);
          }
        };
        await Promise.all(
          Array.from({ length: Math.min(CONCURRENCY, chunks.length) }, worker)
        );

        if (exchangeStoreRef.current) {
          saveHistoryCache(exchangeStoreRef.current.data, eventRangesRef.current, bounds.gaps);
        }
        return exchangeStoreRef.current;
      } catch (error) {
        mapError('events', 'Failed to load full exchange history', error);
        return exchangeStoreRef.current; // partial data is still usable
      } finally {
        fullLoadPromiseRef.current = null;
      }
    })();

    fullLoadPromiseRef.current = promise;
    return promise;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyBounds, restoreCacheOnce, findUncoveredGaps, fetchEventRange, recordRange]);

  // Timeline coverage 0..1 — drives the Conflict Finder's loading indicator
  const historyLoadProgress = useMemo(() => {
    if (!historyBounds) return 0;
    const start = new Date(historyBounds.earliest).getTime();
    const end = new Date(historyBounds.latest).getTime();
    const total = end - start;
    if (total <= 0) return 1;
    let covered = 0;
    for (const [s, e] of loadedRanges) {
      covered += Math.max(0, Math.min(e, end) - Math.max(s, start));
    }
    return Math.min(1, covered / total);
  }, [historyBounds, loadedRanges]);

  // Keep timestamp ref in sync (for playback interval) and cache to sessionStorage
  useEffect(() => {
    historyTimestampRef.current = historyTimestamp;
    if (historyTimestamp) {
      sessionStorage.setItem('history-slider-position', historyTimestamp.toISOString());
    }
  }, [historyTimestamp]);

  // Stable ref for loadEvents (playback interval uses it)
  const loadEventsRef = useRef(loadEvents);
  useEffect(() => { loadEventsRef.current = loadEvents; }, [loadEvents]);

  // Abort background fetching on unmount
  useEffect(() => {
    return () => { bgAbortRef.current?.abort(); };
  }, []);

  // Restore history mode from cached viewMode — fires exactly once
  useEffect(() => {
    if (isInitialized && viewMode === 'history' && historyBounds && !exchangeStoreRef.current && !historyTimestamp) {
      // Restore cached slider position if available
      const cachedPos = sessionStorage.getItem('history-slider-position');
      let targetDate: Date;
      if (cachedPos) {
        const parsed = new Date(cachedPos);
        const earliest = new Date(historyBounds.earliest).getTime();
        const latest = new Date(historyBounds.latest).getTime();
        if (!isNaN(parsed.getTime()) && parsed.getTime() >= earliest && parsed.getTime() <= latest) {
          targetDate = parsed;
        } else {
          targetDate = new Date(historyBounds.latest);
        }
      } else {
        targetDate = new Date(historyBounds.latest);
      }
      setHistoryTimestamp(targetDate);
      loadEvents(targetDate);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInitialized, viewMode, historyBounds]);

  // Handle mode change
  const handleModeChange = useCallback(async (mode: 'live' | 'history') => {
    setViewMode(mode);
    if (mode === 'history') {
      setIsPlaying(false);
      // Restore cached slider position if available, otherwise use latest
      const cachedPos = sessionStorage.getItem('history-slider-position');
      let targetDate: Date;
      if (cachedPos) {
        const parsed = new Date(cachedPos);
        const earliest = historyBounds?.earliest ? new Date(historyBounds.earliest).getTime() : 0;
        const latest = historyBounds?.latest ? new Date(historyBounds.latest).getTime() : Infinity;
        // Only use cached position if it falls within current bounds
        if (!isNaN(parsed.getTime()) && parsed.getTime() >= earliest && parsed.getTime() <= latest) {
          targetDate = parsed;
        } else {
          targetDate = historyBounds?.latest ? new Date(historyBounds.latest) : new Date();
        }
      } else {
        targetDate = historyBounds?.latest ? new Date(historyBounds.latest) : new Date();
      }
      setHistoryTimestamp(targetDate); // set ONCE, synchronously
      mapLog('mode', 'switched to history', { target: targetDate.toISOString() });

      // Instant first paint: fetch a single snapshot from the server.
      // Runs CONCURRENTLY with loadEvents below — awaiting it first serialized
      // two independent DB round-trips and delayed event loading by the full
      // snapshot latency. The timestamp is snapped to the 10-minute snapshot
      // grid so the URL is stable and can be served from the route's CDN cache.
      const snapMs = targetDate.getTime() - (targetDate.getTime() % (10 * 60 * 1000));
      fetch(`/api/map-history/snapshot?timestamp=${new Date(snapMs).toISOString()}`)
        .then(async (snapRes) => {
          if (!snapRes.ok) return;
          const snapData = await snapRes.json();
          if (snapData.territories) {
            setInitialSnapshot({
              timestamp: new Date(snapData.timestamp),
              territories: snapData.territories,
            });
            mapLog('snapshot', 'initial snapshot ready', {
              timestamp: snapData.timestamp,
              territories: Object.keys(snapData.territories).length,
            });
          }
        })
        .catch((e) => mapError('snapshot', 'Failed to load initial snapshot', e));

      // Load events in background (never mutates historyTimestamp)
      loadEvents(targetDate);
    } else {
      // Clear all history state
      setHistoryTimestamp(null);
      setInitialSnapshot(null);
      exchangeStoreRef.current = null;
      initialOwnerMapRef.current = null;
      setStoreVersion(0);
      eventRangesRef.current = [];
      setLoadedRanges([]);
      bgAbortRef.current?.abort();
      setIsPlaying(false);
      setConflictBounds(null);
      setIsConflictFocused(false);
    }
  }, [historyBounds, loadEvents]);

  // Handle timeline scrubbing
  const handleTimeChange = useCallback((date: Date) => {
    setHistoryTimestamp(date);
    loadEvents(date); // no-op if range already covered
  }, [loadEvents]);

  // Handle date picker jump
  const handleJumpToDate = useCallback((date: Date) => {
    setHistoryTimestamp(date);
    loadEvents(date);
  }, [loadEvents]);

  // Handle conflict finder jump — switches to history mode if needed
  const handleConflictJump = useCallback((start: Date, end: Date) => {
    if (viewMode !== 'history') {
      setViewMode('history');
    }
    setIsPlaying(false);
    setHistoryTimestamp(start);
    setConflictBounds({ start, end });
    setIsConflictFocused(true);
    loadEvents(start);
  }, [viewMode, loadEvents]);

  // Handle history refresh - re-fetch bounds and reload data
  const handleHistoryRefresh = useCallback(async () => {
    setIsPlaying(false);
    exchangeStoreRef.current = null;
    initialOwnerMapRef.current = null;
    setStoreVersion(0);
    eventRangesRef.current = [];
    setLoadedRanges([]);
    cacheRestorePromiseRef.current = null;
    bgAbortRef.current?.abort();
    clearHistoryCache();

    try {
      const boundsResponse = await fetch('/api/map-history/bounds');
      if (boundsResponse.ok) {
        const boundsData = await boundsResponse.json();
        if (boundsData.earliest && boundsData.latest) {
          setHistoryBounds({
            earliest: boundsData.earliest,
            latest: boundsData.latest,
            gaps: boundsData.gaps,
            initialOwners: boundsData.initialOwners,
          });
          const latestDate = new Date(boundsData.latest);
          setHistoryTimestamp(latestDate);
          await loadEvents(latestDate);
        }
      }
    } catch (error) {
      mapError('bounds', 'Failed to refresh history', error);
    }
  }, [loadEvents]);

  // Build list of available guilds from ALL sources (for factions panel)
  const availableGuilds = useMemo(() => {
    const seen = new Map<string, string>(); // name -> prefix

    // Source 1: All known guilds from guild_prefixes table
    for (const g of allKnownGuilds) {
      seen.set(g.name, g.prefix);
    }

    // Source 2: Current live territories (may have guilds not yet in guild_prefixes)
    for (const t of Object.values(territories)) {
      if (t.guild?.name && t.guild.name !== 'Unclaimed') {
        seen.set(t.guild.name, t.guild.prefix || seen.get(t.guild.name) || '');
      }
    }

    // Source 3: Guilds already in factions (may have been manually added)
    const store = exchangeStoreRef.current;
    const exchangePrefixMap = new Map<string, string>();
    if (store?.data) {
      for (let i = 0; i < store.data.guilds.length; i++) {
        exchangePrefixMap.set(store.data.guilds[i], store.data.prefixes[i]);
      }
    }
    for (const faction of Object.values(factions)) {
      for (const guildName of faction.guilds) {
        if (!seen.has(guildName)) {
          seen.set(guildName, exchangePrefixMap.get(guildName) || '');
        }
      }
    }

    return Array.from(seen.entries())
      .map(([name, prefix]) => ({ name, prefix }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [territories, factions, allKnownGuilds]);

  // Compute effective guild colors, overridden by the Chronicle's alliance
  // colors (time-aware) or the user's local faction colors when either layer
  // is active. Unaffiliated guilds become gray so the groups stand out.
  const effectiveGuildColors = useMemo(() => {
    const chronicleActive = showChronicle && !!chronicleData && chronicleData.alliances.length > 0;
    const factionsActive = showFactions && Object.keys(factions).length > 0;
    if (!chronicleActive && !factionsActive) return guildColors;

    // Start by setting ALL known guild color entries to gray.
    // This covers guilds in both live AND history mode snapshots,
    // since guildColors contains every guild from the Wynntils cache.
    const overridden: Record<string, string> = {};
    for (const key of Object.keys(guildColors)) {
      overridden[key] = "#808080";
    }

    // Build a name→prefix map from exchange store for historical guilds
    // that may not be in the live availableGuilds list
    const store = exchangeStoreRef.current;
    const exchangePrefixMap = new Map<string, string>();
    if (store?.data) {
      for (let i = 0; i < store.data.guilds.length; i++) {
        exchangePrefixMap.set(store.data.guilds[i], store.data.prefixes[i]);
      }
    }

    const paint = (guildName: string, color: string) => {
      overridden[guildName] = color;
      // Find prefix from live data or exchange store history
      const guild = availableGuilds.find(g => g.name === guildName);
      const prefix = guild?.prefix || exchangePrefixMap.get(guildName) || '';
      if (prefix) {
        overridden[prefix] = color;
      }
    };

    if (chronicleActive) {
      // Alliance membership evaluated at the moment the map is showing
      for (const [guildName, color] of allianceColorsAt(chronicleData!.alliances, chronicleTimeMs)) {
        paint(guildName, color);
      }
    } else {
      for (const faction of Object.values(factions)) {
        for (const guildName of faction.guilds) {
          paint(guildName, faction.color);
        }
      }
    }
    return overridden;
  }, [showFactions, factions, guildColors, availableGuilds, showChronicle, chronicleData, chronicleTimeMs]);

  // Precompute land view clusters in background (always running, even when not visible)
  // Uses effectiveGuildColors so faction overrides apply to land view
  const { landViewClusters } = useTerritoryPrecomputation({
    territories,
    verboseData,
    guildColors: effectiveGuildColors,
    enabled: true, // Always precompute for instant toggle
  });

  // Unified snapshot lookup — single binary search derives index + expanded territories.
  // Returns null for historyTerritories if the nearest snapshot is too far from the
  // requested timestamp (data not yet loaded for that time range).
  // Reconstruct the current history snapshot via client-side ExchangeStore.
  // Falls back to initialSnapshot (fetched for instant first paint) before the store is ready.
  const historyTerritories = useMemo(() => {
    if (viewMode !== 'history' || !historyTimestamp) return null;

    // Prefer exchange store — instant reconstruction at any timestamp
    const store = exchangeStoreRef.current;
    if (store) {
      // Build initial owner map lazily (first 3 months backfill from defenders)
      if (!initialOwnerMapRef.current && historyBounds?.initialOwners) {
        initialOwnerMapRef.current = buildInitialOwnerMap(historyBounds.initialOwners, store);
      }
      const snapshot = buildSnapshotAt(store, historyTimestamp, initialOwnerMapRef.current ?? undefined);
      if (snapshot) {
        return expandSnapshot(snapshot.territories, verboseData);
      }
      // Store exists but no snapshot (e.g. timestamp is before all exchange events).
      // Return empty territories instead of null to avoid a false "loading" state.
      return {};
    }

    // Fall back to initial snapshot (before events have loaded)
    if (initialSnapshot) {
      return expandSnapshot(initialSnapshot.territories, verboseData);
    }

    return null;
  // storeVersion triggers recompute when the exchange store is updated
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, historyTimestamp, storeVersion, initialSnapshot, verboseData, historyBounds]);

  // Step forward/backward handlers — time-based stepping (10 minutes)
  const handleStepForward = useCallback(() => {
    if (!historyTimestamp || !historyBounds) return;
    const nextMs = historyTimestamp.getTime() + STEP_MS;
    const latestMs = new Date(historyBounds.latest).getTime();
    if (nextMs <= latestMs) {
      setHistoryTimestamp(new Date(nextMs));
    }
  }, [historyTimestamp, historyBounds]);

  const handleStepBackward = useCallback(() => {
    if (!historyTimestamp || !historyBounds) return;
    const prevMs = historyTimestamp.getTime() - STEP_MS;
    const earliestMs = new Date(historyBounds.earliest).getTime();
    if (prevMs >= earliestMs) {
      setHistoryTimestamp(new Date(prevMs));
    }
  }, [historyTimestamp, historyBounds]);

  // Jump to absolute start/end of the slider range
  const handleJumpToStart = useCallback(() => {
    if (!historyBounds) return;
    const start = new Date(historyBounds.earliest);
    setHistoryTimestamp(start);
    loadEvents(start);
  }, [historyBounds, loadEvents]);

  const handleJumpToEnd = useCallback(() => {
    if (!historyBounds) return;
    const end = new Date(historyBounds.latest);
    setHistoryTimestamp(end);
    loadEvents(end);
  }, [historyBounds, loadEvents]);

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

  // Playback logic — stable interval, steps by time (no dependency on loaded snapshot arrays)
  useEffect(() => {
    if (!isPlaying || viewMode !== 'history') return;

    const FAST_SPEED = -1;
    const isFast = playbackSpeed === FAST_SPEED;
    const intervalMs = isFast ? 100 : 1000 / playbackSpeed;
    const DAY_MS = 24 * 60 * 60 * 1000;

    const tick = () => {
      const currentTs = historyTimestampRef.current;
      if (!currentTs || !historyBounds) return;

      const latestMs = new Date(historyBounds.latest).getTime();

      if (isFast) {
        // Fast mode: jump forward 1 day per tick, skipping gaps
        let nextTime = new Date(currentTs.getTime() + DAY_MS);
        nextTime = skipGapForward(nextTime);
        if (nextTime.getTime() > latestMs) {
          setHistoryTimestamp(new Date(latestMs));
          setIsPlaying(false);
          return;
        }
        setHistoryTimestamp(nextTime);
        // Ensure events are loaded around this time
        loadEventsRef.current(nextTime);
      } else {
        // Normal: step forward 10 minutes, skipping gaps
        let nextTime = new Date(currentTs.getTime() + STEP_MS);
        nextTime = skipGapForward(nextTime);
        if (nextTime.getTime() > latestMs) {
          setHistoryTimestamp(new Date(latestMs));
          setIsPlaying(false);
          return;
        }
        setHistoryTimestamp(nextTime);
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

  // Stable render list — avoids re-allocating the entries array every frame
  const territoryEntries = useMemo(
    () => Object.entries(displayTerritories).filter(([name]) => shouldRenderTerritory(name, viewMode)),
    [displayTerritories, viewMode]
  );

  // Stable Date/gap objects for MapHistoryControls — fresh objects per render
  // would defeat every useMemo inside the timeline
  const historyEarliestDate = useMemo(
    () => (historyBounds ? new Date(historyBounds.earliest) : null),
    [historyBounds]
  );
  const historyLatestDate = useMemo(
    () => (historyBounds ? new Date(historyBounds.latest) : null),
    [historyBounds]
  );
  const historyGapDates = useMemo(
    () => historyBounds?.gaps?.map(g => ({ start: new Date(g.start), end: new Date(g.end) })),
    [historyBounds]
  );

  // No longer need snapshotTimestamps — timeline snaps to 10-min boundaries

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
      // Center the map
      const scaledWidth = img.naturalWidth * fitScale;
      const scaledHeight = img.naturalHeight * fitScale;
      applyTransform({
        x: (containerRect.width - scaledWidth) / 2,
        y: (containerRect.height - scaledHeight) / 2
      }, clampScale(fitScale));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInitialized, applyTransform, clampScale]);

  // Handle mouse down for dragging
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left click
    cancelAnimation();
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    setLastPanPoint({ x: positionRef.current.x, y: positionRef.current.y });
    e.preventDefault();
  }, [cancelAnimation]);

  // Handle mouse move for dragging
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;

    const deltaX = e.clientX - dragStart.x;
    const deltaY = e.clientY - dragStart.y;

    applyTransform({
      x: lastPanPoint.x + deltaX,
      y: lastPanPoint.y + deltaY
    }, null);
  }, [isDragging, dragStart, lastPanPoint, applyTransform]);

  // Handle mouse up
  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Touch event handlers for mobile
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    cancelAnimation();
    if (e.touches.length === 1) {
      // Single touch - start panning
      setIsTouching(true);
      setTouchStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
      setLastPanPoint({ x: positionRef.current.x, y: positionRef.current.y });
    } else if (e.touches.length === 2) {
      // Two touches - start pinch zoom
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const distance = Math.sqrt(
        Math.pow(touch2.clientX - touch1.clientX, 2) +
        Math.pow(touch2.clientY - touch1.clientY, 2)
      );
      lastTouchDistanceRef.current = distance;
      setIsTouching(false); // Disable panning during pinch
    }
  }, [cancelAnimation]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1 && isTouching && touchStart) {
      // Single touch - pan
      const deltaX = e.touches[0].clientX - touchStart.x;
      const deltaY = e.touches[0].clientY - touchStart.y;

      applyTransform({
        x: lastPanPoint.x + deltaX,
        y: lastPanPoint.y + deltaY
      }, null);
    } else if (e.touches.length === 2 && lastTouchDistanceRef.current && containerRef.current) {
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

      const prevScale = scaleRef.current;
      const prevPosition = positionRef.current;
      const zoomFactor = distance / lastTouchDistanceRef.current;
      const newScale = clampScale(prevScale * zoomFactor);

      // Zoom towards pinch center
      const scaleChange = newScale / prevScale;
      applyTransform({
        x: centerX - (centerX - prevPosition.x) * scaleChange,
        y: centerY - (centerY - prevPosition.y) * scaleChange
      }, newScale);
      lastTouchDistanceRef.current = distance;
    }
  }, [isTouching, touchStart, lastPanPoint, clampScale, applyTransform]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      // Lifting one finger out of a pinch. Re-seat the pan baseline on the
      // finger still down, otherwise panning stayed dead until the user lifted
      // off entirely and touched again.
      lastTouchDistanceRef.current = null;
      setIsTouching(true);
      setTouchStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
      setLastPanPoint({ x: positionRef.current.x, y: positionRef.current.y });
      return;
    }
    setIsTouching(false);
    setTouchStart(null);
    lastTouchDistanceRef.current = null;
  }, []);

  // Handle wheel zoom. Attached as a NATIVE non-passive listener (effect
  // below) rather than React's onWheel: React registers wheel handlers as
  // passive, so the preventDefault() here silently failed and logged
  // "Unable to preventDefault inside passive event listener" on every tick.
  const handleWheel = useCallback((e: WheelEvent) => {
    if (!containerRef.current || !mapImageRef.current) return;

    e.preventDefault();

    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const prevScale = scaleRef.current;
    const prevPosition = positionRef.current;
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = clampScale(prevScale * zoomFactor);

    // Zoom towards mouse position
    const scaleChange = newScale / prevScale;
    applyTransform({
      x: mouseX - (mouseX - prevPosition.x) * scaleChange,
      y: mouseY - (mouseY - prevPosition.y) * scaleChange
    }, newScale);
  }, [clampScale, applyTransform]);

  // Native non-passive wheel listener on the map container (see handleWheel)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // Skip wheel events from map UI panels (chronicle, factions, settings,
      // territory leaders…): this native listener runs during the real bubble
      // phase, before any React-level stopPropagation, and its preventDefault
      // would kill the panel's own wheel scrolling.
      if (!e.target || !(e.target as Element).closest('.guild-territory-count, [data-map-ui]')) {
        cancelAnimation();
        handleWheel(e);
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [handleWheel, cancelAnimation]);

  // Zoom controls
  const zoomIn = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const prevScale = scaleRef.current;
    const prevPosition = positionRef.current;
    const newScale = clampScale(prevScale * 1.2);
    const scaleChange = newScale / prevScale;

    applyTransform({
      x: centerX - (centerX - prevPosition.x) * scaleChange,
      y: centerY - (centerY - prevPosition.y) * scaleChange
    }, newScale);
  }, [clampScale, applyTransform]);

  const zoomOut = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const prevScale = scaleRef.current;
    const prevPosition = positionRef.current;
    const newScale = clampScale(prevScale * 0.8);
    const scaleChange = newScale / prevScale;

    applyTransform({
      x: centerX - (centerX - prevPosition.x) * scaleChange,
      y: centerY - (centerY - prevPosition.y) * scaleChange
    }, newScale);
  }, [clampScale, applyTransform]);

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

    startAnimatedTransform(newPosition, clampScale(fitScale));
  }, [clampScale, startAnimatedTransform]);

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
    if (viewMode === 'history') return;
    setSelectedTerritory({ name, territory });
  }, [viewMode]);

  const handleTerritoryHover = useCallback((name: string, territory: Territory) => {
    setHoveredTerritory({ name, territory });
  }, []);

  const handleTerritoryLeave = useCallback(() => {
    setHoveredTerritory(null);
  }, []);

  // Handle guild click to zoom to guild territories.
  // Searches the DISPLAYED territories: in history mode the guild's holdings
  // come from the historical snapshot, not the live map — filtering the live
  // set found nothing there and the click silently did nothing.
  const handleGuildZoom = useCallback((guildName: string) => {
    if (!containerRef.current) return;

    const guildTerritories = Object.values(displayTerritories).filter(
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

    startAnimatedTransform(newPosition, newScale);
  }, [displayTerritories, clampScale, startAnimatedTransform]);

  // Region zoom presets (game coordinates: [minX, minZ, maxX, maxZ])
  // Region zoom presets — game coords [X, Z] where more negative Z = further north on map
  const REGION_BOUNDS: Record<string, { minX: number; minZ: number; maxX: number; maxZ: number }> = {
    Wynn:  { minX: -800, minZ: -2225, maxX: 1400, maxZ: -75 },
    // Scorpion Nest top-left (-2173,-5603) → Raiders' Airbase bottom-right (1558,-4253) + padding
    Gavel: { minX: -2275, minZ: -5700, maxX: 1660, maxZ: -4150 },
    // Barren Sands bottom-right (1450,-2170) → Entrance to Gavel top-left (-2048,-4403) + wide L/R margins
    Ocean: { minX: -2250, minZ: -4500, maxX: 1650, maxZ: -2100 },
  };

  const zoomToRegion = useCallback((regionName: string) => {
    if (!containerRef.current) return;
    const bounds = REGION_BOUNDS[regionName];
    if (!bounds) return;

    const topLeftPixel = coordToPixel([bounds.minX, bounds.minZ]);
    const bottomRightPixel = coordToPixel([bounds.maxX, bounds.maxZ]);

    const boundingWidth = Math.abs(bottomRightPixel[0] - topLeftPixel[0]);
    const boundingHeight = Math.abs(bottomRightPixel[1] - topLeftPixel[1]);
    const boundingCenterX = (topLeftPixel[0] + bottomRightPixel[0]) / 2;
    const boundingCenterY = (topLeftPixel[1] + bottomRightPixel[1]) / 2;

    const containerRect = containerRef.current.getBoundingClientRect();
    const padding = 100;
    const scaleX = (containerRect.width - padding * 2) / boundingWidth;
    const scaleY = (containerRect.height - padding * 2) / boundingHeight;
    const newScale = clampScale(Math.min(scaleX, scaleY));

    const newPosition = {
      x: containerRect.width / 2 - boundingCenterX * newScale,
      y: containerRect.height / 2 - boundingCenterY * newScale,
    };

    startAnimatedTransform(newPosition, newScale);
    setShowRegionMenu(false);
  }, [clampScale, startAnimatedTransform]);

  return (
    <main className="map-opaque-chrome map-viewport" style={{
      position: 'fixed',
      top: '5.5rem',
      left: 0,
      width: '100%',
      overflow: 'hidden',
      userSelect: 'none',
      WebkitUserSelect: 'none',
      cursor: isDragging ? 'grabbing' : 'grab',
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
          className="map-container"
          style={{
            width: 'calc(100vw - 0.5rem)',
            height: '100%',
            border: '2px solid var(--border-color)',
            borderRadius: '0.5rem',
            overflow: 'hidden',
            position: 'relative',
            cursor: isDragging ? 'grabbing' : 'grab',
            background: 'var(--bg-card)'
            // touch-action: none comes from .map-container so the browser
            // stops claiming pinch/pan before our handlers see them.
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
              handleTouchEnd(e);
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
              cursor: isDragging ? 'grabbing' : 'grab',
            }}
          >
            <img
              ref={mapImageRef}
              src="/images/map/fruma_map.v2.webp"
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
            {/* Old Realm of Light underlay — for pre-Jan-2021 history the
                current map's new-RoL inset is covered with the page background
                and the archived old-island render is drawn in its place */}
            {viewMode === 'history' && historyTimestamp && historyTimestamp.getTime() < ROL_UPDATE_CUTOFF_MS && (
              <>
                <div style={{
                  position: 'absolute',
                  left: NEW_ROL_COVER_RECT.left,
                  top: NEW_ROL_COVER_RECT.top,
                  width: NEW_ROL_COVER_RECT.width,
                  height: NEW_ROL_COVER_RECT.height,
                  background: 'var(--bg-card)',
                  zIndex: 1,
                  pointerEvents: 'none',
                }} />
                <img
                  src="/images/map/old-realm-of-light.v1.webp"
                  alt=""
                  draggable={false}
                  style={{
                    position: 'absolute',
                    left: OLD_ROL_ART_RECT.left,
                    top: OLD_ROL_ART_RECT.top,
                    width: OLD_ROL_ART_RECT.width,
                    height: OLD_ROL_ART_RECT.height,
                    zIndex: 2,
                    pointerEvents: 'none',
                    userSelect: 'none',
                  }}
                />
              </>
            )}
            {/* Territory Overlays - positioned in map pixel coordinates */}
            {showTerritories && !showLandView && territoryEntries.map(([name, territory]) => (
              <TerritoryOverlay
                key={name}
                name={name}
                territory={territory}
                scale={scale}
                isDragging={isDragging}
                onClick={handleTerritoryClick}
                onMouseEnter={handleTerritoryHover}
                onMouseLeave={handleTerritoryLeave}
                guildColors={effectiveGuildColors}
                showTimeOutlines={viewMode === 'live' && showTimeOutlines}
                showResourceOutlines={viewMode === 'live' && showResourceOutlines}
                showGuildNames={viewMode === 'live' || showGuildNames}
                verboseData={verboseData?.[name] ?? null}
                opaqueFill={opaqueFill}
                fallbackColor={showFactions ? '#808080' : '#FFFFFF'}
              />
            ))}
            {/* Land View Overlay - merged guild territories */}
            {showTerritories && showLandView && viewMode === 'live' && (
              <LandViewOverlay
                territories={displayTerritories}
                verboseData={verboseData}
                guildColors={effectiveGuildColors}
                scale={scale}
                precomputedClusters={landViewClusters}
                onHoverGuild={handleGuildHover}
                opaqueFill={opaqueFill}
              />
            )}
            {/* Trade routes - only show when enabled, territories are visible, and Land View is off */}
            {showTradeRoutes && showTerritories && !showLandView && <TradeRoutesOverlay territories={territories} verboseData={verboseData} />}
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

          {/* Territory Hover Panel - simplified in history mode, full in live mode */}
          {viewMode === 'history' && hoveredTerritory && (
            <div style={{
              position: 'absolute',
              top: '1rem',
              left: '1rem',
              minWidth: '160px',
              maxWidth: '240px',
              backgroundColor: 'var(--bg-card-solid)',
              border: '2px solid var(--border-color)',
              borderRadius: '0.5rem',
              padding: '0.75rem 1rem',
              zIndex: 1000,
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              pointerEvents: 'none',
            }}>
              <div style={{
                fontWeight: 'bold',
                fontSize: '1.1rem',
                color: 'var(--text-primary)',
                marginBottom: '0.25rem',
              }}>
                {hoveredTerritory.name}
              </div>
              <div style={{
                fontSize: '0.9rem',
                color: 'var(--text-secondary)',
              }}>
                {hoveredTerritory.territory.guild.name || 'Unclaimed'}
                {hoveredTerritory.territory.guild.prefix && ` [${hoveredTerritory.territory.guild.prefix}]`}
              </div>
            </div>
          )}
          {viewMode !== 'history' && !selectedTerritory && (
            <TerritoryHoverPanel
              territory={hoveredTerritory}
              guildColors={effectiveGuildColors}
              verboseData={hoveredTerritory ? verboseData?.[hoveredTerritory.name] ?? null : null}
            />
          )}

          {/* Territory Info Panel - shown when a territory is clicked */}
          <TerritoryInfoPanel
            selectedTerritory={selectedTerritory}
            onClose={() => setSelectedTerritory(null)}
            panelId="territory-info-panel"
            guildColors={effectiveGuildColors}
            territories={territories}
            verboseData={verboseData}
            externalsData={externalsData}
          />
          
          <GuildTerritoryCount territories={displayTerritories} onGuildClick={handleGuildZoom} guildColors={effectiveGuildColors} showLandView={showLandView} />

          {/* Zoom Controls */}
          <div style={{
            position: 'absolute',
            bottom: '1rem',
            left: '1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
            // Above the history panel (z-index 15): that panel is draggable and
            // wide, so it can sit over this column. The map's own chrome has to
            // stay reachable no matter where the user parks the panel.
            zIndex: 20
          }}>
            {/* Region Zoom Button */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowRegionMenu(prev => !prev)}
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '0.5rem',
                  border: '2px solid var(--border-color)',
                  background: showRegionMenu ? 'var(--bg-secondary)' : 'var(--bg-card)',
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
                  if (!showRegionMenu) e.currentTarget.style.background = 'var(--bg-card)';
                  e.currentTarget.style.transform = 'scale(1)';
                }}
                title="Zoom to region"
              >
                <Globe size={20} strokeWidth={2} />
              </button>
              {showRegionMenu && (
                <div style={{
                  position: 'absolute',
                  left: 'calc(100% + 0.5rem)',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  display: 'flex',
                  gap: '0.375rem',
                }}>
                  {['Wynn', 'Gavel', 'Ocean'].map((region) => (
                    <button
                      key={region}
                      onClick={() => zoomToRegion(region)}
                      style={{
                        padding: '0.375rem 0.625rem',
                        borderRadius: '0.375rem',
                        border: '2px solid var(--border-color)',
                        background: 'var(--bg-card)',
                        color: 'var(--text-primary)',
                        fontSize: '0.8rem',
                        fontWeight: '600',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
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
                    >
                      {region}
                    </button>
                  ))}
                </div>
              )}
            </div>
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
              <Home size={20} strokeWidth={2} />
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
              <Plus size={20} strokeWidth={2} />
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
              <Minus size={20} strokeWidth={2} />
            </button>
            
          </div>

          {/* Factions Panel - positioned above bottom-right controls */}
          <FactionPanel
            isOpen={showFactions}
            onClose={() => setShowFactions(false)}
            factions={factions}
            onFactionsChange={setFactions}
            availableGuilds={availableGuilds}
          />

          {/* Chronicle Panel — alliances & events at the shown moment */}
          <ChroniclePanel
            isOpen={showChronicle}
            onClose={() => setShowChronicle(false)}
            data={chronicleData}
            timestampMs={chronicleTimeMs}
            onJumpToDate={viewMode === 'history' ? handleJumpToDate : undefined}
            availableGuilds={availableGuilds}
            containerBounds={containerSize}
          />

          {/* Conflict Finder Panel */}
          <ConflictFinder
            isOpen={showConflictFinder}
            onClose={() => setShowConflictFinder(false)}
            exchangeStore={exchangeStoreRef.current}
            ensureExchangeData={ensureExchangeData}
            loadProgress={historyLoadProgress}
            onJumpToTime={handleConflictJump}
            onCreateFactions={(factionGuilds) => {
              const factionColors = ["#1e88e5", "#e53935", "#43a047", "#fb8c00"];
              const newFactions: Record<string, { name: string; color: string; guilds: string[] }> = {};
              factionGuilds.forEach((guilds, idx) => {
                const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + idx;
                newFactions[id] = {
                  name: `Side ${idx + 1}`,
                  color: factionColors[idx % factionColors.length],
                  guilds,
                };
              });
              setFactions(newFactions);
              setShowFactions(true);
            }}
          />

          {/* Bottom Right Controls Container - Mode selector + Factions + Settings */}
          <div style={{
            position: 'absolute',
            bottom: '1rem',
            right: '1rem',
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: '0.5rem',
            // Was 15 — the same as the history panel, which renders later and so
            // won the tie and swallowed clicks on Live/History/Factions.
            zIndex: 20,
          }}>
            {/* Mode Selector - always to the left */}
            <MapModeSelector
              mode={viewMode}
              onModeChange={handleModeChange}
              historyAvailable={!!historyBounds}
            />

            {/* Replay the history-view tour */}
            {viewMode === 'history' && (
              <button
                onClick={() => tour.restartTour()}
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '0.5rem',
                  border: '2px solid var(--border-color)',
                  background: 'var(--bg-card)',
                  color: 'var(--text-primary)',
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
                title="Tour of the history view"
              >
                <HelpCircle size={20} strokeWidth={2} />
              </button>
            )}

            {/* Chronicle Button — community alliances & events layer */}
            <button
              data-testid="chronicle-toggle"
              data-tour="chronicle-toggle"
              onClick={() => {
                setShowChronicle(prev => !prev);
                setShowFactions(false);
              }}
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '0.5rem',
                border: `2px solid ${showChronicle ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                background: showChronicle ? 'var(--accent-primary)' : 'var(--bg-card)',
                color: showChronicle ? 'var(--text-on-accent)' : 'var(--text-primary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              }}
              onMouseEnter={(e) => {
                if (!showChronicle) {
                  e.currentTarget.style.background = 'var(--bg-secondary)';
                  e.currentTarget.style.transform = 'scale(1.05)';
                }
              }}
              onMouseLeave={(e) => {
                if (!showChronicle) {
                  e.currentTarget.style.background = 'var(--bg-card)';
                }
                e.currentTarget.style.transform = 'scale(1)';
              }}
              title="Chronicle — alliances & events"
            >
              <BookOpen size={20} strokeWidth={2} />
            </button>

            {/* Factions Button */}
            <button
              data-tour="factions-toggle"
              onClick={() => {
                setShowFactions(prev => !prev);
                setShowChronicle(false);
              }}
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '0.5rem',
                border: `2px solid ${showFactions ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                background: showFactions ? 'var(--accent-primary)' : 'var(--bg-card)',
                color: showFactions ? 'var(--text-on-accent)' : 'var(--text-primary)',
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
                if (!showFactions) {
                  e.currentTarget.style.background = 'var(--bg-secondary)';
                  e.currentTarget.style.transform = 'scale(1.05)';
                }
              }}
              onMouseLeave={(e) => {
                if (!showFactions) {
                  e.currentTarget.style.background = 'var(--bg-card)';
                }
                e.currentTarget.style.transform = 'scale(1)';
              }}
              title="Factions"
            >
              <Flag size={20} strokeWidth={2} />
            </button>

            {/* Conflict Finder entry point removed for now — the panel code and
                its wiring (showConflictFinder, ensureExchangeData, handleConflictJump)
                are kept so it can be re-added later. */}

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
                opaqueFill={opaqueFill}
                onOpaqueFillChange={setOpaqueFill}
              />
            ) : (
              <button
                data-tour="map-settings-toggle"
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
                <Settings size={20} strokeWidth={2} />
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
              earliest={isConflictFocused && conflictBounds ? conflictBounds.start : historyEarliestDate!}
              latest={isConflictFocused && conflictBounds ? conflictBounds.end : historyLatestDate!}
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
              canStepForward={!!(historyTimestamp && historyBounds && historyTimestamp.getTime() < new Date(historyBounds.latest).getTime())}
              canStepBackward={!!(historyTimestamp && historyBounds && historyTimestamp.getTime() > new Date(historyBounds.earliest).getTime())}
              isLoading={isLoadingHistory}
              onRefresh={handleHistoryRefresh}
              containerBounds={containerSize}
              gaps={isConflictFocused && conflictBounds ? undefined : historyGapDates}
              conflictBounds={conflictBounds}
              isConflictFocused={isConflictFocused}
              onConflictFocusToggle={() => setIsConflictFocused(prev => !prev)}
              seasons={seasons}
              loadProgress={historyLoadProgress}
              eventMarkers={chronicleEventMarkers}
            />
          </div>
        )}

        {/* First-visit tour of the history view */}
        <OnboardingTour {...tour} />
      </div>
    </main>
  );
}

export default function MapPage() {
  return <MapPageContent />;
}
