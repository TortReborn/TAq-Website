import { describe, expect, it } from 'vitest';
import {
  contentToText, fromReadable, imageSrc, normalizeContent, parseMessageLink, toReadable,
} from './bot-panels';

const ASSET = 'asset://0123456789abcdef.png';

describe('normalizeContent', () => {
  it('keeps known fields, trims, and drops everything else', () => {
    const { content, errors } = normalizeContent({
      messages: [{
        content: '  hello  ', junk: 'x',
        images: [ASSET],
        embeds: [{ title: ' T ', description: 'D', color: 0x94c1ff, evil: '<script>', fields: [{ name: 'n', value: 'v', inline: 1 }] }],
        rows: [[{ kind: 'link', label: 'Site', url: 'https://the-aquarium.com', extra: 1 }], []],
      }],
    });
    expect(errors).toEqual([]);
    expect(content).toEqual({
      messages: [{
        content: 'hello',
        images: [ASSET],
        embeds: [{ title: 'T', description: 'D', color: 0x94c1ff, fields: [{ name: 'n', value: 'v', inline: true }] }],
        rows: [[{ kind: 'link', label: 'Site', url: 'https://the-aquarium.com' }]],
      }],
    });
  });

  it('names the spot that breaks a Discord limit', () => {
    const { content, errors } = normalizeContent({
      messages: [{ embeds: [{ description: 'ok' }, { description: 'x'.repeat(4097) }] }],
    });
    expect(content).toBeUndefined();
    expect(errors[0]).toMatch(/^Message 1, embed 2: description is 4097/);
  });

  it('rejects linked banners, bad schemes and unknown bot buttons', () => {
    const { errors } = normalizeContent({
      messages: [{
        images: ['https://example.com/banner.png'],
        embeds: [{ description: 'x', image: 'javascript:alert(1)' }],
        rows: [[{ kind: 'action', action: 'role:admin' }]],
      }],
    }, { actionKeys: new Set(['apply_guild']) });
    expect(errors.join('\n')).toMatch(/must be uploaded/);
    expect(errors.join('\n')).toMatch(/must start with https/);
    expect(errors.join('\n')).toMatch(/"role:admin" is not a bot action/);
  });

  it('allows the generated block on one message only', () => {
    const msg = { embeds: [{ description: 'x' }], dynamic: 'shell_exchange_panels' };
    expect(normalizeContent({ messages: [msg] }).errors).toEqual([]);
    expect(normalizeContent({ messages: [msg, msg] }).errors).toContain('Only one message can carry the generated images.');
  });

  it('rejects empty panels and messages', () => {
    expect(normalizeContent({ messages: [] }).errors).toHaveLength(1);
    expect(normalizeContent({ messages: [{ content: '  ' }] }).errors[0]).toMatch(/empty/);
  });
});

describe('helpers', () => {
  it('parses Discord message links', () => {
    expect(parseMessageLink('https://discord.com/channels/729147655875199017/1369134566295732335/1549069144572436581'))
      .toEqual({ guildId: '729147655875199017', channelId: '1369134566295732335', messageId: '1549069144572436581' });
    expect(parseMessageLink('https://canary.discord.com/channels/1/2/3')).toBeNull();
    expect(parseMessageLink('https://evil.com/channels/729147655875199017/1369134566295732335/1549069144572436581')).toBeNull();
  });

  it('routes assets through the exec API and refuses non-https', () => {
    expect(imageSrc(ASSET)).toBe('/api/exec/bot-panels/assets?name=0123456789abcdef.png');
    expect(imageSrc('https://x.y/a.png')).toBe('https://x.y/a.png');
    expect(imageSrc('http://x.y/a.png')).toBeNull();
    expect(imageSrc('asset://../../etc/passwd')).toBeNull();
  });


  it('renders a labelled text form for diffs', () => {
    const text = contentToText({
      messages: [{ embeds: [{ title: 'Rules', description: 'one\ntwo', color: 0x94c1ff }], rows: [[{ kind: 'action', action: 'apply_guild' }]] }],
    }, k => (k === 'apply_guild' ? 'Guild Member Application' : k));
    expect(text.split('\n')).toEqual([
      '── Message 1 ──',
      'Message 1 › Embed 1 › Colour: #94c1ff',
      'Message 1 › Embed 1 › Title: Rules',
      'Message 1 › Embed 1 › Description: one',
      'Message 1 › Embed 1 › Description · two',
      'Message 1 › Row 1 button 1: Guild Member Application',
    ]);
  });
});

