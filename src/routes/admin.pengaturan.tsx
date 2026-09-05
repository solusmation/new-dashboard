import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Coins, Settings } from "lucide-react";
import { toast } from "sonner";
import { getClubSettings, updateDefaultNewUserCoins } from "@/lib/admin-settings.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/admin/pengaturan")({
  component: PengaturanPage,
});

function PengaturanPage() {
  const queryClient = useQueryClient();
  const fetchSettings = useServerFn(getClubSettings);
  const updateCoinsFn = useServerFn(updateDefaultNewUserCoins);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "club-settings"],
    queryFn: () => fetchSettings(),
  });

  const [coinsInput, setCoinsInput] = useState("");

  useEffect(() => {
    if (data) setCoinsInput(String(data.defaultNewUserCoins));
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const coins = parseInt(coinsInput.replace(/\D/g, ""), 10);
      if (!Number.isFinite(coins) || coins < 0) {
        throw new Error("Jumlah koin harus angka >= 0.");
      }
      return updateCoinsFn({ data: { coins } });
    },
    onSuccess: (res) => {
      toast.success(`Default koin user baru diset ke ${res.defaultNewUserCoins.toLocaleString("id-ID")}.`);
      void queryClient.invalidateQueries({ queryKey: ["admin", "club-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const current = data?.defaultNewUserCoins ?? 0;
  const parsed = parseInt(coinsInput.replace(/\D/g, ""), 10);
  const dirty = Number.isFinite(parsed) && parsed !== current;

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[720px]">
      <header className="flex items-center gap-2">
        <Settings className="h-8 w-8 text-muted-foreground" />
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Pengaturan</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Konfigurasi klub yang berlaku untuk user baru dan operasional dashboard
          </p>
        </div>
      </header>

      <section className="rounded-xl border bg-card p-6 shadow-sm space-y-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-muted p-2">
            <Coins className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <h2 className="font-semibold text-foreground">Koin awal user baru</h2>
            <p className="text-sm text-muted-foreground">
              Jumlah Star Poin yang diberikan otomatis saat signup. Tidak lagi hardcode 999 —
              atur di sini sesuai kebijakan klub.
            </p>
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}

        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="flex-1 space-y-2 sm:max-w-xs">
            <Label htmlFor="default-coins">Jumlah koin</Label>
            <Input
              id="default-coins"
              type="number"
              min={0}
              max={1_000_000}
              step={1}
              value={coinsInput}
              onChange={(e) => setCoinsInput(e.target.value)}
              disabled={isLoading || saveMutation.isPending}
              placeholder="0"
            />
          </div>
          <Button
            type="button"
            disabled={isLoading || saveMutation.isPending || !dirty}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? "Menyimpan…" : "Simpan"}
          </Button>
        </div>

        {data?.updatedAt && (
          <p className="text-xs text-muted-foreground">
            Terakhir diubah:{" "}
            {new Date(data.updatedAt).toLocaleString("id-ID", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </p>
        )}
      </section>
    </div>
  );
}
