// Tower stats by level (0-11) - actual values at each level
export const TOWER_STATS = {
  // Health values per level
  health: [300000, 450000, 600000, 750000, 960000, 1200000, 1500000, 1800000, 2160000, 2280000, 2580000, 2820000],
  // Defense percentages per level
  defense: [0.10, 0.40, 0.55, 0.625, 0.70, 0.75, 0.79, 0.82, 0.84, 0.86, 0.88, 0.90],
  // Damage min values per level
  damageMin: [1000, 1400, 1800, 2200, 2600, 3000, 3400, 3800, 4200, 4600, 5000, 5400],
  // Damage max values per level
  damageMax: [1500, 2100, 2700, 3300, 3900, 4500, 5100, 5700, 6300, 6900, 7500, 8100],
  // Attack speed multipliers per level
  attackSpeed: [0.5, 0.75, 1.0, 1.25, 1.61, 2.0, 2.5, 3.0, 3.1, 4.2, 4.35, 4.7]
};

// Aura cooldown by level (0-3), 0 = disabled
export const AURA_COOLDOWN = [0, 24, 18, 12];

// Volley cooldown by level (0-3), 0 = disabled
export const VOLLEY_COOLDOWN = [0, 20, 15, 10];

// Max levels
export const MAX_TOWER_LEVEL = 11;
export const MAX_AURA_LEVEL = 3;
export const MAX_VOLLEY_LEVEL = 3;

// Calculate connection bonus multiplier
// Formula: stat × (1.0 + 0.3 × connections)
export function calculateConnectionBonus(connections: number): number {
  return 1.0 + (0.3 * connections);
}

// Calculate HQ bonus multiplier
// Formula: (1.5 + 0.25 × externals) when HQ is enabled
export function calculateHQBonus(isHQ: boolean, externals: number): number {
  if (!isHQ) return 1.0;
  return 1.5 + (0.25 * externals);
}

// Calculate effective HP
// EHP = health / (1 - defense%) × connection bonus × HQ bonus
export function calculateEffectiveHP(
  healthLevel: number,
  defenseLevel: number,
  connections: number,
  isHQ: boolean,
  externals: number
): number {
  const health = TOWER_STATS.health[healthLevel];
  const defense = TOWER_STATS.defense[defenseLevel];
  const connectionBonus = calculateConnectionBonus(connections);
  const hqBonus = calculateHQBonus(isHQ, externals);

  // EHP = health / (1 - defense) × bonuses
  const effectiveHP = (health / (1 - defense)) * connectionBonus * hqBonus;
  return Math.round(effectiveHP);
}

// Calculate average DPS
// Avg DPS = ((damageMin + damageMax) / 2) × attackSpeed × connection bonus × HQ bonus
export function calculateAvgDPS(
  damageLevel: number,
  attackSpeedLevel: number,
  connections: number,
  isHQ: boolean,
  externals: number
): number {
  const damageMin = TOWER_STATS.damageMin[damageLevel];
  const damageMax = TOWER_STATS.damageMax[damageLevel];
  const attackSpeed = TOWER_STATS.attackSpeed[attackSpeedLevel];
  const connectionBonus = calculateConnectionBonus(connections);
  const hqBonus = calculateHQBonus(isHQ, externals);

  const avgDamage = (damageMin + damageMax) / 2;
  const dps = avgDamage * attackSpeed * connectionBonus * hqBonus;
  return Math.round(dps * 100) / 100;
}

// Get defense tier based on effective HP and DPS
export function getDefenseTier(effectiveHP: number, avgDPS: number): { tier: string; color: string } {
  const score = effectiveHP + (avgDPS * 1000);

  if (score >= 100000000) {
    return { tier: 'Very High', color: '#43a047' };
  } else if (score >= 50000000) {
    return { tier: 'High', color: '#fbc02d' };
  } else if (score >= 20000000) {
    return { tier: 'Medium', color: '#fb8c00' };
  } else if (score >= 5000000) {
    return { tier: 'Low', color: '#e57373' };
  } else {
    return { tier: 'Very Low', color: '#b71c1c' };
  }
}

// Get treasury tier based on time held (in seconds)
export function getTreasuryTier(timeHeldSeconds: number): { tier: string; color: string } {
  const oneHour = 3600;
  const oneDay = 86400;
  const fiveDays = oneDay * 5;
  const twelveDays = oneDay * 12;

  if (timeHeldSeconds < oneHour) {
    return { tier: 'Very Low', color: '#43a047' };
  } else if (timeHeldSeconds < oneDay) {
    return { tier: 'Low', color: '#8bc34a' };
  } else if (timeHeldSeconds < fiveDays) {
    return { tier: 'Medium', color: '#fbc02d' };
  } else if (timeHeldSeconds < twelveDays) {
    return { tier: 'High', color: '#fb8c00' };
  } else {
    return { tier: 'Very High', color: '#b71c1c' };
  }
}

// Format time held as readable string
export function formatTimeHeld(timeHeldSeconds: number): string {
  if (timeHeldSeconds < 0 || isNaN(timeHeldSeconds)) return '';

  const days = Math.floor(timeHeldSeconds / 86400);
  const hours = Math.floor((timeHeldSeconds % 86400) / 3600);
  const minutes = Math.floor((timeHeldSeconds % 3600) / 60);
  const seconds = Math.floor(timeHeldSeconds % 60);

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m ${seconds}s`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  } else {
    return `${seconds}s`;
  }
}

// Get display text for Aura level
export function getAuraDisplay(level: number): string {
  if (level === 0) return 'N/A';
  return `${AURA_COOLDOWN[level]}s`;
}

// Get display text for Volley level
export function getVolleyDisplay(level: number): string {
  if (level === 0) return 'N/A';
  return `${VOLLEY_COOLDOWN[level]}s`;
}

// Format large numbers with commas (e.g., 1,234,567)
export function formatNumber(num: number): string {
  return num.toLocaleString('en-US');
}

// Get health display value
export function getHealthDisplay(level: number): string {
  return formatNumber(TOWER_STATS.health[level]);
}

// Get defense display value as percentage
export function getDefenseDisplay(level: number): string {
  return `${Math.round(TOWER_STATS.defense[level] * 100)}%`;
}

// Get damage range display
export function getDamageDisplay(level: number): string {
  return `${formatNumber(TOWER_STATS.damageMin[level])}-${formatNumber(TOWER_STATS.damageMax[level])}`;
}

// Get attack speed display
export function getAttackSpeedDisplay(level: number): string {
  return `${TOWER_STATS.attackSpeed[level]}x`;
}
