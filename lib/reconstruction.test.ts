import { describe, it, expect } from 'vitest';
import verbose from '@/public/territories_verbose.json';
import {
  reconstructAt,
  isReconstructed,
  anchorAt,
  RECONSTRUCTION_START,
  RECONSTRUCTION_END,
} from './reconstruction';

const geo = verbose as unknown as Record<
  string,
  { Location: { start: [number, number]; end: [number, number] } }
>;

const at = (iso: string) => new Date(`${iso}T00:00:00Z`);
const leader = (iso: string) => {
  const state = reconstructAt(at(iso), geo)!;
  const counts = new Map<string, number>();
  for (const t of Object.values(state.territories)) counts.set(t.n, (counts.get(t.n) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
};

describe('reconstruction window', () => {
  it('covers the guild update through to the first logged exchange', () => {
    expect(RECONSTRUCTION_START.toISOString().slice(0, 10)).toBe('2014-12-22');
    expect(RECONSTRUCTION_END.toISOString().slice(0, 10)).toBe('2018-01-03');
  });

  it('claims only the period before the log', () => {
    expect(isReconstructed(at('2015-06-01'))).toBe(true);
    expect(isReconstructed(at('2017-12-31'))).toBe(true);
    expect(isReconstructed(RECONSTRUCTION_END)).toBe(false);
    expect(isReconstructed(at('2018-06-01'))).toBe(false);
    expect(isReconstructed(at('2014-12-01'))).toBe(false);
  });

  it('returns nothing once the log takes over', () => {
    expect(reconstructAt(at('2018-02-01'), geo)).toBeNull();
    expect(anchorAt(at('2018-02-01'))).toBeNull();
  });
});

describe('reconstructed states', () => {
  it('assigns every tile it has in play', () => {
    const state = reconstructAt(at('2017-11-23'), geo)!;
    const total = state.provenance[0] + state.provenance[1] + state.provenance[2];
    expect(Object.keys(state.territories).length).toBe(total);
    expect(total).toBeGreaterThan(300);
  });

  it('holds Wynn only before Gavel opened, and the whole map after', () => {
    const held = (iso: string) => Object.keys(reconstructAt(at(iso), geo)!.territories);
    // Gavel territories became capturable on 28 August 2016
    expect(held('2016-07-28').length).toBe(held('2015-08-15').length);
    expect(held('2016-07-28').length).toBeLessThan(held('2016-09-23').length);
    // Corkus arrived on 7 April 2017
    expect(held('2017-03-16')).not.toContain('Corkus City');
    expect(held('2017-06-15')).toContain('Corkus City');
  });

  it('reproduces the territory lists the game published', () => {
    const count = (when: Date, guild: string) =>
      Object.values(reconstructAt(when, geo)!.territories).filter(t => t.n === guild).length;
    const dec23 = new Date('2014-12-23T10:05:08Z');
    expect(count(dec23, 'Holders of LE')).toBe(13);
    expect(count(dec23, 'Chex Mix')).toBe(13);
    const jun13 = new Date('2016-06-13T11:11:07Z');
    expect(count(jun13, "Nether's Ascent")).toBe(51);
    expect(reconstructAt(jun13, geo)!.provenance[2]).toBe(Object.keys(reconstructAt(jun13, geo)!.territories).length);
  });

  it('places the territories filmed in 2015 with the guild on their boss bar', () => {
    const owner = (iso: string, terr: string) => reconstructAt(at(iso), geo)!.territories[terr]?.n;
    expect(owner('2015-01-20', 'Volcano Upper')).toBe('Terrian');
    expect(owner('2015-02-10', 'Detlas')).toBe('Imperial');
    expect(owner('2015-03-09', 'Detlas')).toBe('Frosted Pants');
    expect(owner('2015-07-31', 'Almuj City')).toBe("Nether's Ascent");
    expect(owner('2015-07-31', 'Detlas')).toBe('Kangronomicon');
    // the July footage, not an inference, decides the desert in mid-August
    expect(owner('2015-08-15', 'Almuj City')).toBe("Nether's Ascent");
  });

  it('places the territories filmed in 2016 and 2017 with the guild on their boss bar', () => {
    const owner = (iso: string, terr: string) => reconstructAt(at(iso), geo)!.territories[terr]?.n;
    expect(owner('2016-01-24', 'Almuj City')).toBe('HackForums');
    expect(owner('2016-08-12', 'Ragni Main Entrance')).toBe('HackForums');
    expect(owner('2016-12-01', "Orphion's Seal")).toBe('UltimateXeons');
    expect(owner('2017-04-20', 'Corkus City')).toBe('Libertas');
    expect(owner('2017-09-24', 'Light Forest Canyon')).toBe('HackForums');
  });

  it('keeps HackForums on most of the map until the footage shows the break-up', () => {
    const hax = (iso: string) =>
      Object.values(reconstructAt(at(iso), geo)!.territories).filter(t => t.n === 'HackForums').length;
    expect(hax('2017-09-24')).toBeGreaterThan(250);   // still holding nearly everything filmed
    expect(hax('2017-10-01')).toBeLessThan(50);       // first fragmented footage is 30 Sep
  });

  it('shows Wynn split between many guilds three weeks after HackForums', () => {
    const owner = (iso: string, terr: string) => reconstructAt(at(iso), geo)!.territories[terr]?.n;
    expect(owner('2017-10-21', 'Detlas')).toBe('Titans Valor');
    expect(owner('2017-10-21', 'Nemract Town')).toBe('DogsAmongUs');
    expect(owner('2017-10-21', 'Nether Gate')).toBe('New York Nibbas');
    expect(owner('2015-06-08', 'Detlas')).toBe('Kangronomicon');
    expect(owner('2015-11-23', 'City of Troms')).toBe("Nether's Ascent");
  });

  it('holds nothing on the day guilds are released', () => {
    const first = reconstructAt(RECONSTRUCTION_START, geo)!;
    expect(Object.keys(first.territories)).toHaveLength(0);
    expect(anchorAt(RECONSTRUCTION_START)!.label).toBe('Guilds are released');
  });

  it('has the whole province claimed by the morning of the second day', () => {
    const held = (iso: string) => Object.keys(reconstructAt(at(iso), geo)!.territories).length;
    const full = Object.keys(reconstructAt(new Date('2014-12-23T10:05:08Z'), geo)!.territories).length;
    expect(held('2014-12-22')).toBe(0);
    expect(full).toBeGreaterThan(100);
    // and it stays claimed — no drifting back towards an empty map
    expect(held('2015-03-01')).toBe(full);
    expect(held('2015-08-15')).toBe(full);
  });

  it('fills during the first day rather than at a stroke', () => {
    const held = (h: number) =>
      Object.keys(reconstructAt(new Date(Date.UTC(2014, 11, 22, h)), geo)!.territories).length;
    expect(held(0)).toBe(0);
    expect(held(12)).toBeGreaterThan(0);
    expect(held(12)).toBeLessThan(held(23));
  });

  it('reproduces the leader each anchor is built around', () => {
    expect(leader('2015-08-15')![0]).toBe('Kangronomicon');
    expect(leader('2015-10-01')![0]).toBe('Travellers');
    expect(leader('2016-09-23')![0]).toBe('HackForums');
    expect(leader('2017-06-15')![0]).toBe('HackForums');
  });

  it('tracks HackForums along the arc the sources describe', () => {
    const hax = (iso: string) =>
      Object.values(reconstructAt(at(iso), geo)!.territories).filter(t => t.n === 'HackForums').length;
    expect(hax('2016-07-15')).toBeLessThan(hax('2016-09-23'));   // 94 on 8 Jun, 146 in the capture
    expect(hax('2016-09-23')).toBe(146);                          // the capture itself
    expect(hax('2017-06-15')).toBeGreaterThan(300);               // "300+ territories", their own thread
    expect(hax('2017-07-18')).toBeLessThan(hax('2017-06-15'));    // "even if it is less than 300"
    expect(hax('2017-11-23')).toBeLessThan(50);                   // the Coalition has taken Wynn
  });

  it('honours the archived leaderboard totals it was built from', () => {
    const [name, count] = leader('2016-09-23')!;
    expect(name).toBe('HackForums');
    expect(count).toBe(146); // the capture of 23 Sep 2016
  });

  it('moves gradually between anchors rather than jumping', () => {
    const a = reconstructAt(at('2017-06-15'), geo)!;
    const mid = reconstructAt(at('2017-07-01'), geo)!;
    const b = reconstructAt(at('2017-07-18'), geo)!;
    const diff = (x: typeof a, y: typeof a) =>
      Object.keys(x.territories).filter(k => x.territories[k].n !== y.territories[k]?.n).length;
    // the midpoint sits between the two ends, not on top of either
    expect(diff(a, mid)).toBeGreaterThan(0);
    expect(diff(mid, b)).toBeGreaterThan(0);
    expect(diff(a, mid)).toBeLessThan(diff(a, b) + 1);
  });

  it('marks most of the map as guessed, and says so honestly', () => {
    const state = reconstructAt(at('2016-09-23'), geo)!;
    const [guessed, inferred, attested] = state.provenance;
    expect(guessed).toBeGreaterThan(attested + inferred);
  });

  it('carries the anchor label and note for the banner', () => {
    const a = anchorAt(at('2017-06-20'))!;
    expect(a.label).toBe('The record');
    expect(a.note).toMatch(/300\+ territories/);
  });
});
