import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Plus, Ticket } from "lucide-react";
import * as React from "react";
import { listVouchers } from "@/lib/admin-voucher.functions";
import { VOUCHER_STATUS_LABEL, voucherStatusBadgeVariant } from "@/lib/voucher-display";
import { formatStarCost } from "@/lib/reward-display";
import { VoucherFormDialog } from "@/components/admin/VoucherFormDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/admin/voucher/")({
  component: VoucherListPage,
});

function VoucherListPage() {
  const navigate = useNavigate();
  const fetchList = useServerFn(listVouchers);
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "voucher", "list"],
    queryFn: () => fetchList(),
  });

  const rows = data?.items ?? [];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Voucher</h1>
      </header>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="rounded-xl border bg-card p-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Ticket className="h-4 w-4" />
          Total voucher: {isLoading ? "…" : rows.length}
        </div>
        <Button type="button" size="sm" className="gap-1.5" onClick={() => setDialogOpen(true)}>
          <Plus className="size-4" />
          Buat voucher
        </Button>
      </div>

      <div className="rounded-xl border bg-card shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground bg-muted/40">
            <tr>
              <th className="px-4 py-3">Nama</th>
              <th className="px-4 py-3">Penerima</th>
              <th className="px-4 py-3">Dipakai</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr
                key={item.id}
                className="border-t hover:bg-muted/30 cursor-pointer"
                onClick={() =>
                  void navigate({ to: "/admin/voucher/$voucherId", params: { voucherId: item.id } })
                }
              >
                <td className="px-4 py-3 font-medium">
                  <div className="flex flex-wrap items-center gap-2">
                    <span>{item.name}</span>
                    {item.linked_reward ? (
                      <Badge variant="outline">{formatStarCost(item.linked_reward.star_cost)}</Badge>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {item.assign_to_all ? (
                    <span>
                      {item.issued_count.toLocaleString("id-ID")}
                      <span className="block text-xs text-muted-foreground">Semua user</span>
                    </span>
                  ) : (
                    item.issued_count.toLocaleString("id-ID")
                  )}
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {item.used_count.toLocaleString("id-ID")}
                  <span className="text-muted-foreground">
                    {" "}
                    / {item.issued_count.toLocaleString("id-ID")}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={voucherStatusBadgeVariant(item.status)}>
                    {VOUCHER_STATUS_LABEL[item.status]}
                  </Badge>
                </td>
              </tr>
            ))}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                  Belum ada voucher. Buat voucher pertama untuk dibagikan ke pengguna.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <VoucherFormDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
