// Web Worker for territory computation
// Runs computeLandViewClusters off the main thread to prevent UI blocking

import { Territory } from "../lib/utils";
import { TerritoryVerboseData } from "../lib/connection-calculator";
import { computeLandViewClusters, TerritoryCluster } from "../lib/territoryComputation";

export interface WorkerInput {
  territories: Record<string, Territory>;
  verboseData: Record<string, TerritoryVerboseData> | null;
  guildColors: Record<string, string>;
  requestId: number; // To match requests with responses
}

export interface WorkerOutput {
  clusters: TerritoryCluster[];
  requestId: number;
}

// Handle messages from main thread
self.onmessage = (event: MessageEvent<WorkerInput>) => {
  const { territories, verboseData, guildColors, requestId } = event.data;

  try {
    // Run the expensive computation (this is now on a separate thread)
    const clusters = computeLandViewClusters(territories, verboseData, guildColors);

    // Send results back to main thread
    const response: WorkerOutput = { clusters, requestId };
    self.postMessage(response);
  } catch (error) {
    console.error("Worker computation error:", error);
    // Send empty result on error
    const response: WorkerOutput = { clusters: [], requestId };
    self.postMessage(response);
  }
};

// Export empty object for TypeScript module compatibility
export {};
