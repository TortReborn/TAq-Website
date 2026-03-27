"use client";

import { useState, useEffect, useCallback } from 'react';
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
  const meta = useExecSnipeMeta();

  const changeTab = useCallback((tab: Tab) => {
    setActiveTab(tab);
    localStorage.setItem('snipes_active_tab', tab);
  }, []);

  const navigateToStats = (ign: string) => {
    setStatsIgn(ign);
    changeTab('Stats');
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
        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Season {meta.currentSeason}</span>
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
