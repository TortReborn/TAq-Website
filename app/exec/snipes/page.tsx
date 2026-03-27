"use client";

import { useState, useCallback } from 'react';
import { useExecSnipeMeta } from '@/hooks/useExecSnipes';
import SnipeLogForm from './SnipeLogForm';
import SnipeBrowse from './SnipeBrowse';
import SnipeLeaderboard from './SnipeLeaderboard';
import SnipeStats from './SnipeStats';
import SnipeDashboard from './SnipeDashboard';

const TABS = ['Log', 'Browse', 'Leaderboard', 'Stats', 'Dashboard'] as const;
type Tab = (typeof TABS)[number];

function getInitialTab(): Tab {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('snipes_active_tab');
    if (saved && TABS.includes(saved as Tab)) return saved as Tab;
  }
  return 'Browse';
}

export default function ExecSnipesPage() {
  const [activeTab, setActiveTab] = useState<Tab>(getInitialTab);
  const [statsIgn, setStatsIgn] = useState<string | null>(null);
  const [showSeasonPicker, setShowSeasonPicker] = useState(false);
  const [pendingSeason, setPendingSeason] = useState<number | null>(null);
  const [seasonSaving, setSeasonSaving] = useState(false);
  const meta = useExecSnipeMeta();

  const changeTab = useCallback((tab: Tab) => {
    setActiveTab(tab);
    localStorage.setItem('snipes_active_tab', tab);
  }, []);

  const navigateToStats = (ign: string) => {
    setStatsIgn(ign);
    changeTab('Stats');
  };

  const handleSeasonChange = async () => {
    if (pendingSeason === null || pendingSeason === meta.currentSeason) return;
    setSeasonSaving(true);
    try {
      const res = await fetch('/api/exec/snipes/meta', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ season: pendingSeason }),
      });
      if (!res.ok) throw new Error('Failed to update season');
      meta.mutate();
      setShowSeasonPicker(false);
      setPendingSeason(null);
    } catch (e) {
      console.error(e);
    } finally {
      setSeasonSaving(false);
    }
  };

  const tabStyle = (tab: Tab): React.CSSProperties => ({
    padding: '0.5rem 1.25rem',
    borderRadius: '0.375rem',
    border: 'none',
    cursor: 'pointer',
    fontSize: '0.85rem',
    fontWeight: activeTab === tab ? '700' : '500',
    background: activeTab === tab ? 'var(--color-ocean-400)' : 'transparent',
    color: activeTab === tab ? '#fff' : 'var(--text-secondary)',
    transition: 'all 0.15s',
  });

  if (meta.loading) {
    return (
      <div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '2rem' }}>Snipes</h1>
        <div style={{ background: 'var(--bg-card)', borderRadius: '0.75rem', border: '1px solid var(--border-card)', height: '400px', animation: 'pulse 1.5s ease-in-out infinite' }} />
        <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: 'var(--text-primary)', margin: 0 }}>Snipes</h1>
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => { setShowSeasonPicker(!showSeasonPicker); setPendingSeason(null); }}
            style={{
              fontSize: '0.8rem', color: 'var(--text-secondary)', background: 'var(--bg-card)',
              border: '1px solid var(--border-card)', borderRadius: '0.375rem',
              padding: '0.3rem 0.6rem', cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            Season {meta.currentSeason} ▾
          </button>

          {showSeasonPicker && (
            <div style={{
              position: 'absolute', right: 0, top: '100%', marginTop: '0.5rem',
              background: 'var(--bg-card-solid)', border: '1px solid var(--border-card)',
              borderRadius: '0.5rem', padding: '1rem', zIndex: 100, minWidth: '220px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            }}>
              <div style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '0.75rem' }}>
                Change Season
              </div>
              <input
                type="number"
                min={1}
                value={pendingSeason ?? meta.currentSeason}
                onChange={e => setPendingSeason(parseInt(e.target.value, 10) || 1)}
                style={{
                  width: '100%', padding: '0.4rem 0.5rem', fontSize: '0.85rem',
                  background: 'var(--bg-input)', color: 'var(--text-primary)',
                  border: '1px solid var(--border-card)', borderRadius: '0.375rem',
                  boxSizing: 'border-box',
                }}
              />
              {pendingSeason !== null && pendingSeason !== meta.currentSeason && (
                <div style={{
                  marginTop: '0.75rem', padding: '0.5rem', borderRadius: '0.375rem',
                  background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)',
                  fontSize: '0.75rem', color: '#f59e0b',
                }}>
                  Change from Season {meta.currentSeason} → Season {pendingSeason}?
                  <br />New snipes will be logged to Season {pendingSeason}.
                </div>
              )}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                <button
                  onClick={() => { setShowSeasonPicker(false); setPendingSeason(null); }}
                  style={{
                    flex: 1, padding: '0.4rem', fontSize: '0.8rem', borderRadius: '0.375rem',
                    border: '1px solid var(--border-card)', background: 'transparent',
                    color: 'var(--text-secondary)', cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSeasonChange}
                  disabled={seasonSaving || pendingSeason === null || pendingSeason === meta.currentSeason}
                  style={{
                    flex: 1, padding: '0.4rem', fontSize: '0.8rem', borderRadius: '0.375rem',
                    border: 'none', cursor: 'pointer', fontWeight: '600',
                    background: (pendingSeason !== null && pendingSeason !== meta.currentSeason)
                      ? 'var(--color-ocean-400)' : 'var(--bg-card)',
                    color: (pendingSeason !== null && pendingSeason !== meta.currentSeason)
                      ? '#fff' : 'var(--text-secondary)',
                    opacity: seasonSaving ? 0.6 : 1,
                  }}
                >
                  {seasonSaving ? 'Saving...' : 'Confirm'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div style={{
        display: 'flex', gap: '0.25rem', marginBottom: '1.5rem',
        background: 'var(--bg-card)', borderRadius: '0.5rem', padding: '0.25rem',
        border: '1px solid var(--border-card)',
      }}>
        {TABS.map(tab => (
          <button key={tab} style={tabStyle(tab)} onClick={() => changeTab(tab)}>
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'Log' && <SnipeLogForm meta={meta} />}
      {activeTab === 'Browse' && <SnipeBrowse meta={meta} onViewStats={navigateToStats} />}
      {activeTab === 'Leaderboard' && <SnipeLeaderboard meta={meta} onViewStats={navigateToStats} />}
      {activeTab === 'Stats' && <SnipeStats meta={meta} initialIgn={statsIgn} />}
      {activeTab === 'Dashboard' && <SnipeDashboard meta={meta} />}
    </div>
  );
}
