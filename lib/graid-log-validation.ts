// Validation for manually-logged guild raids (the /exec/guild-raids Log tab).
// Raids allow 1-4 participants: when raiding alongside players from other
// guilds, only our own members are logged, so a full party of 4 is not
// guaranteed. Party size never changes how a raid is processed — the announce
// flag decides whether the bot posts it to Discord, and raids with an Unknown
// type are recorded for totals but never announced.

import { RAID_SHORT_TO_FULL } from './graid-log-constants';

export const MIN_PARTICIPANTS = 1;
export const MAX_PARTICIPANTS = 4;
export const MAX_RAIDS_PER_SUBMISSION = 50;

export type GraidLogValidationResult =
  | { ok: true; participants: string[] }
  | { ok: false; error: string };

export function validateGraidLogSubmission(participants: unknown): GraidLogValidationResult {
  if (!participants || !Array.isArray(participants) || participants.length === 0) {
    return { ok: false, error: 'Participants are required.' };
  }
  for (const p of participants) {
    if (!p || typeof p !== 'string' || !p.trim()) {
      return { ok: false, error: 'All participants must have a valid IGN.' };
    }
  }

  const trimmed = (participants as string[]).map(p => p.trim());
  if (trimmed.length < MIN_PARTICIPANTS || trimmed.length > MAX_PARTICIPANTS) {
    return {
      ok: false,
      error: `Raids must have between ${MIN_PARTICIPANTS} and ${MAX_PARTICIPANTS} participants.`,
    };
  }
  const uniqueIgns = new Set(trimmed.map(p => p.toLowerCase()));
  if (uniqueIgns.size < trimmed.length) {
    return { ok: false, error: 'All participants must be different players.' };
  }

  return { ok: true, participants: trimmed };
}

// Resolves a short raid type (NOTG, TCC, ...) to its full name.
// Unknown / missing resolves to null — recorded, but not announced by the bot.
export function validateGraidRaidType(
  raidType: unknown,
): { ok: true; fullRaidName: string | null } | { ok: false; error: string } {
  const raw = (raidType ?? '').toString().trim();
  if (!raw || raw === 'Unknown') return { ok: true, fullRaidName: null };
  const resolved = RAID_SHORT_TO_FULL[raw];
  if (!resolved) {
    return { ok: false, error: 'Invalid raid type. Must be NOTG, TCC, TNA, NOL, WTP, or Unknown.' };
  }
  return { ok: true, fullRaidName: resolved };
}

export interface ValidatedGraidLogRaid {
  raidType: string | null;
  participants: string[];
  // Whether the bot should post this raid to the Discord announce channel.
  // Unknown-type raids are never announced regardless of this flag.
  announce: boolean;
}

export type GraidLogBatchResult =
  | { ok: true; raids: ValidatedGraidLogRaid[] }
  | { ok: false; error: string };

// Validates a batch submission: every raid must pass or the whole batch is
// rejected, so a partial list is never queued.
export function validateGraidLogBatch(raids: unknown): GraidLogBatchResult {
  if (!Array.isArray(raids) || raids.length === 0) {
    return { ok: false, error: 'At least one raid is required.' };
  }
  if (raids.length > MAX_RAIDS_PER_SUBMISSION) {
    return { ok: false, error: `At most ${MAX_RAIDS_PER_SUBMISSION} raids can be queued at once.` };
  }

  const validated: ValidatedGraidLogRaid[] = [];
  for (let i = 0; i < raids.length; i++) {
    const entry = raids[i];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return { ok: false, error: `Raid ${i + 1}: invalid entry.` };
    }
    const typeResult = validateGraidRaidType((entry as Record<string, unknown>).raidType);
    if (!typeResult.ok) {
      return { ok: false, error: `Raid ${i + 1}: ${typeResult.error}` };
    }
    const participantsResult = validateGraidLogSubmission(
      (entry as Record<string, unknown>).participants,
    );
    if (!participantsResult.ok) {
      return { ok: false, error: `Raid ${i + 1}: ${participantsResult.error}` };
    }
    const rawAnnounce = (entry as Record<string, unknown>).announce;
    if (rawAnnounce !== undefined && typeof rawAnnounce !== 'boolean') {
      return { ok: false, error: `Raid ${i + 1}: announce must be a boolean.` };
    }
    validated.push({
      raidType: typeResult.fullRaidName,
      participants: participantsResult.participants,
      announce: rawAnnounce !== false,
    });
  }
  return { ok: true, raids: validated };
}
