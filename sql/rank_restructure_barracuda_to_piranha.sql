-- Rank restructure: collapse Barracuda into Piranha.
--
-- Run this against BOTH prod (Neon) and dev (local 127.0.0.1) at the same time
-- the bot/website code roll out. After this completes there should be zero rows
-- with rank='Barracuda' anywhere.
--
-- Swordfish is a brand-new rank with zero existing members on day one, so no
-- backfill is needed for it.

BEGIN;

UPDATE discord_links
   SET rank = 'Piranha'
 WHERE rank = 'Barracuda';

UPDATE promotion_queue
   SET current_rank = 'Piranha'
 WHERE current_rank = 'Barracuda';

UPDATE promotion_queue
   SET new_rank = 'Piranha'
 WHERE new_rank = 'Barracuda';

UPDATE promo_suggestions
   SET current_rank = 'Piranha'
 WHERE current_rank = 'Barracuda';

COMMIT;

-- Sanity checks (run after commit):
-- SELECT rank, COUNT(*) FROM discord_links GROUP BY rank ORDER BY rank;
-- SELECT current_rank, new_rank, COUNT(*) FROM promotion_queue GROUP BY current_rank, new_rank;
-- SELECT current_rank, COUNT(*) FROM promo_suggestions GROUP BY current_rank;
