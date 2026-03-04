-- Migration: Reading stats tracking
-- Run this in Supabase SQL Editor

-- Track individual reading sessions
create table reading_sessions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  bookmark_id bigint not null references bookmarks(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds int not null default 0,
  word_count int not null default 0,
  finished boolean not null default false
);

create index reading_sessions_user_idx on reading_sessions(user_id, started_at desc);
create index reading_sessions_bookmark_idx on reading_sessions(bookmark_id);

-- RLS
alter table reading_sessions enable row level security;

create policy "Users can read own sessions"
  on reading_sessions for select
  using (auth.uid() = user_id);

create policy "Users can insert own sessions"
  on reading_sessions for insert
  with check (auth.uid() = user_id);

create policy "Users can update own sessions"
  on reading_sessions for update
  using (auth.uid() = user_id);

-- Helper: get reading stats for a user
create or replace function get_reading_stats(user_uuid uuid)
returns json
language sql stable
as $$
  select json_build_object(
    'total_articles_read', (
      select count(distinct bookmark_id)
      from reading_sessions
      where user_id = user_uuid and duration_seconds > 10
    ),
    'total_words_read', (
      select coalesce(sum(word_count), 0)
      from reading_sessions
      where user_id = user_uuid and duration_seconds > 10
    ),
    'total_reading_seconds', (
      select coalesce(sum(duration_seconds), 0)
      from reading_sessions
      where user_id = user_uuid
    ),
    'articles_this_week', (
      select count(distinct bookmark_id)
      from reading_sessions
      where user_id = user_uuid
        and duration_seconds > 10
        and started_at >= date_trunc('week', now())
    ),
    'articles_this_month', (
      select count(distinct bookmark_id)
      from reading_sessions
      where user_id = user_uuid
        and duration_seconds > 10
        and started_at >= date_trunc('month', now())
    ),
    'streak_days', (
      select count(*)::int from (
        select distinct date_trunc('day', started_at)::date as d
        from reading_sessions
        where user_id = user_uuid and duration_seconds > 10
        order by d desc
      ) sub
      where d >= current_date - (
        select count(*)::int from (
          select distinct date_trunc('day', started_at)::date as d2
          from reading_sessions
          where user_id = user_uuid and duration_seconds > 10
            and started_at >= current_date - interval '365 days'
          order by d2 desc
        ) s2
      )
    ),
    'daily_reading', (
      select coalesce(json_agg(row_to_json(t)), '[]'::json) from (
        select
          date_trunc('day', started_at)::date as day,
          count(distinct bookmark_id) as articles,
          coalesce(sum(duration_seconds), 0) as seconds,
          coalesce(sum(word_count), 0) as words
        from reading_sessions
        where user_id = user_uuid
          and started_at >= current_date - interval '30 days'
        group by 1
        order by 1
      ) t
    ),
    'top_reading_days', (
      select coalesce(json_agg(row_to_json(t)), '[]'::json) from (
        select
          date_trunc('day', started_at)::date as day,
          count(distinct bookmark_id) as articles,
          coalesce(sum(word_count), 0) as words
        from reading_sessions
        where user_id = user_uuid and duration_seconds > 10
        group by 1
        order by words desc
        limit 5
      ) t
    )
  );
$$;
