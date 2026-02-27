import { describe, it, expect } from 'vitest';
import {
  RETIRED_TERRITORIES,
  shouldRenderTerritory,
  shouldRenderTradeRoute,
} from './retired-territories';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal live-territory map stub (just needs the key to be present) */
function makeLive(...names: string[]): Record<string, unknown> {
  return Object.fromEntries(names.map((n) => [n, {}]));
}

// ---------------------------------------------------------------------------
// RETIRED_TERRITORIES set contents
// ---------------------------------------------------------------------------

describe('RETIRED_TERRITORIES set', () => {
  // ── territories the user explicitly reported as problematic ───────────────
  it('contains all user-reported Light Forest territories', () => {
    const expected = [
      'Light Forest East Lower',
      'Light Forest East Mid',
      'Light Forest East Upper',
      'Light Forest Canyon',
      'Light Forest South Entrance',
      'Light Forest Entrance',
      'Light Forest North Entrance',
      'Light Forest North Exit',
      'Light Forest South Exit',
      'Light Forest West Lower',
      'Light Forest West Mid',
      'Light Forest West Upper',
    ];
    for (const name of expected) {
      expect(RETIRED_TERRITORIES.has(name), `Expected "${name}" to be retired`).toBe(true);
    }
  });

  it('contains all user-reported Realm of Light territories', () => {
    const expected = [
      'Spiraling Trees',
      'Light Realm Mushrooms',
      'Light Realm East',
      'Light Realm East Mid-Upper',
      'Light Realm Entrance Upper',
    ];
    for (const name of expected) {
      expect(RETIRED_TERRITORIES.has(name), `Expected "${name}" to be retired`).toBe(true);
    }
  });

  it('contains user-reported old camp territories', () => {
    expect(RETIRED_TERRITORIES.has('Red Camp')).toBe(true);
    expect(RETIRED_TERRITORIES.has('Green Camp')).toBe(true);
    expect(RETIRED_TERRITORIES.has('Black Camp')).toBe(true);
  });

  it('contains user-reported Aldorei and Ozoth territories', () => {
    const expected = [
      "Aldorei's River",
      "Aldorei's Waterfall",
      "Aldorei's North Exit",
      "Aldorei's Arch",
      // "Path to Ozoth's Spire" (lowercase-t) is the NEW post-Rekindled territory — NOT retired
      "Path To Ozoth's Spire Lower",
      "Path To Ozoth's Spire Mid",
      "Path To Ozoth's Spire Upper",
      'Abandoned Manor',
    ];
    for (const name of expected) {
      expect(RETIRED_TERRITORIES.has(name), `Expected "${name}" to be retired`).toBe(true);
    }
  });

  it('contains Road to Light Forest in both capitalisation variants', () => {
    expect(RETIRED_TERRITORIES.has('Road to Light Forest')).toBe(true);
    expect(RETIRED_TERRITORIES.has('Road To Light Forest')).toBe(true);
  });

  // ── known-active territories must NOT be in the set ───────────────────────
  it('does NOT contain currently-active territories', () => {
    const active = [
      'Bantisu Air Temple',
      'Detlas',
      'Selchar',
      "Wolves' Den",
      'Maro Peaks',
      "Nomads' Refuge",
      'Lava Springs',
      'Trunkstump Goblin Camp',
      // These territories are ACTIVE (verified in DB through Feb 2026)
      // — they were wrongly classified as retired due to apostrophe mismatch in old DB entries
      "Krolton's Cave",
      "Ranol's Farm",
      "Jitak's Farm",
      "Cinfras's Small Farm",
      // Post-Rekindled active territory (lowercase-t, different from the old uppercase-T variants)
      "Path to Ozoth's Spire",
    ];
    for (const name of active) {
      expect(RETIRED_TERRITORIES.has(name), `"${name}" should NOT be retired`).toBe(false);
    }
  });

  it('does NOT contain FRUMA TBD territory names (they are not retired, just unreleased)', () => {
    const frumaTBD = [
      'Agricultural Sector',
      'Industrial Sector',
      'Residence Sector',
      "Citadel's Shadow",
      'Royal Barracks',
      'Fort Hegea',
      'Fort Tericen',
    ];
    for (const name of frumaTBD) {
      expect(RETIRED_TERRITORIES.has(name), `FRUMA TBD "${name}" should NOT be in retired set`).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// shouldRenderTerritory — live mode
// ---------------------------------------------------------------------------

describe('shouldRenderTerritory — live mode', () => {
  it('returns false for all retired Light Forest territories', () => {
    const retired = [
      'Light Forest East Lower',
      'Light Forest East Mid',
      'Light Forest East Upper',
      'Light Forest Canyon',
      'Light Forest South Entrance',
    ];
    for (const name of retired) {
      expect(shouldRenderTerritory(name, 'live'), `"${name}" should not render in live mode`).toBe(false);
    }
  });

  it('returns false for Realm of Light territories in live mode', () => {
    expect(shouldRenderTerritory('Spiraling Trees', 'live')).toBe(false);
    expect(shouldRenderTerritory('Light Realm Mushrooms', 'live')).toBe(false);
    expect(shouldRenderTerritory('Light Realm East', 'live')).toBe(false);
  });

  it('returns true for active farm / cave territories in live mode (they are NOT retired)', () => {
    // These were previously misclassified as retired; verified active in DB through Feb 2026
    expect(shouldRenderTerritory("Krolton's Cave", 'live')).toBe(true);
    expect(shouldRenderTerritory("Ranol's Farm", 'live')).toBe(true);
    expect(shouldRenderTerritory("Jitak's Farm", 'live')).toBe(true);
    expect(shouldRenderTerritory("Cinfras's Small Farm", 'live')).toBe(true);
  });

  it('returns false for Red Camp / Green Camp / Black Camp in live mode', () => {
    expect(shouldRenderTerritory('Red Camp', 'live')).toBe(false);
    expect(shouldRenderTerritory('Green Camp', 'live')).toBe(false);
    expect(shouldRenderTerritory('Black Camp', 'live')).toBe(false);
  });

  it('returns true for known-active territories in live mode', () => {
    const active = ['Bantisu Air Temple', 'Detlas', 'Selchar', 'Maro Peaks'];
    for (const name of active) {
      expect(shouldRenderTerritory(name, 'live'), `"${name}" should render in live mode`).toBe(true);
    }
  });

  it('returns true for FRUMA TBD territories in live mode (they are unreleased, not retired)', () => {
    expect(shouldRenderTerritory('Agricultural Sector', 'live')).toBe(true);
    expect(shouldRenderTerritory('Royal Barracks', 'live')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// shouldRenderTerritory — history mode
// This is the core regression that caused Light Forest not to appear at Sep 2023
// ---------------------------------------------------------------------------

describe('shouldRenderTerritory — history mode', () => {
  it('returns true for Light Forest East Lower at any historical timestamp (regression: Sep 2 2023)', () => {
    // Before the fix, this returned false because RETIRED_TERRITORIES was applied
    // to history mode too, blocking Light Forest from appearing in 2023.
    expect(shouldRenderTerritory('Light Forest East Lower', 'history')).toBe(true);
  });

  it('returns true for ALL Light Forest territories in history mode', () => {
    const lightForest = [
      'Light Forest East Lower',
      'Light Forest East Mid',
      'Light Forest East Upper',
      'Light Forest Canyon',
      'Light Forest South Entrance',
      'Light Forest North Entrance',
      'Light Forest North Exit',
      'Light Forest South Exit',
      'Light Forest Entrance',
      'Light Forest West Lower',
      'Light Forest West Mid',
      'Light Forest West Upper',
    ];
    for (const name of lightForest) {
      expect(shouldRenderTerritory(name, 'history'), `"${name}" should render in history mode (it existed before removal)`).toBe(true);
    }
  });

  it('returns true for Realm of Light territories in history mode', () => {
    const realmOfLight = [
      'Spiraling Trees',
      'Light Realm Mushrooms',
      'Light Realm East',
      'Light Realm East Mid-Upper',
      'Light Realm Entrance Upper',
    ];
    for (const name of realmOfLight) {
      expect(shouldRenderTerritory(name, 'history'), `"${name}" should render in history mode`).toBe(true);
    }
  });

  it('returns true for active farm / cave territories in history mode', () => {
    expect(shouldRenderTerritory("Krolton's Cave", 'history')).toBe(true);
    expect(shouldRenderTerritory("Ranol's Farm", 'history')).toBe(true);
    expect(shouldRenderTerritory("Jitak's Farm", 'history')).toBe(true);
    expect(shouldRenderTerritory("Cinfras's Small Farm", 'history')).toBe(true);
  });

  it('returns true for Red Camp / Green Camp / Black Camp in history mode', () => {
    expect(shouldRenderTerritory('Red Camp', 'history')).toBe(true);
    expect(shouldRenderTerritory('Green Camp', 'history')).toBe(true);
    expect(shouldRenderTerritory('Black Camp', 'history')).toBe(true);
  });

  it('returns true for currently-active territories in history mode', () => {
    const active = ['Bantisu Air Temple', 'Detlas', 'Selchar'];
    for (const name of active) {
      expect(shouldRenderTerritory(name, 'history')).toBe(true);
    }
  });

  it('returns true for Aldorei and Ozoth territories in history mode', () => {
    const oldTerrs = [
      "Aldorei's River",
      "Aldorei's Waterfall",
      "Aldorei's North Exit",
      "Aldorei's Arch",
      "Path To Ozoth's Spire Lower",
      "Path To Ozoth's Spire Mid",
    ];
    for (const name of oldTerrs) {
      expect(shouldRenderTerritory(name, 'history'), `"${name}" should render in history mode`).toBe(true);
    }
  });

  it('returns true for Abandoned Manor in history mode', () => {
    expect(shouldRenderTerritory('Abandoned Manor', 'history')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Live/history mode is the ONLY dimension — both should allow unknown names
// ---------------------------------------------------------------------------

describe('shouldRenderTerritory — unknown / future territories', () => {
  it('returns true for unknown territory names in live mode (not retired = allow)', () => {
    expect(shouldRenderTerritory('Some Future Territory 2026', 'live')).toBe(true);
    expect(shouldRenderTerritory('New Region Alpha', 'live')).toBe(true);
  });

  it('returns true for unknown territory names in history mode', () => {
    expect(shouldRenderTerritory('Some Future Territory 2026', 'history')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// shouldRenderTradeRoute
// ---------------------------------------------------------------------------

describe('shouldRenderTradeRoute', () => {
  const liveMap = makeLive('Detlas', 'Ragni', 'Almuj', 'Bantisu Air Temple');

  it('returns true when both source and dest exist in live territories and neither is retired', () => {
    expect(shouldRenderTradeRoute('Detlas', 'Ragni', liveMap)).toBe(true);
    expect(shouldRenderTradeRoute('Ragni', 'Almuj', liveMap)).toBe(true);
  });

  it('returns false when source is not in live territories (stale verbose-JSON entry)', () => {
    // Krolton's Cave is retired and NOT in live map → route should not be drawn
    expect(shouldRenderTradeRoute("Krolton's Cave", 'Detlas', liveMap)).toBe(false);
  });

  it('returns false when dest is not in live territories', () => {
    expect(shouldRenderTradeRoute('Detlas', "Krolton's Cave", liveMap)).toBe(false);
  });

  it('returns false when source is in live territories but is retired', () => {
    // Even if somehow a retired territory appears in the live map, routes should be blocked
    const mapWithRetired = makeLive('Detlas', 'Light Forest East Lower');
    expect(shouldRenderTradeRoute('Light Forest East Lower', 'Detlas', mapWithRetired)).toBe(false);
  });

  it('returns false when dest is in live territories but is retired', () => {
    const mapWithRetired = makeLive('Detlas', 'Light Forest East Lower');
    expect(shouldRenderTradeRoute('Detlas', 'Light Forest East Lower', mapWithRetired)).toBe(false);
  });

  it('returns false when both endpoints are missing from live map', () => {
    expect(shouldRenderTradeRoute('Light Forest East Lower', 'Light Forest East Mid', liveMap)).toBe(false);
  });

  it('returns false for old farm-to-farm routes that should never render', () => {
    const emptyMap = makeLive();
    expect(shouldRenderTradeRoute("Ranol's Farm", "Jitak's Farm", emptyMap)).toBe(false);
    expect(shouldRenderTradeRoute("Krolton's Cave", "Ranol's Farm", emptyMap)).toBe(false);
  });

  it('returns false for Aldorei route to Detlas when neither is live', () => {
    expect(shouldRenderTradeRoute("Aldorei's River", 'Detlas', liveMap)).toBe(false);
  });

  it('returns false for Road to Light Forest routes', () => {
    const mapWithRoad = makeLive('Detlas', 'Road to Light Forest');
    expect(shouldRenderTradeRoute('Road to Light Forest', 'Detlas', mapWithRoad)).toBe(false);
    expect(shouldRenderTradeRoute('Detlas', 'Road to Light Forest', mapWithRoad)).toBe(false);
  });
});
