// Graid log system constants

export const RAID_NAMES = [
  'Nest of the Grootslangs',
  'The Canyon Colossus',
  'The Nameless Anomaly',
  "Orphion's Nexus of Light",
] as const;

export type RaidName = (typeof RAID_NAMES)[number];

export const RAID_SHORT: Record<string, string> = {
  'Nest of the Grootslangs': 'NOTG',
  'The Canyon Colossus': 'TCC',
  'The Nameless Anomaly': 'TNA',
  "Orphion's Nexus of Light": 'NOL',
};

export const RAID_SHORT_TO_FULL: Record<string, string> = {
  'NOTG': 'Nest of the Grootslangs',
  'TCC': 'The Canyon Colossus',
  'TNA': 'The Nameless Anomaly',
  'NOL': "Orphion's Nexus of Light",
};

export const RAID_TYPE_COLORS: Record<string, string> = {
  'NOTG': '#ff6b35',
  'TCC': '#4ecdc4',
  'TNA': '#a855f7',
  'NOL': '#fbbf24',
  'Unknown': '#6b7280',
};

export function getRaidShort(raidType: string | null): string {
  if (!raidType) return 'Unknown';
  return RAID_SHORT[raidType] || 'Unknown';
}

export function getRaidColor(raidType: string | null): string {
  const short = getRaidShort(raidType);
  return RAID_TYPE_COLORS[short] || RAID_TYPE_COLORS['Unknown'];
}

export const LB_SORT_CHOICES = ['Total Raids', 'NOTG Count', 'TCC Count', 'TNA Count', 'NOL Count'] as const;
export const LIST_SORT_CHOICES = ['Newest', 'Oldest'] as const;

export const LIST_ORDER_SQL: Record<string, string> = {
  'Newest':    'gl.completed_at DESC',
  'Oldest':    'gl.completed_at ASC',
  'date_asc':  'gl.completed_at ASC',
  'date_desc': 'gl.completed_at DESC',
  'type_asc':  'gl.raid_type ASC, gl.completed_at DESC',
  'type_desc': 'gl.raid_type DESC, gl.completed_at DESC',
};
