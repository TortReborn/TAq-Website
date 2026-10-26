import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, inTransaction, readJson, requirePlayer, unauthorized } from '@/lib/duel/http';
import { act, DuelInputError, loadMatch, seatOf, toPayload } from '@/lib/duel/store';
import type { Action, TargetRef } from '@/lib/duel/types';
import type { Deploy, Order, Plan, SlotRef, WarAction } from '@/lib/duel/war/types';
import type { GridAction } from '@/lib/duel/grid/types';

export const dynamic = 'force-dynamic';

function target(x: unknown): TargetRef | undefined {
  const t = x as Record<string, unknown> | undefined;
  if (!t) return undefined;
  if (t.kind === 'hero' && (t.side === 0 || t.side === 1)) return { kind: 'hero', side: t.side };
  if (t.kind === 'unit' && typeof t.uid === 'string') return { kind: 'unit', uid: t.uid };
  return undefined;
}

const isSide = (x: unknown): x is 0 | 1 => x === 0 || x === 1;
const isLane = (x: unknown): x is 0 | 1 | 2 => x === 0 || x === 1 || x === 2;

function slot(x: unknown): SlotRef | undefined {
  const t = x as Record<string, unknown> | undefined;
  return t && isSide(t.side) && isLane(t.lane) ? { side: t.side, lane: t.lane } : undefined;
}

/** A war order; undefined when malformed (null is a valid "no order"). */
function order(x: unknown): Order | null | undefined {
  if (x === null) return null;
  const o = x as Record<string, unknown> | undefined;
  if (!o || typeof o.k !== 'string') return undefined;
  switch (o.k) {
    case 'attack': { const target = slot(o.target); return target ? { k: 'attack', target } : undefined; }
    case 'move': {
      const target = o.target === undefined ? undefined : slot(o.target);
      const attack = o.attack === undefined ? undefined : slot(o.attack);
      if ((o.target !== undefined && !target) || (o.attack !== undefined && !attack)) return undefined;
      return { k: 'move', ...(target ? { target } : {}), ...(attack ? { attack } : {}) };
    }
    case 'brace': return { k: 'brace' };
    case 'switch': return o.garrison === 0 || o.garrison === 1 ? { k: 'switch', garrison: o.garrison } : undefined;
    case 'shift': return o.dir === -1 || o.dir === 1 ? { k: 'shift', dir: o.dir } : undefined;
    default: return undefined;
  }
}

/** A war round plan, field by field; the engine then checks it against the board (validatePlan). */
function parsePlan(x: unknown): Plan | null {
  const p = x as Record<string, unknown> | undefined;
  if (!p || !Array.isArray(p.orders) || p.orders.length !== 3) return null;
  const orders = p.orders.map(order);
  if (orders.some(o => o === undefined)) return null;
  const rawDeploys = p.deploys ?? [];
  if (!Array.isArray(rawDeploys) || rawDeploys.length > 8) return null;
  const deploys: Deploy[] = [];
  for (const d of rawDeploys as Record<string, unknown>[]) {
    if (!d || typeof d.uid !== 'string' || d.uid.length > 32) return null;
    if (d.to !== 'garrison' && !isLane(d.to)) return null;
    const target = d.target === undefined ? undefined : slot(d.target);
    if (d.target !== undefined && !target) return null;
    deploys.push({ uid: d.uid, to: d.to as Deploy['to'], ...(target ? { target } : {}) });
  }
  let hq: Plan['hq'] = null;
  if (p.hq !== undefined && p.hq !== null) {
    const h = p.hq as Record<string, unknown>;
    const target = h.target === undefined ? undefined : slot(h.target);
    if (typeof h !== 'object' || (h.target !== undefined && !target)) return null;
    hq = target ? { target } : {};
  }
  return { orders: orders as (Order | null)[], deploys, hq };
}

/** Rebuild the action from the body field by field; nothing else gets through. */
function parseAction(x: unknown): Action | WarAction | null {
  const a = x as Record<string, unknown> | undefined;
  if (!a || typeof a.type !== 'string') return null;
  switch (a.type) {
    case 'mulligan':
      return Array.isArray(a.replace) && a.replace.every(u => typeof u === 'string') ? { type: 'mulligan', replace: a.replace as string[] } : null;
    case 'play':
      return typeof a.uid === 'string' ? { type: 'play', uid: a.uid, target: target(a.target) } : null;
    case 'attack': {
      const t = target(a.target);
      return typeof a.uid === 'string' && t ? { type: 'attack', uid: a.uid, target: t } : null;
    }
    case 'move':
      return typeof a.uid === 'string' ? { type: 'move', uid: a.uid, target: target(a.target) } : null;
    case 'tank':
      return { type: 'tank', target: target(a.target) };
    case 'pearl': case 'end_turn': case 'concede':
      return { type: a.type };
    case 'plan': {
      const plan = parsePlan(a.plan);
      return plan ? { type: 'plan', plan } : null;
    }
    default:
      return null;
  }
}

const isTile = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x) && x >= 0 && x < 64;
const isUid = (x: unknown): x is string => typeof x === 'string' && x.length > 0 && x.length <= 32;

/**
 * A Warfront (grid) action, rebuilt field by field. Tiles are integers
 * (y * width + x); the engine then checks each against the board.
 */
function parseGridAction(x: unknown): GridAction | null {
  const a = x as Record<string, unknown> | undefined;
  if (!a || typeof a.type !== 'string') return null;
  const target = a.target === undefined ? undefined : isTile(a.target) ? a.target : null;
  if (target === null) return null;
  switch (a.type) {
    case 'mulligan':
      return Array.isArray(a.replace) && a.replace.length <= 10 && a.replace.every(isUid) ? { type: 'mulligan', replace: a.replace as string[] } : null;
    case 'deploy':
      return isUid(a.uid) && isTile(a.tile) ? { type: 'deploy', uid: a.uid, tile: a.tile, ...(target !== undefined ? { target } : {}) } : null;
    case 'move':
      return isUid(a.uid) && isTile(a.to) ? { type: 'move', uid: a.uid, to: a.to } : null;
    case 'attack':
      return isUid(a.uid) && target !== undefined ? { type: 'attack', uid: a.uid, target } : null;
    case 'ability':
      return isUid(a.uid) ? { type: 'ability', uid: a.uid, ...(target !== undefined ? { target } : {}) } : null;
    case 'brace':
      return isUid(a.uid) ? { type: 'brace', uid: a.uid } : null;
    case 'hq':
      return { type: 'hq', ...(target !== undefined ? { target } : {}) };
    case 'end_turn': case 'concede':
      return { type: a.type };
    default:
      return null;
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await requirePlayer(request);
  if (!me) return unauthorized();
  const { id } = await params;
  const body = await readJson(request);
  // The ruleset decides the action's shape, so both parses are kept until the row is loaded.
  const action = parseAction(body?.action);
  const gridAction = parseGridAction(body?.action);
  if (!body || (!action && !gridAction) || typeof body.version !== 'number') {
    return NextResponse.json({ error: 'Send { version, action }' }, { status: 400 });
  }
  try {
    const row = await inTransaction(async client => {
      const current = await loadMatch(client, id, true);
      if (!current || seatOf(current, me.discordId) === null) return null;
      const chosen = current.ruleset === 'grid' ? gridAction : action;
      if (!chosen) throw new DuelInputError('Send { version, action }');
      return act(client, current, me, body.version as number, chosen);
    });
    if (!row) return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    return NextResponse.json({ match: toPayload(row, seatOf(row, me.discordId)) });
  } catch (e) {
    return errorResponse(e, 'play');
  }
}
