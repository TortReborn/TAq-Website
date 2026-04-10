-- Track the previous version a member was on, so execs can one-click undo
-- an erroneous version change. Set automatically on every upsert in
-- POST /api/exec/builds. Nullable + no FK so dropping a build version
-- doesn't break the undo trail (the UI hides undo if the prev version
-- no longer exists).
ALTER TABLE member_builds
  ADD COLUMN IF NOT EXISTS prev_version_major SMALLINT,
  ADD COLUMN IF NOT EXISTS prev_version_minor SMALLINT;
