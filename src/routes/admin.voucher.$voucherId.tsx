import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { VoucherCardPreview } from "@/components/admin/VoucherCardPreview";
import { ArrowLeft, Pencil, Plus, Search, Trash2, UserPlus, Users } from "lucide-react";
import * as React from "react";
import { addVoucherRecipients, deleteVoucher, getVoucherDetail, redeemVoucherCode } from "@/lib/admin-voucher.functions";
import {
  formatVoucherCodeDisplay,
  formatVoucherPeriod,
  VOUCHER_ISSUED_VIA_LABEL,
  VOUCHER_STATUS_LABEL,
  voucherStatusBadgeVariant,
} from "@/lib/voucher-display";
import { formatStarCost } from "@/lib/star-display";
import { VoucherAddRecipientsDialog } from "@/components/admin/VoucherAddRecipientsDialog";
import { VoucherFormDialog, type VoucherFormInitial } from "@/components/admin/VoucherFormDialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/voucher/$voucherId")({
  component: VoucherDetailPage,
});

function initials(name: string | null, username: string | null) {
  const src = (name || username || "?").trim();
  return src.slice(0, 2).toUpperCase();
}

function formatUsedAt(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizeInput(raw: string) {
  return raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

function RedeemCodeCell({
  voucherId,
  userId,
  usedAt,
  status,
}: {
  voucherId: string;
  userId: string;
  usedAt: string | null;
  status: "upcoming" | "active" | "expired" | "used";
}) {
  const queryClient = useQueryClient();
  const redeemFn = useServerFn(redeemVoucherCode);
  const [code, setCode] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  const redeemMutation = useMutation({
    mutationFn: (value: string) =>
      redeemFn({ data: { code: value, voucherId, userId } }),
    onSuccess: () => {
      setCode("");
      toast.success("Kode benar. Voucher ditandai sudah digunakan.");
      void queryClient.invalidateQueries({ queryKey: ["admin", "voucher"] });
    },
    onError: (e: Error) => {
      toast.error(e.message);
      inputRef.current?.select();
    },
  });

  if (usedAt || status === "used") {
    return <span className="text-xs text-muted-foreground">Sudah ditukar</span>;
  }

  if (status === "expired") {
    return <span className="text-xs text-muted-foreground">Kadaluarsa</span>;
  }

  return (
    <form
      className="flex items-center justify-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const compact = normalizeInput(code);
        if (!compact) {
          toast.error("Masukkan kode voucher.");
          return;
        }
        redeemMutation.mutate(compact);
      }}
    >
      <Input
        ref={inputRef}
        value={code}
        onChange={(e) => setCode(normalizeInput(e.target.value))}
        placeholder="Masukkan kode"
        className="font-mono uppercase h-8 w-[9.5rem] text-xs tracking-wider"
        autoComplete="off"
        maxLength={12}
        disabled={redeemMutation.isPending || status === "upcoming"}
      />
      <Button
        type="submit"
        size="sm"
        disabled={redeemMutation.isPending || !code.trim() || status === "upcoming"}
      >
        {redeemMutation.isPending ? "…" : "Tukar"}
      </Button>
    </form>
  );
}

