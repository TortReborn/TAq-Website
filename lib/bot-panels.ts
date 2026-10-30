/**
 * Bot panels: persistent Discord messages (guild info, role info, FAQ, shell
 * exchange, ...) edited at /exec/bot-panels and published by the bot
 * (Tort-Reborn Tasks/publish_bot_panels.py). Client-safe: types, Discord's
 * limits, the normalizer the API gates writes with, and the text form the
 * history diff compares.
 *
 * Keep the content shape and limits in sync with Tort-Reborn
 * Helpers/bot_panels.py, which re-validates everything before sending.
 */

import { contentValueKeys, isPanelValue, valuesFromReadable, valuesToReadable } from '@/lib/panel-values';

export const ASSET_SCHEME = 'asset://';
export const ASSET_NAME_RE = /^[0-9a-f]{16}\.(png|jpg|jpeg|gif|webp)$/;
export const DYNAMIC_SHELL_EXCHANGE = 'shell_exchange_panels';
export const DEFAULT_EMBED_COLOR = 0x94c1ff;

export const LIMITS = {
  messages: 10,
  content: 2000,
  embeds: 10,
  embedTotal: 6000,
  title: 256,
  description: 4096,
  fields: 25,
  fieldName: 256,
  fieldValue: 1024,
  footer: 2048,
  author: 256,
  rows: 5,
  buttonsPerRow: 5,
  buttonLabel: 80,
  images: 10,
  note: 200,
  /** All text in a single-box (Components V2) message */
  boxText: 4000,
} as const;

/** message.layout: one Components V2 box (text, full-width images, buttons) instead of embeds. */
export const LAYOUT_BOX = 'box';

export type ButtonStyle = 'primary' | 'secondary' | 'success' | 'danger';
export const BUTTON_STYLES: ButtonStyle[] = ['primary', 'secondary', 'success', 'danger'];

export interface PanelField { name: string; value: string; inline?: boolean }

export interface PanelEmbed {
  title?: string;
  url?: string;
  description?: string;
  color?: number | null;
  author?: { name?: string; url?: string; icon_url?: string };
  thumbnail?: string;
  image?: string;
  footer?: { text?: string; icon_url?: string };
  fields?: PanelField[];
}

export type PanelButton =
  | { kind: 'link'; label?: string; url: string; emoji?: string }
  | { kind: 'action'; action: string; label?: string; emoji?: string; style?: ButtonStyle };

export interface PanelMessage {
  /** 'box': one Components V2 container; `content` is its text, `color` its accent */
  layout?: typeof LAYOUT_BOX;
  color?: number | null;
  content?: string;
  images?: string[];
  embeds?: PanelEmbed[];
  rows?: PanelButton[][];
  dynamic?: string | null;
}

export interface PanelContent { messages: PanelMessage[] }

export type RevisionStatus = 'pending' | 'publishing' | 'published' | 'failed' | 'superseded';

export interface PanelSummary {
  slug: string;
  name: string;
  channel_id: string | null;
  message_ids: string[];
  published_rev: number | null;
  updated_at: string;
  latest_rev: number | null;
  latest_status: RevisionStatus | null;
  latest_author: string | null;
  latest_at: string | null;
}

export interface RevisionMeta {
  rev_number: number;
  channel_id: string | null;
  note: string;
  restored_from: number | null;
  author_name: string | null;
  status: RevisionStatus;
  error: string | null;
  created_at: string;
  published_at: string | null;
  adopted: boolean;
}

/** What the bot publishes to cache_entries 'botPanelRegistry'. */
export interface PanelRegistry {
  actions: { key: string; label: string; group: string; emoji: string | null; style: ButtonStyle }[];
  dynamic: { key: string; label: string }[];
  default_color: number;
  guild: { id: string; name: string } | null;
  channels: { id: string; name: string; type: string; category: string | null; postable: boolean }[];
  roles: { id: string; name: string; color: number }[];
  emojis: { id: string; name: string; animated: boolean; server?: string | null }[]; // server: set when not the main one
  updated_at: string;
}

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/;

