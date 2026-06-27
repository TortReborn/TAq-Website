"use client";

import React, { useState } from "react";
import type { Row } from "@/lib/graid";
import { formatLePayout, formatPoints } from "@/lib/currency";
import { getRankColor } from "@/lib/rank-constants";

export default function EventTable({
  rows,
  minPoints,
  valueLabel = "Points",
  minimumLabel = "points",
  onRefresh
}: {
  rows: Row[];
  minPoints: number;
  valueLabel?: string;
  minimumLabel?: string;
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
              {valueLabel}
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
            const lastMinIdx = rows.map(r => r.meetsMin).lastIndexOf(true);
            return rows.map((r, i) => (
              <React.Fragment key={`row-group-${r.username}-${i}`}>
                <tr
                  key={`${r.username}-${i}`}
                  style={{
                    background: i % 2 === 1 ? 'rgba(255, 255, 255, 0.025)' : 'var(--table-row-bg)',
                    borderBottom: '1px solid var(--table-border)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--table-row-hover)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = i % 2 === 1 ? 'rgba(255, 255, 255, 0.025)' : 'var(--table-row-bg)';
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
                    fontWeight: '500',
                    fontSize: 'clamp(0.8rem, 2.5vw, 1rem)',
                    color: getRankColor(r.rank),
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
                    {formatPoints(r.rankingPoints)}
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
                        ? r.bonusDetails.length > 0
                          ? r.bonusDetails.join(", ")
                          : `Meets minimum ${minimumLabel}`
                        : `Below minimum ${minimumLabel} (${minPoints}) - hypothetical payout shown`
                    }
                  >
                    {formatLePayout(r.payoutLe)}
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