function VoucherDetailPage() {
  const { voucherId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchDetail = useServerFn(getVoucherDetail);
  const deleteFn = useServerFn(deleteVoucher);
  const addRecipientsFn = useServerFn(addVoucherRecipients);
  const [editOpen, setEditOpen] = React.useState(false);
  const [addOpen, setAddOpen] = React.useState(false);
  const [recipientSearch, setRecipientSearch] = React.useState("");
  const [sourceFilter, setSourceFilter] = React.useState<"all" | "admin" | "star_reward">("all");

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "voucher", "detail", voucherId],
    queryFn: () => fetchDetail({ data: { voucherId } }),
    refetchOnWindowFocus: true,
    refetchInterval: 15_000,
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteFn({ data: { voucherId } }),
    onSuccess: (res) => {
      toast.success(`Voucher "${res.name}" berhasil dihapus.`);
      void queryClient.invalidateQueries({ queryKey: ["admin", "voucher"] });
      void navigate({ to: "/admin/voucher" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addAllMutation = useMutation({
    mutationFn: () => addRecipientsFn({ data: { voucherId, assignToAll: true, userIds: [] } }),
    onSuccess: (res) => {
      toast.success(
        res.issued > 0
          ? `Semua pengguna ditambahkan (${res.issued} kode baru).`
          : "Semua pengguna sudah memiliki kode.",
      );
      void queryClient.invalidateQueries({ queryKey: ["admin", "voucher"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const voucher = data?.voucher;
  const recipients = data?.recipients ?? [];
  const adminCount = recipients.filter((r) => r.issued_via === "admin").length;
  const starCount = recipients.filter((r) => r.issued_via === "star_reward").length;
  const q = recipientSearch.trim().toLowerCase();
  const filteredRecipients = recipients.filter((r) => {
    if (sourceFilter !== "all" && r.issued_via !== sourceFilter) return false;
    if (!q) return true;
    const hay = `${r.display_name ?? ""} ${r.username ?? ""} ${r.code} ${VOUCHER_ISSUED_VIA_LABEL[r.issued_via]}`.toLowerCase();
    return hay.includes(q);
  });
  const starUserIds = [...new Set(recipients.filter((r) => r.issued_via === "star_reward").map((r) => r.user_id))];

  const formInitial: VoucherFormInitial | null = voucher
    ? {
        id: voucher.id,
        name: voucher.name,
        description: voucher.description,
        how_to_get: voucher.how_to_get,
        how_to_use: voucher.how_to_use,
        terms_and_conditions: voucher.terms_and_conditions,
        valid_from: voucher.valid_from,
        valid_until: voucher.valid_until,
        bg_color: voucher.bg_color,
        image_url: voucher.image_url,
        image_storage_path: voucher.image_storage_path,
        is_purchasable: voucher.is_purchasable,
        star_cost: voucher.star_cost,
        stock_limit: voucher.stock_limit,
      }
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Button type="button" variant="ghost" size="sm" className="-ml-2" asChild>
            <Link to="/admin/voucher">
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              Kembali
            </Link>
          </Button>
          <h2 className="text-xl font-semibold">{isLoading ? "…" : voucher?.name}</h2>
          {voucher ? (
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>{formatVoucherPeriod(voucher.valid_from, voucher.valid_until)}</span>
              <Badge variant={voucherStatusBadgeVariant(voucher.status)}>
                {VOUCHER_STATUS_LABEL[voucher.status]}
              </Badge>
              {voucher.assign_to_all ? <Badge variant="secondary">Semua pengguna</Badge> : null}
              {voucher.is_purchasable && voucher.star_cost ? (
                <Badge variant="outline">{formatStarCost(voucher.star_cost)}</Badge>
              ) : null}
              {voucher.stock_limit !== null && voucher.stock_limit !== undefined ? (
                <Badge variant="secondary">
                  Stok: {voucher.redeemed_count}/{voucher.stock_limit}
                </Badge>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={!voucher} onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4 mr-1.5" />
            Edit
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            disabled={deleteMutation.isPending || !voucher}
            onClick={() => {
              if (!voucher) return;
              if (
                !window.confirm(
                  `Hapus voucher "${voucher.name}" beserta semua kodenya? Tindakan ini tidak dapat dibatalkan.`,
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

      {voucher ? (
        <section>
          <VoucherCardPreview
            name={voucher.name}
            validFrom={voucher.valid_from}
            validUntil={voucher.valid_until}
            bgColor={voucher.bg_color ?? "#1a1a2e"}
            imageUrl={voucher.image_url}
          />
        </section>
      ) : null}

      {voucher &&
      (voucher.description || voucher.how_to_get || voucher.how_to_use || voucher.terms_and_conditions) ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {voucher.description ? (
            <section className="rounded-xl border bg-card p-4 shadow-sm">
              <h3 className="text-sm font-semibold mb-1">Description</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{voucher.description}</p>
            </section>
          ) : null}
          {voucher.how_to_get ? (
            <section className="rounded-xl border bg-card p-4 shadow-sm">
              <h3 className="text-sm font-semibold mb-1">How to get</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{voucher.how_to_get}</p>
            </section>
          ) : null}
          {voucher.how_to_use ? (
            <section className="rounded-xl border bg-card p-4 shadow-sm">
              <h3 className="text-sm font-semibold mb-1">How to use</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{voucher.how_to_use}</p>
            </section>
          ) : null}
          {voucher.terms_and_conditions ? (
            <section className="rounded-xl border bg-card p-4 shadow-sm">
              <h3 className="text-sm font-semibold mb-1">Terms & Condition</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {voucher.terms_and_conditions}
              </p>
            </section>
          ) : null}
        </div>
      ) : null}

      <section className="rounded-xl border bg-card shadow-sm">
        <div className="p-5 border-b flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative min-w-[200px] sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={recipientSearch}
                onChange={(e) => setRecipientSearch(e.target.value)}
                placeholder="Cari nama / kode…"
                className="pl-9"
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" size="sm" className="gap-1.5" disabled={!voucher || addAllMutation.isPending}>
                  <Plus className="h-4 w-4" />
                  Tambahkan pengguna
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setAddOpen(true)}>
                  <UserPlus className="h-4 w-4" />
                  Pilih pengguna
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={addAllMutation.isPending}
                  onClick={() => addAllMutation.mutate()}
                >
                  <Users className="h-4 w-4" />
                  Semua pengguna
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                { id: "all" as const, label: `Semua (${recipients.length})` },
                { id: "admin" as const, label: `Admin (${adminCount})` },
                { id: "star_reward" as const, label: `Star (${starCount})` },
              ] as const
            ).map((opt) => (
              <Button
                key={opt.id}
                type="button"
                size="sm"
                variant={sourceFilter === opt.id ? "default" : "outline"}
                className="h-7"
                onClick={() => setSourceFilter(opt.id)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground bg-muted/40 sticky top-0">
              <tr>
                <th className="px-4 py-2">Pengguna</th>
                <th className="px-4 py-2">Kode</th>
                <th className="px-4 py-2">Sumber</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2 text-right">Tukar kode</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecipients.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-7 w-7">
                        <AvatarImage src={r.avatar_url ?? undefined} alt="" />
                        <AvatarFallback className="text-[10px]">
                          {initials(r.display_name, r.username)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium">{r.display_name || r.username || r.user_id.slice(0, 8)}</div>
                        {r.username && r.display_name ? (
                          <div className="text-xs text-muted-foreground">@{r.username}</div>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs tracking-wider">
                    {formatVoucherCodeDisplay(r.code)}
                  </td>
                  <td className="px-4 py-2">
                    <Badge variant={r.issued_via === "star_reward" ? "default" : "secondary"}>
                      {VOUCHER_ISSUED_VIA_LABEL[r.issued_via]}
                    </Badge>
                  </td>
                  <td className="px-4 py-2">
                    <Badge variant={voucherStatusBadgeVariant(r.status)}>
                      {VOUCHER_STATUS_LABEL[r.status]}
                    </Badge>
                    {r.used_at ? (
                      <div className="text-xs text-muted-foreground mt-0.5">{formatUsedAt(r.used_at)}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-2">
                    <RedeemCodeCell
                      voucherId={voucherId}
                      userId={r.user_id}
                      usedAt={r.used_at}
                      status={r.status}
                    />
                  </td>
                </tr>
              ))}
              {!isLoading && filteredRecipients.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    {recipients.length === 0
                      ? "Belum ada penerima."
                      : "Tidak ada penerima yang cocok."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <VoucherFormDialog open={editOpen} onOpenChange={setEditOpen} voucher={formInitial} />
      <VoucherAddRecipientsDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        voucherId={voucherId}
        existingUserIds={recipients.filter((r) => r.issued_via === "admin").map((r) => r.user_id)}
        starUserIds={starUserIds}
      />
    </div>
  );
}
