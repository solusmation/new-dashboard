import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { ChevronLeft, ChevronRight, TrendingDown, TrendingUp, Minus, X } from "lucide-react";
import {
  getFinanceOkupansiAnalytics,
  upsertCourtOccupancyManual,
  OCCUPANCY_CATEGORIES,
  OCCUPANCY_CATEGORY_COLORS,
  OCCUPANCY_CATEGORY_LABELS,
  type OccupancyCategory,
} from "@/lib/admin-finance.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/keuangan/okupansi")({
  component: KeuanganOkupansiPage,
});

const MONTH_NAMES_ID = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
] as const;

type CourtView = "all" | "reguler" | "event" | "free";

const COURT_VIEWS: { id: CourtView; label: string }[] = [
  { id: "all", label: "All Court" },
  { id: "reguler", label: "Court Reguler" },
  { id: "event", label: "Court Event" },
  { id: "free", label: "Court Free & Kompensasi" },
];

const REGULER_CATEGORIES = new Set<OccupancyCategory>([
  "ayo",
  "payment_link",
  "tunai",
  "unpaid",
]);

function effectiveSlotCategory(
  category: OccupancyCategory | null | undefined,
  memberCourts: number,
): OccupancyCategory | null {
  if (category && OCCUPANCY_CATEGORIES.includes(category)) return category;
  if (memberCourts > 0) return "ayo";
  return null;
}

function slotMatchesCourtView(
  view: CourtView,
  category: OccupancyCategory | null,
): boolean {
  if (view === "all") return true;
  if (!category) return false;
  if (view === "reguler") return REGULER_CATEGORIES.has(category);
  if (view === "event") return category === "event";
  return category === "free";
}

function defaultCategoryForView(view: CourtView): OccupancyCategory {
  if (view === "event") return "event";
  if (view === "free") return "free";
  return "ayo";
}

function categoryCellStyle(
  count: number,
  courtCount: number,
  category: OccupancyCategory | null | undefined,
): CSSProperties {
  if (count <= 0 || courtCount <= 0) return {};
  const cat = category && OCCUPANCY_CATEGORIES.includes(category) ? category : "ayo";
  const { hue, sat, light } = OCCUPANCY_CATEGORY_COLORS[cat];
  const intensity = Math.min(100, Math.max(0, (count / courtCount) * 100)) / 100;
  return {
    backgroundColor: `color-mix(in oklch, hsl(${hue} ${sat}% ${light}%) ${Math.round(intensity * 92)}%, white)`,
  };
}

function pctCellStyle(pct: number): CSSProperties {
  const intensity = Math.min(100, Math.max(0, pct)) / 100;
  return {
    backgroundColor: `color-mix(in oklch, hsl(142 55% 38%) ${Math.round(intensity * 92)}%, white)`,
  };
}

