export interface InventoryMatchItem {
  id: number;
  name: string;
  scanKey: string;
  aliases: string[];
}

export interface InventoryLocationReport {
  name: string;
  page: number;
  quantity: number;
}

export function normalizeInventoryName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('en-US');
}

export function isReserveInventorySource(sourceKey: string): boolean {
  return sourceKey.startsWith('character_bank:bonus-consu-');
}

function buildNameIndex(items: InventoryMatchItem[]): Map<string, InventoryMatchItem> {
  const byName = new Map<string, InventoryMatchItem>();
  for (const item of items) {
    for (const candidate of [item.name, item.scanKey, ...item.aliases]) {
      byName.set(normalizeInventoryName(candidate), item);
    }
  }
  return byName;
}

export function matchInventorySnapshot(
  reported: Record<string, number>,
  items: InventoryMatchItem[]
): { matchedCounts: Record<string, number>; unmatched: Record<string, number>; matched: number } {
  const byName = buildNameIndex(items);
  const matchedCounts: Record<string, number> = {};
  const unmatched: Record<string, number> = {};
  let matched = 0;
  for (const [name, quantity] of Object.entries(reported)) {
    const item = byName.get(normalizeInventoryName(name));
    if (!item) {
      unmatched[name] = quantity;
      continue;
    }
    matchedCounts[item.name] = (matchedCounts[item.name] ?? 0) + quantity;
    matched += 1;
  }

  return { matchedCounts, unmatched, matched };
}

// Maps matched item ids to their reported page; unmatched names are skipped.
export function matchInventoryLocations(
  reportedPages: Record<string, number>,
  items: InventoryMatchItem[]
): Map<number, number> {
  const byName = buildNameIndex(items);
  const locations = new Map<number, number>();
  for (const [name, page] of Object.entries(reportedPages)) {
    const item = byName.get(normalizeInventoryName(name));
    if (item) locations.set(item.id, page);
  }
  return locations;
}

export function matchInventoryLocationReports(
  reportedLocations: InventoryLocationReport[],
  items: InventoryMatchItem[]
): Map<number, number> {
  const byName = buildNameIndex(items);
  const bestByItem = new Map<number, { page: number; quantity: number }>();
  for (const report of reportedLocations) {
    const item = byName.get(normalizeInventoryName(report.name));
    if (!item) continue;
    const current = bestByItem.get(item.id);
    if (
      !current
      || report.quantity > current.quantity
      || (report.quantity === current.quantity && report.page < current.page)
    ) {
      bestByItem.set(item.id, { page: report.page, quantity: report.quantity });
    }
  }

  return new Map([...bestByItem.entries()].map(([id, location]) => [id, location.page]));
}

export function aggregateInventorySnapshots(
  snapshots: Array<Record<string, number>>,
  items: InventoryMatchItem[]
): Map<number, number> {
  const totals = new Map(items.map(item => [item.id, 0]));
  const byCanonicalName = new Map(items.map(item => [normalizeInventoryName(item.name), item.id]));
  for (const snapshot of snapshots) {
    const { matchedCounts } = matchInventorySnapshot(snapshot, items);
    for (const [name, quantity] of Object.entries(matchedCounts)) {
      const id = byCanonicalName.get(normalizeInventoryName(name));
      if (id !== undefined) totals.set(id, (totals.get(id) ?? 0) + quantity);
    }
  }
  return totals;
}
