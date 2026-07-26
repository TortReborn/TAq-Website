"use client";

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useExecSession } from '@/hooks/useExecSession';
import styles from './externals.module.css';

type View = 'exceptions' | 'alliances';

interface ExceptionRecord {
  id?: number;
  discordUser: string;
  discordId: string;
  ign: string;
  minecraftUuid: string;
  exceptionType: 'alt' | 'rank_exception' | 'role_exception' | 'other';
  linkedMain: string;
  accountOwner: string;
  inGameRank: string;
  taqRole: string;
  accessNotes: string;
  notes: string;
}

interface AllianceRecord {
  id?: number;
  guildName: string;
  guildPrefix: string;
  discordRoleId: string;
  displayRank: string;
  notes: string;
  enabled: boolean;
}

const NARWHAL_RANKS = new Set(['Narwhal', 'Hydra', '✫✪✫ Hydra - Leader']);
const EMPTY_EXCEPTION: ExceptionRecord = {
  discordUser: '', discordId: '', ign: '', minecraftUuid: '', exceptionType: 'alt',
  linkedMain: '', accountOwner: '', inGameRank: '', taqRole: '', accessNotes: '', notes: '',
};
const EMPTY_ALLIANCE: AllianceRecord = {
  guildName: '', guildPrefix: '', discordRoleId: '', displayRank: 'Navigator', notes: '', enabled: true,
};

function clean<T extends Record<string, unknown>>(record: T): T {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, value ?? ''])) as T;
}

