import { describe, expect, it } from 'vitest';
import { extractCitations, citationList, fallbackCitationTitle } from './wiki-citations';
import type { WikiCitationMap } from './wiki-citations';

describe('extractCitations', () => {
  it('numbers citations in order of first appearance', () => {
    const found = extractCitations('A{{cite:thread-1}} B{{cite:thread-2|p3 #45}} C');
    expect(found.map(c => [c.number, c.ref, c.locator])).toEqual([
      [1, 'thread-1', ''],
      [2, 'thread-2', 'p3 #45'],
    ]);
  });

  it('reuses a number for an identical repeated citation', () => {
    const found = extractCitations('X{{cite:thread-1}} Y{{cite:thread-2}} Z{{cite:thread-1}}');
    expect(found).toHaveLength(2);
    expect(found[0].number).toBe(1);
    expect(found[1].number).toBe(2);
  });

  it('treats a different locator as a distinct reference', () => {
    const found = extractCitations('{{cite:t|p1}} and {{cite:t|p2}}');
    expect(found).toHaveLength(2);
    expect(found.map(c => c.locator)).toEqual(['p1', 'p2']);
  });

  it('handles urls and free text as refs', () => {
    const found = extractCitations('{{cite:https://example.com/a|Some page}} {{cite:map-data analysis}}');
    expect(found[0].ref).toBe('https://example.com/a');
    expect(found[0].locator).toBe('Some page');
    expect(found[1].ref).toBe('map-data analysis');
  });

  it('ignores malformed or multiline tokens', () => {
    expect(extractCitations('{{cite:}}')).toHaveLength(0);
    expect(extractCitations('{{cite:a\nb}}')).toHaveLength(0);
    expect(extractCitations('{{alliance:Federation}}')).toHaveLength(0);
  });
});

describe('citationList', () => {
  it('sorts by number', () => {
    const map: WikiCitationMap = {
      b: { raw: 'b', ref: 'r2', locator: '', number: 2, title: 'Two', archived: false },
      a: { raw: 'a', ref: 'r1', locator: '', number: 1, title: 'One', archived: false },
    };
    expect(citationList(map).map(c => c.title)).toEqual(['One', 'Two']);
  });
});

describe('fallbackCitationTitle', () => {
  it('shortens urls and passes text through', () => {
    expect(fallbackCitationTitle('https://www.example.com/a/b')).toBe('example.com/a/b');
    expect(fallbackCitationTitle('https://example.com/')).toBe('example.com');
    expect(fallbackCitationTitle('territory_exchanges analysis')).toBe('territory_exchanges analysis');
  });
});
