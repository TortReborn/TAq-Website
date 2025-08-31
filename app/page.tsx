export const dynamic = "force-dynamic";
import { fetchActiveEvent, fetchMostRecentEvent } from "@/lib/graid";
import { fmtDate } from "@/lib/utils";
import { formatPayout } from "@/lib/currency";
import EventTable from "@/components/EventTable";

export default async function Page() {
  const { event, rows } = await fetchActiveEvent();
  let fallback = null;
  if (!event) {
    fallback = await fetchMostRecentEvent();
  }

  const showEvent = event || fallback?.event;
  const showRows = event ? rows : fallback?.rows || [];
  const isFallback = !event && !!fallback?.event;

  return (
    <main className="flex flex-col items-center pt-20 px-4">
      <div className="max-w-3xl w-full flex flex-col items-center text-center gap-6">
        {/* Title */}
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-ocean-900">
          The Aquarium Guild Raid Event Tracking
        </h1>

        {/* Subtitle / event name */}
        <div className="card w-full p-6">
          {showEvent ? (
            <>
              <h2 className="text-2xl font-bold text-ocean-800">{showEvent.title}</h2>
              <p className="mt-2 text-ocean-800/90">
                <span className="font-semibold">Window:</span>{" "}
                {fmtDate(showEvent.startTs)} — {fmtDate(showEvent.endTs)}
              </p>
              <p className="text-ocean-800/90">
                <span className="font-semibold">Payouts:</span>{" "}
                Low rank = {formatPayout(showEvent.low)} • High rank = {formatPayout(showEvent.high)}
              </p>
              <p className="text-ocean-800/90">
                <span className="font-semibold">Minimum completions:</span> {showEvent.minc}
              </p>
              <p className="mt-4 text-ocean-800/90">
                <span className="font-semibold">Note:</span> Rank 1 graider receives a <b>2x</b> payout multiplier, and ranks 2–5 receive a <b>1.5x</b> multiplier.
              </p>
              {isFallback && (
                <p className="mt-4 text-ocean-800/90 font-semibold">
                  There are currently no active events! Here is the payout from the most recent guild raid event.
                </p>
              )}
            </>
          ) : (
            <>
              <h2 className="text-2xl font-bold text-ocean-800">No Event Data</h2>
              <p className="mt-2 text-ocean-800/80">
                No event data found in the database.
              </p>
            </>
          )}
        </div>

        {/* Table */}
        {showEvent && (
          <div className="w-full">
            <EventTable rows={showRows} minc={showEvent.minc} />
            <p className="mt-3 text-xs text-ocean-700/70 text-left">
              * Starfish, Manatee, Piranha, Barracuda are treated as <b>low ranks</b>. Others are high.
              Payouts below the minimum completions threshold are shown in gray as hypothetical.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
