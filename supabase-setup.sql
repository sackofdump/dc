-- ============================================================
-- XxDungeonSlayerxX — Supabase setup
-- Run this once in your Supabase project's SQL Editor.
-- ============================================================

-- ---------- TABLES ----------

-- Per-user profile, 1:1 with auth.users.  Display name is shown on the leaderboard.
create table if not exists public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  display_name text not null,
  save_data    jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index if not exists profiles_display_name_unique on public.profiles (lower(display_name));

-- Leaderboard rows are written client-side after each run; the user can only edit their own row.
create table if not exists public.leaderboard (
  user_id              uuid primary key references auth.users on delete cascade,
  display_name         text not null,
  best_floor           int  not null default 1,
  best_act             int  not null default 1,
  total_dust           bigint not null default 0,
  act1_clear_seconds   int,                                 -- null until they first clear act 1
  updated_at           timestamptz not null default now()
);
create index if not exists leaderboard_act_idx       on public.leaderboard (best_act desc, best_floor desc, total_dust desc);
create index if not exists leaderboard_floor_idx     on public.leaderboard (best_floor desc, total_dust desc);
create index if not exists leaderboard_dust_idx      on public.leaderboard (total_dust desc);
create index if not exists leaderboard_speedrun_idx  on public.leaderboard (act1_clear_seconds asc nulls last);

-- Auto-update updated_at
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

drop trigger if exists touch_profiles on public.profiles;
create trigger touch_profiles before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_leaderboard on public.leaderboard;
create trigger touch_leaderboard before update on public.leaderboard
  for each row execute function public.touch_updated_at();

-- ---------- ROW-LEVEL SECURITY ----------

alter table public.profiles    enable row level security;
alter table public.leaderboard enable row level security;

-- Profiles: anyone can read display_name (for leaderboard joins); only the owner can write.
drop policy if exists profiles_read_all on public.profiles;
create policy profiles_read_all on public.profiles
  for select using (true);

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Leaderboard: anyone can read; only the owner can insert/update their own row.
drop policy if exists leaderboard_read_all on public.leaderboard;
create policy leaderboard_read_all on public.leaderboard
  for select using (true);

drop policy if exists leaderboard_insert_self on public.leaderboard;
create policy leaderboard_insert_self on public.leaderboard
  for insert with check (auth.uid() = user_id);

drop policy if exists leaderboard_update_self on public.leaderboard;
create policy leaderboard_update_self on public.leaderboard
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- HELPER RPC: upsert leaderboard row, only ratcheting upward ----------
-- Clients call this so we can't accidentally clobber a higher score with a lower one.
create or replace function public.submit_score(
  p_best_floor          int,
  p_best_act            int,
  p_total_dust          bigint,
  p_act1_clear_seconds  int,
  p_display_name        text
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.leaderboard (user_id, display_name, best_floor, best_act, total_dust, act1_clear_seconds)
    values (auth.uid(), p_display_name, greatest(1, p_best_floor), greatest(1, p_best_act),
            greatest(0::bigint, p_total_dust), p_act1_clear_seconds)
  on conflict (user_id) do update
    set best_floor         = greatest(public.leaderboard.best_floor,    excluded.best_floor),
        best_act           = greatest(public.leaderboard.best_act,      excluded.best_act),
        total_dust         = greatest(public.leaderboard.total_dust,    excluded.total_dust),
        -- For speedrun column, lower is better; null is "never cleared yet".
        act1_clear_seconds = case
          when public.leaderboard.act1_clear_seconds is null then excluded.act1_clear_seconds
          when excluded.act1_clear_seconds is null           then public.leaderboard.act1_clear_seconds
          else least(public.leaderboard.act1_clear_seconds, excluded.act1_clear_seconds)
        end,
        display_name = excluded.display_name;
end; $$;

revoke all on function public.submit_score(int, int, bigint, int, text) from public;
grant execute on function public.submit_score(int, int, bigint, int, text) to authenticated;
