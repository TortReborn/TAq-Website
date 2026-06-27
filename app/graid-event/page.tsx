"use client";

import EventTable from "@/components/EventTable";
import EventSkeleton from "@/components/skeletons/EventSkeleton";
import { useGraidEvent } from "@/hooks/useGraidEvent";
import { formatLePayout, formatPayout, formatPoints } from "@/lib/currency";
import type { ActiveEvent, Row } from "@/lib/graid";
import { RAID_NAMES, RAID_SHORT_NAMES } from "@/lib/raid-constants";

interface EventData {
  event: ActiveEvent | null;
  rows: Row[];
  isFallback: boolean;
}

function ordinal(n: number) {
  if (n >= 11 && n <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

function formatWindowDate(value: string | null) {
  if (!value) return 'Ongoing';
  return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
}

function formatSystemTime(value: string | null) {
  if (!value) return 'Ongoing';
  return new Date(value).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
  });
}

const TH: React.CSSProperties = {
  padding: '0.5rem 1rem',
  background: 'var(--table-header-bg)',
  color: 'var(--table-header-text)',
  fontWeight: '600',
  fontSize: '0.8rem',
  textAlign: 'left',
  borderBottom: '1px solid var(--table-border)',
};

const TD_LABEL: React.CSSProperties = {
  padding: '0.45rem 1rem',
  color: 'var(--text-secondary)',
  fontSize: '0.875rem',
  borderBottom: '1px solid var(--table-border)',
};

const TD_VALUE: React.CSSProperties = {
  padding: '0.45rem 1rem',
  color: 'var(--text-primary)',
  fontWeight: '600',
  fontSize: '0.875rem',
  borderBottom: '1px solid var(--table-border)',
  textAlign: 'right',
};

