"use client";

import { clsx } from "clsx";
import type { Row } from "@/lib/graid";
import { fmtInt } from "@/lib/utils";
import { formatPayout } from "@/lib/currency";

export default function EventTable({ rows, minc }: { rows: Row[]; minc: number }) {
  return (
    <div className="card overflow-hidden">
      <table className="min-w-[720px] w-full">
        <thead className="bg-ocean-100/70 text-ocean-800">
          <tr>
            <th className="text-left px-4 py-3 font-semibold">Rank</th>
            <th className="text-left px-6 py-3 font-semibold">Minecraft Username</th>
            <th className="text-left px-6 py-3 font-semibold">Guild Raids Completed</th>
            <th className="text-left px-6 py-3 font-semibold">Payout</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/70">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-6 py-6 text-center text-ocean-700/80">
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
              <>
                <tr key={`${r.username}-${i}`} className="bg-white/70 hover:bg-white/90">
                  <td
                    className={clsx(
                      "px-4 py-3 font-bold",
                      r.rankNum === 1 && "text-yellow-500",
                      r.rankNum === 2 && "text-gray-400",
                      r.rankNum >= 3 && r.rankNum <= 5 && "text-amber-700",
                      !(r.rankNum >= 1 && r.rankNum <= 5) && "text-ocean-800"
                    )}
                  >
                    {r.rankNum}
                  </td>
                  <td className="px-6 py-3 font-medium text-ocean-900">{r.username}</td>
                  <td className="px-6 py-3 text-ocean-800">{fmtInt(r.total)}</td>
                  <td
                    className={clsx(
                      "px-6 py-3 font-semibold",
                      r.meetsMin ? "text-ocean-900" : "text-gray-400 italic"
                    )}
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
                  <tr key={`cutoff-line-minc-${i}`}> 
                    <td colSpan={4}>
                      <div className="border-t-2 border-dashed border-ocean-400 my-0.5"></div>
                    </td>
                  </tr>
                )}
                {showRankCutoff && i === lastRank5OrLessIdx && (
                  <tr key={`cutoff-line-rank5-${i}`}> 
                    <td colSpan={4}>
                      <div className="border-t border-dashed border-ocean-300 opacity-60 my-0.5"></div>
                    </td>
                  </tr>
                )}
              </>
            ));
          })()}
        </tbody>
      </table>
    </div>
  );
}
