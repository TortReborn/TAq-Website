import { describe, it, expect } from 'vitest';
import { tradeRouteEraFor, TRADE_ROUTES_EPOCH_MS, TRADE_ROUTE_ERAS } from './trade-routes';

const at = (iso: string) => tradeRouteEraFor(Date.parse(iso));

describe('tradeRouteEraFor', () => {
  it('returns null before trade routes existed (pre-1.20)', () => {
    expect(at('2018-06-15')).toBeNull();
    expect(at('2020-12-31')).toBeNull();
    expect(tradeRouteEraFor(TRADE_ROUTES_EPOCH_MS - 1)).toBeNull();
  });

  it('resolves the 1.20 launch graph from the epoch', () => {
    expect(tradeRouteEraFor(TRADE_ROUTES_EPOCH_MS)?.url).toBe('/trade-routes/2021-01.json?v=1');
    expect(at('2021-06-01')?.url).toBe('/trade-routes/2021-01.json?v=1');
  });

  it('resolves the 1.20.3 graph (with Bloody Beach route) from Jul 2021', () => {
    expect(at('2021-07-05')?.url).toBe('/trade-routes/2021-07.json?v=1');
    expect(at('2021-10-01')?.url).toBe('/trade-routes/2021-07.json?v=1');
  });

  it('resolves the post-resurvey graph from Nov 2021 through the whole 2.0 era', () => {
    expect(at('2021-11-13')?.url).toBe('/trade-routes/2021-11.json?v=1');
    expect(at('2022-06-15')?.url).toBe('/trade-routes/2021-11.json?v=1');
    expect(at('2024-01-01')?.url).toBe('/trade-routes/2021-11.json?v=1');
  });

  it('resolves the 2.1 Rekindled graph (with Picnic Pond route) from Aug 2024', () => {
    expect(at('2024-08-10')?.url).toBe('/trade-routes/2024-08.json?v=1');
    expect(at('2025-06-01')?.url).toBe('/trade-routes/2024-08.json?v=1');
  });

  it('resolves the post-Picnic-Pond-removal graph from Jul 31, 2025', () => {
    expect(at('2025-07-31')?.url).toBe('/trade-routes/2025-07.json?v=1');
    expect(at('2025-12-01')?.url).toBe('/trade-routes/2025-07.json?v=1');
  });

  it('resolves the present-day graph from 2.2 Fruma onward, and for live view', () => {
    expect(at('2026-06-01')?.url).toContain('territories_verbose');
    expect(tradeRouteEraFor(null)?.url).toContain('territories_verbose');
  });

  it('eras are sorted ascending by start', () => {
    for (let i = 1; i < TRADE_ROUTE_ERAS.length; i++) {
      expect(TRADE_ROUTE_ERAS[i].startMs).toBeGreaterThan(TRADE_ROUTE_ERAS[i - 1].startMs);
    }
  });
});
