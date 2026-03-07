-- Kindle highlights sync migration
-- Run this in Supabase SQL Editor
-- Stores Kindle highlight data per user for cross-device access (mobile PWA)

CREATE TABLE IF NOT EXISTS kindle_data (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE kindle_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own kindle data" ON kindle_data
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own kindle data" ON kindle_data
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own kindle data" ON kindle_data
  FOR UPDATE USING (auth.uid() = user_id);
