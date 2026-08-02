export interface InventoryMatchItem {
  id: number;
  name: string;
  scanKey: string;
  aliases: string[];
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

export function matchInventorySnapshot(
  reported: Record<string, number>,
  items: InventoryMatchItem[]
): { matchedCounts: Record<string, number>; unmatched: Record<string, number>; matched: number } {
  const byName = new Map<string, InventoryMatchItem>();
  for (const item of items) {
    for (const candidate of [item.name, item.scanKey, ...item.aliases]) {
      byName.set(normalizeInventoryName(candidate), item);
    }
  }

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
