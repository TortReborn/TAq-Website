import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { starterDeck } from './deck';
import { getCard } from './catalog';
import type { GameState } from './types';
import type { WarState } from './war/types';
import type { GridState } from './grid/types';
import { GRID_TURN_SECONDS } from './grid/config';
import { deployOptions, deployTargets } from './grid/client';
import {
  act, acceptChallenge, cancelChallenge, createChallenge, createPractice, DuelInputError, lobby, loadMatch,
  resolveDeck, saveDeck, settleAndSave, StaleVersionError, toPayload, TURN_SECONDS, type Me,
} from './store';

// Integration test against the local dev database. Every table the store
// touches is shadowed by a session TEMP table (the real duel tables are
// created from sql/create_card_duels.sql into pg_temp), so real SQL and real
// constraints run and nothing in the database is written. Skipped when the
// database is unreachable.
const config = {
  user: process.env.DB_LOGIN,
  password: process.env.DB_PASS,
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_DATABASE || 'tortreborn',
  ssl: undefined,
  max: 1,
  connectionTimeoutMillis: 3000,
};

async function probe(): Promise<boolean> {
  const p = new Pool(config);
  try {
    await p.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await p.end().catch(() => {});
  }
}

const available = await probe();

const A: Me = { discordId: '1001', ign: 'Alpha', uuid: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' };
const B: Me = { discordId: '1002', ign: 'Bravo', uuid: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' };

describe.skipIf(!available)('duel store', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool(config);
    const ddl = fs.readFileSync(path.join(__dirname, '../../sql/create_card_duels.sql'), 'utf8')
      .replace(/CREATE TABLE IF NOT EXISTS/g, 'CREATE TEMP TABLE')
      .replace(/CREATE INDEX IF NOT EXISTS \w+ ON/g, 'CREATE INDEX ON')
      .replace(/COMMENT ON[\s\S]*?;\n/g, '');
    await pool.query(ddl);
    await pool.query(`CREATE TEMP TABLE card_collection ("user" BIGINT, card VARCHAR(64), count INT, stars SMALLINT DEFAULT 0, first_at TIMESTAMPTZ DEFAULT NOW())`);
    await pool.query(`CREATE TEMP TABLE card_members (slug VARCHAR(64) PRIMARY KEY, discord_id BIGINT, uuid UUID, ign VARCHAR(64), rank VARCHAR(32), owner BIGINT, retired BOOLEAN DEFAULT FALSE)`);
    await pool.query(`CREATE TEMP TABLE discord_links (discord_id BIGINT PRIMARY KEY, ign VARCHAR(64), uuid UUID)`);
    await pool.query(`CREATE TEMP TABLE guild_roster (uuid UUID PRIMARY KEY)`);
    await pool.query(`INSERT INTO discord_links VALUES ($1, $2, $3::uuid), ($4, $5, $6::uuid)`,
      [A.discordId, A.ign, A.uuid, B.discordId, B.ign, B.uuid]);
  });

  afterAll(async () => {
    await pool?.end();
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM duel_matches; DELETE FROM duel_decks; DELETE FROM card_collection;');
  });

  it('saves decks by shape, and checks ownership only when a friendly deck is used', async () => {
    const cards = [...starterDeck('fire').slice(0, 19), 'orphion'];
    const deck = await saveDeck(pool, A.discordId, { name: '  Sun  Deck ', cards });
    expect(deck.name).toBe('Sun Deck');
    await expect(saveDeck(pool, A.discordId, { name: 'x', cards: cards.slice(1) })).rejects.toThrow(DuelInputError);
    // Practice ignores ownership; a friendly game does not.
    await expect(resolveDeck(pool, A.discordId, { deckId: deck.id }, false)).resolves.toHaveLength(20);
    await expect(resolveDeck(pool, A.discordId, { deckId: deck.id }, true)).rejects.toThrow(/Orphion: you own 0/);
    await pool.query(`INSERT INTO card_collection ("user", card, count) VALUES ($1, 'orphion', 1)`, [A.discordId]);
    await expect(resolveDeck(pool, A.discordId, { deckId: deck.id }, true)).resolves.toHaveLength(20);
    // Someone else's deck id is simply not found.
    await expect(resolveDeck(pool, B.discordId, { deckId: deck.id }, false)).rejects.toThrow('Deck not found.');
  });

  it('runs a practice game with the bot answering in the same request', async () => {
    let row = await createPractice(pool, A, starterDeck('earth'));
    expect(row.state!.players[1].mulliganed).toBe(true);
    row = await act(pool, row, A, row.version, { type: 'mulligan', replace: [] });
    expect(row.state!.phase).toBe('main');
    for (let i = 0; i < 80 && row.state!.phase !== 'over'; i++) {
      expect((row.state as GameState).active).toBe(0); // the bot never leaves the turn with itself
      row = await act(pool, row, A, row.version, { type: 'end_turn' });
    }
    expect(row.status).toBe('finished');
    expect(row.deadline).toBeNull();
  });

  it('plays a friendly challenge end to end, refusing stale versions and strangers', async () => {
    const open = await createChallenge(pool, A, starterDeck('water'), B.discordId);
    const l = await lobby(pool, B);
    expect(l.incoming).toEqual([expect.objectContaining({ id: open.id, direct: true, from: { ign: 'Alpha', uuid: A.uuid } })]);
    const C: Me = { discordId: '1003', ign: 'Charlie', uuid: 'c'.repeat(32) };
    await expect(acceptChallenge(pool, open, C, starterDeck('air'))).rejects.toThrow('for someone else');

    let row = await acceptChallenge(pool, (await loadMatch(pool, open.id))!, B, starterDeck('air'));
    expect(row.status).toBe('active');
    expect(row.deadline).not.toBeNull();
    const payloadA = toPayload(row, 0);
    expect(JSON.stringify(payloadA)).not.toContain('"deck"');
    expect(payloadA.view!.players[1].hand).toBeUndefined();

    row = await act(pool, row, A, row.version, { type: 'mulligan', replace: [] });
    await expect(act(pool, row, B, row.version - 1, { type: 'mulligan', replace: [] })).rejects.toThrow(StaleVersionError);
    row = await act(pool, row, B, row.version, { type: 'mulligan', replace: [] });
    expect(row.state!.phase).toBe('main');
    const first = (row.state as GameState).active;
    const player = first === 0 ? A : B;
    await expect(act(pool, row, first === 0 ? B : A, row.version, { type: 'end_turn' })).rejects.toThrow('Not your turn');
    row = await act(pool, row, player, row.version, { type: 'concede' });
    expect(row.status).toBe('finished');
    expect(row.winner).toBe(first === 0 ? 1 : 0);
    const record = (await lobby(pool, first === 0 ? B : A)).record;
    expect(record.wins).toBe(1);
  });

  it('applies missed turn clocks lazily, one timeout per missed deadline', async () => {
    const open = await createChallenge(pool, A, starterDeck('fire'), null);
    let row = await acceptChallenge(pool, open, B, starterDeck('earth'));
    row = await act(pool, row, A, row.version, { type: 'mulligan', replace: [] });
    row = await act(pool, row, B, row.version, { type: 'mulligan', replace: [] });
    const started = (row.state as GameState).turn;
    // Nobody touches the match for three full turns.
    const later = new Date(row.deadline!.getTime() + 2 * TURN_SECONDS * 1000 + 1000);
    row = await settleAndSave(pool, row, later);
    expect((row.state as GameState).turn).toBe(started + 3);
    expect(row.state!.players.map(p => p.timeouts).sort()).toEqual([1, 2]);
    expect(row.deadline!.getTime()).toBeGreaterThan(later.getTime());
  });

  it('lets the challenger withdraw and the invitee decline, nobody else', async () => {
    const open = await createChallenge(pool, A, starterDeck('fire'), B.discordId);
    const C: Me = { discordId: '1003', ign: 'Charlie', uuid: 'c'.repeat(32) };
    await expect(cancelChallenge(pool, open, C)).rejects.toThrow('Not your challenge.');
    await cancelChallenge(pool, open, B);
    expect((await loadMatch(pool, open.id))!.status).toBe('cancelled');
  });

  describe('Three-Front War matches', () => {
    const empty = { orders: [null, null, null], deploys: [] };
    const war = (row: { state: unknown }) => row.state as WarState;
    // The cheapest card in a war hand (round 1 pays WAR.income emeralds).
    const cheapest = (hand: WarState['players'][0]['hand']) => hand.slice().sort((x, y) => (getCard(x.slug)?.cost ?? 9) - (getCard(y.slug)?.cost ?? 9))[0];

    it('resolves a practice round as soon as the player locks in', async () => {
      let row = await createPractice(pool, A, starterDeck('earth'), undefined, 'war');
      expect(row.ruleset).toBe('war');
      expect(war(row).players[1].mulliganed).toBe(true);
      row = await act(pool, row, A, row.version, { type: 'mulligan', replace: [] });
      expect(war(row).phase).toBe('plan');
      expect(war(row).round).toBe(1);
      const card = cheapest(war(row).players[0].hand);
      row = await act(pool, row, A, row.version, { type: 'plan', plan: { ...empty, deploys: [{ uid: card.uid, to: 1 }] } });
      expect(war(row).round).toBe(2);
      expect(war(row).players[0].active[1]?.uid).toBe(card.uid);
      expect(war(row).log.some(e => e.k === 'resolved' && e.round === 1)).toBe(true);
      const p = toPayload(row, 0);
      expect(p.ruleset).toBe('war');
      expect(p.view).toBeNull();
      expect(p.lockedIn).toBe(false);
      await expect(act(pool, row, A, row.version, { type: 'end_turn' })).rejects.toThrow('Unknown action');
    });

    it('waits for both friendly plans and never shows either side the other plan', async () => {
      const open = await createChallenge(pool, A, starterDeck('fire'), B.discordId, 'war');
      let row = await acceptChallenge(pool, open, B, starterDeck('water'));
      expect(row.ruleset).toBe('war');
      row = await act(pool, row, A, row.version, { type: 'mulligan', replace: [] });
      expect(toPayload(row, 1).opponentLockedIn).toBe(true);
      row = await act(pool, row, B, row.version, { type: 'mulligan', replace: [] });
      const secret = cheapest(war(row).players[0].hand);
      row = await act(pool, row, A, row.version, { type: 'plan', plan: { ...empty, deploys: [{ uid: secret.uid, to: 0 }] } });
      expect(war(row).round).toBe(1);
      const forB = toPayload(row, 1);
      const forA = toPayload(row, 0);
      expect(forA.lockedIn).toBe(true);
      expect(forB.lockedIn).toBe(false);
      expect(forB.opponentLockedIn).toBe(true);
      expect(forB.yourTurn).toBe(true);
      expect(forB.warView!.players[0].plan).toBeUndefined();
      expect(JSON.stringify(forB)).not.toContain(secret.uid);
      await expect(act(pool, row, A, row.version, { type: 'plan', plan: empty })).rejects.toThrow('already in');
      row = await act(pool, row, B, row.version, { type: 'plan', plan: empty });
      expect(war(row).round).toBe(2);
    });

    it('braces for a player whose round clock runs out, and counts the miss', async () => {
      const open = await createChallenge(pool, A, starterDeck('air'), null, 'war');
      let row = await acceptChallenge(pool, open, B, starterDeck('thunder'));
      row = await act(pool, row, A, row.version, { type: 'mulligan', replace: [] });
      row = await act(pool, row, B, row.version, { type: 'mulligan', replace: [] });
      row = await act(pool, row, A, row.version, { type: 'plan', plan: empty });
      const later = new Date(row.deadline!.getTime() + 1000);
      row = await settleAndSave(pool, row, later);
      expect(war(row).round).toBe(2);
      expect(war(row).players.map(p => p.timeouts)).toEqual([0, 1]);
      expect(row.deadline!.getTime()).toBeGreaterThan(later.getTime());
    });
  });

  describe('Warfront (grid) matches', () => {
    const grid = (row: { state: unknown }) => row.state as GridState;

    it('plays a practice game: the bot answers each turn in the same request, and the view hides its hand', async () => {
      let row = await createPractice(pool, A, starterDeck('fire'), undefined, 'grid');
      expect(row.ruleset).toBe('grid');
      expect(grid(row).players[1].mulliganed).toBe(true);
      expect(grid(row).width).toBe(7);
      row = await act(pool, row, A, row.version, { type: 'mulligan', replace: [] });
      expect(grid(row).phase).toBe('main');
      expect(grid(row).active).toBe(0); // if the bot went first, it has already played
      const p = toPayload(row, 0);
      expect(p.view).toBeNull();
      expect(p.warView).toBeNull();
      expect(p.gridView!.players[1].hand).toBeUndefined();
      expect(JSON.stringify(p)).not.toContain('"deck"');
      expect(p.yourTurn).toBe(true);
      // Deploy the cheapest affordable card onto the first open deploy tile, then end the turn.
      const v = p.gridView!;
      const card = deployOptions(v).find(d => d.affordable && d.tiles.length);
      if (card) {
        const target = deployTargets(v, card.uid, card.tiles[0].tile)[0];
        row = await act(pool, row, A, row.version, { type: 'deploy', uid: card.uid, tile: card.tiles[0].tile, ...(target !== undefined ? { target } : {}) });
        expect(grid(row).units.some(u => u.uid === card.uid)).toBe(true);
      }
      const turn = grid(row).turn;
      await expect(act(pool, row, A, row.version - 1, { type: 'end_turn' })).rejects.toThrow(StaleVersionError);
      row = await act(pool, row, A, row.version, { type: 'end_turn' });
      expect(grid(row).active).toBe(0);
      expect(grid(row).turn).toBe(turn + 2);
      expect(grid(row).log.some(e => e.k === 'end_turn' && e.side === 1)).toBe(true);
      await expect(act(pool, row, A, row.version, { type: 'plan', plan: { orders: [null, null, null], deploys: [] } } as never)).rejects.toThrow(DuelInputError);
      for (let i = 0; i < 40 && grid(row).phase === 'main'; i++) row = await act(pool, row, A, row.version, { type: 'end_turn' });
      expect(row.status).toBe('finished');
      expect(row.deadline).toBeNull();
    });

    it('takes a 5x5 board in practice', async () => {
      const row = await createPractice(pool, A, starterDeck('water'), undefined, 'grid', { size: 5 });
      expect(grid(row).width).toBe(5);
      expect(grid(row).nodes).toHaveLength(3);
    });

    it('plays a friendly game turn by turn, refusing the player whose turn it is not', async () => {
      const open = await createChallenge(pool, A, starterDeck('earth'), B.discordId, 'grid');
      let row = await acceptChallenge(pool, open, B, starterDeck('air'));
      expect(row.ruleset).toBe('grid');
      expect(row.deadline).not.toBeNull();
      row = await act(pool, row, A, row.version, { type: 'mulligan', replace: [] });
      expect(toPayload(row, 1).yourTurn).toBe(true);
      row = await act(pool, row, B, row.version, { type: 'mulligan', replace: [] });
      const first = grid(row).active;
      const [mover, waiter] = first === 0 ? [A, B] : [B, A];
      expect(toPayload(row, first).yourTurn).toBe(true);
      expect(toPayload(row, first === 0 ? 1 : 0).yourTurn).toBe(false);
      await expect(act(pool, row, waiter, row.version, { type: 'end_turn' })).rejects.toThrow('Not your turn');
      const deadline = row.deadline!;
      row = await act(pool, row, mover, row.version, { type: 'end_turn' });
      expect(grid(row).active).toBe(first === 0 ? 1 : 0);
      expect(row.deadline!.getTime()).toBeGreaterThanOrEqual(deadline.getTime());
      row = await act(pool, row, waiter, row.version, { type: 'concede' });
      expect(row.status).toBe('finished');
      expect(row.winner).toBe(first);
    });

    it('ends a turn whose clock ran out, and forfeits after three missed turns in a row', async () => {
      const open = await createChallenge(pool, A, starterDeck('thunder'), null, 'grid');
      let row = await acceptChallenge(pool, open, B, starterDeck('fire'));
      row = await act(pool, row, A, row.version, { type: 'mulligan', replace: [] });
      row = await act(pool, row, B, row.version, { type: 'mulligan', replace: [] });
      const started = grid(row).turn;
      const later = new Date(row.deadline!.getTime() + 1000);
      row = await settleAndSave(pool, row, later);
      expect(grid(row).turn).toBe(started + 1);
      expect(row.deadline!.getTime()).toBeGreaterThan(later.getTime());
      // Five more missed turns: each side misses three in a row; the first to reach three loses.
      const idle = grid(row).players[grid(row).active].timeouts;
      expect(idle).toBe(0);
      row = await settleAndSave(pool, row, new Date(row.deadline!.getTime() + 5 * GRID_TURN_SECONDS * 1000));
      expect(row.status).toBe('finished');
      expect(row.end_reason).toBe('timeout');
    });
  });
});