export default function ExternalsPage() {
  const router = useRouter();
  const { user, loading: sessionLoading } = useExecSession();
  const [view, setView] = useState<View>('exceptions');
  const [exceptions, setExceptions] = useState<ExceptionRecord[]>([]);
  const [alliances, setAlliances] = useState<AllianceRecord[]>([]);
  const [exceptionDraft, setExceptionDraft] = useState<ExceptionRecord | null>(null);
  const [allianceDraft, setAllianceDraft] = useState<AllianceRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!sessionLoading && !NARWHAL_RANKS.has(user?.rank ?? '')) router.replace('/exec/unauthorized');
  }, [router, sessionLoading, user?.rank]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/exec/externals', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Could not load externals.');
      setExceptions(payload.exceptions.map(clean));
      setAlliances(payload.alliances.map(clean));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load externals.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (NARWHAL_RANKS.has(user?.rank ?? '')) void load();
  }, [load, user?.rank]);

  async function save(event: FormEvent, type: 'exception' | 'alliance') {
    event.preventDefault();
    const draft = type === 'exception' ? exceptionDraft : allianceDraft;
    if (!draft) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch(
        draft.id ? `/api/exec/externals/${type}/${draft.id}` : '/api/exec/externals',
        {
          method: draft.id ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(draft.id
            ? draft
            : { action: type === 'exception' ? 'createException' : 'createAlliance', ...draft }),
        }
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Could not save record.');
      setExceptionDraft(null);
      setAllianceDraft(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save record.');
    } finally {
      setSaving(false);
    }
  }

  if (sessionLoading || !NARWHAL_RANKS.has(user?.rank ?? '')) return null;

  return (
    <div className={styles.page}>
      <header>
        <div>
          <span>Restricted operations</span>
          <h1>Externals & alliances</h1>
          <p>Document non-standard accounts and configure the allied guilds used by Tort-Reborn registration.</p>
        </div>
        <button onClick={() => view === 'exceptions'
          ? setExceptionDraft({ ...EMPTY_EXCEPTION })
          : setAllianceDraft({ ...EMPTY_ALLIANCE })}>
          Add {view === 'exceptions' ? 'exception' : 'alliance'}
        </button>
      </header>

      <div className={styles.tabs}>
        <button className={view === 'exceptions' ? styles.active : ''} onClick={() => setView('exceptions')}>Account & role exceptions</button>
        <button className={view === 'alliances' ? styles.active : ''} onClick={() => setView('alliances')}>Guild alliances</button>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {loading ? <div className={styles.loading} /> : view === 'exceptions' ? (
        <div className={styles.tableWrap}>
          <table>
            <thead><tr><th>IGN</th><th>Type</th><th>Linked main / owner</th><th>Rank mapping</th><th>Discord / access</th><th>Notes</th><th /></tr></thead>
            <tbody>
              {exceptions.map(record => (
                <tr key={record.id}>
                  <td><strong>{record.ign}</strong>{record.minecraftUuid && <small>{record.minecraftUuid}</small>}</td>
                  <td><span className={styles.type}>{record.exceptionType.replaceAll('_', ' ')}</span></td>
                  <td>{record.linkedMain || '—'}<small>{record.accountOwner ? `Owner: ${record.accountOwner}` : ''}</small></td>
                  <td>{record.inGameRank || '—'} <span className={styles.arrow}>→</span> {record.taqRole || '—'}</td>
                  <td>{record.discordUser || '—'}<small>{record.accessNotes}</small></td>
                  <td>{record.notes || '—'}</td>
                  <td><button className={styles.edit} onClick={() => setExceptionDraft({ ...record })}>Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className={styles.allianceGrid}>
          {alliances.map(record => (
            <article key={record.id} className={!record.enabled ? styles.disabled : ''}>
              <div className={styles.guildMark}>{record.guildPrefix.slice(0, 3).toUpperCase()}</div>
              <div className={styles.guildBody}>
                <div><h2>{record.guildName}</h2><span>{record.enabled ? 'Enabled' : 'Disabled'}</span></div>
                <dl>
                  <div><dt>Guild prefix</dt><dd>{record.guildPrefix}</dd></div>
                  <div><dt>Discord role</dt><dd>{record.discordRoleId}</dd></div>
                  <div><dt>Display rank</dt><dd>{record.displayRank}</dd></div>
                </dl>
                {record.notes && <p>{record.notes}</p>}
              </div>
              <button className={styles.edit} onClick={() => setAllianceDraft({ ...record })}>Edit</button>
            </article>
          ))}
        </div>
      )}

      {exceptionDraft && (
        <div className={styles.backdrop} onMouseDown={event => { if (event.target === event.currentTarget) setExceptionDraft(null); }}>
          <form className={styles.modal} onSubmit={event => void save(event, 'exception')}>
            <div className={styles.modalHeader}><h2>{exceptionDraft.id ? 'Edit exception' : 'Add exception'}</h2><button type="button" onClick={() => setExceptionDraft(null)}>×</button></div>
            <div className={styles.formGrid}>
              <label>IGN<input required value={exceptionDraft.ign} onChange={event => setExceptionDraft({ ...exceptionDraft, ign: event.target.value })} /></label>
              <label>Exception type<select value={exceptionDraft.exceptionType} onChange={event => setExceptionDraft({ ...exceptionDraft, exceptionType: event.target.value as ExceptionRecord['exceptionType'] })}><option value="alt">Alt account</option><option value="rank_exception">Rank exception</option><option value="role_exception">Role exception</option><option value="other">Other</option></select></label>
              <label>Discord username<input value={exceptionDraft.discordUser} onChange={event => setExceptionDraft({ ...exceptionDraft, discordUser: event.target.value })} /></label>
              <label>Discord ID<input inputMode="numeric" value={exceptionDraft.discordId} onChange={event => setExceptionDraft({ ...exceptionDraft, discordId: event.target.value })} /></label>
              <label>Minecraft UUID<input value={exceptionDraft.minecraftUuid} onChange={event => setExceptionDraft({ ...exceptionDraft, minecraftUuid: event.target.value })} /></label>
              <label>Linked main<input value={exceptionDraft.linkedMain} onChange={event => setExceptionDraft({ ...exceptionDraft, linkedMain: event.target.value })} /></label>
              <label>Account owner<input value={exceptionDraft.accountOwner} onChange={event => setExceptionDraft({ ...exceptionDraft, accountOwner: event.target.value })} /></label>
              <label>Actual in-game rank<input value={exceptionDraft.inGameRank} onChange={event => setExceptionDraft({ ...exceptionDraft, inGameRank: event.target.value })} /></label>
              <label>Intended TAq role<input value={exceptionDraft.taqRole} onChange={event => setExceptionDraft({ ...exceptionDraft, taqRole: event.target.value })} /></label>
              <label>Access notes<input value={exceptionDraft.accessNotes} onChange={event => setExceptionDraft({ ...exceptionDraft, accessNotes: event.target.value })} /></label>
              <label className={styles.full}>Notes<textarea rows={3} value={exceptionDraft.notes} onChange={event => setExceptionDraft({ ...exceptionDraft, notes: event.target.value })} /></label>
            </div>
            <div className={styles.actions}><button type="button" onClick={() => setExceptionDraft(null)}>Cancel</button><button className={styles.save} disabled={saving}>Save exception</button></div>
          </form>
        </div>
      )}

      {allianceDraft && (
        <div className={styles.backdrop} onMouseDown={event => { if (event.target === event.currentTarget) setAllianceDraft(null); }}>
          <form className={`${styles.modal} ${styles.smallModal}`} onSubmit={event => void save(event, 'alliance')}>
            <div className={styles.modalHeader}><h2>{allianceDraft.id ? 'Edit alliance' : 'Add alliance'}</h2><button type="button" onClick={() => setAllianceDraft(null)}>×</button></div>
            <div className={styles.formGrid}>
              <label>Guild name<input required value={allianceDraft.guildName} onChange={event => setAllianceDraft({ ...allianceDraft, guildName: event.target.value })} /></label>
              <label>Guild prefix<input required value={allianceDraft.guildPrefix} onChange={event => setAllianceDraft({ ...allianceDraft, guildPrefix: event.target.value })} /></label>
              <label className={styles.full}>Existing Discord role ID<input required inputMode="numeric" pattern="\d{15,22}" value={allianceDraft.discordRoleId} onChange={event => setAllianceDraft({ ...allianceDraft, discordRoleId: event.target.value })} /></label>
              <label>Display rank<input required value={allianceDraft.displayRank} onChange={event => setAllianceDraft({ ...allianceDraft, displayRank: event.target.value })} /></label>
              <label className={styles.checkbox}><input type="checkbox" checked={allianceDraft.enabled} onChange={event => setAllianceDraft({ ...allianceDraft, enabled: event.target.checked })} /> Enabled in bot</label>
              <label className={styles.full}>Notes<textarea rows={3} value={allianceDraft.notes} onChange={event => setAllianceDraft({ ...allianceDraft, notes: event.target.value })} /></label>
            </div>
            <p className={styles.hint}>The Discord role must already exist. Tort-Reborn will refuse registration if it cannot find it.</p>
            <div className={styles.actions}><button type="button" onClick={() => setAllianceDraft(null)}>Cancel</button><button className={styles.save} disabled={saving}>Save alliance</button></div>
          </form>
        </div>
      )}
    </div>
  );
}
