-- Fast finance KPI aggregates (avoid downloading full transaksi rows into the app server).

CREATE OR REPLACE FUNCTION public.admin_sum_transaksi_by_status(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_to_exclusive timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT jsonb_build_object(
    'success', coalesce(sum(abs(amount_idr)) FILTER (
      WHERE lower(trim(coalesce(status, ''))) IN (
        'success', 'succeeded', 'completed', 'paid', 'settled', 'payout'
      )
    ), 0),
    'pending', coalesce(sum(abs(amount_idr)) FILTER (
      WHERE lower(trim(coalesce(status, ''))) IN (
        'pending', 'processing', 'waiting', 'waiting_payment'
      )
      OR (
        lower(trim(coalesce(status, ''))) <> ''
        AND lower(trim(coalesce(status, ''))) NOT IN (
          'success', 'succeeded', 'completed', 'paid', 'settled', 'payout',
          'refund', 'refunded', 'reversed',
          'pending', 'processing', 'waiting', 'waiting_payment'
        )
      )
    ), 0),
    'refund', coalesce(sum(abs(amount_idr)) FILTER (
      WHERE lower(trim(coalesce(status, ''))) IN (
        'refund', 'refunded', 'reversed'
      )
    ), 0)
  )
  FROM public.transaksi
  WHERE (p_from IS NULL OR created_at >= p_from)
    AND (p_to_exclusive IS NULL OR created_at < p_to_exclusive)
    AND (
      p_to_exclusive IS NOT NULL
      OR p_to IS NULL
      OR created_at <= p_to
    );
$$;

GRANT EXECUTE ON FUNCTION public.admin_sum_transaksi_by_status(timestamptz, timestamptz, timestamptz)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_sum_transaksi_by_status IS
  'KPI sum amount_idr by normalized status bucket; mirrors dashboard-padel normalizedTxnStatus.';
