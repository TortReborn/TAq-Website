"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { coordToPixel, Territory } from '@/lib/utils';
import { shouldRenderTradeRoute } from '@/lib/retired-territories';
import { TerritoryVerboseData } from '@/lib/connection-calculator';

interface TradeRoute {
  key: string;
  from: [number, number];
  to: [number, number];
}

interface TradeRoutesOverlayProps {
  territories: Record<string, Territory>;
  verboseData?: Record<string, TerritoryVerboseData> | null;
}

let verboseDataPromise: Promise<Record<string, TerritoryVerboseData>> | null = null;

const fetchVerboseData = (): Promise<Record<string, TerritoryVerboseData>> => {
  if (!verboseDataPromise) {
    verboseDataPromise = fetch('/territories_verbose.json?v=4').then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    });
    // Reset on failure so a later mount can retry instead of reusing the rejection
    verboseDataPromise.catch(() => { verboseDataPromise = null; });
  }
  return verboseDataPromise;
};

const centerPixel = (location: { start: [number, number]; end: [number, number] }): [number, number] =>
  coordToPixel([
    (location.start[0] + location.end[0]) / 2,
    (location.start[1] + location.end[1]) / 2,
  ]);

const TradeRoutesOverlay = ({ territories, verboseData }: TradeRoutesOverlayProps) => {
  const [fetchedData, setFetchedData] = useState<Record<string, TerritoryVerboseData> | null>(null);

  // Fallback: load verbose data directly if not provided via props
  useEffect(() => {
    if (verboseData) return;
    let cancelled = false;
    fetchVerboseData()
      .then((data) => {
        if (!cancelled) setFetchedData(data);
      })
      .catch((error) => console.error("Failed to fetch trade routes:", error));
    return () => {
      cancelled = true;
    };
  }, [verboseData]);

  const territoriesData = verboseData ?? fetchedData;

  const tradeRoutes = useMemo(() => {
    if (!territoriesData) return [];

    const routes: TradeRoute[] = [];
    // Avoid duplicate lines by only adding one for each pair, regardless of orientation
    const seenPairs = new Set<string>();

    for (const territoryName in territoriesData) {
      if (!shouldRenderTradeRoute(territoryName, territoryName, territories)) continue;

      const territory = territoriesData[territoryName];
      if (!territory["Trading Routes"]) continue;

      const fromPixel = centerPixel(territory.Location);

      territory["Trading Routes"].forEach(partnerName => {
        if (!shouldRenderTradeRoute(territoryName, partnerName, territories)) return;

        const partner = territoriesData[partnerName];
        if (!partner) return;

        const pairKey = territoryName < partnerName
          ? `${territoryName}|${partnerName}`
          : `${partnerName}|${territoryName}`;
        if (seenPairs.has(pairKey)) return;
        seenPairs.add(pairKey);

        routes.push({ key: pairKey, from: fromPixel, to: centerPixel(partner.Location) });
      });
    }

    return routes;
  }, [territoriesData, territories]);

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
