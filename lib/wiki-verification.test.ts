import { describe, it, expect } from 'vitest';
import {
  WIKI_IMAGE_SRC_RE,
  WIKI_VALIDATIONS_REQUIRED,
  WikiVerification,
  validateWikiPagePayload,
} from './wiki';

/**
 * The rule the banner is computed from, restated here so a change to it has to
 * be deliberate. A page is verified when a person has edited it, or when enough
 * chroniclers have vouched for the revision now on display.
 */
function isVerified(v: Pick<WikiVerification, 'hasHumanRevision' | 'validations'>): boolean {
  return v.hasHumanRevision || v.validations >= WIKI_VALIDATIONS_REQUIRED;
}

describe('page verification rule', () => {
  it('treats a page no human has touched as unverified', () => {
    expect(isVerified({ hasHumanRevision: false, validations: 0 })).toBe(false);
  });

  it('does not let a single vouch clear a page', () => {
    // The whole point of requiring two: one person cannot wave through a page,
    // including one they wrote themselves.
    expect(WIKI_VALIDATIONS_REQUIRED).toBeGreaterThan(1);
    expect(isVerified({ hasHumanRevision: false, validations: 1 })).toBe(false);
  });

  it('clears once enough chroniclers vouch', () => {
    expect(isVerified({ hasHumanRevision: false, validations: WIKI_VALIDATIONS_REQUIRED })).toBe(true);
  });

  it('clears as soon as a person edits, with no vouches at all', () => {
    expect(isVerified({ hasHumanRevision: true, validations: 0 })).toBe(true);
  });
});

describe('lead image sources', () => {
  it('accepts an uploaded image served from the wiki image route', () => {
    expect(WIKI_IMAGE_SRC_RE.test('/api/wiki/image/42')).toBe(true);
  });

  it('accepts committed assets and absolute urls', () => {
    expect(WIKI_IMAGE_SRC_RE.test('/images/chronicles/media/libertas.webp')).toBe(true);
    expect(WIKI_IMAGE_SRC_RE.test('https://example.com/a.png')).toBe(true);
  });

  it('rejects sources that would put script or data into an img src', () => {
    for (const bad of [
      'javascript:alert(1)',
      'data:image/svg+xml;base64,PHN2Zz4=',
      '//evil.example.com/a.png',
      '/api/wiki/image/../../etc/passwd',
      '/api/wiki/image/abc',
    ]) {
      expect(WIKI_IMAGE_SRC_RE.test(bad), bad).toBe(false);
    }
  });

  it('accepts a payload carrying an uploaded lead image', () => {
    const result = validateWikiPagePayload({
      slug: 'a-guild',
      title: 'A Guild',
      pageType: 'guild',
      summary: 'A guild that existed.',
      infobox: [],
      leadImage: '/api/wiki/image/7',
      leadImageCaption: 'The guild banner.',
      body: 'Body text.',
    });
    expect(result.ok).toBe(true);
  });
});
