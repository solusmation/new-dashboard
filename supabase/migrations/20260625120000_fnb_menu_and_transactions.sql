-- FnB menu items + transaksi pembelian makanan/minuman

-- ---------------------------------------------------------------------------
-- fnb_menu_items
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.fnb_menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('makanan', 'minuman', 'snack', 'lainnya')),
  price_idr integer NOT NULL CHECK (price_idr >= 0),
  image_url text NOT NULL DEFAULT '',
  image_storage_path text NULL,
  description text NOT NULL DEFAULT '',
  is_available boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fnb_menu_items_category_idx ON public.fnb_menu_items (category);
CREATE INDEX IF NOT EXISTS fnb_menu_items_available_idx ON public.fnb_menu_items (is_available);
CREATE INDEX IF NOT EXISTS fnb_menu_items_sort_idx ON public.fnb_menu_items (sort_order, name);

COMMENT ON TABLE public.fnb_menu_items IS 'Menu makanan & minuman FnB yang ditampilkan di aplikasi.';

-- ---------------------------------------------------------------------------
-- transaksi_fnb (header pembelian)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.transaksi_fnb (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (user_id) ON DELETE RESTRICT,
  total_amount_idr integer NOT NULL CHECK (total_amount_idr >= 0),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'cancelled', 'refunded')),
  notes text NULL,
  metode_pembayaran_id uuid NULL REFERENCES public.metode_pembayaran (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS transaksi_fnb_user_idx ON public.transaksi_fnb (user_id);
CREATE INDEX IF NOT EXISTS transaksi_fnb_status_idx ON public.transaksi_fnb (status);
CREATE INDEX IF NOT EXISTS transaksi_fnb_created_at_idx ON public.transaksi_fnb (created_at DESC);

COMMENT ON TABLE public.transaksi_fnb IS 'Transaksi pembelian FnB oleh pengguna aplikasi.';

-- ---------------------------------------------------------------------------
-- transaksi_fnb_items (detail baris pesanan)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.transaksi_fnb_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaksi_fnb_id uuid NOT NULL REFERENCES public.transaksi_fnb (id) ON DELETE CASCADE,
  fnb_menu_item_id uuid NULL REFERENCES public.fnb_menu_items (id) ON DELETE SET NULL,
  menu_name text NOT NULL,
  menu_category text NOT NULL,
  unit_price_idr integer NOT NULL CHECK (unit_price_idr >= 0),
  quantity integer NOT NULL CHECK (quantity > 0),
  subtotal_idr integer NOT NULL CHECK (subtotal_idr >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS transaksi_fnb_items_tx_idx ON public.transaksi_fnb_items (transaksi_fnb_id);

COMMENT ON TABLE public.transaksi_fnb_items IS 'Detail item per transaksi FnB (snapshot harga & nama saat order).';

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fnb_menu_items_updated_at ON public.fnb_menu_items;
CREATE TRIGGER fnb_menu_items_updated_at
  BEFORE UPDATE ON public.fnb_menu_items
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS transaksi_fnb_updated_at ON public.transaksi_fnb;
CREATE TRIGGER transaksi_fnb_updated_at
  BEFORE UPDATE ON public.transaksi_fnb
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Storage bucket untuk foto menu
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'fnb-assets',
  'fnb-assets',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.fnb_menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaksi_fnb ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaksi_fnb_items ENABLE ROW LEVEL SECURITY;

-- Menu: semua user terautentikasi bisa baca menu tersedia; superadmin full access
DROP POLICY IF EXISTS "FnB menu readable" ON public.fnb_menu_items;
CREATE POLICY "FnB menu readable"
  ON public.fnb_menu_items
  FOR SELECT
  TO authenticated
  USING (is_available = true OR public.is_superadmin(auth.uid()));

DROP POLICY IF EXISTS "FnB menu superadmin insert" ON public.fnb_menu_items;
CREATE POLICY "FnB menu superadmin insert"
  ON public.fnb_menu_items
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_superadmin(auth.uid()));

DROP POLICY IF EXISTS "FnB menu superadmin update" ON public.fnb_menu_items;
CREATE POLICY "FnB menu superadmin update"
  ON public.fnb_menu_items
  FOR UPDATE
  TO authenticated
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));

DROP POLICY IF EXISTS "FnB menu superadmin delete" ON public.fnb_menu_items;
CREATE POLICY "FnB menu superadmin delete"
  ON public.fnb_menu_items
  FOR DELETE
  TO authenticated
  USING (public.is_superadmin(auth.uid()));

-- Transaksi FnB: user lihat milik sendiri; superadmin lihat semua
DROP POLICY IF EXISTS "Transaksi FnB readable" ON public.transaksi_fnb;
CREATE POLICY "Transaksi FnB readable"
  ON public.transaksi_fnb
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.is_superadmin(auth.uid()));

