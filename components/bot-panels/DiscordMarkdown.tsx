"use client";

/**
 * Discord-flavoured markdown → React, for the bot panel preview. Covers what
 * panels use: headings, -# subtext, quotes, lists, code, bold / italic /
 * underline / strike / spoiler, masked links, mentions, custom emoji and
 * <t:…> timestamps. Builds elements directly (no innerHTML), so pasted text
 * can never inject markup.
 */

import { Fragment, ReactNode, useState } from 'react';
import type { PanelRegistry } from '@/lib/bot-panels';

export interface MarkdownContext {
  registry: PanelRegistry | null;
  /** Embed descriptions allow headings and lists; so does message content */
  blocks?: boolean;
}

const LINK = '#00a8fc';

function Spoiler({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      onClick={() => setOpen(true)}
      style={{
        background: open ? 'rgba(255,255,255,0.1)' : '#1e1f22', color: open ? undefined : 'transparent',
        borderRadius: 3, cursor: open ? 'auto' : 'pointer', padding: '0 2px',
      }}
    >{children}</span>
  );
}

function Mention({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <span style={{
      background: color ? `${color}26` : 'rgba(88,101,242,0.3)', color: color ?? '#c9cdfb',
      borderRadius: 3, padding: '0 2px', fontWeight: 500,
    }}>{children}</span>
  );
}

function formatTimestamp(seconds: number, style: string): string {
  const d = new Date(seconds * 1000);
  if (isNaN(d.getTime())) return '<invalid time>';
  if (style === 'R') {
    const diff = (d.getTime() - Date.now()) / 1000;
    const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    const units: [Intl.RelativeTimeFormatUnit, number][] = [['year', 31536000], ['month', 2592000], ['day', 86400], ['hour', 3600], ['minute', 60]];
    for (const [unit, s] of units) if (Math.abs(diff) >= s) return rtf.format(Math.round(diff / s), unit);
    return rtf.format(Math.round(diff), 'second');
  }
  const opts: Record<string, Intl.DateTimeFormatOptions> = {
    t: { timeStyle: 'short' }, T: { timeStyle: 'medium' }, d: { dateStyle: 'short' }, D: { dateStyle: 'long' },
    f: { dateStyle: 'long', timeStyle: 'short' }, F: { dateStyle: 'full', timeStyle: 'short' },
  };
  return d.toLocaleString('en-GB', opts[style] ?? opts.f);
}

type Rule = { re: RegExp; render: (m: RegExpExecArray, ctx: MarkdownContext, key: number) => ReactNode };

const RULES: Rule[] = [
  { re: /^\\([^0-9A-Za-z\s])/, render: m => m[1] },
  {
    re: /^(`+)([\s\S]*?[^`])\1(?!`)/, render: (m, _c, k) => (
      <code key={k} style={{ background: '#2b2d31', border: '1px solid #1e1f22', borderRadius: 4, padding: '0 3px', fontSize: '0.85em', fontFamily: 'Consolas, monospace' }}>{m[2]}</code>
    ),
  },
  {
    re: /^<#(\d+)>/, render: (m, c, k) => {
      const ch = c.registry?.channels.find(x => x.id === m[1]);
      return <Mention key={k}>#{ch?.name ?? 'unknown-channel'}</Mention>;
    },
  },
  {
    re: /^<@&(\d+)>/, render: (m, c, k) => {
      const role = c.registry?.roles.find(x => x.id === m[1]);
      const color = role?.color ? `#${role.color.toString(16).padStart(6, '0')}` : undefined;
      return <Mention key={k} color={color}>@{role?.name ?? 'unknown-role'}</Mention>;
    },
  },
  { re: /^<@!?(\d+)>/, render: (_m, _c, k) => <Mention key={k}>@user</Mention> },
  {
    re: /^<(a?):(\w{2,32}):(\d{15,22})>/, render: (m, _c, k) => (
      // eslint-disable-next-line @next/next/no-img-element
      <img key={k} alt={`:${m[2]}:`} title={`:${m[2]}:`} src={`https://cdn.discordapp.com/emojis/${m[3]}.${m[1] ? 'gif' : 'webp'}?size=48`}
        style={{ width: '1.375em', height: '1.375em', verticalAlign: 'bottom', objectFit: 'contain' }} />
    ),
  },
  {
    re: /^<t:(-?\d{1,13})(?::([tTdDfFR]))?>/, render: (m, _c, k) => (
      <span key={k} style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 3, padding: '0 2px' }}>{formatTimestamp(Number(m[1]), m[2] ?? 'f')}</span>
    ),
  },
  {
    re: /^\[([^\[\]\n]+)\]\(<?(https?:\/\/[^\s)>]+)>?\)/, render: (m, c, k) => (
      <a key={k} href={m[2]} target="_blank" rel="noopener noreferrer" style={{ color: LINK }}>{inline(m[1], c)}</a>
    ),
  },
  {
    re: /^<?(https?:\/\/[^\s<]+[^<.,:;"')\]\s])>?/, render: (m, _c, k) => (
      <a key={k} href={m[1]} target="_blank" rel="noopener noreferrer" style={{ color: LINK, wordBreak: 'break-all' }}>{m[1]}</a>
    ),
  },
  { re: /^\*\*([\s\S]+?)\*\*(?!\*)/, render: (m, c, k) => <strong key={k}>{inline(m[1], c)}</strong> },
  { re: /^__([\s\S]+?)__(?!_)/, render: (m, c, k) => <u key={k}>{inline(m[1], c)}</u> },
  { re: /^\*(?=\S)([\s\S]*?\S)\*(?!\*)/, render: (m, c, k) => <em key={k}>{inline(m[1], c)}</em> },
  { re: /^_([\s\S]+?)_(?![_A-Za-z0-9])/, render: (m, c, k) => <em key={k}>{inline(m[1], c)}</em> },
  { re: /^~~([\s\S]+?)~~/, render: (m, c, k) => <s key={k}>{inline(m[1], c)}</s> },
  { re: /^\|\|([\s\S]+?)\|\|/, render: (m, c, k) => <Spoiler key={k}>{inline(m[1], c)}</Spoiler> },
];

