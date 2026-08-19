-- Admin-managed star rewards catalog (redeemable with profiles.coins / Star).

CREATE TABLE IF NOT EXISTS public.rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  how_to_use text NOT NULL DEFAULT '',
  terms_and_conditions text NOT NULL DEFAULT '',
  star_cost integer NOT NULL,
  reward_type text NOT NULL DEFAULT 'other',
  stock_limit integer NULL,
  redeemed_count integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  image_storage_path text NULL,
  image_url text NULL,
  created_by uuid NULL REFERENCES public.profiles (user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rewards_star_cost_check CHECK (star_cost > 0),
  CONSTRAINT rewards_stock_limit_check CHECK (stock_limit IS NULL OR stock_limit > 0),
  CONSTRAINT rewards_redeemed_count_check CHECK (redeemed_count >= 0),
  CONSTRAINT rewards_stock_redeemed_check CHECK (
    stock_limit IS NULL OR redeemed_count <= stock_limit
  ),
  CONSTRAINT rewards_reward_type_check CHECK (
    reward_type IN ('voucher_discount', 'goods', 'fnb_discount', 'free_fnb', 'other')
  )
);

CREATE INDEX IF NOT EXISTS rewards_is_active_idx
  ON public.rewards (is_active);

CREATE INDEX IF NOT EXISTS rewards_created_at_idx
  ON public.rewards (created_at DESC);

COMMENT ON TABLE public.rewards IS
  'Katalog reward admin — ditukar dengan Star (profiles.coins). Stok habis otomatis nonaktif.';

DROP TRIGGER IF EXISTS rewards_set_updated_at ON public.rewards;
CREATE TRIGGER rewards_set_updated_at
  BEFORE UPDATE ON public.rewards
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.rewards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Rewards superadmin select" ON public.rewards;
CREATE POLICY "Rewards superadmin select"
  ON public.rewards FOR SELECT TO authenticated
  USING (public.is_superadmin(auth.uid()));

DROP POLICY IF EXISTS "Rewards superadmin insert" ON public.rewards;
CREATE POLICY "Rewards superadmin insert"
  ON public.rewards FOR INSERT TO authenticated
  WITH CHECK (public.is_superadmin(auth.uid()));

DROP POLICY IF EXISTS "Rewards superadmin update" ON public.rewards;
CREATE POLICY "Rewards superadmin update"
  ON public.rewards FOR UPDATE TO authenticated
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));

DROP POLICY IF EXISTS "Rewards superadmin delete" ON public.rewards;
CREATE POLICY "Rewards superadmin delete"
  ON public.rewards FOR DELETE TO authenticated
  USING (public.is_superadmin(auth.uid()));
