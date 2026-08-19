import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Gift, Plus } from "lucide-react";
import * as React from "react";
import { listRewards } from "@/lib/admin-reward.functions";
import {
  formatRewardStock,
  formatStarCost,
  REWARD_TYPE_LABEL,
  REWARD_STATUS_LABEL,
  rewardStatusBadgeVariant,
  type RewardType,
} from "@/lib/reward-display";
import { RewardFormDialog } from "@/components/admin/RewardFormDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/admin/reward/")({
  component: RewardListPage,
});

function RewardListPage() {
  const navigate = useNavigate();
  const fetchList = useServerFn(listRewards);
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "reward", "list"],
    queryFn: () => fetchList(),
  });

  const rows = data?.items ?? [];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Reward</h1>
      </header>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="rounded-xl border bg-card p-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Gift className="h-4 w-4" />
          Total reward: {isLoading ? "…" : rows.length}
        </div>
        <Button type="button" size="sm" className="gap-1.5" onClick={() => setDialogOpen(true)}>
          <Plus className="size-4" />
          Buat reward
        </Button>
      </div>

      <div className="rounded-xl border bg-card shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground bg-muted/40">
            <tr>
              <th className="px-4 py-3">Nama</th>
              <th className="px-4 py-3">Tipe</th>
              <th className="px-4 py-3">Harga Star</th>
              <th className="px-4 py-3">Stok</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr
                key={item.id}
                className="border-t hover:bg-muted/30 cursor-pointer"
                onClick={() =>
                  void navigate({ to: "/admin/reward/$rewardId", params: { rewardId: item.id } })
                }
              >
                <td className="px-4 py-3 font-medium">{item.name}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {REWARD_TYPE_LABEL[item.reward_type as RewardType]}
                </td>
                <td className="px-4 py-3 tabular-nums">{formatStarCost(item.star_cost)}</td>
                <td className="px-4 py-3 tabular-nums">
                  {formatRewardStock(item.stock_limit, item.redeemed_count)}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={rewardStatusBadgeVariant(item.status)}>
                    {REWARD_STATUS_LABEL[item.status]}
                  </Badge>
                </td>
              </tr>
            ))}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  Belum ada reward. Buat reward pertama untuk ditukar pengguna dengan Star.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <RewardFormDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
