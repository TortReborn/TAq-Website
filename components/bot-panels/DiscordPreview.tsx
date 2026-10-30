"use client";

/** Discord-style rendering of a bot panel, close enough to judge layout. */

import { ReactNode, useMemo } from 'react';
import DiscordMarkdown, { inline } from './DiscordMarkdown';
import { usePanelValues } from './values';
import { fillValues } from '@/lib/panel-values';
import {
  DYNAMIC_SHELL_EXCHANGE, LAYOUT_BOX, imageSrc,
  type PanelButton, type PanelContent, type PanelEmbed, type PanelMessage, type PanelRegistry,
} from '@/lib/bot-panels';

const BG = '#313338';
const EMBED_BG = '#2b2d31';
const TEXT = '#dbdee1';
const MUTED = '#949ba4';

const BUTTON_COLORS: Record<string, string> = {
  primary: '#5865f2', secondary: '#4e5058', success: '#248046', danger: '#da373c', link: '#4e5058',
};

function hex(color: number | null | undefined): string {
  return color == null ? '#1e1f22' : `#${color.toString(16).padStart(6, '0')}`;
}

function Img({ url, style }: { url?: string | null; style: React.CSSProperties }) {
  const src = imageSrc(url);
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" style={style} />;
}

function Emoji({ raw }: { raw?: string | null }) {
  if (!raw) return null;
  const custom = /^<(a?):(\w+):(\d+)>$/.exec(raw);
  if (custom) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt={custom[2]} src={`https://cdn.discordapp.com/emojis/${custom[3]}.${custom[1] ? 'gif' : 'webp'}?size=48`} style={{ width: 18, height: 18, objectFit: 'contain' }} />;
  }
  return <span style={{ fontSize: 16, lineHeight: 1 }}>{raw}</span>;
}

function Embed({ embed, registry }: { embed: PanelEmbed; registry: PanelRegistry | null }) {
  const ctx = { registry };
  const fields = embed.fields ?? [];
  // Inline fields sit up to three per row; a non-inline field breaks the row
  const rows: (typeof fields)[] = [];
  for (const f of fields) {
    const last = rows[rows.length - 1];
    if (f.inline && last && last.length < 3 && last.every(x => x.inline)) last.push(f);
    else rows.push([f]);
  }

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.5rem 1rem', maxWidth: 520,
      background: EMBED_BG, borderLeft: `4px solid ${hex(embed.color)}`, borderRadius: 4,
      padding: '0.5rem 1rem 1rem 0.75rem', marginTop: '0.25rem',
    }}>
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {embed.author?.name && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', fontWeight: 600, marginTop: '0.5rem' }}>
            <Img url={embed.author.icon_url} style={{ width: 24, height: 24, borderRadius: '50%' }} />
            <span>{(embed.author.name ?? '')}</span>
          </div>
        )}
        {embed.title && (
          <div style={{ fontWeight: 600, fontSize: '1rem', marginTop: '0.5rem', color: embed.url ? '#00a8fc' : '#f2f3f5' }}>
            {inline((embed.title ?? ''), { registry, blocks: false })}
          </div>
        )}
        {embed.description && (
          <div style={{ fontSize: '0.875rem', lineHeight: 1.375, marginTop: embed.title || embed.author?.name ? 0 : '0.5rem' }}>
            <DiscordMarkdown text={(embed.description ?? '')} ctx={ctx} />
          </div>
        )}
        {rows.map((row, ri) => (
          <div key={ri} style={{ display: 'grid', gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))`, gap: '0.5rem' }}>
            {row.map((f, fi) => (
              <div key={fi} style={{ minWidth: 0, fontSize: '0.875rem', lineHeight: 1.375 }}>
                <div style={{ fontWeight: 600, marginBottom: 2 }}>{inline((f.name ?? ''), { registry, blocks: false })}</div>
                <DiscordMarkdown text={(f.value ?? '')} ctx={ctx} />
              </div>
            ))}
          </div>
        ))}
        <Img url={embed.image} style={{ maxWidth: '100%', borderRadius: 4, marginTop: '0.25rem' }} />
        {embed.footer?.text && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: MUTED }}>
            <Img url={embed.footer.icon_url} style={{ width: 20, height: 20, borderRadius: '50%' }} />
            <span>{(embed.footer.text ?? '')}</span>
          </div>
        )}
      </div>
      {embed.thumbnail && (
        <Img url={embed.thumbnail} style={{ width: 80, maxHeight: 80, objectFit: 'contain', borderRadius: 4, marginTop: '0.5rem' }} />
      )}
    </div>
  );
}

function Button({ button, registry }: { button: PanelButton; registry: PanelRegistry | null }) {
  const action = button.kind === 'action' ? registry?.actions.find(a => a.key === button.action) : undefined;
  const style = button.kind === 'link' ? 'link' : (button.style ?? action?.style ?? 'secondary');
  const label = (button.label ?? '') || (button.kind === 'action' ? action?.label ?? button.action : '');
  const emoji = button.emoji || (button.kind === 'action' ? action?.emoji : null);
  return (
    <span
      title={button.kind === 'link' ? button.url : `Bot button: ${action?.label ?? button.action}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 16px', borderRadius: 8,
        background: BUTTON_COLORS[style], color: '#fff', fontSize: '0.875rem', fontWeight: 500,
      }}
    >
      <Emoji raw={emoji} />
      {label && <span>{label}</span>}
      {button.kind === 'link' && <span style={{ opacity: 0.8, fontSize: 12 }}>↗</span>}
    </span>
  );
}

