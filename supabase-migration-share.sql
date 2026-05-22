-- Migration: Public share links for bookmarks
-- Run in Supabase SQL Editor

-- 1. Add share columns to bookmarks
alter table bookmarks add column if not exists share_slug text unique;
alter table bookmarks add column if not exists is_public boolean not null default false;
alter table bookmarks add column if not exists shared_at timestamptz;

create index if not exists bookmarks_share_slug_idx on bookmarks(share_slug) where share_slug is not null;
create index if not exists bookmarks_is_public_idx on bookmarks(is_public) where is_public = true;

-- 2. RLS: allow anyone (including anon) to read a bookmark when it's public
-- Existing "Users can view own bookmarks" policy stays in place; this is an additional
-- permissive policy ORed with the others.
drop policy if exists "Anyone can view public bookmarks" on bookmarks;
create policy "Anyone can view public bookmarks"
  on bookmarks for select
  using (is_public = true);

-- 3. RLS: allow anyone to read archived_content when the parent bookmark is public
drop policy if exists "Anyone can view public archived_content" on archived_content;
create policy "Anyone can view public archived_content"
  on archived_content for select
  using (
    exists (
      select 1 from bookmarks
      where bookmarks.id = archived_content.bookmark_id
      and bookmarks.is_public = true
    )
  );

-- 4. RLS: allow anyone to read bookmark_tags + tags when bookmark is public
drop policy if exists "Anyone can view public bookmark_tags" on bookmark_tags;
create policy "Anyone can view public bookmark_tags"
  on bookmark_tags for select
  using (
    exists (
      select 1 from bookmarks
      where bookmarks.id = bookmark_tags.bookmark_id
      and bookmarks.is_public = true
    )
  );

-- 5. Public profile lookup: expose minimal owner info (display name) for share banner
-- We do NOT expose auth.users directly. Instead, we add an owner_display column
-- that gets populated lazily when a bookmark is first shared.
alter table bookmarks add column if not exists owner_display text;
