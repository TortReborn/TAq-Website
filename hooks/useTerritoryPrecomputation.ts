"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Territory } from "@/lib/utils";
import { TerritoryVerboseData } from "@/lib/connection-calculator";
import { TerritoryCluster, computeLandViewClusters } from "@/lib/territoryComputation";

// Throttle interval for land view updates (20 seconds)
const LAND_VIEW_UPDATE_INTERVAL = 20000;

interface UseTerritoryPrecomputationOptions {
  territories: Record<string, Territory>;
  verboseData: Record<string, TerritoryVerboseData> | null;
  guildColors: Record<string, string>;
  enabled?: boolean;
}

interface PrecomputationResult {
  landViewClusters: TerritoryCluster[] | null;
  isComputing: boolean;
  lastUpdated: number | null;
  forceUpdate: () => void;
}

export function useTerritoryPrecomputation({
  territories,
  verboseData,
  guildColors,
  enabled = true,
}: UseTerritoryPrecomputationOptions): PrecomputationResult {
  const [landViewClusters, setLandViewClusters] = useState<TerritoryCluster[] | null>(null);
  const [isComputing, setIsComputing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  // Refs for tracking computation state
  const lastComputeTimeRef = useRef<number>(0);
  const computeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isComputingRef = useRef(false);

  // Track input hashes to detect changes
  const inputHashRef = useRef<string>("");

  // Compute a simple hash of inputs to detect changes
  const computeInputHash = useCallback(() => {
    const territoryKeys = Object.keys(territories).sort().join(",");
    const colorKeys = Object.keys(guildColors).sort().join(",");
    const hasVerbose = verboseData ? "1" : "0";
    return `${territoryKeys}|${colorKeys}|${hasVerbose}`;
  }, [territories, guildColors, verboseData]);

  // Force an immediate update
  const forceUpdate = useCallback(() => {
    lastComputeTimeRef.current = 0;
    inputHashRef.current = ""; // Reset hash to force recomputation
  }, []);

  // Main computation effect
  useEffect(() => {
    if (!enabled) return;

    // Check if we have the necessary data
    if (Object.keys(territories).length === 0) return;
    if (Object.keys(guildColors).length === 0) return;

    const currentHash = computeInputHash();
    const now = Date.now();
    const timeSinceLastCompute = now - lastComputeTimeRef.current;

    // Skip if inputs haven't changed and we're within the throttle window
    if (
      currentHash === inputHashRef.current &&
      timeSinceLastCompute < LAND_VIEW_UPDATE_INTERVAL &&
      landViewClusters !== null
    ) {
      return;
    }

    // Schedule computation
    const scheduleComputation = () => {
      // Don't start if already computing
      if (isComputingRef.current) return;

      // Clear any existing timeout
      if (computeTimeoutRef.current) {
        clearTimeout(computeTimeoutRef.current);
      }

      // Compute after a brief delay to batch rapid changes
      computeTimeoutRef.current = setTimeout(() => {
        // Double-check we're not already computing
        if (isComputingRef.current) return;

        isComputingRef.current = true;
        setIsComputing(true);

        // Use requestIdleCallback if available, otherwise setTimeout
        const scheduleWork = (typeof window !== 'undefined' && 'requestIdleCallback' in window)
          ? (window as Window & { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback
          : (cb: () => void) => setTimeout(cb, 0);

        scheduleWork(() => {
          try {
            const clusters = computeLandViewClusters(
              territories,
              verboseData,
              guildColors
            );

            setLandViewClusters(clusters);
            setLastUpdated(Date.now());
            lastComputeTimeRef.current = Date.now();
            inputHashRef.current = currentHash;
          } catch (error) {
            console.error("Error computing land view clusters:", error);
          } finally {
            isComputingRef.current = false;
            setIsComputing(false);
          }
        });
      }, 50); // 50ms debounce for rapid input changes
    };

    // If inputs changed, recompute regardless of throttle
    if (currentHash !== inputHashRef.current) {
      // But still respect the throttle if we have existing data
      if (landViewClusters !== null && timeSinceLastCompute < LAND_VIEW_UPDATE_INTERVAL) {
        // Schedule for when throttle expires
        const delay = LAND_VIEW_UPDATE_INTERVAL - timeSinceLastCompute;
        computeTimeoutRef.current = setTimeout(scheduleComputation, delay);
      } else {
        scheduleComputation();
      }
    } else if (timeSinceLastCompute >= LAND_VIEW_UPDATE_INTERVAL) {
      // Periodic refresh
      scheduleComputation();
    }

    return () => {
      if (computeTimeoutRef.current) {
        clearTimeout(computeTimeoutRef.current);
      }
    };
  }, [territories, verboseData, guildColors, enabled, computeInputHash, landViewClusters]);

  // Initial computation on mount (no throttle)
  useEffect(() => {
    if (!enabled) return;
    if (Object.keys(territories).length === 0) return;
    if (Object.keys(guildColors).length === 0) return;
    if (landViewClusters !== null) return; // Already have data

    // Compute immediately on first load
    const timeoutId = setTimeout(() => {
      if (isComputingRef.current) return;

      isComputingRef.current = true;
      setIsComputing(true);

      try {
        const clusters = computeLandViewClusters(
          territories,
          verboseData,
          guildColors
        );

        setLandViewClusters(clusters);
        setLastUpdated(Date.now());
        lastComputeTimeRef.current = Date.now();
        inputHashRef.current = computeInputHash();
      } catch (error) {
        console.error("Error computing land view clusters:", error);
      } finally {
        isComputingRef.current = false;
        setIsComputing(false);
      }
    }, 100); // Small delay to let the UI settle

    return () => clearTimeout(timeoutId);
  }, [enabled, territories, verboseData, guildColors, landViewClusters, computeInputHash]);

  return {
    landViewClusters,
    isComputing,
    lastUpdated,
    forceUpdate,
  };
}
