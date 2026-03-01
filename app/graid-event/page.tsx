"use client";

import { fmtDate } from "@/lib/utils";
import { formatPayout } from "@/lib/currency";
import EventTable from "@/components/EventTable";
import { useGraidEvent } from "@/hooks/useGraidEvent";
import EventSkeleton from "@/components/skeletons/EventSkeleton";

interface ActiveEvent {
  id: number;
  title: string;
  startTs: string;
  endTs: string | null;
  low: number;
  high: number;
  minc: number;
  bonusThreshold: number | null;
  bonusAmount: number | null;
}

interface Row {
  username: string;
  rank: string;
  total: number;
  payout: number;
  meetsMin: boolean;
  rankNum: number;
  isRankLeader: boolean;
}

interface EventData {
  event: ActiveEvent | null;
  rows: Row[];
  isFallback: boolean;
}

export default function GraidEventPage() {
  const { eventData, loading, error, refresh } = useGraidEvent();

  if (loading) {
    return <EventSkeleton />;
  }

  if (error) {
    return (
      <main style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: '5rem',
        paddingLeft: '1rem',
        paddingRight: '1rem'
      }}>
        <div style={{ 
          padding: '2rem', 
          textAlign: 'center',
          minHeight: '50vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{ 
            fontSize: '1.125rem', 
            color: '#e33232',
            background: 'var(--bg-card)',
            padding: '1.5rem',
            borderRadius: '0.5rem',
            border: '1px solid #e33232'
          }}>
            ❌ {error}
          </div>
        </div>
      </main>
    );
  }

  if (!eventData) {
    return null;
  }

  const { event: showEvent, rows: showRows, isFallback } = eventData;

  return (
    <main style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      paddingTop: '2rem',
      paddingLeft: '1rem',
      paddingRight: '1rem'
    }}>
      <div style={{
        maxWidth: '48rem',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1.5rem'
      }}>
        {/* Event Info Card */}
        <div className="card" style={{
          width: '100%',
          padding: '1.5rem',
          textAlign: 'center',
          border: '3px solid #240059'
        }}>
          {isFallback && (
            <>
              <div style={{ marginBottom: '0.5rem' }}>
                <span style={{
                  display: 'block',
                  fontSize: '1.5rem',
                  fontWeight: '900',
                  color: '#dc2626'
                }}>
                  There are currently no active events!
                </span>
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <span style={{
                  display: 'block',
                  fontSize: '1rem',
                  fontWeight: '600',
                  color: 'var(--text-secondary)'
                }}>
                  Here is the payout from the most recent guild raid event.
                </span>
              </div>
            </>
          )}
          {showEvent ? (
            <>
              <h1 style={{
                fontSize: 'clamp(1.5rem, 3vw, 2rem)',
                fontWeight: '800',
                background: 'linear-gradient(135deg, var(--color-ocean-400), var(--color-ocean-600))',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                margin: 0,
                paddingBottom: '1rem',
                letterSpacing: '-0.02em',
                textTransform: 'capitalize'
              }}>
                {showEvent.title}
              </h1>
              <p style={{
                color: 'var(--text-secondary)',
                margin: '0'
              }}>
                <span style={{ fontWeight: '600' }}>Window:</span>{" "}
                {fmtDate(showEvent.startTs)} — {fmtDate(showEvent.endTs)}
              </p>
              <p style={{
                color: 'var(--text-secondary)',
                margin: '0.25rem 0'
              }}>
                {showEvent.low === showEvent.high ? (
                  <>
                    <span style={{ fontWeight: '600' }}>Payout Per Raid:</span>{" "}
                    {formatPayout(showEvent.low)}
                  </>
                ) : (
                  <>
                    <span style={{ fontWeight: '600' }}>Payout Per Raid:</span>{" "}
                    Low rank = {formatPayout(showEvent.low)} • High rank = {formatPayout(showEvent.high)}
                  </>
                )}
              </p>
              <p style={{
                color: 'var(--text-secondary)',
                margin: '0.25rem 0'
              }}>
                <span style={{ fontWeight: '600' }}>Minimum Completions:</span> {showEvent.minc}
              </p>
              <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{
                  border: '2px solid rgba(100, 116, 139, 0.5)',
                  borderRadius: '0.5rem',
                  overflow: 'hidden'
                }}>
                <table style={{
                  borderCollapse: 'collapse',
                  fontSize: '0.9rem'
                }}>
                  <thead>
                    <tr style={{ background: 'rgba(100, 116, 139, 0.3)' }}>
                      <th colSpan={2} style={{
                        padding: '0.5rem 1rem',
                        fontWeight: '600',
                        color: 'var(--text-primary)',
                        borderBottom: '2px solid rgba(100, 116, 139, 0.5)'
                      }}>
                        Bonuses
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ padding: '0.35rem 1rem', color: 'var(--text-secondary)', borderBottom: '1px solid rgba(100, 116, 139, 0.3)' }}>Rank 1</td>
                      <td style={{ padding: '0.35rem 1rem', fontWeight: '600', color: 'var(--text-primary)', borderBottom: '1px solid rgba(100, 116, 139, 0.3)' }}>2x multiplier</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '0.35rem 1rem', color: 'var(--text-secondary)', borderBottom: '1px solid rgba(100, 116, 139, 0.3)' }}>Ranks 2–5</td>
                      <td style={{ padding: '0.35rem 1rem', fontWeight: '600', color: 'var(--text-primary)', borderBottom: '1px solid rgba(100, 116, 139, 0.3)' }}>1.5x multiplier</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '0.35rem 1rem', color: 'var(--text-secondary)', borderBottom: '1px solid rgba(100, 116, 139, 0.3)' }}>Highest in Rank Group</td>
                      <td style={{ padding: '0.35rem 1rem', fontWeight: '600', color: 'var(--text-primary)', borderBottom: '1px solid rgba(100, 116, 139, 0.3)' }}>1.5x multiplier</td>
                    </tr>
                    {showEvent?.bonusThreshold != null && showEvent?.bonusAmount != null && (
                    <tr>
                      <td style={{ padding: '0.35rem 1rem', color: 'var(--text-secondary)' }}>{showEvent.bonusThreshold}+ Raids</td>
                      <td style={{ padding: '0.35rem 1rem', fontWeight: '600', color: 'var(--text-primary)' }}>+{showEvent.bonusAmount} LE bonus</td>
                    </tr>
                    )}
                  </tbody>
                </table>
                </div>
              </div>
            </>
          ) : (
            <>
              <h1 style={{
                fontSize: 'clamp(1.5rem, 3vw, 2rem)',
                fontWeight: '800',
                background: 'linear-gradient(135deg, var(--color-ocean-400), var(--color-ocean-600))',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                margin: 0,
                paddingBottom: '1rem',
                letterSpacing: '-0.02em'
              }}>
                No Event Data
              </h1>
              <p style={{
                color: 'var(--text-muted)',
                margin: '0'
              }}>
                No event data found in the database.
              </p>
            </>
          )}
        </div>

        {/* Table */}
        <div style={{
          width: '100%',
          border: '3px solid #240059',
          borderRadius: '1rem',
          overflow: 'hidden'
        }}>
          <EventTable
            rows={showRows}
            minc={showEvent?.minc ?? 0}
            bonusThreshold={showEvent?.bonusThreshold ?? null}
            bonusAmount={showEvent?.bonusAmount ?? null}
            onRefresh={refresh}
          />
        </div>

        {/* Footer text */}
        <div style={{
          width: '100%',
          paddingBottom: '2rem'
        }}>
          <p style={{
            fontSize: '0.875rem',
            textAlign: 'center',
            color: 'var(--text-muted)',
            margin: 0
          }}>
            Multiplicative bonuses do not stack.<br />
            {showEvent && showEvent.low !== showEvent.high && (
              <>Starfish, Manatee, Piranha, Barracuda are treated as <strong>low ranks</strong>. Others are high.<br /></>
            )}
            Payouts below the minimum completions threshold are shown in gray as hypothetical.
            {showEvent?.bonusThreshold != null && showEvent?.bonusAmount != null && (
              <><br />★ indicates {showEvent.bonusThreshold}+ raids bonus.</>
            )}
          </p>
        </div>
      </div>
    </main>
  );
}
