export type RewardType =
  | "voucher_discount"
  | "goods"
  | "fnb_discount"
  | "free_fnb"
  | "other";

export type RewardStatus = "active" | "sold_out" | "inactive";

export const REWARD_TYPE_LABEL: Record<RewardType, string> = {
  voucher_discount: "Voucher potongan",
  goods: "Barang",
  fnb_discount: "Diskon makanan",
  free_fnb: "Free makanan",
  other: "Lainnya",
};

export const REWARD_TYPE_OPTIONS: ReadonlyArray<{ value: RewardType; label: string }> = [
  { value: "voucher_discount", label: REWARD_TYPE_LABEL.voucher_discount },
  { value: "goods", label: REWARD_TYPE_LABEL.goods },
  { value: "fnb_discount", label: REWARD_TYPE_LABEL.fnb_discount },
  { value: "free_fnb", label: REWARD_TYPE_LABEL.free_fnb },
  { value: "other", label: REWARD_TYPE_LABEL.other },
];

export const REWARD_STATUS_LABEL: Record<RewardStatus, string> = {
  active: "Aktif",
  sold_out: "Habis",
  inactive: "Nonaktif",
};

export function getRewardStatus(
  isActive: boolean,
  stockLimit: number | null,
  redeemedCount: number,
): RewardStatus {
  if (stockLimit !== null && redeemedCount >= stockLimit) return "sold_out";
  if (!isActive) return "inactive";
  return "active";
}

export function rewardStatusBadgeVariant(
  status: RewardStatus,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "active") return "default";
  if (status === "sold_out") return "destructive";
  return "secondary";
}

export function formatRewardStock(stockLimit: number | null, redeemedCount: number): string {
  if (stockLimit === null) return "Tanpa batas";
  return `${redeemedCount.toLocaleString("id-ID")} / ${stockLimit.toLocaleString("id-ID")}`;
}

export function formatStarCost(starCost: number): string {
  return `${starCost.toLocaleString("id-ID")} Star`;
}
