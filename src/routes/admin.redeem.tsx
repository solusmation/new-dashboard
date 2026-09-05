import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { Coins, Gift, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  confirmStarRedeem,
  listOpenStarRedeemSessions,
  validateStarRedeemCode,
  type EligibleStarVoucher,
  type OpenStarRedeemSession,
  type ValidateStarRedeemResult,
} from "@/lib/admin-star-redeem.functions";
import { formatStarCost } from "@/lib/star-display";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/redeem")({
  component: StarRedeemPage,
});

function normalizeCode(raw: string) {
  return raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

function initials(name: string | null, username: string | null) {
  const src = (name || username || "?").trim();
  return src.slice(0, 2).toUpperCase();
}

function personLabel(displayName: string | null, username: string | null, userId: string) {
  const name = displayName?.trim() || username?.trim();
  if (name) return username ? `${name} (@${username})` : name;
  return userId.slice(0, 8);
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function secondsSince(iso: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
}

function StarRedeemPage() {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listOpenStarRedeemSessions);
  const validateFn = useServerFn(validateStarRedeemCode);
  const confirmFn = useServerFn(confirmStarRedeem);

  const [codeInput, setCodeInput] = React.useState("");
  const [validated, setValidated] = React.useState<ValidateStarRedeemResult | null>(null);
  const [selectedVoucher, setSelectedVoucher] = React.useState<EligibleStarVoucher | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [, setTick] = React.useState(0);

  const { data: sessions = [], isLoading, error } = useQuery({
    queryKey: ["admin", "star-redeem", "open"],
    queryFn: () => listFn(),
  });

  React.useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  React.useEffect(() => {
    let debounceTimer: number | undefined;
    const invalidateSoon = () => {
      window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: ["admin", "star-redeem", "open"] });
      }, 1200);
    };

    const channel = supabase
      .channel("admin-star-redeem-sessions")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "star_redeem_sessions" },
        invalidateSoon,
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "star_redeem_sessions" },
        (payload) => {
          const prev = payload.old as { status?: string } | null;
          const next = payload.new as { status?: string } | null;
          // Abaikan heartbeat last_seen_at; refetch hanya saat status berubah.
          if (prev?.status !== next?.status) invalidateSoon();
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "star_redeem_sessions" },
        invalidateSoon,
      )
      .subscribe();

    return () => {
      window.clearTimeout(debounceTimer);
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  React.useEffect(() => {
    if (!validated) return;
    const stillOpen = sessions.some((s) => s.id === validated.session.id);
    if (!stillOpen) {
      setValidated(null);
      setSelectedVoucher(null);
      setConfirmOpen(false);
      toast.message("Session redeem user sudah ditutup.");
    }
  }, [sessions, validated]);

  const validateMutation = useMutation({
    mutationFn: (code: string) => validateFn({ data: { code } }),
    onSuccess: (res) => {
      setValidated(res);
      setSelectedVoucher(null);
      toast.success("Kode valid. Pilih voucher untuk ditukar.");
      void queryClient.invalidateQueries({ queryKey: ["admin", "star-redeem", "open"] });
    },
    onError: (e: Error) => {
      setValidated(null);
      setSelectedVoucher(null);
      toast.error(e.message);
    },
  });

  const confirmMutation = useMutation({
    mutationFn: () => {
      if (!validated || !selectedVoucher) {
        throw new Error("Pilih voucher terlebih dahulu.");
      }
      return confirmFn({
        data: {
          sessionId: validated.session.id,
          voucherId: selectedVoucher.id,
        },
      });
    },
    onSuccess: (res) => {
      toast.success(
        `"${res.voucher_name}" ditukar. Sisa Star: ${res.coins_remaining.toLocaleString("id-ID")}.`,
      );
      setConfirmOpen(false);
      setValidated(null);
      setSelectedVoucher(null);
      setCodeInput("");
      void queryClient.invalidateQueries({ queryKey: ["admin", "star-redeem", "open"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function onPickSession(session: OpenStarRedeemSession) {
    setCodeInput(session.code);
    validateMutation.mutate(session.code);
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Tukar Star</h1>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <section className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-semibold text-foreground">Antrian aktif</h2>
            </div>
            <Badge variant="secondary">{sessions.length} terbuka</Badge>
          </div>

          <div className="p-3 space-y-2 max-h-[70vh] overflow-y-auto">
            {isLoading && (
              <p className="text-sm text-muted-foreground px-2 py-6 text-center">Memuat antrian…</p>
            )}
            {error && (
              <p className="text-sm text-destructive px-2 py-4">{(error as Error).message}</p>
            )}
            {!isLoading && !error && sessions.length === 0 && (
              <p className="text-sm text-muted-foreground px-2 py-8 text-center">
                Belum ada user yang membuka bagian Redeem.
              </p>
            )}
            {sessions.map((session) => {
              const age = secondsSince(session.last_seen_at);
              const selected = validated?.session.id === session.id;
              return (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => onPickSession(session)}
                  className={cn(
                    "w-full text-left rounded-lg border p-3 transition-colors",
                    selected
                      ? "border-foreground/30 bg-muted/60"
                      : "hover:bg-muted/40",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={session.avatar_url ?? undefined} />
                      <AvatarFallback>
                        {initials(session.display_name, session.username)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">
                        {personLabel(session.display_name, session.username, session.user_id)}
                      </p>
                      <p className="text-xs text-muted-foreground font-mono tracking-wider">
                        {session.code}
                      </p>
                    </div>
                    <div className="text-right shrink-0 space-y-1">
                      <Badge variant={age <= 10 ? "default" : "outline"} className="text-[10px]">
                        {age <= 10 ? "hidup" : `${age}s`}
                      </Badge>
                      <p className="text-[11px] text-muted-foreground">
                        {formatTime(session.created_at)}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <div className="border-b px-4 py-3 space-y-3">
            <h2 className="font-semibold text-foreground">Validasi & tukar</h2>
            <form
              className="flex flex-col sm:flex-row gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const code = normalizeCode(codeInput);
                if (!code) {
                  toast.error("Masukkan kode redeem.");
                  return;
                }
                validateMutation.mutate(code);
              }}
            >
              <Input
                value={codeInput}
                onChange={(e) => setCodeInput(normalizeCode(e.target.value))}
                placeholder="Kode sementara user"
                className="font-mono uppercase tracking-wider"
                maxLength={8}
                autoComplete="off"
                disabled={validateMutation.isPending}
              />
              <Button type="submit" disabled={validateMutation.isPending || !codeInput.trim()}>
                {validateMutation.isPending ? "Memeriksa…" : "Validasi"}
              </Button>
            </form>
          </div>

          <div className="p-4 space-y-4">
            {!validated && (
              <p className="text-sm text-muted-foreground py-10 text-center">
                Masukkan atau pilih kode dari antrian untuk melihat saldo Star dan voucher yang bisa
                ditukar.
              </p>
            )}

            {validated && (
              <>
                <div className="flex items-center gap-3 rounded-lg border p-3">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={validated.user.avatar_url ?? undefined} />
                    <AvatarFallback>
                      {initials(validated.user.display_name, validated.user.username)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold truncate">
                      {personLabel(
                        validated.user.display_name,
                        validated.user.username,
                        validated.user.user_id,
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono tracking-wider">
                      {validated.session.code}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-2">
                    <Coins className="h-4 w-4 text-muted-foreground" />
                    <span className="font-semibold tabular-nums">
                      {validated.user.coins.toLocaleString("id-ID")}
                    </span>
                    <span className="text-xs text-muted-foreground">Star</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Gift className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold">Pilih voucher</h3>
                  </div>
                  {validated.vouchers.length === 0 ? (
                    <p className="text-sm text-muted-foreground rounded-lg border border-dashed p-4 text-center">
                      Tidak ada voucher Star yang bisa ditukar dengan saldo saat ini.
                    </p>
                  ) : (
                    <ul className="space-y-2 max-h-[42vh] overflow-y-auto pr-1">
                      {validated.vouchers.map((voucher) => {
                        const active = selectedVoucher?.id === voucher.id;
                        return (
                          <li key={voucher.id}>
                            <button
                              type="button"
                              onClick={() => setSelectedVoucher(voucher)}
                              className={cn(
                                "w-full text-left rounded-lg border p-3 transition-colors",
                                active
                                  ? "border-foreground/40 bg-muted/70 ring-1 ring-foreground/10"
                                  : "hover:bg-muted/40",
                              )}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 space-y-1">
                                  <p className="font-medium text-sm">{voucher.name}</p>
                                  {voucher.description ? (
                                    <p className="text-xs text-muted-foreground line-clamp-2">
                                      {voucher.description}
                                    </p>
                                  ) : null}
                                </div>
                                <Badge variant="outline" className="shrink-0">
                                  {formatStarCost(voucher.star_cost)}
                                </Badge>
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                <div className="pt-2">
                  <Button
                    className="w-full"
                    disabled={!selectedVoucher || confirmMutation.isPending}
                    onClick={() => setConfirmOpen(true)}
                  >
                    Tukar voucher
                  </Button>
                  <p className="text-[11px] text-muted-foreground mt-2 text-center">
                    Konfirmasi ulang ke user sebelum menekan tukar. Setelah dikonfirmasi tidak bisa
                    dibatalkan.
                  </p>
                </div>
              </>
            )}
          </div>
        </section>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Konfirmasi penukaran Star?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  Pastikan user menyetujui penukaran ini. Setelah dikonfirmasi, Star akan terpotong
                  dari wallet dan voucher masuk ke riwayat sebagai sudah digunakan.
                </p>
                {selectedVoucher && validated && (
                  <ul className="rounded-md border bg-muted/40 p-3 space-y-1 text-foreground">
                    <li>
                      <span className="text-muted-foreground">User: </span>
                      {personLabel(
                        validated.user.display_name,
                        validated.user.username,
                        validated.user.user_id,
                      )}
                    </li>
                    <li>
                      <span className="text-muted-foreground">Voucher: </span>
                      {selectedVoucher.name}
                    </li>
                    <li>
                      <span className="text-muted-foreground">Biaya: </span>
                      {formatStarCost(selectedVoucher.star_cost)}
                    </li>
                    <li>
                      <span className="text-muted-foreground">Sisa setelah tukar: </span>
                      {(validated.user.coins - selectedVoucher.star_cost).toLocaleString("id-ID")}{" "}
                      Star
                    </li>
                  </ul>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirmMutation.isPending}>Batal</AlertDialogCancel>
            <AlertDialogAction
              disabled={confirmMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                confirmMutation.mutate();
              }}
            >
              {confirmMutation.isPending ? "Memproses…" : "Ya, tukar sekarang"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
