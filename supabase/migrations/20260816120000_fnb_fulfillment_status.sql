-- Status pemenuhan pesanan FnB (Confirm / Cancel), terpisah dari status pembayaran.
-- Tidak menghapus transaksi atau item. Data lama dianggap Confirm.

ALTER TABLE public.transaksi_fnb
  ADD COLUMN IF NOT EXISTS fulfillment_status text NOT NULL DEFAULT 'confirmed';

ALTER TABLE public.transaksi_fnb
  DROP CONSTRAINT IF EXISTS transaksi_fnb_fulfillment_status_check;

ALTER TABLE public.transaksi_fnb
  ADD CONSTRAINT transaksi_fnb_fulfillment_status_check
  CHECK (fulfillment_status IN ('confirmed', 'cancelled'));

COMMENT ON COLUMN public.transaksi_fnb.fulfillment_status IS
  'Pemenuhan pesanan: confirmed (Confirm) atau cancelled (Cancel). Pembayaran tetap di kolom status.';

CREATE OR REPLACE FUNCTION public.map_fnb_order_to_fulfillment(p_status text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(trim(coalesce(p_status, '')))
    WHEN 'cancelled' THEN 'cancelled'
    ELSE 'confirmed'
  END;
$$;

-- Sinkron header saja; item yang sudah ada tidak dihapus.
CREATE OR REPLACE FUNCTION public.sync_fnb_order_to_transaksi_fnb(p_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_order public.fnb_orders%ROWTYPE;
  v_tx_id uuid;
  v_item public.fnb_order_items%ROWTYPE;
  v_category text;
  v_fulfillment text;
  v_has_items boolean;
BEGIN
  SELECT * INTO v_order FROM public.fnb_orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pesanan FnB tidak ditemukan';
  END IF;

  v_fulfillment := public.map_fnb_order_to_fulfillment(v_order.status);

  SELECT id INTO v_tx_id FROM public.transaksi_fnb WHERE fnb_order_id = p_order_id;

  IF v_tx_id IS NULL THEN
    INSERT INTO public.transaksi_fnb (
      user_id,
      total_amount_idr,
      status,
      fulfillment_status,
      notes,
      metode_pembayaran_id,
      fnb_order_id,
      court_number,
      created_at
    )
    VALUES (
      v_order.user_id,
      v_order.total_amount_idr::integer,
      'paid',
      v_fulfillment,
      format('Pengantaran Lapangan %s', v_order.court_number),
      v_order.metode_pembayaran_id,
      v_order.id,
      v_order.court_number,
      v_order.created_at
    )
    RETURNING id INTO v_tx_id;
  ELSE
    UPDATE public.transaksi_fnb
    SET
      fulfillment_status = v_fulfillment,
      total_amount_idr = v_order.total_amount_idr::integer,
      metode_pembayaran_id = v_order.metode_pembayaran_id,
      court_number = v_order.court_number,
      notes = format('Pengantaran Lapangan %s', v_order.court_number)
    WHERE id = v_tx_id;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.transaksi_fnb_items WHERE transaksi_fnb_id = v_tx_id
  ) INTO v_has_items;

  IF NOT v_has_items THEN
    FOR v_item IN
      SELECT * FROM public.fnb_order_items WHERE order_id = p_order_id ORDER BY created_at
    LOOP
      SELECT m.category INTO v_category
      FROM public.fnb_menu_items m
      WHERE m.id = v_item.menu_item_id;

      INSERT INTO public.transaksi_fnb_items (
        transaksi_fnb_id,
        fnb_menu_item_id,
        menu_name,
        menu_category,
        unit_price_idr,
        quantity,
        subtotal_idr
      )
      VALUES (
        v_tx_id,
        v_item.menu_item_id,
        v_item.item_name,
        coalesce(v_category, 'food'),
        v_item.unit_price_idr::integer,
        v_item.quantity,
        v_item.line_total_idr::integer
      );
    END LOOP;
  END IF;

  RETURN v_tx_id;
END;
$$;

UPDATE public.transaksi_fnb t
SET fulfillment_status = public.map_fnb_order_to_fulfillment(o.status)
FROM public.fnb_orders o
WHERE t.fnb_order_id = o.id
  AND t.fulfillment_status IS DISTINCT FROM public.map_fnb_order_to_fulfillment(o.status);

UPDATE public.transaksi_fnb
SET fulfillment_status = 'confirmed'
WHERE fulfillment_status IS DISTINCT FROM 'cancelled';

CREATE OR REPLACE FUNCTION public.trg_fnb_orders_sync_transaksi_fnb()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND NEW.status IS DISTINCT FROM OLD.status
    AND NEW.total_amount_idr IS NOT DISTINCT FROM OLD.total_amount_idr
    AND NEW.court_number IS NOT DISTINCT FROM OLD.court_number
  THEN
    UPDATE public.transaksi_fnb
    SET fulfillment_status = public.map_fnb_order_to_fulfillment(NEW.status)
    WHERE fnb_order_id = NEW.id;
    RETURN NEW;
  END IF;

  PERFORM public.sync_fnb_order_to_transaksi_fnb(NEW.id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_transaksi_fnb_fulfillment(
  p_transaksi_fnb_id uuid,
  p_fulfillment_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_fnb_order_id uuid;
  v_order_status text;
BEGIN
  IF p_fulfillment_status NOT IN ('confirmed', 'cancelled') THEN
    RAISE EXCEPTION 'Status pemenuhan tidak valid';
  END IF;

  UPDATE public.transaksi_fnb
  SET fulfillment_status = p_fulfillment_status
  WHERE id = p_transaksi_fnb_id
  RETURNING fnb_order_id INTO v_fnb_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaksi tidak ditemukan';
  END IF;

  IF v_fnb_order_id IS NOT NULL THEN
    v_order_status := CASE
      WHEN p_fulfillment_status = 'cancelled' THEN 'cancelled'
      ELSE 'confirmed'
    END;
    UPDATE public.fnb_orders
    SET status = v_order_status
    WHERE id = v_fnb_order_id
      AND status IS DISTINCT FROM v_order_status;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_transaksi_fnb_fulfillment(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_transaksi_fnb_fulfillment(uuid, text) TO service_role;
