"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { loadTerritories, Territory } from "@/lib/utils";
import TerritoryOverlay from "@/components/TerritoryOverlay";
import TerritoryInfoPanel from "@/components/TerritoryInfoPanel";
import TradeRoutesOverlay from "@/components/TradeRoutesOverlay";
import GuildTerritoryCount from "@/components/GuildTerritoryCount";

export default function MapPage() {
  // Store minimum scale in a ref
  const minScaleRef = useRef(0.1);
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
  const [selectedTerritory, setSelectedTerritory] = useState<{ name: string; territory: Territory; pixel: { x: number; y: number } } | null>(null);
  const [hoveredTerritory, setHoveredTerritory] = useState<{ name: string; territory: Territory } | null>(null);
  const [showTerritories, setShowTerritories] = useState(true);
  const [territories, setTerritories] = useState<Record<string, Territory>>({});
  const [isLoadingTerritories, setIsLoadingTerritories] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapImageRef = useRef<HTMLImageElement>(null);

  // Load cached position and scale from localStorage
  useEffect(() => {
    const cachedPosition = localStorage.getItem('map-position');
    const cachedScale = localStorage.getItem('map-scale');
    
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
          setScale(parsed);
        }
      } catch (error) {
        console.error('Failed to parse cached scale:', error);
      }
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

  // Load territories from JSON file and auto-refresh every 10 seconds
  useEffect(() => {
    let isMounted = true;
    const loadTerritoriesData = async () => {
      setIsLoadingTerritories(true);
      try {
        const territoryData = await loadTerritories();
        if (isMounted) setTerritories(territoryData);
      } catch (error) {
        console.error('Failed to load territories:', error);
      } finally {
        if (isMounted) setIsLoadingTerritories(false);
      }
    };
    loadTerritoriesData();
    const interval = setInterval(loadTerritoriesData, 10000);
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
      setScale(fitScale);
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

  // Handle wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!containerRef.current || !mapImageRef.current) return;
    
    e.preventDefault();
    
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
  // Use minScaleRef for minimum scale
  const minScale = minScaleRef.current;
  const newScale = Math.max(minScale, Math.min(5, scale * zoomFactor));

    // Zoom towards mouse position
    const scaleChange = newScale / scale;
    setPosition({
      x: mouseX - (mouseX - position.x) * scaleChange,
      y: mouseY - (mouseY - position.y) * scaleChange
    });
    setScale(newScale);
  }, [scale, position]);

  // Zoom controls
  const zoomIn = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    
    const newScale = Math.min(5, scale * 1.2);
    const scaleChange = newScale / scale;
    
    setPosition({
      x: centerX - (centerX - position.x) * scaleChange,
      y: centerY - (centerY - position.y) * scaleChange
    });
    setScale(newScale);
  }, [scale, position]);

  const zoomOut = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    
  // Use minScaleRef for minimum scale
  const minScale = minScaleRef.current;
  const newScale = Math.max(minScale, scale * 0.8);
    const scaleChange = newScale / scale;
    
    setPosition({
      x: centerX - (centerX - position.x) * scaleChange,
      y: centerY - (centerY - position.y) * scaleChange
    });
    setScale(newScale);
  }, [scale, position]);

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
    // Compute pixel coordinates for info box positioning (top center of territory)
    const start = territory.location.start;
    const end = territory.location.end;
    // Top center of territory for info box positioning
    const topY = Math.min(start[1], end[1]);
    const centerX = (start[0] + end[0]) / 2;
    const topCenterCoord = [centerX, topY];
    
    // Convert to pixel coordinates
    // @ts-ignore
    // eslint-disable-next-line
    const { coordToPixel } = require("@/lib/utils");
    const rawPixel = coordToPixel(topCenterCoord);
    const pixel = {
      x: position.x + rawPixel[0] * scale,
      y: position.y + rawPixel[1] * scale
    };
    setSelectedTerritory({ name, territory, pixel });
  }, [position, scale]);

  // Outside click-to-close logic for info box
  useEffect(() => {
    if (!selectedTerritory) return;
    const handleClick = (e: MouseEvent) => {
      const infoBox = document.getElementById('territory-info-panel');
      if (infoBox && !infoBox.contains(e.target as Node)) {
        setSelectedTerritory(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => {
      document.removeEventListener('mousedown', handleClick);
    };
  }, [selectedTerritory]);

  const handleTerritoryHover = useCallback((name: string, territory: Territory) => {
    setHoveredTerritory({ name, territory });
  }, []);

  const handleTerritoryLeave = useCallback(() => {
    setHoveredTerritory(null);
  }, []);

  const toggleTerritories = useCallback(() => {
    setShowTerritories(prev => !prev);
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
    const newScale = Math.min(scaleX, scaleY, 5); // Cap at max zoom level

    // Calculate position to center the bounding box
    const newPosition = {
      x: containerRect.width / 2 - boundingCenterX * newScale,
      y: containerRect.height / 2 - boundingCenterY * newScale
    };

    setScale(newScale);
    setPosition(newPosition);
    setIsAnimating(true);
    
    // Clear animation state after transition completes
    setTimeout(() => {
      setIsAnimating(false);
    }, 800); // Match the transition duration
  }, [territories]);

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
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
        >
          {/* Map and Territory Overlays (both transformed together) */}
          <div
            style={{
              position: 'absolute',
              transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
              transformOrigin: '0 0',
              width: mapDimensions.width,
              height: mapDimensions.height,
              transition: isAnimating ? 'transform 0.8s ease-in-out' : 'none',
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
            {showTerritories && Object.entries(territories).map(([name, territory]) => (
              <TerritoryOverlay
                key={name}
                name={name}
                territory={territory}
                scale={scale}
                isDragging={isDragging}
                onClick={handleTerritoryClick}
                onMouseEnter={handleTerritoryHover}
                onMouseLeave={handleTerritoryLeave}
              />
            ))}
            <TradeRoutesOverlay />
          </div>

          {/* Territory Info Panel */}
          <TerritoryInfoPanel
            selectedTerritory={selectedTerritory}
            onClose={() => setSelectedTerritory(null)}
            panelId="territory-info-panel"
          />
          
          <GuildTerritoryCount territories={territories} onGuildClick={handleGuildZoom} />

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
            
            {/* Territory Toggle Button */}
            <button
              onClick={toggleTerritories}
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '0.5rem',
                border: '2px solid var(--border-color)',
                background: showTerritories ? 'var(--accent-color)' : 'var(--bg-card)',
                color: showTerritories ? '#fff' : 'var(--text-primary)',
                fontSize: '0.75rem',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
              }}
              onMouseEnter={(e) => {
                if (!showTerritories) {
                  e.currentTarget.style.background = 'var(--bg-secondary)';
                }
                e.currentTarget.style.transform = 'scale(1.05)';
              }}
              onMouseLeave={(e) => {
                if (!showTerritories) {
                  e.currentTarget.style.background = 'var(--bg-card)';
                }
                e.currentTarget.style.transform = 'scale(1)';
              }}
              title={showTerritories ? "Hide Territories" : "Show Territories"}
            >
              T
            </button>
          </div>

          {/* Scale indicator and info */}
          <div style={{
            position: 'absolute',
            bottom: '1rem',
            right: '1rem',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: '0.5rem'
          }}>
            {/* Hover info */}
            {hoveredTerritory && (
              <div style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                borderRadius: '0.25rem',
                padding: '0.5rem 0.75rem',
                fontSize: '0.875rem',
                color: 'var(--text-primary)',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                whiteSpace: 'nowrap'
              }}>
                <div style={{ fontWeight: '600' }}>{hoveredTerritory.name}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                  {hoveredTerritory.territory.guild.name || 'Unclaimed'}
                </div>
              </div>
            )}
            
            {/* Scale indicator */}
            <div style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: '0.25rem',
              padding: '0.5rem 0.75rem',
              fontSize: '0.875rem',
              color: 'var(--text-secondary)',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}>
              {Math.round(scale * 100)}%
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
