"use client";

import * as React from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createVoucher, updateVoucher, uploadVoucherImage } from "@/lib/admin-voucher.functions";
import { VoucherImageCropper } from "@/components/admin/VoucherImageCropper";
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
import { ImagePlus, X } from "lucide-react";
import { toast } from "sonner";

const BG_PRESETS = [
  "#1a1a2e",
  "#16213e",
  "#0f3460",
  "#533483",
  "#e94560",
  "#1b4332",
  "#2d6a4f",
  "#b5838d",
  "#6d6875",
  "#264653",
  "#e76f51",
  "#f4a261",
] as const;

export type VoucherFormInitial = {
  id: string;
  name: string;
  description: string;
  how_to_get: string;
  how_to_use: string;
  terms_and_conditions: string;
  valid_from: string;
  valid_until: string;
  bg_color?: string;
  image_url?: string | null;
  image_storage_path?: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  voucher?: VoucherFormInitial | null;
};

function toLocalInput(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localToIso(local: string, label: string): string {
  if (!local) throw new Error(`${label} wajib diisi.`);
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) throw new Error(`Format ${label.toLowerCase()} tidak valid.`);
  return d.toISOString();
}

export function VoucherFormDialog({ open, onOpenChange, voucher }: Props) {
  const isEdit = Boolean(voucher);
  const queryClient = useQueryClient();

  const [name, setName] = React.useState("");
  const [validFrom, setValidFrom] = React.useState("");
  const [validUntil, setValidUntil] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [howToGet, setHowToGet] = React.useState("");
  const [howToUse, setHowToUse] = React.useState("");
  const [terms, setTerms] = React.useState("");
  const [bgColor, setBgColor] = React.useState("#1a1a2e");

  const [imagePreview, setImagePreview] = React.useState<string | null>(null);
  const [imageBase64, setImageBase64] = React.useState<string | null>(null);
  const [imageStoragePath, setImageStoragePath] = React.useState<string | null>(null);
  const [imageUrl, setImageUrl] = React.useState<string>("");
  const [imageChanged, setImageChanged] = React.useState(false);

  const [cropperOpen, setCropperOpen] = React.useState(false);
  const [rawImageSrc, setRawImageSrc] = React.useState<string>("");
  const [rawFileName, setRawFileName] = React.useState("image.webp");
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) return;
    if (voucher) {
      setName(voucher.name);
      setValidFrom(toLocalInput(voucher.valid_from));
      setValidUntil(toLocalInput(voucher.valid_until));
      setDescription(voucher.description ?? "");
      setHowToGet(voucher.how_to_get ?? "");
      setHowToUse(voucher.how_to_use ?? "");
      setTerms(voucher.terms_and_conditions ?? "");
      setBgColor(voucher.bg_color ?? "#1a1a2e");
      setImagePreview(voucher.image_url ?? null);
      setImageBase64(null);
      setImageStoragePath(voucher.image_storage_path ?? null);
      setImageUrl(voucher.image_url ?? "");
      setImageChanged(false);
    } else {
      setName("");
      setValidFrom("");
      setValidUntil("");
      setDescription("");
      setHowToGet("");
      setHowToUse("");
      setTerms("");
      setBgColor("#1a1a2e");
      setImagePreview(null);
      setImageBase64(null);
      setImageStoragePath(null);
      setImageUrl("");
      setImageChanged(false);
    }
  }, [open, voucher]);

  const createFn = useServerFn(createVoucher);
  const updateFn = useServerFn(updateVoucher);
  const uploadFn = useServerFn(uploadVoucherImage);

  const saveMutation = useMutation({
    mutationFn: async () => {
      let finalImageUrl = imageUrl;
      let finalImageStoragePath = imageStoragePath;

      if (imageBase64 && imageChanged) {
        const uploaded = await uploadFn({
          data: {
            voucherId: voucher?.id,
            fileName: rawFileName,
            fileBase64: imageBase64,
            contentType: "image/webp",
          },
        });
        finalImageUrl = uploaded.imageUrl;
        finalImageStoragePath = uploaded.imageStoragePath;
      }

      if (imageChanged && !imageBase64) {
        finalImageUrl = "";
        finalImageStoragePath = null;
      }

      const payload = {
        name: name.trim(),
        description: description.trim(),
        howToGet: howToGet.trim(),
        howToUse: howToUse.trim(),
        termsAndConditions: terms.trim(),
        validFrom: localToIso(validFrom, "Tanggal mulai"),
        validUntil: localToIso(validUntil, "Tanggal selesai"),
        bgColor,
        imageUrl: finalImageUrl,
        imageStoragePath: imageChanged ? finalImageStoragePath : undefined,
      };

      if (isEdit && voucher) {
        return updateFn({ data: { voucherId: voucher.id, ...payload } });
      }
      return createFn({ data: payload });
    },
    onSuccess: () => {
      toast.success(isEdit ? "Voucher berhasil diperbarui." : "Voucher berhasil dibuat.");
      onOpenChange(false);
      void queryClient.invalidateQueries({ queryKey: ["admin", "voucher"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "reward"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("File harus berupa gambar.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Ukuran gambar maksimal 10 MB.");
      return;
    }
    setRawFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setRawImageSrc(reader.result as string);
      setCropperOpen(true);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function handleCropDone(result: { base64: string; previewUrl: string }) {
    setImagePreview(result.previewUrl);
    setImageBase64(result.base64);
    setImageChanged(true);
  }

  function handleRemoveImage() {
    setImagePreview(null);
    setImageBase64(null);
    setImageChanged(true);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEdit ? "Edit voucher" : "Buat voucher"}</DialogTitle>
            <DialogDescription>
              Penerima dan kode unik bisa diatur nanti di halaman detail voucher.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="space-y-2">
              <Label htmlFor="voucher-name">Nama Voucher</Label>
              <Input
                id="voucher-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Contoh: Minuman gratis weekend"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="voucher-from">Mulai berlaku</Label>
                <Input
                  id="voucher-from"
                  type="datetime-local"
                  value={validFrom}
                  onChange={(e) => setValidFrom(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="voucher-until">Berakhir</Label>
                <Input
                  id="voucher-until"
                  type="datetime-local"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Warna background voucher</Label>
              <div className="flex flex-wrap gap-2">
                {BG_PRESETS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="h-7 w-7 rounded-full border-2 transition-all"
                    style={{
                      backgroundColor: c,
                      borderColor: bgColor === c ? "white" : "transparent",
                      boxShadow: bgColor === c ? `0 0 0 2px ${c}` : "none",
                    }}
                    onClick={() => setBgColor(c)}
                    aria-label={c}
                  />
                ))}
                <label className="relative h-7 w-7 rounded-full border-2 border-dashed border-muted-foreground overflow-hidden cursor-pointer flex items-center justify-center text-xs text-muted-foreground hover:border-foreground transition-colors">
                  <span className="sr-only">Warna kustom</span>
                  <span aria-hidden>+</span>
                  <input
                    type="color"
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    value={bgColor}
                    onChange={(e) => setBgColor(e.target.value)}
                  />
                </label>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Gambar voucher (opsional)</Label>
              {imagePreview ? (
                <div className="relative rounded-lg overflow-hidden border">
                  <img
                    src={imagePreview}
                    alt="Preview"
                    className="w-full aspect-video object-cover"
                  />
                  <button
                    type="button"
                    className="absolute top-2 right-2 rounded-full bg-black/60 p-1 text-white hover:bg-black/80 transition-colors"
                    onClick={handleRemoveImage}
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="absolute bottom-2 right-2 rounded-md bg-black/60 px-2 py-1 text-xs text-white hover:bg-black/80 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Ganti gambar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="flex flex-col items-center justify-center gap-2 w-full aspect-video rounded-lg border-2 border-dashed border-muted-foreground/30 hover:border-muted-foreground/60 transition-colors bg-muted/20 text-muted-foreground"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <ImagePlus className="h-8 w-8" />
                  <span className="text-sm">Pilih gambar</span>
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleFileSelect}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="voucher-desc">Description (opsional)</Label>
              <Textarea
                id="voucher-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Ringkasan manfaat voucher"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="voucher-how-get">How to get (opsional)</Label>
              <Textarea
                id="voucher-how-get"
                value={howToGet}
                onChange={(e) => setHowToGet(e.target.value)}
                rows={2}
                placeholder="Contoh: Diberikan admin, atau tukar Star di katalog Reward"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="voucher-how">How to use (opsional)</Label>
              <Textarea
                id="voucher-how"
                value={howToUse}
                onChange={(e) => setHowToUse(e.target.value)}
                rows={2}
                placeholder="Tunjukkan kode ke kasir untuk ditukar"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="voucher-tnc">Terms & Condition (opsional)</Label>
              <Textarea
                id="voucher-tnc"
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
                rows={3}
                placeholder="Tidak dapat digabung dengan promo lain, dll."
              />
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

      <VoucherImageCropper
        open={cropperOpen}
        onOpenChange={setCropperOpen}
        imageSrc={rawImageSrc}
        onCropDone={handleCropDone}
      />
    </>
  );
}
