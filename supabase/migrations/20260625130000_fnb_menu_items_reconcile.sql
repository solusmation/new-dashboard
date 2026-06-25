-- Selaraskan fnb_menu_items dengan skema yang sudah ada di production (food/drink).
-- Tambah kolom opsional tanpa mengubah data menu yang sudah ada.

ALTER TABLE public.fnb_menu_items
  ADD COLUMN IF NOT EXISTS image_storage_path text NULL;

ALTER TABLE public.fnb_menu_items
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS fnb_menu_items_updated_at ON public.fnb_menu_items;
CREATE TRIGGER fnb_menu_items_updated_at
  BEFORE UPDATE ON public.fnb_menu_items
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
