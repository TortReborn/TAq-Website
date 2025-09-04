export const dynamic = "force-dynamic";
import { fetchActiveEvent, fetchMostRecentEvent } from "@/lib/graid";
import { fmtDate } from "@/lib/utils";
import { formatPayout } from "@/lib/currency";
import EventTable from "@/components/EventTable";

export default async function GraidEventPage() {
  const { event, rows } = await fetchActiveEvent();
  let fallback = null;
  if (!event) {
    fallback = await fetchMostRecentEvent();
  }

  const showEvent = event || fallback?.event;
  const showRows = event ? rows : fallback?.rows || [];
  const isFallback = !event && !!fallback?.event;

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
        maxWidth: '48rem',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1.5rem'
      }}>
        {/* Title */}
        <h1 style={{
          fontSize: '3rem',
          fontWeight: '900',
          textAlign: 'center',
          color: 'var(--text-primary)',
          margin: 0
        }}>
          The Aquarium Guild Raid Event Tracking
        </h1>

        {/* Subtitle / event name */}
        <div className="card" style={{
          width: '100%',
          padding: '1.5rem',
          textAlign: 'center'
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
              <h2 style={{
                fontSize: '1.5rem',
                fontWeight: '700',
                color: 'var(--text-primary)',
                margin: 0
              }}>
                {showEvent.title}
              </h2>
              <p style={{
                marginTop: '0.5rem',
                color: 'var(--text-secondary)',
                margin: '0.5rem 0 0 0'
              }}>
                <span style={{ fontWeight: '600' }}>Window:</span>{" "}
                {fmtDate(showEvent.startTs)} — {fmtDate(showEvent.endTs)}
              </p>
              <p style={{
                color: 'var(--text-secondary)',
                margin: '0.25rem 0'
              }}>
                <span style={{ fontWeight: '600' }}>Payouts:</span>{" "}
                Low rank = {formatPayout(showEvent.low)} • High rank = {formatPayout(showEvent.high)}
              </p>
              <p style={{
                color: 'var(--text-secondary)',
                margin: '0.25rem 0'
              }}>
                <span style={{ fontWeight: '600' }}>Minimum completions:</span> {showEvent.minc}
              </p>
              <p style={{
                marginTop: '1rem',
                color: 'var(--text-secondary)',
                margin: '1rem 0 0 0'
              }}>
                <span style={{ fontWeight: '600' }}>Note:</span> Rank 1 graider receives a <b>2x</b> payout multiplier, and ranks 2–5 receive a <b>1.5x</b> multiplier.
              </p>
            </>
          ) : (
            <>
              <h2 style={{
                fontSize: '1.5rem',
                fontWeight: '700',
                color: 'var(--text-primary)',
                margin: 0
              }}>
                No Event Data
              </h2>
              <p style={{
                marginTop: '0.5rem',
                color: 'var(--text-muted)',
                margin: '0.5rem 0 0 0'
              }}>
                No event data found in the database.
              </p>
            </>
          )}
        </div>

        {/* Table */}
        <div style={{ width: '100%' }}>
          <EventTable rows={showRows} minc={showEvent?.minc ?? 0} />
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
            * Starfish, Manatee, Piranha, Barracuda are treated as <strong>low ranks</strong>. Others are high.<br />
            Payouts below the minimum completions threshold are shown in gray as hypothetical.
          </p>
        </div>
      </div>
    </main>
  );
}
