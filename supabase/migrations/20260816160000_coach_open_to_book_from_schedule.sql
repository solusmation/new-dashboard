-- Ketersediaan coach mengikuti jadwal: ada jam mingguan = bisa dipesan.

CREATE OR REPLACE FUNCTION public.refresh_coach_open_to_book(p_coach_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  UPDATE public.coaches
  SET open_to_book = EXISTS (
    SELECT 1 FROM public.coach_weekly_hours w WHERE w.instructor_id = p_coach_id
  )
  WHERE id = p_coach_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_refresh_coach_open_to_book()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  PERFORM public.refresh_coach_open_to_book(COALESCE(NEW.instructor_id, OLD.instructor_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS coach_weekly_hours_refresh_open_to_book ON public.coach_weekly_hours;
CREATE TRIGGER coach_weekly_hours_refresh_open_to_book
  AFTER INSERT OR UPDATE OR DELETE ON public.coach_weekly_hours
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_refresh_coach_open_to_book();

UPDATE public.coaches c
SET open_to_book = EXISTS (
  SELECT 1 FROM public.coach_weekly_hours w WHERE w.instructor_id = c.id
);
