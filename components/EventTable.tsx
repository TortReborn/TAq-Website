"use client";

import React, { useState } from "react";
import type { Row } from "@/lib/graid";
import { formatLePayout, formatPoints } from "@/lib/currency";
import { getRankColor } from "@/lib/rank-constants";
import { useExecSession } from "@/hooks/useExecSession";

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
  const { user } = useExecSession();
  const myUsername = user?.ign?.toLowerCase() ?? null;

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
                  aria-label="Refresh table data"
                  aria-busy={isRefreshing}
                  className="event-table-refresh-btn"
                  style={{
                    border: 'none',
                    cursor: isRefreshing ? 'wait' : 'pointer',
                    padding: '0.25rem',
                    borderRadius: '0.25rem',
                    color: 'var(--table-header-text)',
                    fontSize: '0.875rem',
                    opacity: isRefreshing ? 0.6 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  title="Refresh table data"
                >
                  <span className={isRefreshing ? 'event-table-refresh-icon event-table-refresh-spinning' : 'event-table-refresh-icon'}>
                    ↻
                  </span>
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
            return rows.map((r, i) => {
              const isMe = myUsername !== null && r.username.toLowerCase() === myUsername;
              const baseBackground = isMe
                ? 'rgba(56, 169, 207, 0.14)'
                : i % 2 === 1 ? 'rgba(255, 255, 255, 0.025)' : 'var(--table-row-bg)';
              return (
              <React.Fragment key={`row-group-${r.username}-${i}`}>
                <tr
                  key={`${r.username}-${i}`}
                  style={{
                    background: baseBackground,
                    borderBottom: '1px solid var(--table-border)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--table-row-hover)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = baseBackground;
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
                    {isMe && (
                      <span style={{
                        display: 'inline-block',
                        marginLeft: '0.4rem',
                        fontSize: '0.65rem',
                        fontWeight: '700',
                        letterSpacing: '0.03em',
                        color: '#fff',
                        background: 'var(--color-ocean-500)',
                        padding: '0.1rem 0.4rem',
                        borderRadius: '0.25rem',
                        verticalAlign: 'middle'
                      }}>
                        YOU
                      </span>
                    )}
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
              );
            });
          })()}
        </tbody>
      </table>
    </div>
  );
}
