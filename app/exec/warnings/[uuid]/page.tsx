"use client";

import { Suspense, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useWarningProfile } from '@/hooks/useExecWarnings';
import type { WarningEntry } from '@/lib/warnings';
import AddWarningModal from '../AddWarningModal';
import ScreenshotDrop from '../ScreenshotDrop';
import { btnStyle, cardStyle, CountSummary, formatDate, inputStyle, KindChip, PlayerHead, smallBtn } from '../ui';

export default function WarningProfilePage() {
  return (
    <Suspense fallback={null}>
      <WarningProfile />
    </Suspense>
  );
}

function WarningProfile() {
  const { uuid } = useParams<{ uuid: string }>();
  const search = useSearchParams();
  const { profile, loading, error, refresh, revoke, restore, updateNotes, addScreenshots, setDiscordId } = useWarningProfile(uuid);
  const [adding, setAdding] = useState(false);
  const [showRevoked, setShowRevoked] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const uploadFailed = Number(search.get('uploadFailed') ?? 0);

  const back = (
    <Link href="/exec/warnings" style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', textDecoration: 'none' }}>
      ← All warnings
    </Link>
  );

  if (loading && !profile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {back}
        <div style={{ ...cardStyle, height: '400px', animation: 'pulse 1.5s ease-in-out infinite' }} />
        <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
      </div>
    );
  }

  if (!profile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {back}
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '0.5rem', padding: '1rem', color: '#ef4444' }}>
          {error?.includes('404') ? 'No warnings on file for this player.' : `Failed to load this profile: ${error}`}
        </div>
      </div>
    );
  }

  const active = profile.entries.filter(e => !e.revokedAt);
  const revoked = profile.entries.filter(e => e.revokedAt);
  // Entries are newest first, so this is the one currently in force.
  const dishonored = active.find(e => e.kind === 'dishonored_fish');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {back}

      <div style={{ ...cardStyle, padding: '1.25rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <PlayerHead uuid={profile.uuid} size={56} />
        <div style={{ flex: 1, minWidth: '200px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <h1 style={{ fontSize: '1.6rem', fontWeight: '800', color: 'var(--text-primary)', margin: 0 }}>{profile.ign}</h1>
          {dishonored && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              <KindChip kind="dishonored_fish" />
              <span>since {formatDate(dishonored.issuedAt)} · given by {dishonored.issuedByIgn ?? `Discord ${dishonored.issuedBy}`}</span>
              {!profile.linkedDiscordId && !profile.discordId && (
                <span style={{ color: '#f59e0b' }}>
                  No Discord account known, so the role can&apos;t be applied. Add one below.
                </span>
              )}
            </div>
          )}
          <DiscordAccount
            linkedId={profile.linkedDiscordId}
            typedId={profile.discordId}
            onSave={setDiscordId}
          />
          <CountSummary counts={profile.counts} size="lg" />
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            {profile.threadUrl
              ? <a href={profile.threadUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-ocean-400)' }}>Discussion thread in TE ↗</a>
              : 'The bot will create this player\'s forum post in TE.'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={refresh} style={{ ...btnStyle, background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border-card)' }}>
            Refresh
          </button>
          <button onClick={() => setAdding(true)} style={{ ...btnStyle, background: '#ef4444', color: '#fff' }}>
            Add warning
          </button>
        </div>
      </div>

      {uploadFailed > 0 && (
        <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '0.5rem', padding: '0.75rem 1rem', color: '#f59e0b', fontSize: '0.85rem' }}>
          The warning was saved, but {uploadFailed} screenshot{uploadFailed !== 1 ? 's' : ''} failed to upload. Add them again from the entry below.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {active.length === 0 && (
          <div style={{ ...cardStyle, padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            Everything on file for this player has been revoked.
          </div>
        )}
        {active.map(entry => (
          <EntryCard key={entry.id} entry={entry} onRevoke={revoke} onRestore={restore} onSaveNotes={updateNotes} onAddScreenshots={addScreenshots} onOpenImage={setLightbox} profileIgn={profile.ign} />
        ))}
      </div>

      {revoked.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <button
            onClick={() => setShowRevoked(v => !v)}
            aria-expanded={showRevoked}
            style={{ ...btnStyle, alignSelf: 'flex-start', background: 'transparent', color: 'var(--text-secondary)', padding: 0 }}
          >
            {showRevoked ? '▾' : '▸'} Revoked ({revoked.length})
          </button>
          {showRevoked && revoked.map(entry => (
            <EntryCard key={entry.id} entry={entry} onRevoke={revoke} onRestore={restore} onSaveNotes={updateNotes} onAddScreenshots={addScreenshots} onOpenImage={setLightbox} profileIgn={profile.ign} />
          ))}
        </div>
      )}

      {profile.legacyThreads.length > 0 && (
        <div style={{ ...cardStyle, padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <h2 style={{ fontSize: '0.9rem', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>Earlier discussion</h2>
          {profile.legacyThreads.map(t => (
            <a key={t.url} href={t.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-ocean-400)', fontSize: '0.85rem' }}>
              {t.title} ↗
            </a>
          ))}
        </div>
      )}

      {adding && (
        <AddWarningModal
          initialIgn={profile.ign}
          onClose={() => setAdding(false)}
          onAdded={() => { setAdding(false); refresh(); }}
        />
      )}

      {lightbox !== null && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Screenshot"
          onClick={() => setLightbox(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', cursor: 'zoom-out' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/exec/warnings/attachments/${lightbox}`} alt="" style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: '0.5rem' }} />
        </div>,
        document.body
      )}
    </div>
  );
}

/**
 * Which Discord account the bot gives the Dishonored Fish role to. A linked
 * account always wins and isn't editable here; otherwise exec can type one in.
 */
function DiscordAccount({ linkedId, typedId, onSave }: {
  linkedId: string | null;
  typedId: string | null;
  onSave: (discordId: string | null) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(typedId ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (next: string | null) => {
    setBusy(true);
    setError(null);
    try {
      await onSave(next);
      setEditing(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const label: React.CSSProperties = { fontSize: '0.8rem', color: 'var(--text-secondary)' };
  const mono: React.CSSProperties = { fontFamily: 'ui-monospace, monospace', color: 'var(--text-primary)' };

  if (linkedId) {
    return <div style={label}>Discord account: <span style={mono}>{linkedId}</span> (linked)</div>;
  }

  if (editing) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
        <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <label htmlFor="warning-discord-id" style={label}>Discord user id</label>
          <input
            id="warning-discord-id"
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && save(value.trim() || null)}
            inputMode="numeric"
            placeholder="e.g. 170719819715313665"
            style={{ ...inputStyle, width: '220px' }}
            autoFocus
          />
          <button disabled={busy} onClick={() => save(value.trim() || null)} style={{ ...smallBtn, background: '#22c55e', color: '#fff' }}>Save</button>
          {typedId && (
            <button disabled={busy} onClick={() => save(null)} style={{ ...smallBtn, background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>Clear</button>
          )}
          <button disabled={busy} onClick={() => { setEditing(false); setValue(typedId ?? ''); setError(null); }} style={{ ...smallBtn, background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>Cancel</button>
        </div>
        <span style={{ ...label, fontSize: '0.75rem' }}>
          Right-click them in Discord and choose Copy User ID. Changing it doesn&apos;t take the role off the previous account.
        </span>
        {error && <span style={{ color: '#ef4444', fontSize: '0.8rem' }}>{error}</span>}
      </div>
    );
  }

  return (
    <div style={label}>
      Discord account: {typedId ? <span style={mono}>{typedId}</span> : 'not linked'}
      {' '}
      <button onClick={() => setEditing(true)} style={{ ...smallBtn, background: 'transparent', color: 'var(--color-ocean-400)', padding: '0 0.25rem' }}>
        {typedId ? 'Change' : 'Add Discord id'}
      </button>
    </div>
  );
}

function EntryCard({ entry, profileIgn, onRevoke, onRestore, onSaveNotes, onAddScreenshots, onOpenImage }: {
  entry: WarningEntry;
  profileIgn: string;
  onRevoke: (id: number, reason: string) => Promise<void>;
  onRestore: (id: number) => Promise<void>;
  onSaveNotes: (id: number, notes: string) => Promise<void>;
  onAddScreenshots: (id: number, files: File[]) => Promise<void>;
  onOpenImage: (attachmentId: number) => void;
}) {
  const isRevoked = !!entry.revokedAt;
  const [mode, setMode] = useState<'view' | 'revoke' | 'notes' | 'screenshots'>('view');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState(entry.notes ?? '');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setMode('view');
      setReason('');
      setFiles([]);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const issuer = entry.issuedByIgn ?? `Discord ${entry.issuedBy}`;

  return (
    <div style={{ ...cardStyle, padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.6rem', opacity: isRevoked ? 0.65 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <KindChip kind={entry.kind} revoked={isRevoked} />
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
          {formatDate(entry.issuedAt)} · issued by {issuer}
          {entry.ign !== profileIgn && <> · as {entry.ign}</>}
        </span>
        {entry.sourceLink && (
          <a href={entry.sourceLink} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-ocean-400)', fontSize: '0.8rem' }}>
            Original message ↗
          </a>
        )}
      </div>

      <div style={{ color: 'var(--text-primary)', fontWeight: '600', textDecoration: isRevoked ? 'line-through' : 'none' }}>
        {entry.rule}
      </div>

      {mode === 'notes' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <textarea id={`notes-${entry.id}`} value={notes} onChange={e => setNotes(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} autoFocus />
          <div style={{ display: 'flex', gap: '0.375rem' }}>
            <button disabled={busy} onClick={() => run(() => onSaveNotes(entry.id, notes))} style={{ ...smallBtn, background: '#22c55e', color: '#fff' }}>Save</button>
            <button disabled={busy} onClick={() => { setMode('view'); setNotes(entry.notes ?? ''); }} style={{ ...smallBtn, background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>Cancel</button>
          </div>
        </div>
      ) : entry.notes && (
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.875rem', whiteSpace: 'pre-wrap' }}>{entry.notes}</p>
      )}

      {entry.attachments.length > 0 && (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {entry.attachments.map(a => (
            <button key={a.id} onClick={() => onOpenImage(a.id)} aria-label={`Open ${a.filename}`} style={{ padding: 0, border: 'none', background: 'none', cursor: 'zoom-in' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/exec/warnings/attachments/${a.id}`} alt={a.filename} loading="lazy" style={{ width: 96, height: 64, objectFit: 'cover', borderRadius: '0.25rem', border: '1px solid var(--border-card)' }} />
            </button>
          ))}
        </div>
      )}

      {mode === 'screenshots' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <ScreenshotDrop files={files} onChange={setFiles} max={10 - entry.attachments.length} />
          <div style={{ display: 'flex', gap: '0.375rem' }}>
            <button disabled={busy || files.length === 0} onClick={() => run(() => onAddScreenshots(entry.id, files))} style={{ ...smallBtn, background: '#22c55e', color: '#fff', opacity: files.length ? 1 : 0.5 }}>
              {busy ? 'Uploading…' : 'Upload'}
            </button>
            <button disabled={busy} onClick={() => { setMode('view'); setFiles([]); }} style={{ ...smallBtn, background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>Cancel</button>
          </div>
        </div>
      )}

      {isRevoked && (
        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          Revoked {formatDate(entry.revokedAt!)} by {entry.revokedByIgn ?? `Discord ${entry.revokedBy}`}: {entry.revokeReason}
        </div>
      )}

      {mode === 'revoke' ? (
        <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            id={`revoke-reason-${entry.id}`}
            value={reason}
            onChange={e => setReason(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && reason.trim() && run(() => onRevoke(entry.id, reason.trim()))}
            placeholder="Why is this being revoked?"
            style={{ ...inputStyle, flex: 1, minWidth: '200px' }}
            autoFocus
          />
          <button disabled={busy || !reason.trim()} onClick={() => run(() => onRevoke(entry.id, reason.trim()))} style={{ ...smallBtn, background: '#ef4444', color: '#fff', opacity: reason.trim() ? 1 : 0.5 }}>
            Revoke
          </button>
          <button disabled={busy} onClick={() => setMode('view')} style={{ ...smallBtn, background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>Cancel</button>
        </div>
      ) : mode === 'view' && (
        <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
          <button onClick={() => setMode('notes')} style={{ ...smallBtn, background: 'var(--bg-primary)', color: 'var(--text-secondary)', border: '1px solid var(--border-card)' }}>
            {entry.notes ? 'Edit notes' : 'Add notes'}
          </button>
          {entry.attachments.length < 10 && (
            <button onClick={() => setMode('screenshots')} style={{ ...smallBtn, background: 'var(--bg-primary)', color: 'var(--text-secondary)', border: '1px solid var(--border-card)' }}>
              Add screenshots
            </button>
          )}
          {isRevoked ? (
            <button disabled={busy} onClick={() => run(() => onRestore(entry.id))} style={{ ...smallBtn, background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e' }}>
              Restore
            </button>
          ) : (
            <button onClick={() => setMode('revoke')} style={{ ...smallBtn, background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
              Revoke
            </button>
          )}
        </div>
      )}

      {error && <div style={{ color: '#ef4444', fontSize: '0.8rem' }}>{error}</div>}
    </div>
  );
}
