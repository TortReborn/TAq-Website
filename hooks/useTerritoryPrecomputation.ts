"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Territory } from "@/lib/utils";
import { TerritoryVerboseData } from "@/lib/connection-calculator";
import { TerritoryCluster } from "@/lib/territoryComputation";
import type { WorkerInput, WorkerOutput } from "@/workers/territoryWorker";

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
  // Double-buffered state: clusters only update when worker COMPLETES
  const [landViewClusters, setLandViewClusters] = useState<TerritoryCluster[] | null>(null);
  const [isComputing, setIsComputing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  // Worker and computation state refs
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const pendingDataRef = useRef<WorkerInput | null>(null);
  const isComputingRef = useRef(false);
  const lastComputeTimeRef = useRef<number>(0);
  const inputHashRef = useRef<string>("");
  const throttleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Compute a simple hash of inputs to detect meaningful changes
  const computeInputHash = useCallback(() => {
    const territoryKeys = Object.keys(territories).sort().join(",");
    const colorKeys = Object.keys(guildColors).sort().join(",");
    const hasVerbose = verboseData ? "1" : "0";
    return `${territoryKeys}|${colorKeys}|${hasVerbose}`;
  }, [territories, guildColors, verboseData]);

  // Force an immediate update (resets throttle)
  const forceUpdate = useCallback(() => {
    lastComputeTimeRef.current = 0;
    inputHashRef.current = ""; // Reset hash to force recomputation
  }, []);

  // Start computation in worker
  const startWorkerComputation = useCallback((input: WorkerInput) => {
    if (!workerRef.current) return;

    isComputingRef.current = true;
    setIsComputing(true);
    workerRef.current.postMessage(input);
  }, []);

  // Initialize worker on mount (client-side only)
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      // Create worker using URL constructor (Next.js 13+ compatible)
      workerRef.current = new Worker(
        new URL("../workers/territoryWorker.ts", import.meta.url)
      );

      // Handle results from worker
      workerRef.current.onmessage = (event: MessageEvent<WorkerOutput>) => {
        const { clusters, requestId } = event.data;

        // Only accept results from the current/latest request
        if (requestId === requestIdRef.current) {
          // Atomic swap to new data - this is the only place state updates
          setLandViewClusters(clusters);
          setLastUpdated(Date.now());
          lastComputeTimeRef.current = Date.now();
          setIsComputing(false);
          isComputingRef.current = false;

          // Process any queued request
          if (pendingDataRef.current) {
            const pending = pendingDataRef.current;
            pendingDataRef.current = null;
            startWorkerComputation(pending);
          }
        }
      };

      workerRef.current.onerror = (err) => {
        console.error("Territory worker error:", err);
        setIsComputing(false);
        isComputingRef.current = false;
      };
    } catch (err) {
      console.error("Failed to create territory worker:", err);
    }

    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      if (throttleTimeoutRef.current) {
        clearTimeout(throttleTimeoutRef.current);
      }
    };
  }, [startWorkerComputation]);

  // Trigger computation when inputs change (with throttling)
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;

    // Need valid data
    if (Object.keys(territories).length === 0) return;
    if (Object.keys(guildColors).length === 0) return;

    const currentHash = computeInputHash();
    const now = Date.now();
    const timeSinceLastCompute = now - lastComputeTimeRef.current;

    // Skip if inputs haven't changed and we're within throttle window
    if (
      currentHash === inputHashRef.current &&
      timeSinceLastCompute < LAND_VIEW_UPDATE_INTERVAL &&
      landViewClusters !== null
    ) {
      return;
    }

    // Update hash for future comparisons
    inputHashRef.current = currentHash;

    // Create request
    requestIdRef.current += 1;
    const input: WorkerInput = {
      territories,
      verboseData,
      guildColors,
      requestId: requestIdRef.current,
    };

    // Clear any pending throttle timeout
    if (throttleTimeoutRef.current) {
      clearTimeout(throttleTimeoutRef.current);
      throttleTimeoutRef.current = null;
    }

    // Determine if we should compute now or wait for throttle
    const shouldThrottle = landViewClusters !== null && timeSinceLastCompute < LAND_VIEW_UPDATE_INTERVAL;

    if (shouldThrottle) {
      // Already have data - wait for throttle window to expire
      const delay = LAND_VIEW_UPDATE_INTERVAL - timeSinceLastCompute;
      throttleTimeoutRef.current = setTimeout(() => {
        if (isComputingRef.current) {
          // Queue for later if currently computing
          pendingDataRef.current = input;
        } else {
          startWorkerComputation(input);
        }
      }, delay);
    } else {
      // No data yet or throttle expired - compute now
      if (isComputingRef.current) {
        // Queue for when current computation finishes
        pendingDataRef.current = input;
      } else {
        // Start immediately
        startWorkerComputation(input);
      }
    }

    return () => {
      if (throttleTimeoutRef.current) {
        clearTimeout(throttleTimeoutRef.current);
      }
    };
  }, [territories, verboseData, guildColors, enabled, computeInputHash, landViewClusters, startWorkerComputation]);

  return {
    landViewClusters,
    isComputing,
    lastUpdated,
    forceUpdate,
  };
}