// A slug becomes /api/exec/bot-panels/<slug>; these are routes of their own there.
const RESERVED_SLUGS = new Set(['assets', 'registry']);

/** A panel's slug (page address, API path), derived from its name once at creation:
 *  accents dropped, lowercase, every run of other characters one dash. Always
 *  matches SLUG_RE; `n` > 1 gives the n-th free variant (name-2, name-3, ...). */
export function slugFromName(name: string, n = 1): string {
  let base = name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (base.length < 3) base = base ? `${base}-panel` : 'panel';
  if (RESERVED_SLUGS.has(base)) base = `${base}-panel`;
  const suffix = n > 1 ? `-${n}` : '';
  return base.slice(0, 48 - suffix.length).replace(/-+$/, '') + suffix;
}

export function assetName(url: string | undefined | null): string | null {
  if (!url || !url.startsWith(ASSET_SCHEME)) return null;
  const name = url.slice(ASSET_SCHEME.length);
  return ASSET_NAME_RE.test(name) ? name : null;
}

/** Browser-visible URL for an image field (assets go through the exec API). */
export function imageSrc(url: string | undefined | null): string | null {
  if (!url) return null;
  const name = assetName(url);
  if (name) return `/api/exec/bot-panels/assets?name=${name}`;
  return url.startsWith('https://') ? url : null;
}

const DISCORD_MESSAGE_LINK_RE =
  /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/channels\/(\d{15,22})\/(\d{15,22})\/(\d{15,22})\/?$/;

export function parseMessageLink(link: string): { guildId: string; channelId: string; messageId: string } | null {
  const m = DISCORD_MESSAGE_LINK_RE.exec(link.trim());
  return m ? { guildId: m[1], channelId: m[2], messageId: m[3] } : null;
}

// ---------------------------------------------------------------------------
// Normalizer — rebuilds content from known fields only, trimmed, with every
// Discord limit checked. Errors name the spot the way the editor labels it.
// ---------------------------------------------------------------------------

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const optional = (v: unknown): string | undefined => {
  const s = str(v).trim();
  return s ? s : undefined;
};

export function embedLength(e: PanelEmbed): number {
  return (e.title?.length ?? 0) + (e.description?.length ?? 0) + (e.footer?.text?.length ?? 0) +
    (e.author?.name?.length ?? 0) +
    (e.fields ?? []).reduce((n, f) => n + f.name.length + f.value.length, 0);
}

interface NormalizeOptions {
  /** Action keys the bot accepts; skipped when the registry hasn't synced yet */
  actionKeys?: Set<string>;
}