function currentMonthInputValue(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function parseMonthValue(month: string): { year: number; monthIndex: number } {
  const [y, m] = month.split("-").map((x) => parseInt(x, 10));
  return { year: y, monthIndex: m - 1 };
}

function toMonthValue(year: number, monthIndex: number): string {
  const d = new Date(Date.UTC(year, monthIndex, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(month: string, delta: number): string {
  const { year, monthIndex } = parseMonthValue(month);
  return toMonthValue(year, monthIndex + delta);
}

function roundPct(n: number): number {
  return Math.round(n * 10) / 10;
}

function formatRangeLabel(fromYmd: string, toYmd: string): string {
  const fromDay = parseInt(fromYmd.split("-")[2], 10);
  const toDay = parseInt(toYmd.split("-")[2], 10);
  const monthName =
    MONTH_NAMES_ID[parseInt(fromYmd.split("-")[1], 10) - 1] ?? fromYmd.slice(5, 7);
  if (fromYmd === toYmd) return `${fromDay} ${monthName}`;
  return `${fromDay}–${toDay} ${monthName}`;
}

function formatSlotLabel(ymd: string, hour: number): string {
  const dt = new Date(`${ymd}T12:00:00`);
  const datePart = dt.toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const end = hour === 23 ? "00:00" : `${String(hour + 1).padStart(2, "0")}:00`;
  return `${datePart} · ${String(hour).padStart(2, "0")}:00–${end}`;
}

type EditSlot = {
  ymd: string;
  hour: number;
  memberCourts: number;
  manualCourts: number;
  category: OccupancyCategory;
  courtCount: number;
};

function CategoryDot({ category }: { category: OccupancyCategory }) {
  const { hue, sat, light } = OCCUPANCY_CATEGORY_COLORS[category];
  return (
    <span
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
      style={{ backgroundColor: `hsl(${hue} ${sat}% ${light}%)` }}
      aria-hidden
    />
  );
}

function KeuanganOkupansiPage() {
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(currentMonthInputValue);
  const [courtView, setCourtView] = useState<CourtView>("all");
  const [anchorIdx, setAnchorIdx] = useState<number | null>(null);
  const [endIdx, setEndIdx] = useState<number | null>(null);
  const [editSlot, setEditSlot] = useState<EditSlot | null>(null);
  const [manualInput, setManualInput] = useState(0);
  const [categoryInput, setCategoryInput] = useState<OccupancyCategory>("ayo");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [cellTip, setCellTip] = useState<{
    text: string;
    x: number;
    y: number;
  } | null>(null);

  const fetchOk = useServerFn(getFinanceOkupansiAnalytics);
  const saveManual = useServerFn(upsertCourtOccupancyManual);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "finance", "okupansi", month],
    queryFn: () => fetchOk({ data: { month } }),
  });

  const saveMutation = useMutation({
    mutationFn: (payload: {
      bookingDate: string;
      hour: number;
      manualCourts: number;
      category: OccupancyCategory;
      memberCourts: number;
    }) => saveManual({ data: payload }),
    onSuccess: async () => {
      setEditSlot(null);
      setSaveError(null);
      await queryClient.invalidateQueries({ queryKey: ["admin", "finance", "okupansi", month] });
    },
    onError: (err: Error) => {
      setSaveError(err.message || "Gagal menyimpan.");
    },
  });

  const table = data?.table;
  const { year, monthIndex } = parseMonthValue(month);

  const yearOptions = useMemo(() => {
    const nowY = new Date().getFullYear();
    const years: number[] = [];
    for (let y = nowY - 3; y <= nowY + 1; y++) years.push(y);
    if (!years.includes(year)) years.push(year);
    return years.sort((a, b) => a - b);
  }, [year]);

  const dayColumns = useMemo(() => {
    const sourceDates =
      table?.dates?.length && table.dates.length > 0
        ? table.dates
        : (() => {
            const { year: y, monthIndex: m0 } = parseMonthValue(month);
            const last = new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
            return Array.from({ length: last }, (_, i) => {
              const d = i + 1;
              return `${y}-${String(m0 + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            });
          })();

    return sourceDates.map((ymd) => {
      const day = parseInt(ymd.split("-")[2], 10);
      const dt = new Date(ymd + "T12:00:00");
      const dow = dt.toLocaleDateString("id-ID", { weekday: "short" });
      return { ymd, day, dow };
    });
  }, [table?.dates, month]);

  const hourRows = useMemo(() => {
    if (table?.hours?.length) return table.hours;
    return Array.from({ length: 18 }, (_, i) => 6 + i);
  }, [table?.hours]);

  useEffect(() => {
    setAnchorIdx(null);
    setEndIdx(null);
  }, [month, courtView]);

  useEffect(() => {
    if (!editSlot) return;
    setManualInput(editSlot.manualCourts);
    setCategoryInput(editSlot.category);
    setSaveError(null);
  }, [editSlot]);

  const viewGrid = useMemo(() => {
    if (!table?.grid?.length) return null;
    return table.grid.map((row, hi) =>
      row.map((count, di) => {
        const cat = effectiveSlotCategory(
          table.categoryGrid?.[hi]?.[di] as OccupancyCategory | null,
          table.memberGrid?.[hi]?.[di] ?? 0,
        );
        return slotMatchesCourtView(courtView, cat) ? count : 0;
      }),
    );
  }, [table, courtView]);

  const viewDailyAvgPct = useMemo(() => {
    if (!table || !viewGrid) return [];
    const courtCount = table.courtCount || 8;
    const hours = table.hours.length;
    return table.dates.map((_, di) => {
      if (hours <= 0) return 0;
      const sumPct = viewGrid.reduce((acc, row) => acc + ((row[di] ?? 0) / courtCount) * 100, 0);
      return roundPct(sumPct / hours);
    });
  }, [table, viewGrid]);

  const viewMonthAvgPct = useMemo(() => {
    if (!table || !viewDailyAvgPct.length) return 0;
    const todayYmd = (() => {
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, "0");
      const d = String(now.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    })();
    const elapsed = table.dates
      .map((d, i) => (d <= todayYmd ? i : -1))
      .filter((i) => i >= 0);
    if (!elapsed.length) return 0;
    return roundPct(elapsed.reduce((a, i) => a + viewDailyAvgPct[i], 0) / elapsed.length);
  }, [table, viewDailyAvgPct]);

  const selection = useMemo(() => {
    if (anchorIdx == null) return null;
    const from = endIdx == null ? anchorIdx : Math.min(anchorIdx, endIdx);
    const to = endIdx == null ? anchorIdx : Math.max(anchorIdx, endIdx);
    return { from, to, complete: endIdx != null };
  }, [anchorIdx, endIdx]);

  const rangeStats = useMemo(() => {
    if (!table || !selection || !viewGrid) return null;
    const { from, to } = selection;
    let booked = 0;
    for (let hi = 0; hi < viewGrid.length; hi++) {
      for (let di = from; di <= to; di++) {
        booked += viewGrid[hi]?.[di] ?? 0;
      }
    }
    const dayCount = to - from + 1;
    const totalSlots = dayCount * table.hours.length * table.courtCount;
    const avgPct = totalSlots > 0 ? roundPct((booked / totalSlots) * 100) : 0;
    return {
      label: formatRangeLabel(table.dates[from], table.dates[to]),
      avgPct,
      booked,
      totalSlots,
    };
  }, [table, selection, viewGrid]);

  function handleDayHeaderClick(di: number) {
    if (anchorIdx == null || endIdx != null) {
      setAnchorIdx(di);
      setEndIdx(null);
      return;
    }
    setEndIdx(di);
  }

  function clearSelection() {
    setAnchorIdx(null);
    setEndIdx(null);
  }

  function isColSelected(di: number) {
    return selection != null && di >= selection.from && di <= selection.to;
  }

  function colEdge(di: number) {
    if (!selection) return { start: false, end: false };
    return { start: di === selection.from, end: di === selection.to };
  }

  function openSlotEditor(hi: number, di: number) {
    setCellTip(null);
    const ymd = table?.dates[di] ?? dayColumns[di]?.ymd;
    const hour = table?.hours[hi] ?? hourRows[hi];
    if (!ymd || hour == null) return;
    const memberCourts = table?.memberGrid?.[hi]?.[di] ?? 0;
    const manualCourts = table?.manualGrid?.[hi]?.[di] ?? 0;
    const rawCat = table?.categoryGrid?.[hi]?.[di];
    const existing =
      rawCat && OCCUPANCY_CATEGORIES.includes(rawCat as OccupancyCategory)
        ? (rawCat as OccupancyCategory)
        : null;
    const category = existing ?? defaultCategoryForView(courtView);
    setEditSlot({
      ymd,
      hour,
      memberCourts,
      manualCourts,
      category,
      courtCount: table?.courtCount ?? 8,
    });
  }

  const maxManual = editSlot
    ? Math.max(0, editSlot.courtCount - editSlot.memberCourts)
    : 0;
  const totalPreview = editSlot
    ? Math.min(editSlot.courtCount, editSlot.memberCourts + Math.max(0, manualInput))
    : 0;
  const pctPreview =
    editSlot && editSlot.courtCount > 0
      ? roundPct((totalPreview / editSlot.courtCount) * 100)
      : 0;

  function handleSave() {
    if (!editSlot) return;
    const clamped = Math.min(maxManual, Math.max(0, Math.floor(Number(manualInput) || 0)));
    saveMutation.mutate({
      bookingDate: editSlot.ymd,
      hour: editSlot.hour,
      manualCourts: clamped,
      category: categoryInput,
      memberCourts: editSlot.memberCourts,
    });
  }
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {COURT_VIEWS.map((view) => (
            <button
              key={view.id}
              type="button"
              onClick={() => setCourtView(view.id)}
              className={cn(
                "rounded-md border px-3 py-1.5 text-sm transition-colors",
                courtView === view.id
                  ? "border-sky-400 bg-sky-50 text-sky-900 font-medium dark:border-sky-600 dark:bg-sky-950/50 dark:text-sky-100"
                  : "border-border bg-card text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              {view.label}
            </button>
          ))}
        </div>

        <section className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-3">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setMonth((m) => shiftMonth(m, -1))}
                aria-label="Bulan sebelumnya"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Select
                value={String(monthIndex)}
                onValueChange={(v) => setMonth(toMonthValue(year, parseInt(v, 10)))}
              >
                <SelectTrigger className="h-8 w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTH_NAMES_ID.map((name, i) => (
                    <SelectItem key={name} value={String(i)}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={String(year)}
                onValueChange={(v) => setMonth(toMonthValue(parseInt(v, 10), monthIndex))}
              >
                <SelectTrigger className="h-8 w-[96px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setMonth((m) => shiftMonth(m, 1))}
                aria-label="Bulan berikutnya"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {!isLoading && data && (
            <p className="text-sm">
              Rata-rata bulan ini:{" "}
              <strong className="text-emerald-700 dark:text-emerald-400 tabular-nums">
                {viewMonthAvgPct}%
              </strong>
            </p>
          )}
        </div>

        {rangeStats && (
          <div className="mx-5 mb-3 flex items-start gap-3 rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-950 dark:border-sky-700 dark:bg-sky-950/40 dark:text-sky-100">
            <div className="min-w-0 flex-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span>
                Blok terpilih: <strong>{rangeStats.label}</strong>
              </span>
              <span>
                Okupansi: <strong className="tabular-nums">{rangeStats.avgPct}%</strong>
              </span>
              <span className="text-sky-800/80 dark:text-sky-200/80">
                {rangeStats.booked} dari {rangeStats.totalSlots} slot lapangan terbooking
              </span>
            </div>
            <button
              type="button"
              onClick={clearSelection}
              className="shrink-0 rounded p-0.5 text-sky-700 hover:bg-sky-100 dark:text-sky-200 dark:hover:bg-sky-900"
              aria-label="Tutup blok"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {isLoading ? (
          <p className="text-sm text-muted-foreground px-5 pb-5">Memuat…</p>
        ) : (
          <div className="overflow-x-auto pb-5">
            <table className="text-xs border-separate border-spacing-0 min-w-full">
              <thead>
                <tr>
                  <th className="p-2 border-y border-r border-border bg-muted text-left sticky left-0 z-20 min-w-[4.5rem] shadow-[1px_0_0_0_hsl(var(--border))]">
                    Jam
                  </th>
                  {dayColumns.map(({ ymd, day, dow }, di) => {
                    const selected = isColSelected(di);
                    const { start, end } = colEdge(di);
                    return (
                      <th
                        key={ymd}
                        title={`${ymd} — klik untuk blok tanggal`}
                        onClick={() => handleDayHeaderClick(di)}
                        className={cn(
                          "p-1 border-y border-r border-border bg-muted font-normal text-center min-w-[2.25rem] cursor-pointer select-none",
                          "hover:bg-sky-50 dark:hover:bg-sky-950/50",
                          selected && "bg-sky-100 dark:bg-sky-900/50",
                          selected && "border-t-2 border-t-sky-500",
                          start && "border-l-2 border-l-sky-500",
                          end && "border-r-2 border-r-sky-500",
                          selection && !selection.complete && selected && "ring-1 ring-inset ring-sky-400",
                        )}
                      >
                        <span className="block text-[10px] text-muted-foreground leading-none">
                          {dow}
                        </span>
                        <span className="block tabular-nums font-medium">{day}</span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {hourRows.map((hour, hi) => (
                  <tr key={hour}>
                    <td className="p-2 border-b border-r border-border bg-card font-medium tabular-nums sticky left-0 z-10 shadow-[1px_0_0_0_hsl(var(--border))]">
                      {String(hour).padStart(2, "0")}:00
                    </td>
                    {(viewGrid?.[hi] ?? table?.grid[hi] ?? dayColumns.map(() => 0)).map((count, di) => {
                      const selected = isColSelected(di);
                      const { start, end } = colEdge(di);
                      const rawCat = (table?.categoryGrid?.[hi]?.[di] ?? null) as OccupancyCategory | null;
                      const memberCourts = table?.memberGrid?.[hi]?.[di] ?? 0;
                      const cat = effectiveSlotCategory(rawCat, memberCourts);
                      const ymd = table?.dates[di] ?? dayColumns[di]?.ymd;
                      if (!ymd) return null;
                      const courtCount = table?.courtCount ?? 8;
                      const slotPct = courtCount > 0 ? roundPct((count / courtCount) * 100) : 0;
                      const tipText = `${count}/${courtCount} (${slotPct}%)`;
                      const displayCat = count > 0 ? cat : null;
                      return (
                        <td
                          key={ymd}
                          role="button"
                          tabIndex={0}
                          onClick={() => openSlotEditor(hi, di)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              openSlotEditor(hi, di);
                            }
                          }}
                          onMouseEnter={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setCellTip({
                              text: tipText,
                              x: rect.left + rect.width / 2,
                              y: rect.top,
                            });
                          }}
                          onMouseLeave={() => setCellTip(null)}
                          className={cn(
                            "p-0.5 border-b border-r border-border text-center tabular-nums align-middle h-7 cursor-pointer",
                            "hover:outline hover:outline-1 hover:outline-sky-400 hover:relative hover:z-[1]",
                            start && "border-l-2 border-l-sky-500",
                            end && "border-r-2 border-r-sky-500",
                          )}
                          style={{
                            ...categoryCellStyle(count, courtCount, displayCat),
                            ...(selected
                              ? {
                                  boxShadow:
                                    "inset 0 0 0 9999px color-mix(in oklch, rgb(14 165 233) 14%, transparent)",
                                }
                              : {}),
                          }}
                        >
                          {count > 0 ? <span className="text-[10px]">{count}</span> : ""}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="p-2 border-b border-r border-border sticky left-0 z-10 bg-muted whitespace-nowrap text-[11px] shadow-[1px_0_0_0_hsl(var(--border))]">
                    Rata-rata harian
                  </td>
                  {(viewDailyAvgPct.length
                    ? viewDailyAvgPct
                    : (table?.dailyAvgPct ?? dayColumns.map(() => 0))
                  ).map((pct, di) => {
                    const selected = isColSelected(di);
                    const { start, end } = colEdge(di);
                    const ymd = table?.dates[di] ?? dayColumns[di]?.ymd;
                    if (!ymd) return null;
                    return (
                      <td
                        key={ymd}
                        className={cn(
                          "p-1 border-b border-r border-border text-center tabular-nums text-[10px]",
                          start && "border-l-2 border-l-sky-500",
                          end && "border-r-2 border-r-sky-500",
                          selected && "border-b-2 border-b-sky-500",
                        )}
                        style={{
                          ...pctCellStyle(pct),
                          ...(selected
                            ? {
                                boxShadow:
                                  "inset 0 0 0 9999px color-mix(in oklch, rgb(14 165 233) 14%, transparent)",
                              }
                            : {}),
                        }}
                        title={ymd}
                      >
                        {pct}%
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>
      </div>

      {cellTip &&
        createPortal(
          <div
            role="tooltip"
            className="pointer-events-none fixed z-[200] -translate-x-1/2 -translate-y-[calc(100%+8px)] rounded-md bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-md dark:bg-zinc-100 dark:text-zinc-900"
            style={{ left: cellTip.x, top: cellTip.y }}
          >
            <span className="tabular-nums">{cellTip.text}</span>
          </div>,
          document.body,
        )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="rounded-xl border bg-card p-5 shadow-sm">
          <h2 className="text-base font-semibold mb-4">Okupansi minggu ini</h2>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Memuat…</p>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center gap-6">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Minggu ini</p>
                <p className="text-4xl font-bold tabular-nums text-emerald-800 dark:text-emerald-400">
                  {data?.weeklySnapshot?.thisWeekAvgPct ?? 0}%
                </p>
                <p className="text-xs text-muted-foreground mt-1">{data?.weeklySnapshot?.thisWeekLabel}</p>
              </div>
              <div className="flex-1 rounded-lg border bg-muted/30 p-4">
                <p className="text-xs text-muted-foreground mb-2">vs minggu lalu</p>
                <div className="flex items-center gap-2 flex-wrap">
                  {data?.weeklySnapshot?.deltaDirection === "up" && (
                    <TrendingUp className="h-6 w-6 text-emerald-600 shrink-0" />
                  )}
                  {data?.weeklySnapshot?.deltaDirection === "down" && (
                    <TrendingDown className="h-6 w-6 text-red-600 shrink-0" />
                  )}
                  {data?.weeklySnapshot?.deltaDirection === "flat" && (
                    <Minus className="h-6 w-6 text-muted-foreground shrink-0" />
                  )}
                  <span
                    className={cn(
                      "text-2xl font-semibold tabular-nums",
                      data?.weeklySnapshot?.deltaDirection === "up" && "text-emerald-700",
                      data?.weeklySnapshot?.deltaDirection === "down" && "text-red-600",
                      data?.weeklySnapshot?.deltaDirection === "flat" && "text-muted-foreground",
                    )}
                  >
                    {data?.weeklySnapshot?.deltaPctPoints != null &&
                    data.weeklySnapshot.deltaPctPoints > 0
                      ? "+"
                      : ""}
                    {data?.weeklySnapshot?.deltaPctPoints ?? 0}%
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Minggu lalu:{" "}
                  <strong className="text-foreground tabular-nums">
                    {data?.weeklySnapshot?.previousWeekAvgPct ?? 0}%
                  </strong>
                </p>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-xl border bg-card p-5 shadow-sm">
          <h2 className="text-base font-semibold mb-4">Rata-rata okupansi bulanan</h2>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Memuat…</p>
          ) : (
            <>
              <div className="h-52 mb-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data?.monthlyAvgs ?? []}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} width={40} />
                    <Tooltip formatter={(v: number) => [`${v}%`, "Okupansi"]} />
                    <Bar
                      dataKey="avgPct"
                      name="Okupansi %"
                      fill="hsl(220 55% 48%)"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <ul className="text-sm space-y-1.5 max-h-40 overflow-y-auto">
                {(data?.monthlyAvgs ?? []).map((m) => (
                  <li
                    key={m.month}
                    className="flex justify-between gap-2 border-b border-border/50 pb-1"
                  >
                    <span className="text-muted-foreground">{m.label}</span>
                    <span className="font-medium tabular-nums">{m.avgPct}%</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>

      <Dialog
        open={editSlot != null}
        onOpenChange={(open) => {
          if (!open) {
            setEditSlot(null);
            setSaveError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Input Okupansi Manual</DialogTitle>
            <DialogDescription>
              {editSlot ? formatSlotLabel(editSlot.ymd, editSlot.hour) : ""}
            </DialogDescription>
          </DialogHeader>

          {editSlot && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/60 px-3 py-2.5 text-sm">
                Dari booking member:{" "}
                <strong className="tabular-nums">{editSlot.memberCourts} lapangan</strong>
              </div>

              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm dark:border-emerald-800 dark:bg-emerald-950/40">
                Okupansi slot:{" "}
                <strong className="tabular-nums">
                  {totalPreview}/{editSlot.courtCount} ({pctPreview}%)
                </strong>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="manual-courts" className="text-sm font-medium">
                  Tambahan manual (jumlah lapangan)
                </label>
                <Input
                  id="manual-courts"
                  type="number"
                  min={0}
                  max={maxManual}
                  step={1}
                  value={manualInput}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    if (Number.isNaN(n)) {
                      setManualInput(0);
                      return;
                    }
                    setManualInput(Math.min(maxManual, Math.max(0, n)));
                  }}
                  className="focus-visible:ring-emerald-500"
                />
                <p className="text-xs text-muted-foreground">
                  {editSlot.memberCourts > 0
                    ? "Booking member tidak dapat dikurangi; hanya tambahan manual yang bisa diubah."
                    : "Ubah tambahan manual untuk mengisi slot kosong."}
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Kategori</label>
                <Select
                  value={categoryInput}
                  onValueChange={(v) => setCategoryInput(v as OccupancyCategory)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Pilih kategori" />
                  </SelectTrigger>
                  <SelectContent>
                    {OCCUPANCY_CATEGORIES.map((id) => (
                      <SelectItem key={id} value={id}>
                        <span className="flex items-center gap-2">
                          <CategoryDot category={id} />
                          {OCCUPANCY_CATEGORY_LABELS[id]}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {saveError && <p className="text-sm text-destructive">{saveError}</p>}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditSlot(null)}
              disabled={saveMutation.isPending}
            >
              Batal
            </Button>
            <Button
              type="button"
              className="bg-emerald-700 hover:bg-emerald-800 text-white"
              onClick={handleSave}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? "Menyimpan…" : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
