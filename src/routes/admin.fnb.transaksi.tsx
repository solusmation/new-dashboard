import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { FNB_CATEGORY_LABELS, listTransaksiFnb } from "@/lib/admin-fnb.functions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

function todayYmdJakarta(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

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
  const [selectedDate, setSelectedDate] = React.useState(todayYmdJakarta());

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "fnb", "transaksi", selectedDate],
    queryFn: () =>
      fetchTx({
        data: {
          limit: 200,
          date: selectedDate,
        },
      }),
  });

  const rows = (data?.transactions ?? []) as TxRow[];
  const summary = data?.summary ?? { totalAll: 0, totalToday: 0 };

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

        <div className="space-y-1.5">
          <Label htmlFor="fnb-date" className="text-xs">
            Tanggal
          </Label>
          <Input
            id="fnb-date"
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-[160px]"
          />
        </div>
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
            Tidak ada transaksi FnB pada tanggal ini.
          </div>
        )}
      </div>
    </div>
  );
}
