/**
 * Playback speed tiers — THE single source of truth, shared by
 * MapHistoryControls and HistoryPlayback (which each render a speed dropdown
 * depending on panel width; they previously kept separate hardcoded lists and
 * drifted apart).
 *
 * Values are minutes of history per real second. Labels state the literal
 * rate so each tier is meaningful at a glance. The top tier matches the old
 * "Fast" mode (1 day per 100ms tick = 10 days/s).
 */
export const SPEED_OPTIONS = [10, 30, 60, 360, 1440, 14400];

export function speedLabel(s: number): string {
  if (s < 60) return `${s} min/s`;
  if (s < 1440) return `${s / 60} hr/s`;
  const days = s / 1440;
  return days === 1 ? '1 day/s' : `${days} days/s`;
}
