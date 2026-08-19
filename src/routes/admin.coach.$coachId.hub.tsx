import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { addDays, format } from "date-fns";
import { id } from "date-fns/locale";
import { ArrowLeft, CalendarClock, CalendarIcon, Loader2, Plus, Trash2, UserPen } from "lucide-react";
import {
  adminCreateCoachBooking,
  deleteCoachBooking,
  getCoachBookingDetail,
  getCoachById,
  getCoachHubGrid,
  toggleCoachSlotOverride,
  type CoachHubGridCell,
} from "@/lib/admin-coach.functions";
import { CoachHubGrid } from "@/components/admin/CoachHubGrid";
import { EditCoachProfileDialog } from "@/components/admin/EditCoachProfileDialog";
import { EditCoachScheduleDialog } from "@/components/admin/EditCoachScheduleDialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/coach/$coachId/hub")({
  component: CoachHubPage,
});

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseYmd(ymd: string): Date {
  const [y, mo, day] = ymd.split("-").map((x) => parseInt(x, 10));
  return new Date(y, mo - 1, day);
}

const fmtIDR = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

function CoachHubPage() {
  const { coachId } = Route.useParams();
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(todayYmd);
  const [calOpen, setCalOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [jadwalOpen, setJadwalOpen] = useState(false);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);

  const [bookOpen, setBookOpen] = useState(false);
  const [bookName, setBookName] = useState("");
  const [bookCourt, setBookCourt] = useState("1");
  const [bookTimeStart, setBookTimeStart] = useState("08:00");
  const [bookTimeEnd, setBookTimeEnd] = useState("09:00");
  const [bookCategory, setBookCategory] = useState<string>("");

  const fetchCoach = useServerFn(getCoachById);
  const fetchGrid = useServerFn(getCoachHubGrid);
  const fetchDetail = useServerFn(getCoachBookingDetail);
  const toggleSlot = useServerFn(toggleCoachSlotOverride);
  const deleteBooking = useServerFn(deleteCoachBooking);
  const createBooking = useServerFn(adminCreateCoachBooking);

  const { data: coachData } = useQuery({
    queryKey: ["admin", "coach", coachId],
    queryFn: () => fetchCoach({ data: { coachId } }),
  });

  const { data: gridData, isLoading: gridLoad } = useQuery({
    queryKey: ["admin", "coach", coachId, "hub", selectedDate],
    queryFn: () => fetchGrid({ data: { coachId, date: selectedDate } }),
  });

  const { data: bookingDetail, isLoading: detailLoad } = useQuery({
    queryKey: ["admin", "coach", "booking", selectedBookingId],
    queryFn: () => fetchDetail({ data: { bookingId: selectedBookingId! } }),
    enabled: detailOpen && Boolean(selectedBookingId),
  });

  const toggleMutation = useMutation({
    mutationFn: (args: { startTime: string; overrideType: "block" | "open" | "clear" }) =>
      toggleSlot({
        data: {
          coachId,
          date: selectedDate,
          startTime: args.startTime,
          overrideType: args.overrideType,
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "coach", coachId, "hub", selectedDate] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (bookingId: string) => deleteBooking({ data: { bookingId } }),
    onSuccess: () => {
      toast.success("Booking coach dihapus.");
      setDetailOpen(false);
      setSelectedBookingId(null);
      void queryClient.invalidateQueries({ queryKey: ["admin", "coach", coachId, "hub", selectedDate] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bookMutation = useMutation({
    mutationFn: () => {
      const [sh, sm] = bookTimeStart.split(":").map(Number);
      const [eh, em] = bookTimeEnd.split(":").map(Number);
      const dur = (eh * 60 + em - sh * 60 - sm) / 60;
      if (dur <= 0) throw new Error("Jam berakhir harus lebih besar dari jam mulai.");
      return createBooking({
        data: {
          coachId,
          date: selectedDate,
          startTime: bookTimeStart,
          durationHours: dur,
          courtNumber: parseInt(bookCourt, 10),
          bookerName: bookName,
          category: bookCategory === "" ? undefined : (bookCategory as "coaching" | "coaching_program" | "social_play"),
        },
      });
    },
    onSuccess: () => {
      toast.success("Booking berhasil dibuat.");
      setBookOpen(false);
      setBookName("");
      setBookCourt("1");
      setBookTimeStart("08:00");
      setBookTimeEnd("09:00");
      setBookCategory("");
      void queryClient.invalidateQueries({ queryKey: ["admin", "coach", coachId, "hub", selectedDate] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const coachName = coachData?.coach.display_name ?? "Coach";
  const cells = gridData?.cells ?? [];

  const dateStrip = useMemo(() => {
    const base = parseYmd(selectedDate);
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(base, i - 3);
      const ymd = format(d, "yyyy-MM-dd");
      return {
        ymd,
        day: format(d, "EEE", { locale: id }),
        num: format(d, "d MMM", { locale: id }),
      };
    });
  }, [selectedDate]);

  function handleCellClick(cell: CoachHubGridCell) {
    if (cell.status === "booked" && cell.coach_booking_id) {
      setSelectedBookingId(cell.coach_booking_id);
      setDetailOpen(true);
      return;
    }
    if (cell.status === "available") {
      toggleMutation.mutate({ startTime: cell.start_time.slice(0, 5), overrideType: "block" });
      toast.success("Sesi diblokir.");
      return;
    }
    if (cell.status === "blocked") {
      toggleMutation.mutate({ startTime: cell.start_time.slice(0, 5), overrideType: "clear" });
      toast.success("Blokir sesi dihapus.");
    }
  }

  const b = bookingDetail?.booking;
  const bookerName = bookingDetail?.bookerName;
  const bookerEmail = bookingDetail?.bookerEmail;
  const profile = bookingDetail?.profile;
  const court = bookingDetail?.court;

  return (
    <div className="p-4 lg:p-6 space-y-4 h-screen flex flex-col">
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/admin/coach">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Kembali
          </Link>
        </Button>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            className="bg-[#244827] hover:bg-[#1a351d] text-white"
            onClick={() => setProfileOpen(true)}
          >
            <UserPen className="h-4 w-4 mr-1.5" />
            Edit Profile
          </Button>
          <Button
            type="button"
            size="sm"
            className="bg-[#244827] hover:bg-[#1a351d] text-white"
            onClick={() => setJadwalOpen(true)}
          >
            <CalendarClock className="h-4 w-4 mr-1.5" />
            Edit jadwal
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {dateStrip.map((d) => (
          <button
            key={d.ymd}
            type="button"
            onClick={() => setSelectedDate(d.ymd)}
            className={cn(
              "shrink-0 rounded-xl px-3 py-1.5 text-center min-w-[4rem] border transition-colors",
              selectedDate === d.ymd
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card hover:bg-muted/50",
            )}
          >
            <div className="text-[10px] uppercase font-semibold">{d.day}</div>
            <div className="text-xs">{d.num}</div>
          </button>
        ))}
        <Popover open={calOpen} onOpenChange={setCalOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="icon" className="shrink-0 h-8 w-8">
              <CalendarIcon className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="single"
              locale={id}
              selected={parseYmd(selectedDate)}
              onSelect={(d) => {
                if (!d) return;
                const ymd = format(d, "yyyy-MM-dd");
                setSelectedDate(ymd);
                setCalOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Jadwal {coachName}</h2>
        <Button size="sm" onClick={() => setBookOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Booking
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <span className="rounded-full px-3 py-1 text-xs font-medium bg-orange-100 text-orange-900 border border-orange-200">
          Diblokir
        </span>
        <span className="rounded-full px-3 py-1 text-xs font-medium bg-blue-100 text-blue-900 border border-blue-200">
          Coaching Program
        </span>
        <span className="rounded-full px-3 py-1 text-xs font-medium bg-green-100 text-green-900 border border-green-200">
          Social Play
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        {gridLoad ? (
          <div className="flex justify-center py-16 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <CoachHubGrid cells={cells} onCellClick={handleCellClick} />
        )}
      </div>

      <Dialog open={bookOpen} onOpenChange={setBookOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Booking Jadwal Coach</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Atas nama</Label>
              <Input
                placeholder="Nama pembooking"
                value={bookName}
                onChange={(e) => setBookName(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Jam mulai</Label>
                <Input
                  type="time"
                  value={bookTimeStart}
                  onChange={(e) => setBookTimeStart(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Jam berakhir</Label>
                <Input
                  type="time"
                  value={bookTimeEnd}
                  onChange={(e) => setBookTimeEnd(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Lapangan</Label>
                <Select value={bookCourt} onValueChange={setBookCourt}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((c) => (
                      <SelectItem key={c} value={String(c)}>LAP {c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Kategori <span className="text-muted-foreground">(opsional)</span></Label>
                <Select value={bookCategory} onValueChange={setBookCategory}>
                  <SelectTrigger><SelectValue placeholder="Pilih..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="coaching">Coaching</SelectItem>
                    <SelectItem value="coaching_program">Coaching Program</SelectItem>
                    <SelectItem value="social_play">Social Play</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={!bookName.trim() || bookMutation.isPending}
              onClick={() => bookMutation.mutate()}
            >
              {bookMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Buat Booking
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EditCoachProfileDialog
        coachId={coachId}
        coach={coachData?.coach}
        open={profileOpen}
        onOpenChange={setProfileOpen}
      />

      <EditCoachScheduleDialog
        coachId={coachId}
        open={jadwalOpen}
        onOpenChange={setJadwalOpen}
      />

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Detail booking coach</DialogTitle>
          </DialogHeader>
          {detailLoad || !b ? (
            <div className="py-8 flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Pembooking</dt>
                <dd className="font-medium">
                  {bookerName ??
                    profile?.display_name ??
                    profile?.username ??
                    "—"}
                  {profile?.username && bookerName !== profile.username
                    ? ` (@${profile.username})`
                    : ""}
                </dd>
                {bookerEmail ? (
                  <dd className="text-sm text-muted-foreground mt-0.5">{bookerEmail}</dd>
                ) : null}
              </div>
              <div>
                <dt className="text-muted-foreground">Tanggal & jam</dt>
                <dd>
                  {b.booking_date} · {String(b.start_time).slice(0, 5)} ({b.duration_hours} jam)
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Biaya coach</dt>
                <dd>{fmtIDR(Number(b.coach_fee_idr))}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Lapangan</dt>
                <dd>
                  {court?.court_numbers?.length
                    ? court.court_numbers.map((n) => `LAP ${n}`).join(", ")
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Status</dt>
                <dd className="capitalize">{b.status}</dd>
              </div>
            </dl>
          )}
          <DialogFooter className="gap-2">
            {selectedBookingId && (
              <Button
                type="button"
                variant="destructive"
                disabled={deleteMutation.isPending}
                onClick={() => {
                  if (window.confirm("Hapus booking coach ini?")) {
                    deleteMutation.mutate(selectedBookingId);
                  }
                }}
              >
                <Trash2 className="h-4 w-4 mr-1.5" />
                Hapus booking
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
