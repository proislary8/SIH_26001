-- ================================================
-- Migration 004: Auto-create user_profiles on signup
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor)
-- ================================================

-- Function: called by trigger whenever a new auth user is created
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, full_name, role, preferred_language)
  VALUES (
    NEW.id,
    -- Pull full_name from signup metadata if provided, else use email prefix
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      split_part(NEW.email, '@', 1)
    ),
    'citizen',   -- default role for all new signups
    'en'         -- default language
  )
  ON CONFLICT (id) DO NOTHING;  -- safe if row already exists
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: fires after every new row in auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
