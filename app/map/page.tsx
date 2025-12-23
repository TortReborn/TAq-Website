"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { loadTerritories, Territory } from "@/lib/utils";
import TerritoryOverlay from "@/components/TerritoryOverlay";
import LandViewOverlay from "@/components/LandViewOverlay";
import TerritoryInfoPanel from "@/components/TerritoryInfoPanel";
import TerritoryHoverPanel from "@/components/TerritoryHoverPanel";
import TradeRoutesOverlay from "@/components/TradeRoutesOverlay";
import GuildTerritoryCount from "@/components/GuildTerritoryCount";
import MapSettings from "@/components/MapSettings";
import { TerritoryVerboseData, TerritoryExternalsData } from "@/lib/connection-calculator";
import { useTerritoryPrecomputation } from "@/hooks/useTerritoryPrecomputation";

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

    setIsInitialized(true);
  }, []);

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

  // Load territories, guild colors, and verbose data from API cache
  useEffect(() => {
    let isMounted = true;

    const loadAllData = async () => {
      setIsLoadingTerritories(true);
      try {
        // Load territories, guild colors, verbose data, and externals data in parallel
        const [territoryData, guildColorData, verboseDataResult, externalsDataResult] = await Promise.all([
          loadTerritories(),
          loadGuildColorsData(),
          loadVerboseData(),
          loadExternalsData()
        ]);

        if (isMounted) {
          // Force a new object reference to ensure React detects the change
          setTerritories({ ...territoryData });
          setGuildColors({ ...guildColorData });
          setVerboseData(verboseDataResult);
          setExternalsData(externalsDataResult);
          console.log('🗺️ Updated territories data:', Object.keys(territoryData).length, 'territories');
          console.log('🎨 Updated guild colors:', Object.keys(guildColorData).length, 'guilds');
          console.log('📊 Loaded verbose data:', Object.keys(verboseDataResult).length, 'territories');
          console.log('🔗 Loaded externals data:', Object.keys(externalsDataResult).length, 'territories');
        }
      } catch (error) {
        console.error('Failed to load map data:', error);
      } finally {
        if (isMounted) setIsLoadingTerritories(false);
      }
    };

    loadAllData();
    const interval = setInterval(loadAllData, 30000); // 30 seconds to match cache TTL
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Prevent body scrolling on this page
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'auto';
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
    const { coordToPixel } = require("@/lib/utils");
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
            {showTerritories && !showLandView && Object.entries(territories).map(([name, territory]) => (
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
                showTimeOutlines={showTimeOutlines}
                showResourceOutlines={showResourceOutlines}
                verboseData={verboseData?.[name] ?? null}
              />
            ))}
            {/* Land View Overlay - merged guild territories */}
            {showTerritories && showLandView && (
              <LandViewOverlay
                territories={territories}
                verboseData={verboseData}
                guildColors={guildColors}
                scale={scale}
                precomputedClusters={landViewClusters}
                onHoverGuild={handleGuildHover}
              />
            )}
            {/* Trade routes - only show when territories are visible and Land View is off */}
            {showTerritories && !showLandView && <TradeRoutesOverlay />}
          </div>

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
          
          <GuildTerritoryCount territories={territories} onGuildClick={handleGuildZoom} guildColors={guildColors} showLandView={showLandView} />

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

          {/* Settings Button - Bottom Right */}
          <button
            onClick={() => setShowSettings(prev => !prev)}
            style={{
              position: 'absolute',
              bottom: '1rem',
              right: '1rem',
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
              zIndex: 10
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

          {/* Map Settings Panel */}
          <MapSettings
            isOpen={showSettings}
            onClose={() => setShowSettings(false)}
            showTerritories={showTerritories}
            onShowTerritoriesChange={setShowTerritories}
            showTimeOutlines={showTimeOutlines}
            onShowTimeOutlinesChange={setShowTimeOutlines}
            showLandView={showLandView}
            onShowLandViewChange={setShowLandView}
            showResourceOutlines={showResourceOutlines}
            onShowResourceOutlinesChange={setShowResourceOutlines}
          />
        </div>
      </div>
    </main>
  );
}
