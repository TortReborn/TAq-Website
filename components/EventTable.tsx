"use client";

import React, { useState } from "react";
import type { Row } from "@/lib/graid";
import { fmtInt } from "@/lib/utils";
import { formatPayout } from "@/lib/currency";

// Rank color helper function
const getRankColor = (rank: string) => {
  switch (rank) {
    case 'Hydra': return '#ac034c';
    case 'Narwhal': return '#eb2279';
    case 'Dolphin': return '#9d68ff';
    case 'Sailfish': return '#396aff';
    case 'Hammerhead': return '#04b0eb';
    case 'Angler': return '#00e2db';
    case 'Barracuda': return '#79e64a';
    case 'Piranha': return '#c8ff00';
    case 'Manatee': return '#ffe226';
    case 'Starfish': return '#e8a41c';
    default: return 'var(--text-muted)';
  }
};

export default function EventTable({ 
  rows, 
  minc, 
  onRefresh 
}: { 
  rows: Row[]; 
  minc: number; 
  onRefresh?: () => Promise<void>;
}) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (!onRefresh) return;
    
    setIsRefreshing(true);
    try {
      await onRefresh();
    } catch (error) {
      console.error('Error refreshing:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="card" style={{ overflow: 'hidden', borderRadius: 0, border: 'none' }}>
      <table style={{
        width: '100%',
        borderCollapse: 'collapse',
        tableLayout: 'fixed' // Fixed layout for better control
      }}>
        <thead style={{ 
          background: 'var(--table-header-bg)', 
          color: 'var(--table-header-text)' 
        }}>
          <tr>
            <th style={{
              textAlign: 'left',
              padding: '0.75rem 0.5rem',
              fontWeight: '600',
              width: '15%',
              fontSize: 'clamp(0.75rem, 2.5vw, 1rem)'
            }}>
              Rank
            </th>
            <th style={{
              textAlign: 'left',
              padding: '0.75rem 0.5rem',
              fontWeight: '600',
              width: '30%',
              fontSize: 'clamp(0.75rem, 2.5vw, 1rem)'
            }}>
              Username
            </th>
            <th style={{
              textAlign: 'left',
              padding: '0.75rem 0.5rem',
              fontWeight: '600',
              width: '30%',
              fontSize: 'clamp(0.75rem, 2.5vw, 1rem)'
            }}>
              Raids
            </th>
            <th style={{
              textAlign: 'left',
              padding: '0.75rem 0.5rem',
              fontWeight: '600',
              width: '25%',
              fontSize: 'clamp(0.75rem, 2.5vw, 1rem)',
              position: 'relative'
            }}>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                width: '100%'
              }}>
                <span>Payout</span>
                <button
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: isRefreshing ? 'wait' : 'pointer',
                    padding: '0.25rem',
                    borderRadius: '0.25rem',
                    color: 'var(--table-header-text)',
                    fontSize: '0.875rem',
                    opacity: isRefreshing ? 0.6 : 1,
                    transition: 'opacity 0.2s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  onMouseEnter={(e) => {
                    if (!isRefreshing) {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                  title="Refresh table data"
                >
                  {isRefreshing ? '⟳' : '↻'}
                </button>
              </div>
            </th>
          </tr>
        </thead>
        <tbody style={{ borderTop: '1px solid var(--table-border)' }}>
          {rows.length === 0 ? (
            <tr>
              <td 
                colSpan={4} 
                style={{
                  padding: '1.5rem',
                  textAlign: 'center',
                  color: 'var(--text-muted)'
                }}
              >
                No participants yet.
              </td>
            </tr>
          ) : (() => {
            // Find the last index where meetsMin is true
            const lastMinIdx = rows.map(r => r.meetsMin).lastIndexOf(true);
            // Find the last index where rankNum <= 5
            const lastRank5OrLessIdx = rows.map(r => r.rankNum <= 5).lastIndexOf(true);
            const hasRank6Plus = rows.some(r => r.rankNum > 5);
            const showRankCutoff = rows.length > 5 && hasRank6Plus && lastRank5OrLessIdx !== -1 && lastRank5OrLessIdx !== rows.length - 1;
            return rows.map((r, i) => (
              <React.Fragment key={`row-group-${r.username}-${i}`}>
                <tr 
                  key={`${r.username}-${i}`} 
                  style={{ 
                    background: 'var(--table-row-bg)',
                    borderBottom: '1px solid var(--table-border)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--table-row-hover)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'var(--table-row-bg)';
                  }}
                >
                  <td
                    style={{
                      padding: '0.75rem 0.5rem',
                      fontWeight: '700',
                      fontSize: 'clamp(0.8rem, 2.5vw, 1rem)',
                      color: r.rankNum === 1 ? '#eab308' : 
                             r.rankNum === 2 ? '#9ca3af' :
                             r.rankNum >= 3 && r.rankNum <= 5 ? '#b45309' :
                             'var(--table-text)'
                    }}
                  >
                    {r.rankNum}
                  </td>
                  <td style={{
                    padding: '0.75rem 0.5rem',
                    fontWeight: r.isRankLeader ? '700' : '500',
                    fontSize: 'clamp(0.8rem, 2.5vw, 1rem)',
                    color: r.isRankLeader && r.rank ? getRankColor(r.rank) : 'var(--table-text)',
                    wordBreak: 'break-word'
                  }}>
                    {r.username}
                  </td>
                  <td style={{
                    padding: '0.75rem 0.5rem',
                    fontSize: 'clamp(0.8rem, 2.5vw, 1rem)',
                    color: 'var(--table-text)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem'
                  }}>
                    {fmtInt(r.total)}
                    {r.total >= 100 && (
                      <span 
                        style={{
                          fontSize: '0.7rem',
                          color: '#10b981',
                          fontWeight: '600'
                        }}
                        title="100+ raids bonus: +262,144 emeralds (64 LE)"
                      >
                        ★
                      </span>
                    )}
                  </td>
                  <td
                    style={{
                      padding: '0.75rem 0.5rem',
                      fontWeight: '600',
                      fontSize: 'clamp(0.8rem, 2.5vw, 1rem)',
                      color: r.meetsMin ? 'var(--table-text)' : '#9ca3af',
                      fontStyle: r.meetsMin ? 'normal' : 'italic'
                    }}
                    title={
                      r.meetsMin
                        ? "Meets minimum completions"
                        : `Below minimum (${minc}) — hypothetical payout shown`
                    }
                  >
                    {formatPayout(r.payout)}
                  </td>
                </tr>
                {i === lastMinIdx && lastMinIdx !== rows.length - 1 && (
                  <tr key={`cutoff-line-minc-${i}`} style={{ height: '0' }}>
                    <td colSpan={4} style={{ padding: '0', borderBottom: 'none' }}>
                      <div style={{
                        borderTop: '2px dashed var(--table-cutoff-border)',
                        position: 'relative',
                        top: '-1px'
                      }}></div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ));
          })()}
        </tbody>
      </table>
    </div>
  );
}
