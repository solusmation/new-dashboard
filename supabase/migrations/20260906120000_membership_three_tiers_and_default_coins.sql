-- Membership: Basic / Silver / Gold only (remove bronze)
-- New-user coins: configurable via club_settings (no more hardcoded 999)

-- 1) club_settings singleton for admin-editable defaults
CREATE TABLE IF NOT EXISTS public.club_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  default_new_user_coins integer NOT NULL DEFAULT 0 CHECK (default_new_user_coins >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NULL
);

INSERT INTO public.club_settings (id, default_new_user_coins)
VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.club_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Superadmin can read club_settings" ON public.club_settings;
CREATE POLICY "Superadmin can read club_settings"
  ON public.club_settings
  FOR SELECT
  TO authenticated
  USING (public.is_superadmin(auth.uid()));

DROP POLICY IF EXISTS "Superadmin can update club_settings" ON public.club_settings;
CREATE POLICY "Superadmin can update club_settings"
  ON public.club_settings
  FOR UPDATE
  TO authenticated
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));

-- 2) tier_from_coins: 3 tiers (basic < 1000, silver >= 1000, gold >= 2000)
CREATE OR REPLACE FUNCTION public.tier_from_coins(p_coins integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_coins >= 2000 THEN 'gold'
    WHEN p_coins >= 1000 THEN 'silver'
    ELSE 'basic'
  END;
$$;

-- 3) Remap existing bronze rows, then tighten CHECK constraint
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_membership_tier_check;

UPDATE public.profiles
SET membership_tier = public.tier_from_coins(GREATEST(COALESCE(lifetime_coins, 0), COALESCE(coins, 0)))
WHERE membership_tier = 'bronze'
   OR membership_tier IS DISTINCT FROM public.tier_from_coins(GREATEST(COALESCE(lifetime_coins, 0), COALESCE(coins, 0)));

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_membership_tier_check
  CHECK (membership_tier IN ('basic', 'silver', 'gold'));

-- 4) Column defaults: no more auto 999
ALTER TABLE public.profiles ALTER COLUMN coins SET DEFAULT 0;
ALTER TABLE public.profiles ALTER COLUMN lifetime_coins SET DEFAULT 0;

-- 5) Signup: read default coins from club_settings
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_username text;
  v_coins integer := 0;
BEGIN
  v_username := lower(nullif(trim(NEW.raw_user_meta_data->>'username'), ''));

  SELECT COALESCE(default_new_user_coins, 0)
  INTO v_coins
  FROM public.club_settings
  WHERE id = 1;

  IF v_coins IS NULL OR v_coins < 0 THEN
    v_coins := 0;
  END IF;

  INSERT INTO public.profiles (user_id, display_name, username, coins, lifetime_coins, membership_tier)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email),
    v_username,
    v_coins,
    v_coins,
    public.tier_from_coins(v_coins)
  );

  RETURN NEW;
END;
$$;

COMMENT ON TABLE public.club_settings IS 'Singleton pengaturan klub (default koin user baru, dll). Diedit via dashboard admin.';
COMMENT ON COLUMN public.club_settings.default_new_user_coins IS 'Koin awal (wallet + lifetime) untuk setiap user baru saat signup.';
