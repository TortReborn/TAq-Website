// Fixed weekly reset schedule (UTC), corrected 1 hour earlier than the Tort bot's.
export const LOOT_RESET_WEEKDAY_UTC = 5; // Friday
export const LOOT_RESET_HOUR_UTC = 18;
export const RAID_RESET_WEEKDAY_UTC = 5;
export const RAID_RESET_HOUR_UTC = 17;

export function nextWeeklyReset(weekday: number, hour: number, now: Date = new Date()): Date {
  const target = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    hour, 0, 0, 0
  ));
  const daysUntil = (weekday - target.getUTCDay() + 7) % 7;
  target.setUTCDate(target.getUTCDate() + daysUntil);
  if (target.getTime() <= now.getTime()) {
    target.setUTCDate(target.getUTCDate() + 7);
  }
  return target;
}

export function formatCountdown(target: Date, now: Date = new Date()): string {
  const totalSec = Math.max(0, Math.floor((target.getTime() - now.getTime()) / 1000));
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
