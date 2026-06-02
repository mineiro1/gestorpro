-- Run this in the Supabase SQL Editor to completely disable RLS temporarily
-- and clear all policies to avoid any blocks.

ALTER TABLE clients DISABLE ROW LEVEL SECURITY;
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE visits DISABLE ROW LEVEL SECURITY;
ALTER TABLE payments DISABLE ROW LEVEL SECURITY;
ALTER TABLE agenda_contacts DISABLE ROW LEVEL SECURITY;
ALTER TABLE oneoffjobs DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS settings (
  id text primary key,
  monthlyPrice numeric,
  updated_at timestamp with time zone default timezone('utc'::text, now())
);
ALTER TABLE settings DISABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';

