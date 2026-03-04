-- Add type column to bookmarks
ALTER TABLE bookmarks
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'article';

-- Add type-specific metadata (flexible JSONB)
ALTER TABLE bookmarks
  ADD COLUMN IF NOT EXISTS type_metadata jsonb DEFAULT '{}';

-- Index for filtering by type
CREATE INDEX IF NOT EXISTS bookmarks_type_idx ON bookmarks(type);

-- Backfill existing tweets
UPDATE bookmarks
SET type = 'tweet'
WHERE type = 'article'
  AND (url LIKE '%x.com/%/status/%' OR url LIKE '%twitter.com/%/status/%');

-- Backfill videos
UPDATE bookmarks
SET type = 'video'
WHERE type = 'article'
  AND (url LIKE '%youtube.com/watch%' OR url LIKE '%youtu.be/%' OR url LIKE '%vimeo.com/%');

-- Backfill PDFs
UPDATE bookmarks
SET type = 'pdf'
WHERE type = 'article'
  AND (url LIKE '%.pdf' OR url LIKE '%.pdf?%');

-- Backfill images
UPDATE bookmarks
SET type = 'image'
WHERE type = 'article'
  AND (url LIKE '%.jpg' OR url LIKE '%.jpeg' OR url LIKE '%.png'
    OR url LIKE '%.gif' OR url LIKE '%.webp' OR url LIKE '%.svg');
