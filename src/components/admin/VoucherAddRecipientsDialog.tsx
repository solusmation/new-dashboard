"use client";

import * as React from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { addVoucherRecipients, searchVoucherUsers, type VoucherUserOption } from "@/lib/admin-voucher.functions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  voucherId: string;
  existingUserIds: string[];
  starUserIds?: string[];
};

function userLabel(u: Pick<VoucherUserOption, "display_name" | "username" | "user_id">) {
  return u.display_name || u.username || u.user_id.slice(0, 8);
}

function initials(u: Pick<VoucherUserOption, "display_name" | "username">) {
  const src = (u.display_name || u.username || "?").trim();
  return src.slice(0, 2).toUpperCase();
}

export function VoucherAddRecipientsDialog({
  open,
  onOpenChange,
  voucherId,
  existingUserIds,
  starUserIds = [],
}: Props) {
  const queryClient = useQueryClient();
  const [userSearch, setUserSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const existing = React.useMemo(() => new Set(existingUserIds), [existingUserIds]);
  const starUsers = React.useMemo(() => new Set(starUserIds), [starUserIds]);

  React.useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(userSearch), 250);
    return () => window.clearTimeout(t);
  }, [userSearch]);

  React.useEffect(() => {
    if (!open) return;
    setUserSearch("");
    setSelected(new Set());
  }, [open]);

  const searchFn = useServerFn(searchVoucherUsers);
  const { data: userData, isLoading: usersLoading } = useQuery({
    queryKey: ["admin", "voucher", "users", debouncedSearch],
    queryFn: () => searchFn({ data: { search: debouncedSearch || undefined } }),
    enabled: open,
  });

  const addFn = useServerFn(addVoucherRecipients);
  const addMutation = useMutation({
    mutationFn: () =>
      addFn({
        data: { voucherId, assignToAll: false, userIds: [...selected] },
      }),
    onSuccess: (res) => {
      toast.success(
        res.issued > 0
          ? `${res.issued} pengguna ditambahkan.`
          : "Tidak ada pengguna baru yang ditambahkan.",
      );
      onOpenChange(false);
      void queryClient.invalidateQueries({ queryKey: ["admin", "voucher"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const results = (userData?.users ?? []).filter((u) => !existing.has(u.user_id));

  function toggleUser(userId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tambah pengguna</DialogTitle>
          <DialogDescription>
            Pilih pengguna yang belum punya kode admin. Yang sudah menukar dengan Star tetap bisa ditambah dan ditandai.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Cari nama / username…"
              className="pl-9"
            />
          </div>
          <ScrollArea className="h-56 rounded-md border">
            <div className="p-1">
              {usersLoading ? (
                <p className="px-2 py-4 text-sm text-muted-foreground">Memuat…</p>
              ) : results.length === 0 ? (
                <p className="px-2 py-4 text-sm text-muted-foreground">Tidak ada pengguna yang bisa ditambah.</p>
              ) : (
                results.map((u) => (
                  <label
                    key={u.user_id}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/60 cursor-pointer"
                  >
                    <Checkbox checked={selected.has(u.user_id)} onCheckedChange={() => toggleUser(u.user_id)} />
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={u.avatar_url ?? undefined} alt="" />
                      <AvatarFallback className="text-[10px]">{initials(u)}</AvatarFallback>
                    </Avatar>
                    <span className="text-sm truncate">{userLabel(u)}</span>
                    {starUsers.has(u.user_id) ? (
                      <Badge variant="outline" className="ml-auto shrink-0 text-[10px]">
                        Star
                      </Badge>
                    ) : null}
                  </label>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button
            type="button"
            disabled={addMutation.isPending || selected.size === 0}
            onClick={() => addMutation.mutate()}
          >
            {addMutation.isPending ? "Menambah…" : `Tambah${selected.size ? ` (${selected.size})` : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
