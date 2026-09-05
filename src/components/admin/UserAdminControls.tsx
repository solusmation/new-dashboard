"use client";

import * as React from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  adjustUserCoins,
  MEMBERSHIP_TIERS,
  promoteUserToInstructor,
  revokeInstructorEligibility,
  updateProfileMembership,
  updateProfileRole,
} from "@/lib/admin-users.functions";
import {
  membershipTierLabel,
  normalizeMembershipTier,
} from "@/lib/membership-tier";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const ROLES = ["user", "admin", "superadmin"] as const;

type Props = {
  userId: string;
  currentRole: string;
  currentMembership: string;
  currentCoins: number;
  isInstructor: boolean;
};

export function UserAdminControls({
  userId,
  currentRole,
  currentMembership,
  currentCoins,
  isInstructor,
}: Props) {
  const queryClient = useQueryClient();
  const [role, setRole] = React.useState(currentRole);
  const [membership, setMembership] = React.useState(normalizeMembershipTier(currentMembership));
  const [hourlyRate, setHourlyRate] = React.useState("150000");
  const [coins, setCoins] = React.useState(String(currentCoins));

  React.useEffect(() => {
    setRole(currentRole);
  }, [currentRole]);

  React.useEffect(() => {
    setMembership(normalizeMembershipTier(currentMembership));
  }, [currentMembership]);

  React.useEffect(() => {
    setCoins(String(currentCoins));
  }, [currentCoins]);

  const updateRoleFn = useServerFn(updateProfileRole);
  const updateMembershipFn = useServerFn(updateProfileMembership);
  const adjustCoinsFn = useServerFn(adjustUserCoins);
  const promoteFn = useServerFn(promoteUserToInstructor);
  const revokeFn = useServerFn(revokeInstructorEligibility);

  const roleMutation = useMutation({
    mutationFn: () =>
      updateRoleFn({
        data: { userId, role: role as (typeof ROLES)[number] },
      }),
    onSuccess: () => {
      toast.success("Role pengguna diperbarui.");
      void queryClient.invalidateQueries({ queryKey: ["admin", "user", userId] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "users", "list"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const membershipMutation = useMutation({
    mutationFn: () =>
      updateMembershipFn({
        data: {
          userId,
          membershipTier: membership,
        },
      }),
    onSuccess: () => {
      toast.success("Membership pengguna diperbarui.");
      void queryClient.invalidateQueries({ queryKey: ["admin", "user", userId] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "users", "list"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "gold-benefits", userId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const coinsMutation = useMutation({
    mutationFn: (delta: number) => adjustCoinsFn({ data: { userId, delta } }),
    onSuccess: (res) => {
      toast.success(`Coins diperbarui menjadi ${res.coins.toLocaleString("id-ID")}.`);
      setCoins(String(res.coins));
      void queryClient.invalidateQueries({ queryKey: ["admin", "user", userId] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "users", "list"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const promoteMutation = useMutation({
    mutationFn: () => {
      const rate = parseInt(hourlyRate.replace(/\D/g, ""), 10);
      return promoteFn({
        data: {
          userId,
          hourlyRateIdr: Number.isFinite(rate) ? rate : 150_000,
          openToBook: true,
        },
      });
    },
    onSuccess: () => {
      toast.success("Pengguna sekarang eligible sebagai coach.");
      void queryClient.invalidateQueries({ queryKey: ["admin", "user", userId] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "users", "list"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "coaches"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revokeMutation = useMutation({
    mutationFn: () => revokeFn({ data: { userId } }),
    onSuccess: () => {
      toast.success("Status coach dicabut.");
      void queryClient.invalidateQueries({ queryKey: ["admin", "user", userId] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "users", "list"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "coaches"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const busy =
    roleMutation.isPending ||
    membershipMutation.isPending ||
    coinsMutation.isPending ||
    promoteMutation.isPending ||
    revokeMutation.isPending;
  const savedMembership = normalizeMembershipTier(currentMembership);

  const parsedCoins = parseInt(coins.replace(/\D/g, ""), 10);
  const coinsDirty =
    Number.isFinite(parsedCoins) && parsedCoins >= 0 && parsedCoins !== currentCoins;

  const saveCoins = () => {
    if (!Number.isFinite(parsedCoins) || parsedCoins < 0) {
      toast.error("Coins harus angka >= 0.");
      return;
    }
    const delta = parsedCoins - currentCoins;
    if (delta === 0) return;
    coinsMutation.mutate(delta);
  };

  return (
    <section className="rounded-xl border border-primary/20 bg-card p-5 shadow-sm space-y-5">
      <div>
        <h2 className="font-semibold text-foreground">Kelola pengguna (Superadmin)</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Ubah coins, membership, role, atau jadikan / cabut eligibility coach.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-end gap-3">
        <div className="flex-1 space-y-2">
          <Label htmlFor="user-coins">Coins</Label>
          <Input
            id="user-coins"
            type="number"
            min={0}
            step={1}
            className="w-full sm:max-w-xs"
            value={coins}
            onChange={(e) => setCoins(e.target.value)}
            disabled={busy}
          />
        </div>
        <Button type="button" disabled={busy || !coinsDirty} onClick={saveCoins}>
          Simpan coins
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-end gap-3">
        <div className="flex-1 space-y-2">
          <Label htmlFor="user-membership">Membership</Label>
          <Select
            value={membership}
            onValueChange={(v) => setMembership(normalizeMembershipTier(v))}
            disabled={busy}
          >
            <SelectTrigger id="user-membership" className="w-full sm:max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MEMBERSHIP_TIERS.map((tier) => (
                <SelectItem key={tier} value={tier}>
                  {membershipTierLabel(tier)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          disabled={busy || membership === savedMembership}
          onClick={() => membershipMutation.mutate()}
        >
          Simpan membership
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-end gap-3">
        <div className="flex-1 space-y-2">
          <Label htmlFor="user-role">Role</Label>
          <Select value={role} onValueChange={setRole} disabled={busy}>
            <SelectTrigger id="user-role" className="w-full sm:max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          disabled={busy || role === currentRole}
          onClick={() => roleMutation.mutate()}
        >
          Simpan role
        </Button>
      </div>

      <div className="border-t pt-4 space-y-3">
        <Label>Status coach</Label>
        {isInstructor ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-muted-foreground">Pengguna sudah terdaftar sebagai coach.</p>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={busy}
              onClick={() => {
                if (window.confirm("Cabut eligibility coach untuk pengguna ini?")) {
                  revokeMutation.mutate();
                }
              }}
            >
              Cabut eligibility coach
            </Button>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="space-y-2 flex-1 sm:max-w-xs">
              <Label htmlFor="hourly-rate">Tarif per jam (IDR)</Label>
              <Input
                id="hourly-rate"
                type="number"
                min={0}
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
                disabled={busy}
              />
            </div>
            <Button type="button" disabled={busy} onClick={() => promoteMutation.mutate()}>
              Jadikan coach
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
