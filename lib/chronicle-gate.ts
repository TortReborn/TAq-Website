/**
 * The Chronicle is under construction (TAQ-90). Until it opens, the whole
 * section — pages, search, images, the source archive — exists only for the
 * people building it: chroniclers and execs, i.e. anyone whose principal
 * `canReview`. Everyone else gets a 404, not a login prompt, so the section
 * is hidden rather than advertised.
 *
 * This module is the single switch. When the Chronicle launches, flip
 * CHRONICLE_RESTRICTED to false (or delete the module and its call sites);
 * the redaction rules in lib/wiki-redaction.ts are separate and stay.
 *
 * Kept free of server imports so the nav (a client component) can use it.
 */

export const CHRONICLE_RESTRICTED = true;

export function canEnterChronicle(
  principal: { canReview: boolean } | null | undefined,
): boolean {
  if (!CHRONICLE_RESTRICTED) return true;
  return !!principal && principal.canReview;
}
