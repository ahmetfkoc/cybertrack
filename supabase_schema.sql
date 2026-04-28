-- CyberTrack Schema
-- Run this in Supabase: SQL Editor → New Query → paste and run

create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  category text not null,
  status text not null default 'pending' check (status in ('pending','in_progress','done')),
  week_start date not null,
  completed_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists activity_log (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid references goals(id) on delete cascade,
  action text not null,
  note text,
  created_at timestamptz default now()
);

-- Enable Row Level Security (open for single user app)
alter table goals enable row level security;
alter table activity_log enable row level security;

create policy "Allow all" on goals for all using (true) with check (true);
create policy "Allow all" on activity_log for all using (true) with check (true);
