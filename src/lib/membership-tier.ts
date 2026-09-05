export const MEMBERSHIP_TIERS = ["basic", "silver", "gold"] as const;
export type MembershipTier = (typeof MEMBERSHIP_TIERS)[number];

const MEMBERSHIP_LABELS: Record<MembershipTier, string> = {
  basic: "Basic",
  silver: "Silver",
  gold: "Gold",
};

export function normalizeMembershipTier(tier: string | null | undefined): MembershipTier {
  const normalized = String(tier ?? "").trim().toLowerCase();
  if (normalized === "silver" || normalized === "gold") return normalized;
  return "basic";
}

export function membershipTierLabel(tier: string | null | undefined): string {
  return MEMBERSHIP_LABELS[normalizeMembershipTier(tier)];
}