export default function DiscordPreview({ content, registry, botName = 'Tort', highlight }: {
  content: PanelContent;
  registry: PanelRegistry | null;
  botName?: string;
  /** Message index the editor is focused on */
  highlight?: number;
}) {
  const ctx = { registry };
  // Show {{values}} the way the bot will post them.
  const values = usePanelValues();
  const shown = useMemo(() => fillValues(content, values), [content, values]);

  return (
    <div style={{ background: BG, color: TEXT, borderRadius: 8, padding: '1rem 0', fontFamily: '"gg sans", "Noto Sans", Helvetica, Arial, sans-serif' }}>
      {shown.messages.map((m, mi) => (
        <div key={mi} style={{
          display: 'flex', gap: '1rem', padding: '0.125rem 1rem',
          background: highlight === mi ? 'rgba(88,101,242,0.08)' : undefined,
          marginTop: mi === 0 ? 0 : '0.5rem',
        }}>
          <div style={{ width: 40, flexShrink: 0 }}>
            {mi === 0 && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src="/images/home/tort-reborn-avatar.webp" alt="" style={{ width: 40, height: 40, borderRadius: '50%', background: '#1e1f22' }} />
            )}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            {mi === 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: 2 }}>
                <span style={{ fontWeight: 500, color: '#f2f3f5' }}>{botName}</span>
                <span style={{ background: '#5865f2', color: '#fff', fontSize: '0.625rem', fontWeight: 600, padding: '1px 4px', borderRadius: 3 }}>APP</span>
                <span style={{ fontSize: '0.75rem', color: MUTED }}>Today</span>
              </div>
            )}
            {m.layout === LAYOUT_BOX ? <Box message={m} ctx={ctx} /> : (
              <>
                {m.content && (
                  <div style={{ fontSize: '0.9375rem', lineHeight: 1.375 }}>
                    <DiscordMarkdown text={(m.content ?? '')} ctx={ctx} />
                  </div>
                )}
                {(m.images ?? []).map((url, i) => (
                  <Img key={i} url={url} style={{ display: 'block', maxWidth: 520, width: '100%', borderRadius: 8, marginTop: '0.25rem' }} />
                ))}
                {(m.embeds ?? []).map((e, ei) => <Embed key={ei} embed={e} registry={registry} />)}
                {m.dynamic === DYNAMIC_SHELL_EXCHANGE && <GeneratedBlock color={m.embeds?.[m.embeds.length - 1]?.color} />}
              </>
            )}
            {(m.rows ?? []).map((row, ri) => (
              <div key={ri} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                {row.map((b, bi) => <Button key={bi} button={b} registry={registry} />)}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** A single-box (Components V2) message: one container with an accent edge holding
 * the text, then each image at full width. Buttons sit below it, as in Discord. */
function Box({ message, ctx }: { message: PanelMessage; ctx: { registry: PanelRegistry | null } }): ReactNode {
  return (
    <div style={{
      maxWidth: 520, background: EMBED_BG, border: '1px solid #3f4147', borderLeft: `4px solid ${hex(message.color)}`,
      borderRadius: 8, padding: '0.75rem 1rem', marginTop: '0.25rem', display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      {message.content && (
        <div style={{ fontSize: '0.9375rem', lineHeight: 1.375 }}>
          <DiscordMarkdown text={message.content} ctx={ctx} />
        </div>
      )}
      {(message.images ?? []).map((url, i) => (
        <Img key={i} url={url} style={{ display: 'block', width: '100%', borderRadius: 6 }} />
      ))}
      {message.dynamic === DYNAMIC_SHELL_EXCHANGE && <GeneratedBlock color={message.color} inBox />}
    </div>
  );
}

function GeneratedBlock({ color, inBox }: { color?: number | null; inBox?: boolean }): ReactNode {
  return (
    <div style={{
      maxWidth: 520, background: inBox ? 'rgba(0,0,0,0.15)' : EMBED_BG, borderLeft: inBox ? undefined : `4px solid ${hex(color)}`,
      borderRadius: inBox ? 6 : 4, padding: '1.5rem 1rem', marginTop: inBox ? 0 : '0.25rem', color: MUTED, fontSize: '0.8125rem', textAlign: 'center',
      backgroundImage: 'repeating-linear-gradient(45deg, transparent 0 10px, rgba(255,255,255,0.02) 10px 20px)',
    }}>
      Ingredient and material rate images<br />
      <span style={{ fontSize: '0.75rem' }}>Drawn by the bot from the Shell Exchange rates when this panel publishes</span>
    </div>
  );
}
