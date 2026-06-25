import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2, UtensilsCrossed } from "lucide-react";
import * as React from "react";
import {
  deleteFnbMenuItem,
  FNB_CATEGORY_LABELS,
  listFnbMenuItems,
} from "@/lib/admin-fnb.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  FnbMenuItemDialog,
  type FnbMenuItemRow,
} from "@/components/admin/FnbMenuItemDialog";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/fnb/")({
  component: FnbMenuPage,
});

const fmtIDR = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

function FnbMenuPage() {
  const queryClient = useQueryClient();
  const fetchMenu = useServerFn(listFnbMenuItems);
  const deleteFn = useServerFn(deleteFnbMenuItem);

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingItem, setEditingItem] = React.useState<FnbMenuItemRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "fnb", "menu"],
    queryFn: () => fetchMenu(),
  });

  const deleteMutation = useMutation({
    mutationFn: (itemId: string) => deleteFn({ data: { itemId } }),
    onSuccess: (res) => {
      toast.success(`Menu "${res.name}" berhasil dihapus.`);
      void queryClient.invalidateQueries({ queryKey: ["admin", "fnb", "menu"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = (data?.items ?? []) as FnbMenuItemRow[];

  function openCreate() {
    setEditingItem(null);
    setDialogOpen(true);
  }

  function openEdit(item: FnbMenuItemRow) {
    setEditingItem(item);
    setDialogOpen(true);
  }

  function handleDelete(item: FnbMenuItemRow) {
    if (!window.confirm(`Hapus menu "${item.name}"? Tindakan ini tidak dapat dibatalkan.`)) {
      return;
    }
    deleteMutation.mutate(item.id);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="rounded-xl border bg-card p-4 flex items-center gap-2 text-sm text-muted-foreground">
          <UtensilsCrossed className="h-4 w-4" />
          Total menu: {isLoading ? "…" : rows.length}
        </div>
        <Button type="button" size="sm" className="gap-1.5" onClick={openCreate}>
          <Plus className="size-4" />
          Tambah menu
        </Button>
      </div>

      <div className="rounded-xl border bg-card shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground bg-muted/40">
            <tr>
              <th className="px-4 py-3">Foto</th>
              <th className="px-4 py-3">Nama</th>
              <th className="px-4 py-3">Kategori</th>
              <th className="px-4 py-3">Harga</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.id} className="border-t">
                <td className="px-4 py-3">
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt={item.name}
                      className="h-12 w-12 rounded-lg object-cover border"
                    />
                  ) : (
                    <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center text-muted-foreground text-xs">
                      —
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium">{item.name}</div>
                  {item.description ? (
                    <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                      {item.description}
                    </div>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  {FNB_CATEGORY_LABELS[item.category as keyof typeof FNB_CATEGORY_LABELS] ??
                    item.category}
                </td>
                <td className="px-4 py-3 tabular-nums">{fmtIDR(item.price_idr)}</td>
                <td className="px-4 py-3">
                  <Badge variant={item.is_available ? "default" : "secondary"}>
                    {item.is_available ? "Tersedia" : "Nonaktif"}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => openEdit(item)}
                    >
                      <Pencil className="h-4 w-4 mr-1.5" />
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      disabled={deleteMutation.isPending}
                      onClick={() => handleDelete(item)}
                    >
                      <Trash2 className="h-4 w-4 mr-1.5" />
                      Hapus
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  Belum ada menu FnB. Tambahkan menu pertama Anda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <FnbMenuItemDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        item={editingItem}
      />
    </div>
  );
}
