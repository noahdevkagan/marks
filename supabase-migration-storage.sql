-- Storage system migration
-- Run this in Supabase SQL Editor

-- Track per-user storage usage
CREATE TABLE IF NOT EXISTS user_storage (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  bytes_used bigint NOT NULL DEFAULT 0,
  storage_limit bigint NOT NULL DEFAULT 1073741824, -- 1 GB in bytes
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_storage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own storage" ON user_storage
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own storage" ON user_storage
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own storage" ON user_storage
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Track individual stored media files
CREATE TABLE IF NOT EXISTS stored_media (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bookmark_id bigint NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  media_type text NOT NULL, -- 'html_archive', 'thumbnail', 'image', 'og_image'
  original_url text,
  file_size bigint NOT NULL DEFAULT 0,
  content_type text, -- MIME type
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stored_media_bookmark ON stored_media(bookmark_id);
CREATE INDEX IF NOT EXISTS idx_stored_media_user ON stored_media(user_id);

ALTER TABLE stored_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own media" ON stored_media
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own media" ON stored_media
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own media" ON stored_media
  FOR DELETE USING (auth.uid() = user_id);

-- Atomic function to increment storage usage
CREATE OR REPLACE FUNCTION increment_storage_usage(p_user_id uuid, p_bytes bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO user_storage (user_id, bytes_used, updated_at)
  VALUES (p_user_id, GREATEST(p_bytes, 0), now())
  ON CONFLICT (user_id) DO UPDATE
  SET bytes_used = GREATEST(user_storage.bytes_used + p_bytes, 0),
      updated_at = now();
END;
$$;

-- Initialize storage records for existing users
INSERT INTO user_storage (user_id)
SELECT id FROM auth.users
ON CONFLICT DO NOTHING;