DROP POLICY IF EXISTS "Transaksi FnB insert own" ON public.transaksi_fnb;
CREATE POLICY "Transaksi FnB insert own"
  ON public.transaksi_fnb
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Transaksi FnB superadmin update" ON public.transaksi_fnb;
CREATE POLICY "Transaksi FnB superadmin update"
  ON public.transaksi_fnb
  FOR UPDATE
  TO authenticated
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));

-- Item transaksi: ikut akses header
DROP POLICY IF EXISTS "Transaksi FnB items readable" ON public.transaksi_fnb_items;
CREATE POLICY "Transaksi FnB items readable"
  ON public.transaksi_fnb_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.transaksi_fnb t
      WHERE t.id = transaksi_fnb_items.transaksi_fnb_id
        AND (t.user_id = auth.uid() OR public.is_superadmin(auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Transaksi FnB items insert own" ON public.transaksi_fnb_items;
CREATE POLICY "Transaksi FnB items insert own"
  ON public.transaksi_fnb_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.transaksi_fnb t
      WHERE t.id = transaksi_fnb_items.transaksi_fnb_id
        AND t.user_id = auth.uid()
    )
  );

-- Storage policies
DROP POLICY IF EXISTS "FnB assets public read" ON storage.objects;
CREATE POLICY "FnB assets public read"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'fnb-assets');

DROP POLICY IF EXISTS "FnB assets superadmin upload" ON storage.objects;
CREATE POLICY "FnB assets superadmin upload"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'fnb-assets'
    AND public.is_superadmin(auth.uid())
  );

DROP POLICY IF EXISTS "FnB assets superadmin update" ON storage.objects;
CREATE POLICY "FnB assets superadmin update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'fnb-assets' AND public.is_superadmin(auth.uid()))
  WITH CHECK (bucket_id = 'fnb-assets' AND public.is_superadmin(auth.uid()));

DROP POLICY IF EXISTS "FnB assets superadmin delete" ON storage.objects;
CREATE POLICY "FnB assets superadmin delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'fnb-assets' AND public.is_superadmin(auth.uid()));

-- ---------------------------------------------------------------------------
-- RPC: place_fnb_order — dipanggil dari aplikasi user
-- p_items: [{ "menu_item_id": "uuid", "quantity": 2 }, ...]
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.place_fnb_order(
  p_items jsonb,
  p_notes text DEFAULT NULL,
  p_metode_pembayaran_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_user_id uuid;
  v_tx_id uuid;
  v_item jsonb;
  v_menu_id uuid;
  v_qty integer;
  v_menu record;
  v_total integer := 0;
  v_subtotal integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Keranjang kosong';
  END IF;

  -- Validasi & hitung total
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_menu_id := (v_item ->> 'menu_item_id')::uuid;
    v_qty := (v_item ->> 'quantity')::integer;

    IF v_menu_id IS NULL OR v_qty IS NULL OR v_qty < 1 THEN
      RAISE EXCEPTION 'Item pesanan tidak valid';
    END IF;

    SELECT id, name, category, price_idr, is_available
    INTO v_menu
    FROM public.fnb_menu_items
    WHERE id = v_menu_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Menu tidak ditemukan: %', v_menu_id;
    END IF;

    IF NOT v_menu.is_available THEN
      RAISE EXCEPTION 'Menu "%" tidak tersedia', v_menu.name;
    END IF;

    v_subtotal := v_menu.price_idr * v_qty;
    v_total := v_total + v_subtotal;
  END LOOP;

  INSERT INTO public.transaksi_fnb (user_id, total_amount_idr, status, notes, metode_pembayaran_id)
  VALUES (v_user_id, v_total, 'pending', NULLIF(trim(p_notes), ''), p_metode_pembayaran_id)
  RETURNING id INTO v_tx_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_menu_id := (v_item ->> 'menu_item_id')::uuid;
    v_qty := (v_item ->> 'quantity')::integer;

    SELECT id, name, category, price_idr
    INTO v_menu
    FROM public.fnb_menu_items
    WHERE id = v_menu_id;

    v_subtotal := v_menu.price_idr * v_qty;

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
      v_menu.id,
      v_menu.name,
      v_menu.category,
      v_menu.price_idr,
      v_qty,
      v_subtotal
    );
  END LOOP;

  RETURN v_tx_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.place_fnb_order(jsonb, text, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- RPC: update transaksi FnB status (admin / payment callback)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_transaksi_fnb_status(
  p_transaksi_fnb_id uuid,
  p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
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

  UPDATE public.transaksi_fnb
  SET status = p_status
  WHERE id = p_transaksi_fnb_id
    AND (
      public.is_superadmin(auth.uid())
      OR (user_id = auth.uid() AND p_status = 'cancelled' AND status = 'pending')
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaksi tidak ditemukan atau tidak dapat diubah';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_transaksi_fnb_status(uuid, text) TO authenticated;
