"use client";

import * as React from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createFnbMenuItem,
  FNB_CATEGORIES,
  FNB_CATEGORY_LABELS,
  type FnbCategory,
  updateFnbMenuItem,
  uploadFnbMenuImage,
} from "@/lib/admin-fnb.functions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export type FnbMenuItemRow = {
  id: string;
  name: string;
  category: string;
  price_idr: number;
  image_url: string | null;
  image_storage_path: string | null;
  description: string;
  is_available: boolean;
  sort_order: number;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item?: FnbMenuItemRow | null;
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] ?? "";
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function FnbMenuItemDialog({ open, onOpenChange, item }: Props) {
  const isEdit = Boolean(item);
  const queryClient = useQueryClient();

  const [name, setName] = React.useState("");
  const [category, setCategory] = React.useState<FnbCategory>("food");
  const [priceIdr, setPriceIdr] = React.useState("25000");
  const [description, setDescription] = React.useState("");
  const [imageUrl, setImageUrl] = React.useState("");
  const [imageStoragePath, setImageStoragePath] = React.useState<string | null>(null);
  const [isAvailable, setIsAvailable] = React.useState(true);
  const [sortOrder, setSortOrder] = React.useState("0");
  const [pendingFile, setPendingFile] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    if (item) {
      setName(item.name);
      setCategory(item.category as FnbCategory);
      setPriceIdr(String(item.price_idr));
      setDescription(item.description ?? "");
      setImageUrl(item.image_url ?? "");
      setImageStoragePath(item.image_storage_path);
      setIsAvailable(item.is_available);
      setSortOrder(String(item.sort_order));
      setPreviewUrl(item.image_url || null);
    } else {
      setName("");
      setCategory("food");
      setPriceIdr("25000");
      setDescription("");
      setImageUrl("");
      setImageStoragePath(null);
      setIsAvailable(true);
      setSortOrder("0");
      setPreviewUrl(null);
    }
    setPendingFile(null);
  }, [open, item]);

  const uploadFn = useServerFn(uploadFnbMenuImage);
  const createFn = useServerFn(createFnbMenuItem);
  const updateFn = useServerFn(updateFnbMenuItem);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const price = parseInt(priceIdr.replace(/\D/g, ""), 10);
      if (!name.trim()) throw new Error("Nama menu wajib diisi.");
      if (!Number.isFinite(price) || price < 0) throw new Error("Harga tidak valid.");

      let finalImageUrl = imageUrl;
      let finalStoragePath = imageStoragePath;

      if (pendingFile) {
        const base64 = await fileToBase64(pendingFile);
        const uploaded = await uploadFn({
          data: {
            itemId: item?.id,
            fileName: pendingFile.name,
            fileBase64: base64,
            contentType: pendingFile.type,
          },
        });
        finalImageUrl = uploaded.imageUrl;
        finalStoragePath = uploaded.imageStoragePath;
      }

      const payload = {
        name: name.trim(),
        category,
        priceIdr: price,
        description: description.trim(),
        imageUrl: finalImageUrl,
        imageStoragePath: finalStoragePath,
        isAvailable,
        sortOrder: parseInt(sortOrder, 10) || 0,
      };

      if (isEdit && item) {
        await updateFn({ data: { itemId: item.id, ...payload } });
      } else {
        await createFn({ data: payload });
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? "Menu berhasil diperbarui." : "Menu berhasil ditambahkan.");
      onOpenChange(false);
      void queryClient.invalidateQueries({ queryKey: ["admin", "fnb", "menu"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("File harus berupa gambar.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Ukuran gambar maksimal 5 MB.");
      return;
    }
    setPendingFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit menu FnB" : "Tambah menu FnB"}</DialogTitle>
          <DialogDescription>
            Menu ini akan ditampilkan di aplikasi dan dapat dipesan oleh pengguna.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="fnb-name">Nama menu</Label>
            <Input
              id="fnb-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saveMutation.isPending}
              placeholder="Contoh: Nasi Goreng"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Kategori</Label>
              <Select
                value={category}
                onValueChange={(v) => setCategory(v as FnbCategory)}
                disabled={saveMutation.isPending}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FNB_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {FNB_CATEGORY_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="fnb-price">Harga (IDR)</Label>
              <Input
                id="fnb-price"
                type="number"
                min={0}
                value={priceIdr}
                onChange={(e) => setPriceIdr(e.target.value)}
                disabled={saveMutation.isPending}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="fnb-desc">Deskripsi (opsional)</Label>
            <Textarea
              id="fnb-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={saveMutation.isPending}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="fnb-image">Foto menu</Label>
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Preview"
                className="h-32 w-full rounded-lg object-cover border"
              />
            ) : null}
            <Input
              id="fnb-image"
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              disabled={saveMutation.isPending}
            />
          </div>

          <div className="grid grid-cols-2 gap-4 items-end">
            <div className="space-y-2">
              <Label htmlFor="fnb-sort">Urutan tampil</Label>
              <Input
                id="fnb-sort"
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                disabled={saveMutation.isPending}
              />
            </div>
            <div className="flex items-center gap-2 pb-2">
              <Switch
                id="fnb-available"
                checked={isAvailable}
                onCheckedChange={setIsAvailable}
                disabled={saveMutation.isPending}
              />
              <Label htmlFor="fnb-available">Tersedia untuk dipesan</Label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button
            type="button"
            disabled={saveMutation.isPending || !name.trim()}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? "Menyimpan…" : "Simpan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
