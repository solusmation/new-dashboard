-- Sinkronkan fnb_orders (aplikasi user) ke transaksi_fnb (dashboard admin).

ALTER TABLE public.transaksi_fnb
  ADD COLUMN IF NOT EXISTS fnb_order_id uuid NULL REFERENCES public.fnb_orders (id) ON DELETE SET NULL;

ALTER TABLE public.transaksi_fnb
  ADD COLUMN IF NOT EXISTS court_number integer NULL;

CREATE UNIQUE INDEX IF NOT EXISTS transaksi_fnb_fnb_order_id_uidx
  ON public.transaksi_fnb (fnb_order_id)
  WHERE fnb_order_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Status mapping
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.map_fnb_order_status_to_transaksi(p_status text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(trim(coalesce(p_status, '')))
    WHEN 'pending' THEN 'pending'
    WHEN 'confirmed' THEN 'paid'
    WHEN 'delivered' THEN 'paid'
    WHEN 'cancelled' THEN 'cancelled'
    ELSE 'pending'
  END;
$$;

CREATE OR REPLACE FUNCTION public.map_transaksi_fnb_status_to_fnb_order(p_status text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(trim(coalesce(p_status, '')))
    WHEN 'pending' THEN 'pending'
    WHEN 'paid' THEN 'confirmed'
    WHEN 'cancelled' THEN 'cancelled'
    WHEN 'refunded' THEN 'cancelled'
    ELSE 'pending'
  END;
$$;

-- ---------------------------------------------------------------------------
-- Sync fnb_orders -> transaksi_fnb (+ items)
-- ---------------------------------------------------------------------------

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
BEGIN
  SELECT * INTO v_order FROM public.fnb_orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pesanan FnB tidak ditemukan';
  END IF;

  SELECT id INTO v_tx_id FROM public.transaksi_fnb WHERE fnb_order_id = p_order_id;

  IF v_tx_id IS NULL THEN
    INSERT INTO public.transaksi_fnb (
      user_id,
      total_amount_idr,
      status,
      notes,
      metode_pembayaran_id,
      fnb_order_id,
      court_number,
      created_at
    )
    VALUES (
      v_order.user_id,
      v_order.total_amount_idr::integer,
      public.map_fnb_order_status_to_transaksi(v_order.status),
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
      status = public.map_fnb_order_status_to_transaksi(v_order.status),
      total_amount_idr = v_order.total_amount_idr::integer,
      metode_pembayaran_id = v_order.metode_pembayaran_id,
      court_number = v_order.court_number,
      notes = format('Pengantaran Lapangan %s', v_order.court_number)
    WHERE id = v_tx_id;

    DELETE FROM public.transaksi_fnb_items WHERE transaksi_fnb_id = v_tx_id;
  END IF;

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

  RETURN v_tx_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_fnb_order_to_transaksi_fnb(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Patch complete_fnb_order: sync ke transaksi_fnb setelah item tersimpan
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.complete_fnb_order(
  p_court_number integer,
  p_items jsonb,
  p_metode_code text DEFAULT 'card'::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_order_id uuid;
  v_metode_id uuid;
  v_transaksi_id uuid;
  v_subtotal bigint := 0;
  v_total_qty int := 0;
  v_item jsonb;
  v_menu public.fnb_menu_items%ROWTYPE;
  v_qty int;
  v_line_total bigint;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_court_number IS NULL OR p_court_number < 1 OR p_court_number > 4 THEN
    RAISE EXCEPTION 'Pilih lapangan pengantaran (1-4)';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Keranjang kosong';
  END IF;

  SELECT m.id INTO v_metode_id
  FROM public.metode_pembayaran m
  WHERE m.code = lower(trim(p_metode_code)) AND m.is_active = true
  LIMIT 1;
  IF v_metode_id IS NULL THEN RAISE EXCEPTION 'Invalid payment method'; END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := (v_item->>'quantity')::int;
    IF v_qty IS NULL OR v_qty < 1 THEN
      RAISE EXCEPTION 'Quantity tidak valid';
    END IF;

    SELECT * INTO v_menu FROM public.fnb_menu_items
    WHERE id = (v_item->>'menu_item_id')::uuid AND is_available = true;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Menu tidak tersedia: %', v_item->>'menu_item_id';
    END IF;

    v_line_total := v_menu.price_idr * v_qty;
    v_subtotal := v_subtotal + v_line_total;
    v_total_qty := v_total_qty + v_qty;
  END LOOP;

  IF v_subtotal <= 0 THEN RAISE EXCEPTION 'Total pesanan tidak valid'; END IF;

  INSERT INTO public.fnb_orders (
    user_id, court_number, subtotal_idr, total_amount_idr, status, item_count, metode_pembayaran_id
  )
  VALUES (
    v_user, p_court_number, v_subtotal, v_subtotal, 'confirmed', v_total_qty, v_metode_id
  )
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := (v_item->>'quantity')::int;
    SELECT * INTO v_menu FROM public.fnb_menu_items
    WHERE id = (v_item->>'menu_item_id')::uuid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Menu tidak ditemukan: %', v_item->>'menu_item_id';
    END IF;
    v_line_total := v_menu.price_idr * v_qty;

    INSERT INTO public.fnb_order_items (
      order_id, menu_item_id, item_name, quantity, unit_price_idr, line_total_idr
    )
    VALUES (
      v_order_id, v_menu.id, v_menu.name, v_qty, v_menu.price_idr, v_line_total
    );
  END LOOP;

  v_transaksi_id := public.record_transaksi(
    v_user, NULL, 'fnb_order', v_order_id, NULL, v_subtotal, 'fnb_order',
    jsonb_build_object(
      'court_number', p_court_number,
      'order_id', v_order_id,
      'item_count', v_total_qty,
      'metode_code', lower(trim(p_metode_code))
    ),
    v_metode_id
  );

  UPDATE public.fnb_orders
  SET transaksi_id = v_transaksi_id
  WHERE id = v_order_id;

  PERFORM public.sync_fnb_order_to_transaksi_fnb(v_order_id);

  PERFORM public.notify_user(
    v_user,
    'fnb_order_confirmed',
    'Pesanan FnB diterima',
    format('Pesanan Anda akan diantar ke Lapangan %s.', p_court_number),
    jsonb_build_object('fnb_order_id', v_order_id, 'court_number', p_court_number)
  );

  RETURN v_order_id;
END;
$$;

-- Sync saat status pesanan di aplikasi berubah
CREATE OR REPLACE FUNCTION public.trg_fnb_orders_sync_transaksi_fnb()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  PERFORM public.sync_fnb_order_to_transaksi_fnb(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fnb_orders_after_update_sync_transaksi_fnb ON public.fnb_orders;
CREATE TRIGGER fnb_orders_after_update_sync_transaksi_fnb
  AFTER UPDATE OF status, total_amount_idr, court_number ON public.fnb_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fnb_orders_sync_transaksi_fnb();

-- ---------------------------------------------------------------------------
-- Backfill pesanan yang sudah ada
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM public.fnb_orders ORDER BY created_at
  LOOP
    PERFORM public.sync_fnb_order_to_transaksi_fnb(r.id);
  END LOOP;
END;
$$;

-- Admin update transaksi_fnb -> sinkron balik ke fnb_orders
CREATE OR REPLACE FUNCTION public.update_transaksi_fnb_status(
  p_transaksi_fnb_id uuid,
  p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_fnb_order_id uuid;
  v_mapped_order_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_status NOT IN ('pending', 'paid', 'cancelled', 'refunded') THEN
    RAISE EXCEPTION 'Status tidak valid';
  END IF;

  IF NOT public.is_superadmin(auth.uid()) AND p_status <> 'cancelled' THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT fnb_order_id INTO v_fnb_order_id
  FROM public.transaksi_fnb
  WHERE id = p_transaksi_fnb_id
    AND (
      public.is_superadmin(auth.uid())
      OR (user_id = auth.uid() AND p_status = 'cancelled' AND status = 'pending')
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaksi tidak ditemukan atau tidak dapat diubah';
  END IF;

  UPDATE public.transaksi_fnb
  SET status = p_status
  WHERE id = p_transaksi_fnb_id;

  IF v_fnb_order_id IS NOT NULL THEN
    v_mapped_order_status := public.map_transaksi_fnb_status_to_fnb_order(p_status);
    UPDATE public.fnb_orders
    SET status = v_mapped_order_status
    WHERE id = v_fnb_order_id;
  END IF;
END;
$$;
