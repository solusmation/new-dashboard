-- Aggregate voucher_codes counts without downloading every code row to the app server.

CREATE OR REPLACE FUNCTION public.admin_voucher_code_stats(p_voucher_ids uuid[])
RETURNS TABLE (voucher_id uuid, issued bigint, used bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT
    vc.voucher_id,
    count(*)::bigint AS issued,
    count(*) FILTER (WHERE vc.used_at IS NOT NULL)::bigint AS used
  FROM public.voucher_codes vc
  WHERE vc.voucher_id = ANY (p_voucher_ids)
  GROUP BY vc.voucher_id;
$$;

GRANT EXECUTE ON FUNCTION public.admin_voucher_code_stats(uuid[])
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_program_participant_counts(p_program_ids uuid[])
RETURNS TABLE (program_id uuid, participant_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT
    pp.program_id,
    count(*)::bigint AS participant_count
  FROM public.program_participants pp
  WHERE pp.program_id = ANY (p_program_ids)
  GROUP BY pp.program_id;
$$;

GRANT EXECUTE ON FUNCTION public.admin_program_participant_counts(uuid[])
  TO authenticated, service_role;
