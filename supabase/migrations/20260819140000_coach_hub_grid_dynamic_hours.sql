-- Replace admin_get_coach_hub_grid to use dynamic hours from coach_weekly_hours
-- and support up to 8 courts instead of hardcoded 4.
CREATE OR REPLACE FUNCTION public.admin_get_coach_hub_grid(
  p_instructor_id uuid,
  p_booking_date date
)
RETURNS TABLE(
  court_number integer,
  start_time time without time zone,
  end_time time without time zone,
  status text,
  coach_booking_id uuid,
  booker_name text,
  booker_username text,
  duration_hours numeric,
  coach_fee_idr bigint,
  court_label text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_court int;
  v_start time;
  v_end time;
  v_dow smallint;
  v_wh record;
  v_has_weekly_hours boolean := false;
  v_daily_break_start time;
  v_daily_break_end time;
  v_slot_override text;
  v_coach_booking record;
  v_court_booked boolean;
  v_in_break boolean;
  v_in_hours boolean;
  v_hour_start int;
  v_hour_end int;
  v_h int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.coaches i WHERE i.id = p_instructor_id) THEN
    RETURN;
  END IF;

  SELECT i.daily_break_start, i.daily_break_end
  INTO v_daily_break_start, v_daily_break_end
  FROM public.coaches i
  WHERE i.id = p_instructor_id;

  v_dow := public.date_to_day_of_week(p_booking_date);

  SELECT * INTO v_wh FROM public.coach_weekly_hours w
  WHERE w.instructor_id = p_instructor_id AND w.day_of_week = v_dow;
  v_has_weekly_hours := FOUND;

  IF v_has_weekly_hours THEN
    v_hour_start := EXTRACT(HOUR FROM v_wh.start_time);
    v_hour_end := EXTRACT(HOUR FROM v_wh.end_time);
    IF EXTRACT(MINUTE FROM v_wh.end_time) > 0 THEN
      v_hour_end := v_hour_end + 1;
    END IF;
  ELSE
    v_hour_start := 8;
    v_hour_end := 22;
  END IF;

  FOR v_court IN 1..8 LOOP
    FOR v_h IN v_hour_start .. v_hour_end - 1 LOOP
      v_start := make_time(v_h, 0, 0);
      v_end := make_time(v_h + 1, 0, 0);

      court_number := v_court;
      start_time := v_start;
      end_time := v_end;
      coach_booking_id := NULL;
      booker_name := NULL;
      booker_username := NULL;
      duration_hours := NULL;
      coach_fee_idr := NULL;
      court_label := 'LAP ' || v_court;

      SELECT override_type INTO v_slot_override
      FROM public.coach_slot_overrides cso
      WHERE cso.instructor_id = p_instructor_id
        AND cso.override_date = p_booking_date AND cso.start_time = v_start;

      SELECT cb.id, cb.duration_hours, cb.coach_fee_idr, p.display_name, p.username
      INTO v_coach_booking
      FROM public.coach_bookings cb
      JOIN public.court_bookings court ON court.id = cb.court_booking_id
      CROSS JOIN LATERAL unnest(court.court_numbers) AS cn(court_number)
      LEFT JOIN public.profiles p ON p.user_id = cb.user_id
      WHERE cb.instructor_id = p_instructor_id
        AND cb.booking_date = p_booking_date
        AND cb.status = 'confirmed'
        AND cn.court_number = v_court
        AND (v_start, v_end) OVERLAPS (cb.start_time, cb.start_time + make_interval(secs => round(cb.duration_hours * 3600)))
      LIMIT 1;

      IF FOUND THEN
        status := 'booked';
        coach_booking_id := v_coach_booking.id;
        booker_name := v_coach_booking.display_name;
        booker_username := v_coach_booking.username;
        duration_hours := v_coach_booking.duration_hours;
        coach_fee_idr := v_coach_booking.coach_fee_idr;
        RETURN NEXT;
        CONTINUE;
      END IF;

      IF v_slot_override = 'block' THEN
        status := 'blocked';
        RETURN NEXT;
        CONTINUE;
      END IF;

      v_in_break := false;
      IF v_daily_break_start IS NOT NULL AND v_daily_break_end IS NOT NULL THEN
        IF (v_start, v_end) OVERLAPS (v_daily_break_start, v_daily_break_end) THEN
          v_in_break := true;
        END IF;
      END IF;

      IF v_in_break THEN
        status := 'break';
        RETURN NEXT;
        CONTINUE;
      END IF;

      v_in_hours := v_has_weekly_hours
        AND v_start >= v_wh.start_time
        AND v_end <= v_wh.end_time;

      IF v_slot_override = 'open' THEN
        v_in_hours := true;
      END IF;

      IF NOT v_in_hours THEN
        status := 'unavailable';
        RETURN NEXT;
        CONTINUE;
      END IF;

      SELECT true INTO v_court_booked
      FROM public.court_bookings cb2
      CROSS JOIN LATERAL unnest(cb2.court_numbers) AS cn2(court_number)
      WHERE cb2.booking_date = p_booking_date
        AND cn2.court_number = v_court
        AND (v_start, v_end) OVERLAPS (cb2.start_time, cb2.start_time + make_interval(secs => round(cb2.duration_hours * 3600)))
      LIMIT 1;

      IF FOUND THEN
        status := 'court_taken';
      ELSE
        status := 'available';
      END IF;

      RETURN NEXT;
    END LOOP;
  END LOOP;
END;
$$;