describe('readable mentions', () => {
  const reg = {
    roles: [{ id: '1', name: 'Narwhal', color: 0 }, { id: '2', name: '☆✪☆ Hydra - Leader', color: 0 }, { id: '3', name: 'Twin', color: 0 }, { id: '4', name: 'Twin', color: 0 }],
    channels: [{ id: '10', name: 'taq-roles', type: 'text', category: null, postable: true }],
    emojis: [{ id: '20', name: 'shells', animated: false }, { id: '21', name: 'spin', animated: true }],
  };

  it('shows names and stores codes, both ways', () => {
    const stored = 'Hi <@&1> and <@&2> in <#10> <:shells:20> <a:spin:21>';
    const shown = 'Hi @[Narwhal] and @[☆✪☆ Hydra - Leader] in #[taq-roles] :shells: :spin:';
    expect(toReadable(stored, reg)).toBe(shown);
    expect(fromReadable(shown, reg)).toBe(stored);
  });

  it('matches names case-insensitively when that is unambiguous', () => {
    expect(fromReadable('@[narwhal]', reg)).toBe('<@&1>');
  });

  it('keeps codes it cannot name back uniquely, and leaves unknown text alone', () => {
    expect(toReadable('<@&3> <@&99> <:other:77>', reg)).toBe('<@&3> <@&99> <:other:77>');
    expect(fromReadable('@[Twin] @[Nobody] 10:30: :nope:', reg)).toBe('@[Twin] @[Nobody] 10:30: :nope:');
  });

  it('does not touch emoji codes that are already stored', () => {
    expect(fromReadable('<:shells:20> <a:spin:21>', reg)).toBe('<:shells:20> <a:spin:21>');
  });

  it('fails validation on names that did not resolve', () => {
    const { errors } = normalizeContent({ messages: [{ embeds: [{ description: 'Ask @[Nobody] in #[nowhere]' }] }] });
    expect(errors).toEqual([
      "Message 1, embed 1: @[Nobody] doesn't match exactly one role in the server.",
      "Message 1, embed 1: #[nowhere] doesn't match exactly one channel in the server.",
    ]);
  });
});

describe('single-box layout', () => {
  it('keeps layout, colour and text, with the larger text limit', () => {
    const { content, errors } = normalizeContent({ messages: [{ layout: 'box', color: 0x94c1ff, content: 'x'.repeat(3000), dynamic: 'shell_exchange_panels' }] });
    expect(errors).toEqual([]);
    expect(content?.messages[0]).toMatchObject({ layout: 'box', color: 0x94c1ff, dynamic: 'shell_exchange_panels' });
  });

  it('enforces Discord limits for boxes', () => {
    expect(normalizeContent({ messages: [{ layout: 'box', content: 'x'.repeat(4001) }] }).errors)
      .toEqual(['Message 1: text is 4001 characters (Discord allows 4000).']);
    expect(normalizeContent({ messages: [{ layout: 'box', content: 'x', embeds: [{ description: 'y' }] }] }).errors)
      .toContain("Message 1: a single-box message can't also have embeds.");
  });

  it('shows up in the history text', () => {
    expect(contentToText({ messages: [{ layout: 'box', color: 0x123456, content: 'Hi' }] }))
      .toContain('Message 1 › Layout: single box\nMessage 1 › Colour: #123456\nMessage 1 › Text: Hi');
  });
});
