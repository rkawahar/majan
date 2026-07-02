create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (char_length(display_name) between 1 and 24),
  created_at timestamptz not null default now()
);

create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  played_at timestamptz not null,
  section_no integer not null check (section_no > 0),
  match_no integer not null check (match_no between 1 and 16),
  created_at timestamptz not null default now()
);

create table if not exists match_results (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  player_id uuid not null references players(id) on delete restrict,
  seat text not null check (seat in ('東', '南', '西', '北')),
  raw_score integer not null,
  rank_label text not null,
  rank_value numeric not null,
  rank_point numeric not null,
  game_score numeric not null,
  created_at timestamptz not null default now(),
  unique(match_id, player_id),
  unique(match_id, seat)
);

alter table players enable row level security;
alter table matches enable row level security;
alter table match_results enable row level security;

create policy "public read players" on players for select using (true);
create policy "public insert players" on players for insert with check (true);
create policy "public update players" on players for update using (true) with check (true);
create policy "public delete players" on players for delete using (true);

create policy "public read matches" on matches for select using (true);
create policy "public insert matches" on matches for insert with check (true);
create policy "public update matches" on matches for update using (true) with check (true);
create policy "public delete matches" on matches for delete using (true);

create policy "public read match_results" on match_results for select using (true);
create policy "public insert match_results" on match_results for insert with check (true);
create policy "public delete match_results" on match_results for delete using (true);
