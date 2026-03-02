-- Migration: AI enrichment for bookmarks (summaries, actions, smart tags)

-- 1. AI-generated enrichment per bookmark
create table bookmark_enrichments (
  bookmark_id bigint primary key references bookmarks(id) on delete cascade,
  summary text,
  action_items jsonb default '[]',
  ai_tags text[] default '{}',
  model text,
  processed_at timestamptz not null default now()
);

-- 2. RLS policies (scoped through bookmarks.user_id)
alter table bookmark_enrichments enable row level security;

create policy "Users can view own bookmark_enrichments"
  on bookmark_enrichments for select
  using (
    exists (
      select 1 from bookmarks
      where bookmarks.id = bookmark_enrichments.bookmark_id
      and bookmarks.user_id = auth.uid()
    )
  );

create policy "Users can insert own bookmark_enrichments"
  on bookmark_enrichments for insert
  with check (
    exists (
      select 1 from bookmarks
      where bookmarks.id = bookmark_enrichments.bookmark_id
      and bookmarks.user_id = auth.uid()
    )
  );

create policy "Users can update own bookmark_enrichments"
  on bookmark_enrichments for update
  using (
    exists (
      select 1 from bookmarks
      where bookmarks.id = bookmark_enrichments.bookmark_id
      and bookmarks.user_id = auth.uid()
    )
  );
