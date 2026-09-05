-- Admin can add/subtract wallet coins per user (bypasses profiles_block_protected_updates).
-- Add: coins + lifetime_coins (counts toward tier). Subtract: wallet only, floor 0.

CREATE OR REPLACE FUNCTION public.admin_adjust_user_coins(
  p_user_id uuid,
  p_delta integer
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coins integer;
  v_lifetime integer;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User required';
  END IF;

  IF p_delta IS NULL OR p_delta = 0 THEN
    RAISE EXCEPTION 'Delta koin tidak boleh 0';
  END IF;

  IF abs(p_delta) > 1000000 THEN
    RAISE EXCEPTION 'Delta koin terlalu besar';
  END IF;

  PERFORM set_config('app.bypass_profile_guard', 'on', true);

  IF p_delta > 0 THEN
    UPDATE public.profiles
    SET
      coins = coins + p_delta,
      lifetime_coins = lifetime_coins + p_delta,
      updated_at = now()
    WHERE user_id = p_user_id
    RETURNING coins, lifetime_coins INTO v_coins, v_lifetime;
  ELSE
    UPDATE public.profiles
    SET
      coins = GREATEST(0, coins + p_delta),
      updated_at = now()
    WHERE user_id = p_user_id
    RETURNING coins, lifetime_coins INTO v_coins, v_lifetime;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profil pengguna tidak ditemukan';
  END IF;

  RETURN json_build_object(
    'coins', v_coins,
    'lifetime_coins', v_lifetime,
    'delta', p_delta
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_adjust_user_coins(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_adjust_user_coins(uuid, integer) TO service_role;

COMMENT ON FUNCTION public.admin_adjust_user_coins(uuid, integer) IS
  'Dashboard admin: tambah/kurang Star Poin wallet. Tambah juga naikkan lifetime; kurangi hanya wallet (min 0).';