export function normalizeContent(raw: unknown, opts: NormalizeOptions = {}): { content?: PanelContent; errors: string[] } {
  const errors: string[] = [];
  const messagesRaw = (raw as any)?.messages;
  if (!Array.isArray(messagesRaw) || messagesRaw.length === 0) return { errors: ['The panel needs at least one message.'] };
  if (messagesRaw.length > LIMITS.messages) return { errors: [`At most ${LIMITS.messages} messages per panel.`] };

  const tooLong = (where: string, what: string, value: string | undefined, limit: number) => {
    if (value && value.length > limit) errors.push(`${where}: ${what} is ${value.length} characters (Discord allows ${limit}).`);
  };
  const image = (where: string, v: unknown): string | undefined => {
    const s = optional(v);
    if (!s) return undefined;
    if (s.startsWith(ASSET_SCHEME)) {
      if (!assetName(s)) errors.push(`${where}: not an uploaded image.`);
      return s;
    }
    if (!s.startsWith('https://')) errors.push(`${where}: image links must start with https://.`);
    return s;
  };
  const mentions = (where: string, value: string | undefined) => {
    for (const m of unresolvedMentions(value)) {
      errors.push(`${where}: ${m} doesn't match exactly one ${m[0] === '@' ? 'role' : 'channel'} in the server.`);
    }
  };
  const link = (where: string, v: unknown): string | undefined => {
    const s = optional(v);
    if (s && !/^https?:\/\//.test(s)) errors.push(`${where}: links must start with http:// or https://.`);
    return s;
  };

  const messages: PanelMessage[] = messagesRaw.map((m: any, mi: number) => {
    const where = `Message ${mi + 1}`;
    const out: PanelMessage = {};
    const box = m?.layout === LAYOUT_BOX;
    if (box) {
      out.layout = LAYOUT_BOX;
      const color = m?.color;
      out.color = Number.isInteger(color) && color >= 0 && color <= 0xffffff ? color : null;
      if (Array.isArray(m?.embeds) && m.embeds.length) errors.push(`${where}: a single-box message can't also have embeds.`);
    }

    const content = optional(m?.content);
    tooLong(where, box ? 'text' : 'content', content, box ? LIMITS.boxText : LIMITS.content);
    mentions(where, content);
    if (content) out.content = content;

    const images = (Array.isArray(m?.images) ? m.images : []).map((u: unknown, i: number) => {
      const s = str(u).trim();
      if (!assetName(s)) errors.push(`${where}, image ${i + 1}: message images must be uploaded.`);
      return s;
    }).filter(Boolean);
    if (images.length > LIMITS.images) errors.push(`${where}: at most ${LIMITS.images} images.`);
    if (images.length) out.images = images;

    const embedsRaw: any[] = Array.isArray(m?.embeds) ? m.embeds : [];
    const embeds: PanelEmbed[] = embedsRaw.map((e: any, ei: number) => {
      const at = `${where}, embed ${ei + 1}`;
      const embed: PanelEmbed = {};
      embed.title = optional(e?.title); tooLong(at, 'title', embed.title, LIMITS.title);
      embed.url = embed.title ? link(`${at} title link`, e?.url) : undefined;
      embed.description = optional(e?.description); tooLong(at, 'description', embed.description, LIMITS.description);
      mentions(at, embed.description);
      const color = e?.color;
      embed.color = Number.isInteger(color) && color >= 0 && color <= 0xffffff ? color : null;

      const authorName = optional(e?.author?.name);
      if (authorName) {
        tooLong(at, 'author name', authorName, LIMITS.author);
        embed.author = { name: authorName, url: link(`${at} author link`, e?.author?.url), icon_url: image(`${at} author icon`, e?.author?.icon_url) };
      }
      const footerText = optional(e?.footer?.text);
      if (footerText) {
        tooLong(at, 'footer', footerText, LIMITS.footer);
        embed.footer = { text: footerText, icon_url: image(`${at} footer icon`, e?.footer?.icon_url) };
      }
      embed.thumbnail = image(`${at} thumbnail`, e?.thumbnail);
      embed.image = image(`${at} image`, e?.image);

      const fieldsRaw: any[] = Array.isArray(e?.fields) ? e.fields : [];
      if (fieldsRaw.length > LIMITS.fields) errors.push(`${at}: at most ${LIMITS.fields} fields.`);
      const fields = fieldsRaw.map((f: any, fi: number) => {
        const name = str(f?.name).trim();
        const value = str(f?.value).trim();
        if (!name || !value) errors.push(`${at}, field ${fi + 1}: a field needs both a name and a value.`);
        tooLong(`${at}, field ${fi + 1}`, 'name', name, LIMITS.fieldName);
        tooLong(`${at}, field ${fi + 1}`, 'value', value, LIMITS.fieldValue);
        mentions(`${at}, field ${fi + 1}`, value);
        return { name, value, inline: !!f?.inline };
      });
      if (fields.length) embed.fields = fields;

      if (!(embed.title || embed.description || embed.fields || embed.image || embed.thumbnail || embed.author || embed.footer)) {
        errors.push(`${at}: the embed is empty.`);
      }
      return JSON.parse(JSON.stringify(embed)); // drop undefined keys
    });
    if (embeds.length > LIMITS.embeds) errors.push(`${where}: at most ${LIMITS.embeds} embeds.`);
    const total = embeds.reduce((n, e) => n + embedLength(e), 0);
    if (total > LIMITS.embedTotal) errors.push(`${where}: the embeds hold ${total} characters in all (Discord allows ${LIMITS.embedTotal}).`);
    if (embeds.length) out.embeds = embeds;

    const rowsRaw: any[] = Array.isArray(m?.rows) ? m.rows : [];
    if (rowsRaw.length > LIMITS.rows) errors.push(`${where}: at most ${LIMITS.rows} button rows.`);
    const seen = new Set<string>();
    const rows: PanelButton[][] = rowsRaw.map((row: any, ri: number) => {
      const buttons: any[] = Array.isArray(row) ? row : [];
      if (buttons.length > LIMITS.buttonsPerRow) errors.push(`${where}, row ${ri + 1}: at most ${LIMITS.buttonsPerRow} buttons.`);
      return buttons.map((b: any, bi: number): PanelButton => {
        const at = `${where}, row ${ri + 1} button ${bi + 1}`;
        const label = optional(b?.label);
        const emoji = optional(b?.emoji);
        tooLong(at, 'label', label, LIMITS.buttonLabel);
        if (b?.kind === 'link') {
          const url = str(b?.url).trim();
          if (!/^(https?|discord):\/\//.test(url)) errors.push(`${at}: a link button needs an http(s) url.`);
          if (!label && !emoji) errors.push(`${at}: a link button needs a label or an emoji.`);
          return JSON.parse(JSON.stringify({ kind: 'link', label, url, emoji }));
        }
        const action = str(b?.action);
        if (b?.kind !== 'action' || !action) errors.push(`${at}: pick what the button does.`);
        else if (opts.actionKeys && !opts.actionKeys.has(action)) errors.push(`${at}: "${action}" is not a bot action.`);
        if (seen.has(action)) errors.push(`${at}: the same bot button appears twice in one message.`);
        seen.add(action);
        const style = BUTTON_STYLES.includes(b?.style) ? b.style : undefined;
        return JSON.parse(JSON.stringify({ kind: 'action', action, label, emoji, style }));
      });
    }).filter((r: PanelButton[]) => r.length > 0);
    if (rows.length) out.rows = rows;

    if (m?.dynamic) {
      if (m.dynamic !== DYNAMIC_SHELL_EXCHANGE) errors.push(`${where}: unknown generated block.`);
      out.dynamic = m.dynamic;
    }

    if (!out.content && !out.images && !out.embeds && !out.dynamic) errors.push(`${where}: the message is empty.`);
    for (const key of contentValueKeys(out)) {
      if (!isPanelValue(key)) errors.push(`${where}: {{${key}}} isn't a value panels can use.`);
    }
    return out;
  });

  if (messages.filter(m => m.dynamic).length > 1) errors.push('Only one message can carry the generated images.');
  return errors.length ? { errors } : { content: { messages }, errors };
}

// ---------------------------------------------------------------------------
// Text form for the history diff: one labelled line per value, so a diff
// reads "Message 2 › Embed 1 › Description" rather than JSON punctuation.
// ---------------------------------------------------------------------------

export function contentToText(content: PanelContent, actionLabel: (key: string) => string = k => k): string {
  const lines: string[] = [];
  const multi = (label: string, value: string | undefined) => {
    if (!value) return;
    value.split('\n').forEach((l, i) => lines.push(`${label}${i === 0 ? ':' : ' ·'} ${l}`));
  };
  content.messages.forEach((m, mi) => {
    const M = `Message ${mi + 1}`;
    lines.push(`── ${M} ──`);
    if (m.layout === LAYOUT_BOX) {
      lines.push(`${M} › Layout: single box`);
      if (m.color != null) lines.push(`${M} › Colour: #${m.color.toString(16).padStart(6, '0')}`);
    }
    multi(`${M} › ${m.layout === LAYOUT_BOX ? 'Text' : 'Content'}`, m.content);
    (m.images ?? []).forEach((u, i) => lines.push(`${M} › Image ${i + 1}: ${u}`));
    (m.embeds ?? []).forEach((e, ei) => {
      const E = `${M} › Embed ${ei + 1}`;
      if (e.color != null) lines.push(`${E} › Colour: #${e.color.toString(16).padStart(6, '0')}`);
      if (e.author?.name) lines.push(`${E} › Author: ${e.author.name}`);
      if (e.title) lines.push(`${E} › Title: ${e.title}${e.url ? ` (${e.url})` : ''}`);
      multi(`${E} › Description`, e.description);
      (e.fields ?? []).forEach((f, fi) => {
        lines.push(`${E} › Field ${fi + 1} name: ${f.name}${f.inline ? ' (inline)' : ''}`);
        multi(`${E} › Field ${fi + 1} value`, f.value);
      });
      if (e.thumbnail) lines.push(`${E} › Thumbnail: ${e.thumbnail}`);
      if (e.image) lines.push(`${E} › Image: ${e.image}`);
      if (e.footer?.text) lines.push(`${E} › Footer: ${e.footer.text}`);
    });
    (m.rows ?? []).forEach((row, ri) => row.forEach((b, bi) => {
      const B = `${M} › Row ${ri + 1} button ${bi + 1}`;
      lines.push(b.kind === 'link'
        ? `${B}: link "${b.label ?? ''}" ${b.emoji ?? ''} → ${b.url}`
        : `${B}: ${actionLabel(b.action)}${b.label ? ` "${b.label}"` : ''}${b.emoji ? ` ${b.emoji}` : ''}${b.style ? ` [${b.style}]` : ''}`);
    }));
    if (m.dynamic) lines.push(`${M} › Generated: shell exchange rate images`);
  });
  return lines.join('\n');
}


// ---------------------------------------------------------------------------
// Readable mentions. The editor shows @[Role], #[channel] and :emoji: in place
// of Discord's <@&id>, <#id> and <:name:id>; stored content always keeps the
// codes, so renaming a role in Discord never breaks a panel. A name that is
// missing or shared by two roles stays in bracket form and fails validation.
// ---------------------------------------------------------------------------

type Mentionables = Pick<PanelRegistry, 'roles' | 'channels' | 'emojis'>;

function byName<T extends { name: string }>(items: T[], name: string): T | undefined {
  const exact = items.filter(i => i.name === name);
  if (exact.length) return exact.length === 1 ? exact[0] : undefined;
  const loose = items.filter(i => i.name.toLowerCase() === name.toLowerCase());
  return loose.length === 1 ? loose[0] : undefined;
}

/** Only names that read back to the same item can be shown in bracket form. */
function readableName<T extends { id: string; name: string }>(items: T[], id: string): string | null {
  const item = items.find(i => i.id === id);
  if (!item || /[\]\n]/.test(item.name) || byName(items, item.name)?.id !== id) return null;
  return item.name;
}

export function toReadable(text: string, reg: Mentionables | null): string {
  if (!text) return text;
  text = valuesToReadable(text);
  if (!reg) return text;
  return text
    .replace(/<@&(\d+)>/g, (whole, id) => { const n = readableName(reg.roles, id); return n == null ? whole : `@[${n}]`; })
    .replace(/<#(\d+)>/g, (whole, id) => { const n = readableName(reg.channels, id); return n == null ? whole : `#[${n}]`; })
    .replace(/<a?:(\w+):(\d+)>/g, (whole, _name, id) => { const n = readableName(reg.emojis, id); return n == null ? whole : `:${n}:`; });
}

export function fromReadable(text: string, reg: Mentionables | null): string {
  if (!text) return text;
  text = valuesFromReadable(text);
  if (!reg) return text;
  return text
    .replace(/@\[([^\]\n]+)\]/g, (whole, name) => { const r = byName(reg.roles, name); return r ? `<@&${r.id}>` : whole; })
    .replace(/#\[([^\]\n]+)\]/g, (whole, name) => { const c = byName(reg.channels, name); return c ? `<#${c.id}>` : whole; })
    .replace(/(?<![\w<]):(\w{2,32}):(?!\d)/g, (whole, name) => {
      const e = reg.emojis.find(x => x.name === name);
      return e ? `<${e.animated ? 'a' : ''}:${e.name}:${e.id}>` : whole;
    });
}

/** Bracket mentions the editor couldn't match to exactly one role or channel. */
export function unresolvedMentions(text: string | undefined): string[] {
  return [...(text ?? '').matchAll(/([@#])\[([^\]\n]+)\]/g)].map(m => `${m[1]}[${m[2]}]`);
}
