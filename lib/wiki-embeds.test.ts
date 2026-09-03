import { describe, expect, it } from 'vitest';
import { extractWikiEmbeds, parseWikiEmbedLine, splitWikiBody } from './wiki-embeds';

describe('parseWikiEmbedLine', () => {
  it('parses each directive kind with pipe args', () => {
    expect(parseWikiEmbedLine('{{alliance:The Federation}}')).toEqual({
      raw: '{{alliance:The Federation}}',
      kind: 'alliance',
      args: ['The Federation'],
    });
    expect(parseWikiEmbedLine('{{war-chart:Hax|Fox|2019-01-01|2019-06-01}}')?.args)
      .toEqual(['Hax', 'Fox', '2019-01-01', '2019-06-01']);
    expect(parseWikiEmbedLine('  {{map:2020-05-01|label text}}  ')?.kind).toBe('map');
  });

  it('rejects inline or malformed directives', () => {
    expect(parseWikiEmbedLine('text {{alliance:X}}')).toBeNull();
    expect(parseWikiEmbedLine('{{unknown:X}}')).toBeNull();
    expect(parseWikiEmbedLine('{{alliance}}')).toBeNull();
  });
});

describe('splitWikiBody', () => {
  it('splits directives out of markdown in order', () => {
    const segs = splitWikiBody('intro\n\n{{alliance:Fed}}\n\nmore text\n{{map:2020-01-01}}');
    expect(segs.map(s => s.type)).toEqual(['md', 'embed', 'md', 'embed']);
    expect(segs[1].type === 'embed' && segs[1].directive.kind).toBe('alliance');
  });

  it('leaves directives inside code fences as markdown', () => {
    const segs = splitWikiBody('```\n{{alliance:Fed}}\n```\nafter');
    expect(segs).toHaveLength(1);
    expect(segs[0].type).toBe('md');
  });

  it('returns one md segment for a body with no directives', () => {
    expect(splitWikiBody('plain **markdown** only')).toEqual([
      { type: 'md', text: 'plain **markdown** only' },
    ]);
  });
});

describe('extractWikiEmbeds', () => {
  it('dedupes repeated directives', () => {
    const found = extractWikiEmbeds('{{map:2020-01-01}}\nx\n{{map:2020-01-01}}\n{{map:2021-01-01}}');
    expect(found).toHaveLength(2);
    expect(found.map(d => d.args[0])).toEqual(['2020-01-01', '2021-01-01']);
  });
});
