import { describe, expect, it } from 'vitest';
import { counterDelta } from './counter-delta';

describe('counterDelta', () => {
  it('is the growth between two readings', () => {
    expect(counterDelta(1500, 1440)).toEqual({ value: 60, hasData: true });
    expect(counterDelta(0, 0)).toEqual({ value: 0, hasData: true });
  });

  it('treats an API correction as no growth', () => {
    expect(counterDelta(64, 71)).toEqual({ value: 0, hasData: true });
  });

  it('has no data when either reading is unknown, instead of crediting the lifetime count', () => {
    expect(counterDelta(10786, null)).toEqual({ value: 0, hasData: false });
    expect(counterDelta(null, 10370)).toEqual({ value: 0, hasData: false });
    expect(counterDelta(10786, undefined)).toEqual({ value: 0, hasData: false });
  });
});
