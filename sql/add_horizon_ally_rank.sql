INSERT INTO rank_definitions (name, kind, sort_order)
VALUES ('Horizon', 'ally', 101)
ON CONFLICT (name) DO NOTHING;