const PLAIN = /^[\s\S]+?(?=[\\`<\[*_~|h]|$)/;

export function inline(text: string, ctx: MarkdownContext): ReactNode[] {
  const out: ReactNode[] = [];
  let rest = text;
  let key = 0;
  let buffer = '';
  const flush = () => { if (buffer) { out.push(buffer); buffer = ''; } };
  while (rest) {
    let matched = false;
    for (const rule of RULES) {
      const m = rule.re.exec(rest);
      if (m) {
        flush();
        out.push(rule.render(m, ctx, key++));
        rest = rest.slice(m[0].length);
        matched = true;
        break;
      }
    }
    if (matched) continue;
    const plain = PLAIN.exec(rest);
    const take = plain && plain[0].length ? plain[0].length : 1;
    buffer += rest.slice(0, take);
    rest = rest.slice(take);
  }
  flush();
  return out;
}

/** Block level: code fences, headings, subtext, quotes and list items. */
export default function DiscordMarkdown({ text, ctx }: { text: string; ctx: MarkdownContext }) {
  const nodes: ReactNode[] = [];
  const lines = text.split('\n');
  let i = 0;
  let key = 0;
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const joined = paragraph.join('\n');
    nodes.push(<div key={key++} style={{ whiteSpace: 'pre-wrap' }}>{inline(joined, ctx)}</div>);
    paragraph = [];
  };

  while (i < lines.length) {
    const line = lines[i];

    const fence = /^```(\w*)\s*$/.exec(line) ?? (line.startsWith('```') ? [line, ''] : null);
    if (fence) {
      const body: string[] = [];
      const first = line.slice(3 + (fence[1]?.length ?? 0));
      const sameLineClose = first.endsWith('```') && first.length >= 3;
      if (sameLineClose) {
        body.push(first.slice(0, -3));
      } else {
        if (first.trim()) body.push(first);
        i++;
        while (i < lines.length && !lines[i].includes('```')) body.push(lines[i++]);
        if (i < lines.length) {
          const tail = lines[i].slice(0, lines[i].indexOf('```'));
          if (tail) body.push(tail);
        }
      }
      flushParagraph();
      nodes.push(
        <pre key={key++} style={{ background: '#2b2d31', border: '1px solid #1e1f22', borderRadius: 4, padding: '0.5em', margin: '0.25em 0', whiteSpace: 'pre-wrap', fontSize: '0.85em', fontFamily: 'Consolas, monospace' }}>{body.join('\n')}</pre>
      );
      i++;
      continue;
    }

    if (line.startsWith('>>> ')) {
      flushParagraph();
      const body = [line.slice(4), ...lines.slice(i + 1)].join('\n');
      nodes.push(<Quote key={key++}><DiscordMarkdown text={body} ctx={ctx} /></Quote>);
      break;
    }
    if (/^> /.test(line) || line === '>') {
      flushParagraph();
      const body: string[] = [];
      while (i < lines.length && (/^> /.test(lines[i]) || lines[i] === '>')) body.push(lines[i++].slice(2));
      nodes.push(<Quote key={key++}><DiscordMarkdown text={body.join('\n')} ctx={ctx} /></Quote>);
      continue;
    }

    if (ctx.blocks !== false) {
      const heading = /^(#{1,3}) (.+)$/.exec(line);
      if (heading) {
        flushParagraph();
        const size = ['1.5em', '1.25em', '1em'][heading[1].length - 1];
        nodes.push(<div key={key++} style={{ fontSize: size, fontWeight: 700, margin: '0.5em 0 0.25em', lineHeight: 1.3 }}>{inline(heading[2], ctx)}</div>);
        i++;
        continue;
      }
      const subtext = /^-# (.+)$/.exec(line);
      if (subtext) {
        flushParagraph();
        nodes.push(<div key={key++} style={{ fontSize: '0.8em', color: '#949ba4' }}>{inline(subtext[1], ctx)}</div>);
        i++;
        continue;
      }
      const item = /^(\s*)[-*] (.+)$/.exec(line);
      if (item) {
        flushParagraph();
        const depth = Math.min(Math.floor(item[1].length / 2), 3);
        nodes.push(
          <div key={key++} style={{ display: 'flex', gap: '0.5em', paddingLeft: `${0.5 + depth * 1.25}em` }}>
            <span>{depth % 2 ? '◦' : '•'}</span><span style={{ whiteSpace: 'pre-wrap' }}>{inline(item[2], ctx)}</span>
          </div>
        );
        i++;
        continue;
      }
    }

    paragraph.push(line);
    i++;
  }
  flushParagraph();
  return <Fragment>{nodes}</Fragment>;
}

function Quote({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: '0.5em', margin: '0.1em 0' }}>
      <div style={{ width: 4, borderRadius: 4, background: '#4e5058', flexShrink: 0 }} />
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}
