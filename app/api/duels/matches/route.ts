import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { errorResponse, readJson, requirePlayer, unauthorized } from '@/lib/duel/http';
import {
  createChallenge, createPractice, DuelInputError, findMember, parseDeckChoice, resolveDeck, RULESETS, toPayload, type Ruleset,
} from '@/lib/duel/store';

export const dynamic = 'force-dynamic';

/**
 * Start a practice game against the bot ({ mode: 'practice', deck }) or
 * issue a challenge ({ mode: 'friendly', deck, opponent?: ign }). Without an
 * opponent the challenge is open to any member. ruleset: 'duel' (default),
 * 'war' (Three-Front War) or 'grid' (Warfront). Warfront practice may also
 * take size: 5 or 7 (default 7); friendly Warfront games are 7x7.
 */
export async function POST(request: NextRequest) {
  const me = await requirePlayer(request);
  if (!me) return unauthorized();
  const body = await readJson(request);
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  try {
    const pool = getPool();
    const choice = parseDeckChoice(body.deck);
    if (body.ruleset !== undefined && !(RULESETS as unknown[]).includes(body.ruleset)) throw new DuelInputError('Unknown ruleset.');
    const ruleset: Ruleset = body.ruleset === 'war' || body.ruleset === 'grid' ? body.ruleset : 'duel';
    if (body.size !== undefined && (ruleset !== 'grid' || (body.size !== 5 && body.size !== 7))) throw new DuelInputError('size is 5 or 7, for Warfront only.');
    if (body.mode === 'practice') {
      const deck = await resolveDeck(pool, me.discordId, choice, false);
      const row = await createPractice(pool, me, deck, undefined, ruleset, body.size === 5 || body.size === 7 ? { size: body.size } : {});
      return NextResponse.json({ match: toPayload(row, 0) });
    }
    if (body.mode !== 'friendly') throw new DuelInputError('Unknown mode.');
    if (body.size === 5) throw new DuelInputError('Friendly Warfront games are 7x7.');
    const deck = await resolveDeck(pool, me.discordId, choice, true);
    let invitee: string | null = null;
    if (typeof body.opponent === 'string' && body.opponent.trim()) {
      if (!/^[A-Za-z0-9_]{1,16}$/.test(body.opponent.trim())) throw new DuelInputError('That is not a Minecraft name.');
      invitee = await findMember(pool, body.opponent);
      if (!invitee) throw new DuelInputError(`${body.opponent.trim()} is not a linked guild member.`);
    }
    const row = await createChallenge(pool, me, deck, invitee, ruleset);
    return NextResponse.json({ challenge: { id: row.id } });
  } catch (e) {
    return errorResponse(e, 'start duel');
  }
}
