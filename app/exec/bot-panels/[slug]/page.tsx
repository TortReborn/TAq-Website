"use client";

import Link from 'next/link';
import { use, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { fetcher } from '@/hooks/fetcher';
import {
  channelGuild, contentToText, isForum, normalizeContent, parseMessageLink, scopedRegistry, toReadable,
  type PanelContent, type PanelRegistry, type PanelSummary, type RevisionMeta,
} from '@/lib/bot-panels';
import { diffCollapsed } from '@/lib/wiki-diff';
import ChannelPicker from '@/components/bot-panels/ChannelPicker';
import { PanelValuesContext } from '@/components/bot-panels/values';
import DiscordPreview from '@/components/bot-panels/DiscordPreview';
import PanelEditor, { btnStyle, inputStyle, labelStyle, smallBtn } from '@/components/bot-panels/PanelEditor';
import { StatusBadge, channelLabel, timeAgo } from '@/components/bot-panels/status';

interface PanelResponse {
  panel: PanelSummary;
  latest: { rev_number: number; content: PanelContent; channel_id: string | null } | null;
  revisions: RevisionMeta[];
  registry: PanelRegistry | null;
  /** Current panel values, see lib/panel-values.ts */
  values: Record<string, string>;
}

const EMPTY: PanelContent = { messages: [{ embeds: [{ color: 0x94c1ff, description: '' }] }] };

interface Draft {
  content: PanelContent;
  channelId: string;
  baseRev: number | null;
  restoredFrom: number | null;
}

const draftKey = (slug: string) => `bot-panel-draft:${slug}`;

function loadDraft(slug: string): Draft | null {
  try {
    const raw = localStorage.getItem(draftKey(slug));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function saveDraft(slug: string, draft: Draft | null) {
  try {
    if (draft) localStorage.setItem(draftKey(slug), JSON.stringify(draft));
    else localStorage.removeItem(draftKey(slug));
  } catch { /* storage unavailable: drafts just don't survive a reload */ }
}

const banner = (color: string): React.CSSProperties => ({
  padding: '0.65rem 0.8rem', borderRadius: '0.375rem', background: `${color}1a`,
  border: `1px solid ${color}4d`, color, fontSize: '0.83rem',
});

export default function BotPanelEditorPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [polling, setPolling] = useState(false);
  // The registry's updated_at when a refresh was asked for; cleared once it moves
  const [refreshFrom, setRefreshFrom] = useState<string | null>(null);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const { data, error, isLoading, mutate } = useSWR<PanelResponse>(`/api/exec/bot-panels/${slug}`, fetcher, {
    revalidateOnFocus: false, refreshInterval: polling || refreshFrom != null ? 2500 : 30000,
  });

  const [tab, setTab] = useState<'edit' | 'history'>('edit');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [restoredDraft, setRestoredDraft] = useState(false);
  const [adoptOpen, setAdoptOpen] = useState(false);
  const [adoptText, setAdoptText] = useState('');
  const [note, setNote] = useState('');
  const [focus, setFocus] = useState<number | undefined>();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string[] | null>(null);
  const [conflict, setConflict] = useState<{ latest_rev: number; latest_author: string | null } | null>(null);
  // The server picked while no channel is chosen; otherwise the channel's server decides
  const [serverPick, setServerPick] = useState<string | null>(null);
  const initialised = useRef(false);

  const latest = data?.latest ?? null;
  const latestMeta = data?.revisions[0];
  const registry = data?.registry ?? null;

  // First load: start from the latest revision, or from an unsaved draft of it
  useEffect(() => {
    if (!data || initialised.current) return;
    initialised.current = true;
    const base: Draft = {
      content: latest?.content ?? EMPTY,
      channelId: latest?.channel_id ?? data.panel.channel_id ?? '',
      baseRev: latest?.rev_number ?? null,
      restoredFrom: null,
    };
    const saved = loadDraft(slug);
    if (saved && saved.baseRev === base.baseRev && JSON.stringify(saved) !== JSON.stringify(base)) {
      setDraft(saved);
      setRestoredDraft(true);
    } else {
      setDraft(base);
    }
  }, [data, latest, slug]);

  // Stop fast polling once the bot has picked the revision up
  useEffect(() => {
    if (polling && latestMeta && !['pending', 'publishing'].includes(latestMeta.status)) setPolling(false);
  }, [polling, latestMeta]);

  // Stop once the bot has rewritten the registry, or give up after a minute
  const registryAt = registry?.updated_at ?? '';
  useEffect(() => {
    if (refreshFrom == null) return;
    if (registryAt !== refreshFrom) { setRefreshFrom(null); return; }
    const t = setTimeout(() => { setRefreshFrom(null); setRefreshFailed(true); }, 60000);
    return () => clearTimeout(t);
  }, [refreshFrom, registryAt]);

  const dirty = useMemo(() => {
    if (!draft) return false;
    return JSON.stringify(draft.content) !== JSON.stringify(latest?.content ?? EMPTY)
      || draft.channelId !== (latest?.channel_id ?? data?.panel.channel_id ?? '')
      || !!adoptText.trim();
  }, [draft, latest, data, adoptText]);

  useEffect(() => {
    if (draft && initialised.current) saveDraft(slug, dirty ? draft : null);
  }, [draft, dirty, slug]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const adoptLinks = adoptText.split(/\s+/).map(s => s.trim()).filter(Boolean);
  const adoptProblems = adoptLinks.filter(l => !parseMessageLink(l));

  const validation = useMemo(() => {
    if (!draft) return [];
    return normalizeContent(draft.content, {
      actionKeys: registry ? new Set(registry.actions.map(a => a.key)) : undefined,
      forum: isForum(registry, draft.channelId),
    }).errors;
  }, [draft, registry]);

  // One server's roles for the role pickers and mentions (TAQ-115)
  const server = channelGuild(registry, draft?.channelId) ?? serverPick ?? registry?.guild?.id ?? null;
  const serverRegistry = useMemo(() => scopedRegistry(registry, server), [registry, server]);

  if (isLoading || (!draft && !error)) return <div style={{ color: 'var(--text-secondary)', padding: '2rem' }}>Loading panel…</div>;
  if (error || !data || !draft) return <div style={{ color: '#ef4444', padding: '2rem' }}>Error: {error?.message ?? 'Panel not found'}</div>;

  const discard = () => {
    if (!confirm('Throw away your unsaved changes?')) return;
    setDraft({ content: latest?.content ?? EMPTY, channelId: latest?.channel_id ?? data.panel.channel_id ?? '', baseRev: latest?.rev_number ?? null, restoredFrom: null });
    setAdoptText(''); setNote(''); setRestoredDraft(false); setSaveError(null); setConflict(null);
  };

  const publish = async (force = false) => {
    setSaving(true); setSaveError(null);
    const res = await fetch(`/api/exec/bot-panels/${slug}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: draft.content, channel_id: draft.channelId, adopt_links: adoptLinks,
        note, restored_from: draft.restoredFrom, base_rev: draft.baseRev, force,
      }),
    });
    const body = await res.json().catch(() => ({}));
    setSaving(false);
    if (res.status === 409 && body.conflict) { setConflict(body.conflict); return; }
    if (!res.ok) { setSaveError(body.errors ?? [body.error ?? 'Failed to publish']); return; }

    const fresh = await mutate();
    setDraft({
      content: fresh?.latest?.content ?? draft.content,
      channelId: fresh?.latest?.channel_id ?? draft.channelId,
      baseRev: body.rev_number, restoredFrom: null,
    });
    saveDraft(slug, null);
    setAdoptText(''); setAdoptOpen(false); setNote(''); setConflict(null); setRestoredDraft(false);
    setPolling(true);
  };

  const refreshRegistry = async () => {
    setRefreshFailed(false);
    const res = await fetch('/api/exec/bot-panels/registry', { method: 'POST' });
    if (res.ok) setRefreshFrom(registryAt);
    else setRefreshFailed(true);
  };

  const loadTheirs = () => {
    initialised.current = false;
    saveDraft(slug, null);
    setDraft(null); setConflict(null);
    mutate();
  };

  const restore = (rev: number, content: PanelContent, channelId: string | null) => {
    setDraft({ content, channelId: channelId ?? draft.channelId, baseRev: latest?.rev_number ?? null, restoredFrom: rev });
    setNote(`Revert to revision ${rev}`);
    setTab('edit');
  };


  return (
    <PanelValuesContext.Provider value={data.values ?? {}}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <Link href="/exec/bot-panels" style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', textDecoration: 'none' }}>← Bot Messages</Link>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{data.panel.name}</h1>
        {latestMeta && <StatusBadge status={latestMeta.status} posted={data.panel.message_ids.length > 0} />}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.25rem', background: 'var(--bg-card)', padding: '0.25rem', borderRadius: '0.5rem' }}>
          {(['edit', 'history'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ ...btnStyle, background: tab === t ? '#3b82f6' : 'transparent', color: tab === t ? '#fff' : 'var(--text-secondary)' }}>
              {t === 'edit' ? 'Edit' : `History (${data.revisions.length})`}
            </button>
          ))}
        </div>
      </div>

      <LatestStatus meta={latestMeta} panel={data.panel} registry={registry} />

      {tab === 'history' ? (
        <History slug={slug} revisions={data.revisions} posted={data.panel.message_ids.length > 0} publishedRev={data.panel.published_rev} registry={registry} onRestore={restore} />
      ) : (
        <>
          {restoredDraft && dirty && (
            <div style={banner('#3b82f6')}>
              Restored your unsaved changes from last time.
              <button onClick={discard} style={{ ...smallBtn, marginLeft: '0.5rem', background: 'transparent', color: '#3b82f6' }}>Discard them</button>
            </div>
          )}
          {draft.restoredFrom != null && (
            <div style={banner('#a855f7')}>Restoring revision {draft.restoredFrom}. Publish to make it live again; nothing in the history is lost.</div>
          )}
          {conflict && (
            <div style={banner('#eab308')}>
              {conflict.latest_author ?? 'Someone'} published revision {conflict.latest_rev} while you were editing.
              <button onClick={loadTheirs} style={{ ...smallBtn, marginLeft: '0.5rem', background: 'transparent', color: '#eab308' }}>Load their version</button>
              <button onClick={() => publish(true)} style={{ ...smallBtn, background: 'transparent', color: '#eab308' }}>Publish mine over it</button>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '1rem', alignItems: 'start' }} className="bot-panel-grid">
            {/* Left: settings + form */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)', borderRadius: '0.5rem', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {(registry?.guilds?.length ?? 0) > 1 && (
                  <div>
                    <label style={labelStyle}>Server</label>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      {registry!.guilds!.map(g => (
                        <button key={g.id} type="button" aria-pressed={g.id === server}
                          onClick={() => {
                            if (g.id === server) return;
                            setServerPick(g.id);
                            setDraft({ ...draft, channelId: '' });
                          }}
                          style={{ ...smallBtn, background: g.id === server ? '#3b82f6' : 'var(--bg-secondary)', color: g.id === server ? '#fff' : 'var(--text-secondary)' }}>
                          {g.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <label style={labelStyle}>Channel</label>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <ChannelPicker value={draft.channelId} registry={registry} guildId={server} onChange={id => setDraft({ ...draft, channelId: id })} />
                    <input value={draft.channelId} placeholder="or channel id" style={{ ...inputStyle, width: '11rem', fontFamily: 'ui-monospace, monospace' }}
                      onChange={e => setDraft({ ...draft, channelId: e.target.value.replace(/\D/g, '') })} />
                  </div>
                  {latest && draft.channelId && data.panel.channel_id && data.panel.message_ids.length > 0 && draft.channelId !== data.panel.channel_id
                    && registry?.channels.find(c => c.id === data.panel.channel_id)?.parent_id !== draft.channelId && (
                    <div style={{ fontSize: '0.72rem', color: '#eab308', marginTop: '0.3rem' }}>
                      Moving channels: the bot posts here first, then deletes the old messages in {channelLabel(data.panel.channel_id, registry)}.
                    </div>
                  )}
                  {isForum(registry, draft.channelId) && (
                    <div style={{ marginTop: '0.5rem' }}>
                      <label style={labelStyle}>Post title</label>
                      <input value={draft.content.post?.title ?? ''} maxLength={100} placeholder="The forum post's title"
                        style={inputStyle}
                        onChange={e => setDraft({ ...draft, content: { ...draft.content, post: { title: e.target.value } } })} />
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                        {data.panel.channel_id && registry?.channels.find(c => c.id === data.panel.channel_id)?.parent_id === draft.channelId
                          ? 'Publishing edits this panel’s post; a changed title renames it.'
                          : 'The first publish opens a new post with this title; later ones edit it.'}
                      </div>
                    </div>
                  )}
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                    {refreshFailed ? <span style={{ color: '#ef4444' }}>The bot didn&rsquo;t refresh; is it running?</span>
                      : `Channels, roles and emojis from the bot${registry ? `, synced ${timeAgo(registry.updated_at)}` : ''}.`}
                    <button onClick={refreshRegistry} disabled={refreshFrom != null}
                      style={{ ...smallBtn, background: 'transparent', color: '#3b82f6', padding: '0 0.4rem', opacity: refreshFrom != null ? 0.6 : 1 }}>
                      {refreshFrom != null ? 'Refreshing…' : 'Refresh'}
                    </button>
                  </div>
                </div>

                <div>
                  <button onClick={() => setAdoptOpen(v => !v)} style={{ ...smallBtn, background: 'transparent', color: 'var(--text-secondary)', padding: 0 }}>
                    {adoptOpen ? '▾' : '▸'} Link existing messages{data.panel.message_ids.length === 0 && latest ? ' (not linked yet)' : ''}
                  </button>
                  {adoptOpen && (
                    <div style={{ marginTop: '0.4rem' }}>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0 0 0.4rem' }}>
                        Paste the links (right-click → Copy Message Link) of the bot messages this panel should take over, top to bottom.
                        The bot edits them in place instead of posting new ones. Leave empty to keep the current messages.
                      </p>
                      <textarea value={adoptText} onChange={e => setAdoptText(e.target.value)} rows={3}
                        placeholder="https://discord.com/channels/…/…/…" style={{ ...inputStyle, fontFamily: 'ui-monospace, monospace', fontSize: '0.75rem' }} />
                      {adoptProblems.length > 0 && <div style={{ fontSize: '0.72rem', color: '#ef4444' }}>Not a message link: {adoptProblems[0]}</div>}
                    </div>
                  )}
                </div>

              </div>

              <PanelEditor content={draft.content} registry={serverRegistry} onFocus={setFocus}
                onChange={content => setDraft({ ...draft, content })} />
            </div>

            {/* Right: sticky preview + publish. Sticky offsets count from inside
                .exec-main's 2rem padding, so pull up to sit just under its top edge,
                and fit the 100vh - 80px area the exec layout gives it. */}
            <div style={{ position: 'sticky', top: '-1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: 'calc(100vh - 80px - 2rem)' }}>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)', borderRadius: '0.5rem', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <input value={note} onChange={e => setNote(e.target.value)} maxLength={200}
                  placeholder="What changed? (shown in the history)" style={inputStyle} />
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <button onClick={() => publish(false)}
                    disabled={saving || !dirty || validation.length > 0 || adoptProblems.length > 0 || !draft.channelId}
                    style={{ ...btnStyle, background: '#3b82f6', color: '#fff', opacity: saving || !dirty || validation.length > 0 || adoptProblems.length > 0 || !draft.channelId ? 0.45 : 1 }}>
                    {saving ? 'Publishing…' : 'Publish to Discord'}
                  </button>
                  {dirty && <button onClick={discard} style={{ ...btnStyle, background: 'transparent', color: 'var(--text-secondary)' }}>Discard</button>}
                  <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {!draft.channelId ? 'Pick a channel first' : dirty ? 'Unsaved changes' : 'No changes'}
                  </span>
                </div>
                {validation.length > 0 && dirty && (
                  <ul style={{ margin: 0, paddingLeft: '1.1rem', color: '#ef4444', fontSize: '0.75rem' }}>
                    {validation.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}
                    {validation.length > 5 && <li>…and {validation.length - 5} more</li>}
                  </ul>
                )}
                {saveError && (
                  <ul style={{ margin: 0, paddingLeft: '1.1rem', color: '#ef4444', fontSize: '0.75rem' }}>
                    {saveError.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                )}
              </div>
              <div style={{ overflowY: 'auto', borderRadius: '0.5rem' }}>
                <DiscordPreview content={draft.content} registry={registry} highlight={focus} />
              </div>
            </div>
          </div>
          <style>{`@media (max-width: 1100px) { .bot-panel-grid { grid-template-columns: minmax(0, 1fr) !important; } .bot-panel-grid > div:last-child { position: static !important; max-height: none !important; } }`}</style>
        </>
      )}
    </div>
    </PanelValuesContext.Provider>
  );
}

function LatestStatus({ meta, panel, registry }: { meta?: RevisionMeta; panel: PanelSummary; registry: PanelRegistry | null }) {
  if (!meta) return <div style={banner('#6b7280')}>This panel is empty. Build it below and publish to post it.</div>;
  const where = channelLabel(meta.channel_id ?? panel.channel_id, registry);
  if (meta.status === 'pending') return <div style={banner('#eab308')}>Revision {meta.rev_number} is waiting for the bot. It usually takes under 15 seconds.</div>;
  if (meta.status === 'publishing') return <div style={banner('#3b82f6')}>The bot is posting revision {meta.rev_number} to {where}…</div>;
  if (meta.status === 'failed') {
    return (
      <div style={banner('#ef4444')}>
        <strong>Revision {meta.rev_number} didn&apos;t publish.</strong> Discord still shows the last good version. {meta.error}
      </div>
    );
  }
  if (meta.status === 'published' && panel.message_ids.length === 0) {
    return (
      <div style={banner('#eab308')}>
        This content was imported from the old /generate command and isn&apos;t linked to the messages in Discord yet.
        Use &quot;Link existing messages&quot; below to take them over, or publish to post fresh ones.
      </div>
    );
  }
  return (
    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
      Live in {where}: revision {meta.rev_number}, by {meta.author_name ?? 'unknown'}, {timeAgo(meta.published_at ?? meta.created_at)}.
      {meta.error && <span style={{ color: '#eab308' }}> Note from the bot: {meta.error}</span>}
    </div>
  );
}

function History({ slug, revisions, posted, publishedRev, registry, onRestore }: {
  slug: string; revisions: RevisionMeta[]; posted: boolean; publishedRev: number | null; registry: PanelRegistry | null;
  onRestore: (rev: number, content: PanelContent, channelId: string | null) => void;
}) {
  const [selected, setSelected] = useState<number | null>(revisions[0]?.rev_number ?? null);
  const [view, setView] = useState<'diff' | 'preview'>('diff');
  const prevRev = revisions.find(r => selected != null && r.rev_number < selected)?.rev_number ?? null;

  const { data: current } = useSWR<{ rev_number: number; content: PanelContent; channel_id: string | null }>(
    selected != null ? `/api/exec/bot-panels/${slug}/revisions/${selected}` : null, fetcher, { revalidateOnFocus: false });
  const { data: previous } = useSWR<{ content: PanelContent }>(
    prevRev != null ? `/api/exec/bot-panels/${slug}/revisions/${prevRev}` : null, fetcher, { revalidateOnFocus: false });

  const actionLabel = (k: string) => registry?.actions.find(a => a.key === k)?.label ?? k;
  const diff = useMemo(() => {
    if (!current) return null;
    const asText = (c: PanelContent) => toReadable(contentToText(c, actionLabel), registry);
    const after = asText(current.content);
    // The first revision has nothing to compare against: show it plain, not as all-added.
    if (prevRev == null) return after.split('\n').map(text => ({ kind: 'same' as const, text }));
    if (!previous) return null;
    return diffCollapsed(asText(previous.content), after, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, previous, prevRev, registry]);

  const latestRev = revisions[0]?.rev_number;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(16rem, 22rem) minmax(0, 1fr)', gap: '1rem', alignItems: 'start' }}>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)', borderRadius: '0.5rem', overflow: 'hidden' }}>
        {revisions.map(r => (
          <button key={r.rev_number} onClick={() => setSelected(r.rev_number)} style={{
            display: 'block', width: '100%', textAlign: 'left', padding: '0.6rem 0.75rem', border: 'none',
            borderTop: '1px solid var(--border-card)', cursor: 'pointer',
            background: selected === r.rev_number ? 'var(--bg-secondary)' : 'transparent', color: 'var(--text-primary)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <strong style={{ fontSize: '0.85rem' }}>Rev {r.rev_number}</strong>
              <StatusBadge status={r.status} posted={posted} current={r.rev_number === publishedRev} />
              <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--text-muted)' }}>{timeAgo(r.created_at)}</span>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2 }}>
              {r.author_name ?? 'unknown'}{r.restored_from != null ? ` · reverted to rev ${r.restored_from}` : ''}{r.adopted ? ' · linked existing messages' : ''}
            </div>
            {r.note && <div style={{ fontSize: '0.75rem', color: 'var(--text-primary)', marginTop: 2 }}>{r.note}</div>}
            {r.status === 'failed' && r.error && <div style={{ fontSize: '0.72rem', color: '#ef4444', marginTop: 2 }}>{r.error}</div>}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', minWidth: 0 }}>
        {current && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ display: 'flex', gap: '0.25rem', background: 'var(--bg-card)', padding: '0.2rem', borderRadius: '0.4rem' }}>
              {(['diff', 'preview'] as const).map(v => (
                <button key={v} onClick={() => setView(v)} style={{ ...smallBtn, background: view === v ? 'var(--bg-secondary)' : 'transparent', color: 'var(--text-primary)' }}>
                  {v === 'diff' ? (prevRev ? `Changes from rev ${prevRev}` : 'Content') : 'Preview'}
                </button>
              ))}
            </div>
            {current.rev_number !== latestRev && (
              <button onClick={() => onRestore(current.rev_number, current.content, current.channel_id)}
                style={{ ...btnStyle, marginLeft: 'auto', background: 'rgba(168, 85, 247, 0.15)', color: '#a855f7' }}>
                Restore this version
              </button>
            )}
          </div>
        )}
        {!current ? (
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{selected == null ? 'No revisions yet.' : 'Loading…'}</div>
        ) : view === 'preview' ? (
          <DiscordPreview content={current.content} registry={registry} />
        ) : (
          <pre style={{ margin: 0, background: 'var(--bg-card)', border: '1px solid var(--border-card)', borderRadius: '0.5rem', padding: '0.6rem 0', fontSize: '0.75rem', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'ui-monospace, Consolas, monospace' }}>
            {diff?.map((row, i) => (
              <div key={i} style={{
                padding: '0 0.75rem',
                background: row.kind === 'add' ? 'rgba(34,197,94,0.12)' : row.kind === 'del' ? 'rgba(239,68,68,0.12)' : undefined,
                color: row.kind === 'skip' ? 'var(--text-muted)' : row.kind === 'add' ? '#86efac' : row.kind === 'del' ? '#fca5a5' : 'var(--text-secondary)',
              }}>{row.kind === 'add' ? '+ ' : row.kind === 'del' ? '− ' : '  '}{row.text}</div>
            ))}
          </pre>
        )}
      </div>
    </div>
  );
}
