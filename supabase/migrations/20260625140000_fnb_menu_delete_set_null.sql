-- Izinkan hapus menu meski sudah pernah dipesan (riwayat order tetap ada, menu_item_id jadi null).

ALTER TABLE public.fnb_order_items
  DROP CONSTRAINT IF EXISTS fnb_order_items_menu_item_id_fkey;

ALTER TABLE public.fnb_order_items
  ADD CONSTRAINT fnb_order_items_menu_item_id_fkey
  FOREIGN KEY (menu_item_id)
  REFERENCES public.fnb_menu_items (id)
  ON DELETE SET NULL;
