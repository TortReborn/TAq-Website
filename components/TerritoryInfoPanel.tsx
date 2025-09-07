"use client";

import React, { useRef, useLayoutEffect, useState, useEffect } from "react";

import { Territory, getGuildColor, coordToPixel } from "@/lib/utils";

interface TerritoryInfoPanelProps {
  selectedTerritory: { name: string; territory: Territory, pixel: { x: number, y: number } } | null;
  onClose: () => void;
  panelId?: string;
}

interface TerritoryVerboseData {
  resources: {
    emeralds: string;
    ore: string;
    crops: string;
    fish: string;
    wood: string;
  };
  Location: {
    start: [number, number];
    end: [number, number];
  };
  Guild: {
    uuid: string;
    name: string;
    prefix: string;
  };
  Acquired: string;
}

export default function TerritoryInfoPanel({ selectedTerritory, onClose, panelId }: TerritoryInfoPanelProps) {

  const infoBoxRef = useRef<HTMLDivElement>(null);
  const [adjusted, setAdjusted] = useState<{ left: number, top: number } | null>(null);
  const [territoryInfo, setTerritoryInfo] = useState<TerritoryVerboseData | null>(null);

  useEffect(() => {
    const fetchTerritoryInfo = async () => {
      if (selectedTerritory) {
        try {
          const response = await fetch('/territories_verbose.json');
          const data = await response.json();
          setTerritoryInfo(data[selectedTerritory.name] || null);
        } catch (error) {
          console.error("Failed to fetch territory data:", error);
          setTerritoryInfo(null);
        }
      } else {
        setTerritoryInfo(null);
      }
    };

    fetchTerritoryInfo();
  }, [selectedTerritory]);

  useLayoutEffect(() => {
    if (selectedTerritory && infoBoxRef.current) {
      const { pixel } = selectedTerritory;

      const rect = infoBoxRef.current.getBoundingClientRect();
      setAdjusted({
        left: pixel.x - rect.width / 2,
        top: pixel.y - rect.height - 8
      });
    }
  }, [selectedTerritory, territoryInfo]);

  if (!selectedTerritory) return null;

  const { name, territory } = selectedTerritory;
  const guildColor = getGuildColor(territory.guild.name);

  // Format resource rates
  const resourceRates = territoryInfo ? Object.entries(territoryInfo.resources)
    .filter(([, value]) => value !== "0")
    .map(([resource, value]) => `+${value} ${resource} / hour`) : [];

  // Prevent info box from going above the map
  const finalTop = adjusted ? Math.max(adjusted.top, 8) : -9999;
  const finalLeft = adjusted ? adjusted.left : -9999;

  return (
    <div
      ref={infoBoxRef}
      id={panelId}
      style={{
        position: 'absolute',
        left: finalLeft,
        top: finalTop,
        minWidth: '220px',
        backgroundColor: '#222', // solid, non-transparent background
        border: '2px solid var(--border-color)',
        borderRadius: '0.5rem',
        padding: '1rem',
        zIndex: 1000,
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        textAlign: 'center',
        pointerEvents: 'auto',
      }}
    >
      {/* Close X button in top right */}
      <button
        onClick={onClose}
        style={{
          position: 'absolute',
          top: '0.5rem',
          right: '0.5rem',
          width: '1.5rem',
          height: '1.5rem',
          borderRadius: '0.25rem',
          border: 'none',
          background: 'transparent',
          color: 'var(--text-secondary)',
          fontWeight: 'bold',
          cursor: 'pointer',
          fontSize: '0.875rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          lineHeight: '1',
        }}
      >
        ×
      </button>
      <div style={{ marginBottom: '0.5rem', fontWeight: 'bold', fontSize: '1.2rem', color: 'var(--text-primary)' }}>{name}</div>
      <div style={{ marginBottom: '0.5rem', fontWeight: 'bold', fontSize: '1rem', color: guildColor }}>{territory.guild.name}</div>
      {resourceRates.map((line, i) => (
        <div key={i} style={{ fontSize: '1rem', color: 'var(--text-primary)', marginBottom: '0.2rem' }}>{line}</div>
      ))}
    </div>
  );
}
