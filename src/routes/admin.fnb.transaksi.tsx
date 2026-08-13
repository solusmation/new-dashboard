import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { SlidersHorizontal } from "lucide-react";
import { FNB_CATEGORY_LABELS, listTransaksiFnb } from "@/lib/admin-fnb.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/admin/fnb/transaksi")({
  component: FnbTransaksiPage,
});

const fmtIDR = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(iso));

const fmtYmdLabel = (ymd: string) =>
  new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date(`${ymd}T12:00:00+07:00`));

const fmtMonthLabel = (monthYm: string) => {
  const [y, m] = monthYm.split("-").map((x) => parseInt(x, 10));
  return new Intl.DateTimeFormat("id-ID", {
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(y, m - 1, 1)));
};

function todayYmdJakarta(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function monthLastDayYmd(monthYm: string): string {
  const [y, m] = monthYm.split("-").map((x) => parseInt(x, 10));
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

type DateFilterMode = "day" | "month" | "range";

type TxRow = {
  id: string;
  user_id: string;
  total_amount_idr: number;
  notes: string | null;
  court_number: number | null;
  fnb_order_id: string | null;
  created_at: string;
  profiles: { display_name: string | null; username: string | null } | null;
  items: Array<{
    menu_name: string;
    menu_category: string;
    unit_price_idr: number;
    quantity: number;
    subtotal_idr: number;
  }>;
};

function FnbTransaksiPage() {
  const fetchTx = useServerFn(listTransaksiFnb);
  const today = todayYmdJakarta();
  const [filterOpen, setFilterOpen] = React.useState(false);
  const [mode, setMode] = React.useState<DateFilterMode>("day");
  const [selectedDate, setSelectedDate] = React.useState(today);
  const [selectedMonth, setSelectedMonth] = React.useState(today.slice(0, 7));
  const [dateFrom, setDateFrom] = React.useState(today);
  const [dateTo, setDateTo] = React.useState(today);

  const range = React.useMemo(() => {
    if (mode === "day") {
      return { from: selectedDate, to: selectedDate };
    }
    if (mode === "month") {
      return {
        from: `${selectedMonth}-01`,
        to: monthLastDayYmd(selectedMonth),
      };
    }
    const from = dateFrom <= dateTo ? dateFrom : dateTo;
    const to = dateFrom <= dateTo ? dateTo : dateFrom;
    return { from, to };
  }, [mode, selectedDate, selectedMonth, dateFrom, dateTo]);

  const filterLabel = React.useMemo(() => {
    if (mode === "day") {
      return selectedDate === today ? "Hari ini" : fmtYmdLabel(selectedDate);
    }
    if (mode === "month") {
      return fmtMonthLabel(selectedMonth);
    }
    if (range.from === range.to) {
      return fmtYmdLabel(range.from);
    }
    return `${fmtYmdLabel(range.from)} – ${fmtYmdLabel(range.to)}`;
  }, [mode, selectedDate, selectedMonth, range.from, range.to, today]);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "fnb", "transaksi", mode, range.from, range.to],
    queryFn: () =>
      fetchTx({
        data: {
          limit: 200,
          dateFrom: range.from,
          dateTo: range.to,
        },
      }),
    enabled: Boolean(range.from && range.to),
  });

  const rows = (data?.transactions ?? []) as TxRow[];
  const summary = data?.summary ?? { totalAll: 0, totalToday: 0 };

  const emptyMessage =
    mode === "month"
      ? "Tidak ada transaksi FnB pada bulan ini."
      : mode === "range"
        ? "Tidak ada transaksi FnB pada rentang tanggal ini."
        : "Tidak ada transaksi FnB pada tanggal ini.";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap gap-3">
          <div className="rounded-xl border bg-card px-4 py-3 min-w-[160px]">
            <div className="text-xs text-muted-foreground">Total transaksi</div>
            <div className="text-2xl font-bold tabular-nums mt-0.5">
              {isLoading ? "…" : summary.totalAll}
            </div>
          </div>
          <div className="rounded-xl border bg-card px-4 py-3 min-w-[160px]">
            <div className="text-xs text-muted-foreground">Total transaksi hari ini</div>
            <div className="text-2xl font-bold tabular-nums mt-0.5">
              {isLoading ? "…" : summary.totalToday}
            </div>
          </div>
        </div>

        <Popover open={filterOpen} onOpenChange={setFilterOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <SlidersHorizontal className="h-4 w-4" />
              <span className="max-w-[220px] truncate">{filterLabel}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="w-[300px] space-y-4 p-4"
            onInteractOutside={(e) => {
              const target = e.target as HTMLElement | null;
              if (target?.closest("[data-radix-select-content]")) {
                e.preventDefault();
              }
            }}
          >
            <div>
              <div className="text-sm font-medium">Filter tanggal</div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Pilih per hari, per bulan, atau rentang tanggal.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Jenis filter</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as DateFilterMode)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Per hari</SelectItem>
                  <SelectItem value="month">Per bulan</SelectItem>
                  <SelectItem value="range">Rentang tanggal</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {mode === "day" ? (
              <div className="space-y-1.5">
                <Label htmlFor="fnb-date" className="text-xs">
                  Tanggal
                </Label>
                <Input
                  id="fnb-date"
                  type="date"
                  value={selectedDate}
                  onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
                />
              </div>
            ) : null}

            {mode === "month" ? (
              <div className="space-y-1.5">
                <Label htmlFor="fnb-month" className="text-xs">
                  Bulan
                </Label>
                <Input
                  id="fnb-month"
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => e.target.value && setSelectedMonth(e.target.value)}
                />
              </div>
            ) : null}

            {mode === "range" ? (
              <div className="grid grid-cols-1 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="fnb-date-from" className="text-xs">
                    Dari tanggal
                  </Label>
                  <Input
                    id="fnb-date-from"
                    type="date"
                    value={dateFrom}
                    onChange={(e) => e.target.value && setDateFrom(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fnb-date-to" className="text-xs">
                    Sampai tanggal
                  </Label>
                  <Input
                    id="fnb-date-to"
                    type="date"
                    value={dateTo}
                    onChange={(e) => e.target.value && setDateTo(e.target.value)}
                  />
                </div>
              </div>
            ) : null}

            <Button
              type="button"
              size="sm"
              className="w-full"
              onClick={() => setFilterOpen(false)}
            >
              Terapkan
            </Button>
          </PopoverContent>
        </Popover>
      </div>

      <div className="space-y-4">
        {rows.map((tx) => {
          const profile = tx.profiles;
          const buyer =
            profile?.display_name ||
            (profile?.username ? `@${profile.username}` : null) ||
            tx.user_id.slice(0, 8);

          return (
            <div key={tx.id} className="rounded-xl border bg-card shadow-sm p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{buyer}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{fmtDate(tx.created_at)}</div>
                  {tx.court_number ? (
                    <div className="text-xs text-muted-foreground mt-1">
                      Lapangan {tx.court_number}
                    </div>
                  ) : null}
                  {tx.notes ? (
                    <div className="text-xs text-muted-foreground mt-1">{tx.notes}</div>
                  ) : null}
                </div>
                <span className="font-semibold tabular-nums">{fmtIDR(tx.total_amount_idr)}</span>
              </div>

              <div className="rounded-lg bg-muted/40 text-sm divide-y">
                {tx.items.map((it, i) => (
                  <div key={i} className="flex flex-wrap justify-between gap-2 px-3 py-2">
                    <span>
                      {it.quantity}× {it.menu_name}{" "}
                      <span className="text-muted-foreground text-xs">
                        (
                        {FNB_CATEGORY_LABELS[
                          it.menu_category as keyof typeof FNB_CATEGORY_LABELS
                        ] ?? it.menu_category}
                        )
                      </span>
                    </span>
                    <span className="tabular-nums">{fmtIDR(it.subtotal_idr)}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {!isLoading && rows.length === 0 && (
          <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground">
            {emptyMessage}
          </div>
        )}
      </div>
    </div>
  );
}
