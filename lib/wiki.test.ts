import { describe, it, expect } from 'vitest';
import {
  extractToc,
  extractWikiLinks,
  slugify,
  validateWikiPagePayload,
} from './wiki';

describe('slugify', () => {
  it('kebab-cases titles', () => {
    expect(slugify('The Federation')).toBe('the-federation');
    expect(slugify('  smtn elf!! ')).toBe('smtn-elf');
    expect(slugify('Idiot Co–Aquarium war')).toBe('idiot-co-aquarium-war');
  });
});

describe('extractWikiLinks', () => {
  it('finds targets, slugified and deduplicated', () => {
    const body = 'See [[The Federation]] and [[goose|the goose]] and [[The Federation|Fed]].';
    expect(extractWikiLinks(body).sort()).toEqual(['goose', 'the-federation']);
  });
  it('ignores plain markdown links', () => {
    expect(extractWikiLinks('[label](https://example.com)')).toEqual([]);
  });
});

describe('extractToc', () => {
  it('collects h2/h3 and skips code fences', () => {
    const body = '## History\n### The [[federation|Fed]] era\n```\n## not a heading\n```\n#### too deep';
    const toc = extractToc(body);
    expect(toc).toEqual([
      { depth: 2, text: 'History', anchor: 'history' },
      { depth: 3, text: 'The Fed era', anchor: 'the-fed-era' },
    ]);
  });
});

describe('validateWikiPagePayload', () => {
  const valid = () => ({
    slug: 'the-federation',
    title: 'The Federation',
    pageType: 'alliance',
    summary: 'The dominant alliance of 2018.',
    infobox: [{ label: 'Founded', value: 'Feb 2018' }],
    body: '## History\nIt held the map.',
  });

  it('accepts a valid payload', () => {
    const r = validateWikiPagePayload(valid());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.slug).toBe('the-federation');
  });

  it('derives the slug from the title when omitted', () => {
    const r = validateWikiPagePayload({ ...valid(), slug: '' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.slug).toBe('the-federation');
  });

  it('rejects bad slugs, types and empty bodies', () => {
    expect(validateWikiPagePayload({ ...valid(), slug: 'Bad Slug!' }).ok).toBe(false);
    expect(validateWikiPagePayload({ ...valid(), pageType: 'faction' }).ok).toBe(false);
    expect(validateWikiPagePayload({ ...valid(), body: '   ' }).ok).toBe(false);
  });

  it('preserves newlines in bodies but strips control chars', () => {
    const r = validateWikiPagePayload({ ...valid(), body: 'line one\r\nline two' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.body).toBe('line one\nline two');
  });
});
