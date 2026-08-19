import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RewardFormDialog, type RewardFormInitial } from "@/components/admin/RewardFormDialog";
import { VoucherCardPreview } from "@/components/admin/VoucherCardPreview";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import * as React from "react";
import { deleteReward, getRewardDetail } from "@/lib/admin-reward.functions";
import {
  formatRewardStock,
  formatStarCost,
  REWARD_TYPE_LABEL,
  REWARD_STATUS_LABEL,
  rewardStatusBadgeVariant,
  type RewardType,
} from "@/lib/reward-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/reward/$rewardId")({
  component: RewardDetailPage,
});

function RewardDetailPage() {
  const { rewardId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchDetail = useServerFn(getRewardDetail);
  const deleteFn = useServerFn(deleteReward);
  const [editOpen, setEditOpen] = React.useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "reward", "detail", rewardId],
    queryFn: () => fetchDetail({ data: { rewardId } }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteFn({ data: { rewardId } }),
    onSuccess: (res) => {
      toast.success(`Reward "${res.name}" berhasil dihapus.`);
      void queryClient.invalidateQueries({ queryKey: ["admin", "reward"] });
      void navigate({ to: "/admin/reward" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reward = data?.reward;

  const formInitial: RewardFormInitial | null = reward
    ? {
        id: reward.id,
        name: reward.name,
        description: reward.description,
        how_to_use: reward.how_to_use,
        terms_and_conditions: reward.terms_and_conditions,
        star_cost: reward.star_cost,
        reward_type: reward.reward_type,
        stock_limit: reward.stock_limit,
        image_url: reward.image_url,
        image_storage_path: reward.image_storage_path,
        voucher_id: reward.voucher_id,
      }
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Button type="button" variant="ghost" size="sm" className="-ml-2" asChild>
            <Link to="/admin/reward">
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              Kembali
            </Link>
          </Button>
          <h2 className="text-xl font-semibold">{isLoading ? "…" : reward?.name}</h2>
          {reward ? (
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>{REWARD_TYPE_LABEL[reward.reward_type as RewardType]}</span>
              <span>·</span>
              <span>{formatStarCost(reward.star_cost)}</span>
              <span>·</span>
              <span>{formatRewardStock(reward.stock_limit, reward.redeemed_count)}</span>
              <Badge variant={rewardStatusBadgeVariant(reward.status)}>
                {REWARD_STATUS_LABEL[reward.status]}
              </Badge>
              {reward.linked_voucher ? (
                <>
                  <span>·</span>
                  <Button type="button" variant="outline" size="sm" className="h-6 px-2 text-xs" asChild>
                    <Link to="/admin/voucher/$voucherId" params={{ voucherId: reward.linked_voucher.id }}>
                      Voucher: {reward.linked_voucher.name}
                    </Link>
                  </Button>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={!reward} onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4 mr-1.5" />
            Edit
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            disabled={deleteMutation.isPending || !reward}
            onClick={() => {
              if (!reward) return;
              if (
                !window.confirm(
                  `Hapus reward "${reward.name}"? Tindakan ini tidak dapat dibatalkan.`,
                )
              ) {
                return;
              }
              deleteMutation.mutate();
            }}
          >
            <Trash2 className="h-4 w-4 mr-1.5" />
            Hapus
          </Button>
        </div>
      </div>

      {reward?.linked_voucher ? (
        <section>
          <VoucherCardPreview
            name={reward.linked_voucher.name}
            validFrom={reward.linked_voucher.valid_from}
            validUntil={reward.linked_voucher.valid_until}
            bgColor={reward.linked_voucher.bg_color || "#1a1a2e"}
            imageUrl={reward.linked_voucher.image_url}
          />
        </section>
      ) : null}

      {reward && (reward.description || reward.how_to_use || reward.terms_and_conditions) ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {reward.description ? (
            <section className="rounded-xl border bg-card p-4 shadow-sm">
              <h3 className="text-sm font-semibold mb-1">Deskripsi</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{reward.description}</p>
            </section>
          ) : null}
          {reward.how_to_use ? (
            <section className="rounded-xl border bg-card p-4 shadow-sm">
              <h3 className="text-sm font-semibold mb-1">How to use</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{reward.how_to_use}</p>
            </section>
          ) : null}
          {reward.terms_and_conditions ? (
            <section className="rounded-xl border bg-card p-4 shadow-sm">
              <h3 className="text-sm font-semibold mb-1">Terms & Condition</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {reward.terms_and_conditions}
              </p>
            </section>
          ) : null}
        </div>
      ) : null}

      <RewardFormDialog open={editOpen} onOpenChange={setEditOpen} reward={formInitial} />
    </div>
  );
}
