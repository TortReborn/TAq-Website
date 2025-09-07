"use client";

import React, { useEffect, useState } from 'react';
import { coordToPixel } from '@/lib/utils';

interface TerritoryVerbose {
  "Trading Routes": string[];
  Location: {
    start: [number, number];
    end: [number, number];
  };
}

interface TerritoriesVerboseData {
  [key: string]: TerritoryVerbose;
}

interface TradeRoute {
  from: [number, number];
  to: [number, number];
}

const TradeRoutesOverlay = () => {
  const [tradeRoutes, setTradeRoutes] = useState<TradeRoute[]>([]);

  useEffect(() => {
    const fetchAndProcessTradeRoutes = async () => {
      try {
        const response = await fetch('/territories_verbose.json');
        const territoriesData: TerritoriesVerboseData = await response.json();
        const routes: TradeRoute[] = [];

        for (const territoryName in territoriesData) {
          const territory = territoriesData[territoryName];
          if (territory["Trading Routes"]) {
            const fromCoord = [
              (territory.Location.start[0] + territory.Location.end[0]) / 2,
              (territory.Location.start[1] + territory.Location.end[1]) / 2
            ] as [number, number];
            const fromPixel = coordToPixel(fromCoord);

            territory["Trading Routes"].forEach(partnerName => {
              const partner = territoriesData[partnerName];
              if (partner) {
                const toCoord = [
                  (partner.Location.start[0] + partner.Location.end[0]) / 2,
                  (partner.Location.start[1] + partner.Location.end[1]) / 2
                ] as [number, number];
                const toPixel = coordToPixel(toCoord);
                
                // Avoid duplicate lines by only adding one for each pair
                if (!routes.some(r => 
                    (r.from[0] === toPixel[0] && r.from[1] === toPixel[1] && r.to[0] === fromPixel[0] && r.to[1] === fromPixel[1])
                )) {
                    routes.push({ from: fromPixel, to: toPixel });
                }
              }
            });
          }
        }
        setTradeRoutes(routes);
      } catch (error) {
        console.error("Failed to fetch or process trade routes:", error);
      }
    };

    fetchAndProcessTradeRoutes();
  }, []);

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
        {tradeRoutes.map((route, index) => (
          <line
            key={index}
            x1={route.from[0]}
            y1={route.from[1]}
            x2={route.to[0]}
            y2={route.to[1]}
            stroke="rgba(128, 128, 128, 1)"
            strokeWidth="5"
          />
        ))}
      </g>
    </svg>
  );
};

export default TradeRoutesOverlay;
