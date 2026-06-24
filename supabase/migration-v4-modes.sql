-- Migration v4 — "Every answer counts" (regular) & "Only first answer counts" (hardcore)
-- Run once in the Supabase SQL Editor. Safe to re-run (idempotent guards).
--
-- 1. Adds players.answered_at (server-clock ISO timestamp of a player's first
--    commit each round; used to pick the winner in hardcore mode).
-- 2. Expands the games.game_mode check constraint to allow the new values while
--    keeping legacy 'think' / 'classic' rows valid for read-only compatibility.

-- 1) answered_at column ------------------------------------------------------
alter table public.players
  add column if not exists answered_at timestamptz;

-- 2) game_mode allowed values ------------------------------------------------
-- Default new games to 'regular' ("every answer counts").
alter table public.games
  alter column game_mode set default 'regular';

-- Replace the check constraint (drop old name if present, then add).
do $$
begin
  if exists (
    select 1 from information_schema.constraint_column_usage
    where table_name = 'games' and constraint_name = 'games_game_mode_check'
  ) then
    alter table public.games drop constraint games_game_mode_check;
  end if;
end $$;

alter table public.games
  add constraint games_game_mode_check
  check (game_mode in ('regular', 'hardcore', 'think', 'classic'));
