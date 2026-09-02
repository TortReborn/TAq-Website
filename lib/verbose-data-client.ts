import { TerritoryVerboseData } from '@/lib/connection-calculator';

// Single shared in-flight/‌resolved promise so the map page and overlays that
// mount before it resolves don't each download the ~270 KB file.
let verboseDataPromise: Promise<Record<string, TerritoryVerboseData>> | null = null;

// ?v= busts stale browser copies when the file's contents change
export const VERBOSE_DATA_URL = '/territories_verbose.json?v=4';

export const fetchVerboseData = (): Promise<Record<string, TerritoryVerboseData>> => {
  if (!verboseDataPromise) {
    verboseDataPromise = fetch(VERBOSE_DATA_URL).then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    });
    // Reset on failure so a later call can retry instead of reusing the rejection
    verboseDataPromise.catch(() => { verboseDataPromise = null; });
  }
  return verboseDataPromise;
};
