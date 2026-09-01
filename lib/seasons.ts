// Guild competitive seasons from the Wynncraft API (/v3/guild/seasons).
// Used to contextualize the map history timeline: on-season vs off-season periods.

export interface RawSeason {
  season: number;
  startDate: string;
  endDate: string;
  territoryHoldingSrPerHour?: number;
  srPerWar?: number;
}

export interface SeasonPeriod {
  type: 'season' | 'off';
  /** Season number, or null for an off-season gap between seasons. */
  season: number | null;
  /** Short label, e.g. "S31" or "Off". */
  label: string;
  start: Date;
  end: Date;
  srPerHour?: number;
  srPerWar?: number;
}

// Gaps shorter than this between consecutive seasons are ignored (treated as contiguous).
const MIN_OFF_SEASON_MS = 60 * 1000;

/**
 * Build a chronological list of on-season and off-season periods from the raw
 * season list. Off-season periods fill the gaps between consecutive seasons.
 */
export function buildSeasonPeriods(raw: RawSeason[]): SeasonPeriod[] {
  const sorted = raw
    .filter((s) => s.startDate && s.endDate)
    .slice()
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

  const periods: SeasonPeriod[] = [];
  let prevEnd: Date | null = null;

  for (const s of sorted) {
    const start = new Date(s.startDate);
    const end = new Date(s.endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) continue;

    if (prevEnd && start.getTime() - prevEnd.getTime() > MIN_OFF_SEASON_MS) {
      periods.push({ type: 'off', season: null, label: 'Off', start: prevEnd, end: start });
    }

    periods.push({
      type: 'season',
      season: s.season,
      label: `S${s.season}`,
      start,
      end,
      srPerHour: s.territoryHoldingSrPerHour,
      srPerWar: s.srPerWar,
    });
    prevEnd = end;
  }

  return periods;
}

/**
 * Find the period (season or off-season) covering a given date, or null if
 * outside all seasons.
 *
 * Boundary instants belong to the SEASON: an off-season's start is exactly the
 * previous season's end, so with a plain half-open scan a date landing exactly
 * on a season's end (e.g. the last pixel of a timeline zoomed to that season)
 * would report "Off-season".
 */
export function seasonAtDate(periods: SeasonPeriod[], date: Date): SeasonPeriod | null {
  const t = date.getTime();
  for (const p of periods) {
    if (p.type === 'season' && t >= p.start.getTime() && t <= p.end.getTime()) return p;
  }
  for (const p of periods) {
    if (p.type === 'off' && t >= p.start.getTime() && t < p.end.getTime()) return p;
  }
  return null;
}

/** Deterministic, well-spread color for a season number (so adjacent seasons are distinguishable). */
export function seasonColor(season: number): string {
  const hue = (season * 53) % 360;
  return `hsl(${hue}, 55%, 45%)`;
}
