-- Run this in the Supabase SQL Editor to create the tag counting function.
-- This replaces client-side counting with a single GROUP BY query in Postgres.

CREATE OR REPLACE FUNCTION get_tag_counts()
RETURNS TABLE(name TEXT, count BIGINT)
LANGUAGE sql SECURITY INVOKER
AS $$
  SELECT t.name, COUNT(*)::BIGINT
  FROM bookmark_tags bt
  JOIN tags t ON bt.tag_id = t.id
  JOIN bookmarks b ON bt.bookmark_id = b.id
  WHERE b.user_id = auth.uid()
  GROUP BY t.name
  ORDER BY COUNT(*) DESC;
$$;
