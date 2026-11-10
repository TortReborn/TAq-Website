/**
 * How much a lifetime counter grew between two readings. Either reading can be
 * unknown: a NULL war count is a private reading (TAQ-134), and treating it as
 * 0 would credit a member's whole lifetime as wars done in the period
 * (TAQ-208). Unknown on either side means no data, not 0.
 */
export function counterDelta(
  current: number | null | undefined,
  historical: number | null | undefined,
): { value: number; hasData: boolean } {
  if (current == null || historical == null) return { value: 0, hasData: false };
  // Negative deltas are API corrections, not lost progress.
  return { value: Math.max(0, current - historical), hasData: true };
}