export default function GraidEventPage() {
  const { eventData, loading, error, refresh } = useGraidEvent();

  if (loading) return <EventSkeleton />;

  if (error) {
    return (
      <main style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '5rem', paddingLeft: '1rem', paddingRight: '1rem' }}>
        <div style={{ padding: '2rem', textAlign: 'center', minHeight: '50vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontSize: '1.125rem', color: '#e33232', background: 'var(--bg-card)', padding: '1.5rem', borderRadius: '0.5rem', border: '1px solid #e33232' }}>
            Failed to fetch event data.
          </div>
        </div>
      </main>
    );
  }

  if (!eventData) return null;

  const { event: showEvent, rows: showRows, isFallback } = eventData as EventData;
  const isLegacy = showEvent?.rewardMode === 'legacy';
  const lePerPoint = showEvent?.lePerPoint ?? 1;

  return (
    <main style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '2rem', paddingLeft: '1rem', paddingRight: '1rem' }}>
      <div style={{ maxWidth: '52rem', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem' }}>

        <div className="card" style={{ width: '100%', padding: '1.5rem', border: '3px solid #240059' }}>

          {isFallback && (
            <p style={{ textAlign: 'center', color: '#dc2626', fontWeight: '700', marginBottom: '1rem', marginTop: 0 }}>
              No active event — showing the most recent event below.
            </p>
          )}

          {showEvent ? (
            <>
              <h1 style={{
                fontSize: 'clamp(1.5rem, 3vw, 2rem)', fontWeight: '800', textAlign: 'center',
                background: 'linear-gradient(135deg, var(--color-ocean-400), var(--color-ocean-600))',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
                margin: '0 0 0.75rem',
              }}>
                {showEvent.title}
              </h1>

              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0.25rem 1.5rem', color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
                <span><strong>Window:</strong> {formatWindowDate(showEvent.startTs)} – {formatWindowDate(showEvent.endTs)}</span>
                <span><strong>{isFallback ? 'Ended' : 'Ends'}:</strong> {formatSystemTime(showEvent.endTs)}</span>
                {isLegacy ? (
                  <>
                    <span><strong>Min completions:</strong> {showEvent.minc}</span>
                    <span><strong>Payout per raid:</strong> {
                      showEvent.low === showEvent.high
                        ? formatPayout(showEvent.low)
                        : `${formatPayout(showEvent.low)} / ${formatPayout(showEvent.high)}`
                    }</span>
                  </>
                ) : (
                  <>
                    <span><strong>Min points:</strong> {showEvent.minPoints}</span>
                    <span><strong>Rate:</strong> {lePerPoint} LE per point</span>
                  </>
                )}
              </div>

              {isLegacy ? (
                <div style={{ maxWidth: '22rem', margin: '0 auto', border: '1px solid var(--table-border)', borderRadius: '0.5rem', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr><th colSpan={2} style={TH}>Legacy Bonuses</th></tr></thead>
                    <tbody>
                      <tr>
                        <td style={TD_LABEL}>Rank 1</td>
                        <td style={TD_VALUE}>2× payout</td>
                      </tr>
                      <tr>
                        <td style={TD_LABEL}>Ranks 2 – 5</td>
                        <td style={TD_VALUE}>1.5× payout</td>
                      </tr>
                      <tr>
                        <td style={{ ...TD_LABEL, borderBottom: showEvent.bonusThreshold != null ? '1px solid var(--table-border)' : 'none' }}>Rank group leader</td>
                        <td style={{ ...TD_VALUE, borderBottom: showEvent.bonusThreshold != null ? '1px solid var(--table-border)' : 'none' }}>1.5× payout</td>
                      </tr>
                      {showEvent.bonusThreshold != null && showEvent.bonusAmount != null && (
                        <tr>
                          <td style={{ ...TD_LABEL, borderBottom: 'none' }}>{showEvent.bonusThreshold}+ raids</td>
                          <td style={{ ...TD_VALUE, borderBottom: 'none' }}>+{showEvent.bonusAmount} LE</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>

                  <div style={{ border: '1px solid var(--table-border)', borderRadius: '0.5rem', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead><tr><th colSpan={2} style={TH}>Raid Points</th></tr></thead>
                      <tbody>
                        {RAID_NAMES.map((raidName, index) => {
                          const pts = showEvent.raidPoints?.[raidName] ?? 0;
                          const last = index === RAID_NAMES.length - 1;
                          return (
                            <tr key={raidName}>
                              <td style={{ ...TD_LABEL, borderBottom: last ? 'none' : '1px solid var(--table-border)' }}>
                                <span style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{RAID_SHORT_NAMES[raidName]}</span>
                                <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{raidName}</span>
                              </td>
                              <td style={{ ...TD_VALUE, borderBottom: last ? 'none' : '1px solid var(--table-border)' }}>{formatPoints(pts)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div style={{ border: '1px solid var(--table-border)', borderRadius: '0.5rem', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead><tr><th colSpan={2} style={TH}>Bonus Points</th></tr></thead>
                      <tbody>
                        {showEvent.milestones.length === 0 && showEvent.placementBonuses.length === 0 ? (
                          <tr>
                            <td colSpan={2} style={{ ...TD_LABEL, borderBottom: 'none', fontStyle: 'italic' }}>None configured</td>
                          </tr>
                        ) : (() => {
                          const allBonuses: { label: string; pts: number }[] = [
                            ...showEvent.milestones.map(m => ({ label: `${m.threshold}+ points`, pts: m.points })),
                            ...showEvent.placementBonuses.map(p => ({ label: `${ordinal(p.placement)} place`, pts: p.points })),
                          ];
                          return allBonuses.map(({ label, pts }, i) => {
                            const last = i === allBonuses.length - 1;
                            return (
                              <tr key={label}>
                                <td style={{ ...TD_LABEL, borderBottom: last ? 'none' : '1px solid var(--table-border)' }}>{label}</td>
                                <td style={{ ...TD_VALUE, borderBottom: last ? 'none' : '1px solid var(--table-border)' }}>
                                  +{pts} pts
                                  {lePerPoint > 1 && <span style={{ fontWeight: '400', color: 'var(--text-muted)', marginLeft: '0.35rem' }}>({formatLePayout(pts * lePerPoint)})</span>}
                                </td>
                              </tr>
                            );
                          });
                        })()}
                      </tbody>
                    </table>
                  </div>

                </div>
              )}
            </>
          ) : (
            <>
              <h1 style={{
                fontSize: 'clamp(1.5rem, 3vw, 2rem)', fontWeight: '800', textAlign: 'center',
                background: 'linear-gradient(135deg, var(--color-ocean-400), var(--color-ocean-600))',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
                margin: '0 0 0.5rem',
              }}>
                No Event Data
              </h1>
              <p style={{ color: 'var(--text-muted)', margin: 0, textAlign: 'center' }}>No event data found in the database.</p>
            </>
          )}
        </div>

        <div style={{ width: '100%', border: '3px solid #240059', borderRadius: '1rem', overflow: 'hidden' }}>
          <EventTable
            rows={showRows}
            minPoints={isLegacy ? showEvent?.minc ?? 0 : showEvent?.minPoints ?? 0}
            valueLabel={isLegacy ? 'Completions' : 'Points'}
            minimumLabel={isLegacy ? 'completions' : 'points'}
            onRefresh={refresh}
          />
        </div>

        <div style={{ width: '100%', paddingBottom: '2rem' }}>
          <p style={{ fontSize: '0.875rem', textAlign: 'center', color: 'var(--text-muted)', margin: 0 }}>
            {isLegacy
              ? 'This historical event uses the old completion reward rules.'
              : 'Completing raids earns you Raid Points that decide your milestones, rankings and end reward payout. Milestone and placement unlocked points get added on top of your raid points during payout only and do not influence your ranking.'
            }<br />
            Payouts below the minimum {isLegacy ? 'completions' : 'points'} threshold are shown in gray as hypothetical.
          </p>
        </div>

      </div>
    </main>
  );
}
