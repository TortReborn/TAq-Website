"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { coordToPixel, Territory } from '@/lib/utils';
import { RETIRED_TERRITORIES } from '@/lib/retired-territories';
import { tradeRouteEraFor } from '@/lib/trade-routes';
import { TerritoryVerboseData } from '@/lib/connection-calculator';
import { VERBOSE_DATA_URL, fetchVerboseData } from '@/lib/verbose-data-client';

interface TradeRoute {
  key: string;
  from: [number, number];
  to: [number, number];
}

interface TradeRoutesOverlayProps {
  /** The territories currently displayed — live data, or the historical
   *  snapshot in history mode. Route endpoints anchor to these, so a route
   *  is only drawn between territories that exist on screen. */
  territories: Record<string, Territory>;
  /** Preloaded present-day verbose data (seeds the graph cache). */
  verboseData?: Record<string, TerritoryVerboseData> | null;
  /** History timestamp, or null/undefined for live view. Selects the route
   *  era; before the trade-route epoch nothing renders. */
  timestampMs?: number | null;
}

// One cached graph per era URL — eras never change once loaded.
const graphCache = new Map<string, Promise<Record<string, TerritoryVerboseData>>>();

const fetchGraph = (url: string): Promise<Record<string, TerritoryVerboseData>> => {
  // The present-day graph IS the verbose territory file — reuse the shared
  // memoized fetch instead of downloading the ~270 KB file a second time.
  if (url === VERBOSE_DATA_URL) return fetchVerboseData();
  let promise = graphCache.get(url);
  if (!promise) {
    promise = fetch(url).then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    });
    promise.catch(() => { graphCache.delete(url); });
    graphCache.set(url, promise);
  }
  return promise;
};

const centerPixel = (location: { start: [number, number]; end: [number, number] }): [number, number] =>
  coordToPixel([
    (location.start[0] + location.end[0]) / 2,
    (location.start[1] + location.end[1]) / 2,
  ]);

const TradeRoutesOverlay = ({ territories, verboseData, timestampMs }: TradeRoutesOverlayProps) => {
  const isHistory = timestampMs !== null && timestampMs !== undefined;
  const era = tradeRouteEraFor(isHistory ? timestampMs : null);

  const [graph, setGraph] = useState<Record<string, TerritoryVerboseData> | null>(null);

  useEffect(() => {
    if (!era) { setGraph(null); return; }
    // The present-day graph may already be in memory via props
    if (!isHistory && verboseData) { setGraph(verboseData); return; }
    let cancelled = false;
    fetchGraph(era.url)
      .then((data) => { if (!cancelled) setGraph(data); })
      .catch((error) => console.error('Failed to fetch trade routes:', error));
    return () => { cancelled = true; };
  }, [era, isHistory, verboseData]);

  const tradeRoutes = useMemo(() => {
    if (!era || !graph) return [];

    const routes: TradeRoute[] = [];
    // Avoid duplicate lines by only adding one for each pair, regardless of orientation
    const seenPairs = new Set<string>();

    // A route renders only when both endpoints exist in the DISPLAYED
    // territories — the historical snapshot in history mode, so routes
    // appear and disappear as the map itself changes over time. Endpoint
    // coordinates come from the displayed territory (works for retired
    // territories, which the era graph may know but today's data doesn't).
    const endpointRenderable = (name: string): boolean => {
      if (!territories[name]?.location) return false;
      if (!isHistory && RETIRED_TERRITORIES.has(name)) return false;
      return true;
    };

    for (const territoryName in graph) {
      if (!endpointRenderable(territoryName)) continue;

      const routePartners = graph[territoryName]['Trading Routes'];
      if (!routePartners) continue;

      const fromPixel = centerPixel(territories[territoryName].location);

      routePartners.forEach(partnerName => {
        if (!endpointRenderable(partnerName)) return;

        const pairKey = territoryName < partnerName
          ? `${territoryName}|${partnerName}`
          : `${partnerName}|${territoryName}`;
        if (seenPairs.has(pairKey)) return;
        seenPairs.add(pairKey);

        routes.push({
          key: pairKey,
          from: fromPixel,
          to: centerPixel(territories[partnerName].location),
        });
      });
    }

    return routes;
  }, [era, graph, territories, isHistory]);

  if (tradeRoutes.length === 0) return null;

  return (
    <svg
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 3,
      }}
    >
      <g>
        {tradeRoutes.map((route) => (
          <line
            key={route.key}
            x1={route.from[0]}
            y1={route.from[1]}
            x2={route.to[0]}
            y2={route.to[1]}
            stroke="rgba(200, 200, 200, 1)"
            strokeWidth="2.5"
          />
        ))}
      </g>
    </svg>
  );
};

export default React.memo(TradeRoutesOverlay);
