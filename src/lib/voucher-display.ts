export type VoucherCampaignStatus = "upcoming" | "active" | "expired";
export type VoucherCodeStatus = VoucherCampaignStatus | "used";
export type VoucherIssuedVia = "admin" | "star_reward";

export const VOUCHER_ISSUED_VIA_LABEL: Record<VoucherIssuedVia, string> = {
  admin: "Admin",
  star_reward: "Star",
};

export function getVoucherCampaignStatus(
  validFrom: string,
  validUntil: string,
  now = new Date(),
): VoucherCampaignStatus {
  const from = new Date(validFrom);
  const until = new Date(validUntil);
  if (now < from) return "upcoming";
  if (now > until) return "expired";
  return "active";
}

export function getVoucherCodeStatus(
  validFrom: string,
  validUntil: string,
  usedAt: string | null,
  now = new Date(),
): VoucherCodeStatus {
  if (usedAt) return "used";
  return getVoucherCampaignStatus(validFrom, validUntil, now);
}

export const VOUCHER_STATUS_LABEL: Record<VoucherCodeStatus, string> = {
  upcoming: "Belum berlaku",
  active: "Aktif",
  expired: "Kadaluarsa",
  used: "Sudah dipakai",
};

export function voucherStatusBadgeVariant(
  status: VoucherCodeStatus,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "active") return "default";
  if (status === "used") return "secondary";
  if (status === "expired") return "destructive";
  return "outline";
}

export function formatVoucherCodeDisplay(code: string): string {
  const compact = code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (compact.length !== 12) return compact;
  return `${compact.slice(0, 4)}-${compact.slice(4, 8)}-${compact.slice(8, 12)}`;
}

export function formatVoucherPeriod(validFrom: string, validUntil: string): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  return `${fmt(validFrom)} – ${fmt(validUntil)}`;
}
