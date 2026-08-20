"use client";

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createVoucher, uploadVoucherImage } from "@/lib/admin-voucher.functions";
import { VoucherImageCropper } from "@/components/admin/VoucherImageCropper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, ImagePlus, X } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/voucher/create")({
  component: VoucherCreatePage,
});

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

function localToIso(local: string, label: string): string {
  if (!local) throw new Error(`${label} wajib diisi.`);
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) throw new Error(`Format ${label.toLowerCase()} tidak valid.`);
  return d.toISOString();
}

function VoucherCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [name, setName] = React.useState("");
  const [validFrom, setValidFrom] = React.useState("");
  const [validUntil, setValidUntil] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [howToGet, setHowToGet] = React.useState("");
  const [howToUse, setHowToUse] = React.useState("");
  const [terms, setTerms] = React.useState("");
  const [bgColor, setBgColor] = React.useState("#1a1a2e");
  const [isPurchasable, setIsPurchasable] = React.useState(false);
  const [starCost, setStarCost] = React.useState("");
  const [stockMode, setStockMode] = React.useState<"unlimited" | "limited">("unlimited");
  const [stockLimit, setStockLimit] = React.useState("");

  const [imagePreview, setImagePreview] = React.useState<string | null>(null);
  const [imageBase64, setImageBase64] = React.useState<string | null>(null);
  const [imageUrl, setImageUrl] = React.useState("");

  const [cropperOpen, setCropperOpen] = React.useState(false);
  const [rawImageSrc, setRawImageSrc] = React.useState("");
  const [rawFileName, setRawFileName] = React.useState("image.webp");
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const createFn = useServerFn(createVoucher);
  const uploadFn = useServerFn(uploadVoucherImage);

  const saveMutation = useMutation({
    mutationFn: async () => {
      let finalImageUrl = imageUrl;
      let finalImageStoragePath: string | null = null;

      if (imageBase64) {
        const uploaded = await uploadFn({
          data: {
            fileName: rawFileName,
            fileBase64: imageBase64,
            contentType: "image/webp",
          },
        });
        finalImageUrl = uploaded.imageUrl;
        finalImageStoragePath = uploaded.imageStoragePath;
      }

      let parsedStarCost: number | null = null;
      if (isPurchasable) {
        parsedStarCost = parseInt(starCost, 10);
        if (!Number.isFinite(parsedStarCost) || parsedStarCost < 1) {
          throw new Error("Harga Star wajib diisi (minimal 1).");
        }
      }

      let parsedStockLimit: number | null = null;
      if (isPurchasable && stockMode === "limited") {
        parsedStockLimit = parseInt(stockLimit, 10);
        if (!Number.isFinite(parsedStockLimit) || parsedStockLimit < 1) {
          throw new Error("Jumlah stok wajib diisi (minimal 1).");
        }
      }

      return createFn({
        data: {
          name: name.trim(),
          description: description.trim(),
          howToGet: howToGet.trim(),
          howToUse: howToUse.trim(),
          termsAndConditions: terms.trim(),
          validFrom: localToIso(validFrom, "Tanggal mulai"),
          validUntil: localToIso(validUntil, "Tanggal selesai"),
          bgColor,
          imageUrl: finalImageUrl,
          imageStoragePath: finalImageStoragePath,
          isPurchasable,
          starCost: parsedStarCost,
          stockLimit: parsedStockLimit,
        },
      });
    },
    onSuccess: (res) => {
      toast.success("Voucher berhasil dibuat.");
      void queryClient.invalidateQueries({ queryKey: ["admin", "voucher"] });
      void navigate({ to: "/admin/voucher/$voucherId", params: { voucherId: res.id } });
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
  }

  function handleRemoveImage() {
    setImagePreview(null);
    setImageBase64(null);
  }

  return (
    <>
      <div className="space-y-6">
        <div className="space-y-1">
          <Button type="button" variant="ghost" size="sm" className="-ml-2" asChild>
            <Link to="/admin/voucher">
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              Kembali
            </Link>
          </Button>
          <h2 className="text-xl font-semibold">Buat voucher</h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="voucher-name">Nama Voucher</Label>
              <Input
                id="voucher-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Contoh: Minuman gratis weekend"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
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

          </div>

          <div className="space-y-4">
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
                placeholder="Contoh: Diberikan admin, atau dibeli dengan Star"
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
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="voucher-purchasable">Bisa dibeli dengan Star</Label>
            <Switch
              id="voucher-purchasable"
              checked={isPurchasable}
              onCheckedChange={setIsPurchasable}
            />
          </div>

          {isPurchasable ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="voucher-star-cost">Harga Star</Label>
                <Input
                  id="voucher-star-cost"
                  type="number"
                  min={1}
                  value={starCost}
                  onChange={(e) => setStarCost(e.target.value)}
                  placeholder="Contoh: 60"
                />
              </div>
              <div className="space-y-2">
                <Label>Stok</Label>
                <RadioGroup
                  value={stockMode}
                  onValueChange={(v) => setStockMode(v as "unlimited" | "limited")}
                  className="gap-2"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="unlimited" id="voucher-stock-unlimited" />
                    <Label htmlFor="voucher-stock-unlimited" className="font-normal cursor-pointer">
                      Tanpa batas
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="limited" id="voucher-stock-limited" />
                    <Label htmlFor="voucher-stock-limited" className="font-normal cursor-pointer">
                      Terbatas
                    </Label>
                  </div>
                </RadioGroup>
                {stockMode === "limited" ? (
                  <Input
                    type="number"
                    min={1}
                    value={stockLimit}
                    onChange={(e) => setStockLimit(e.target.value)}
                    placeholder="Contoh: 100"
                  />
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" asChild>
            <Link to="/admin/voucher">Batal</Link>
          </Button>
          <Button
            type="button"
            disabled={saveMutation.isPending || !name.trim()}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? "Menyimpan…" : "Simpan"}
          </Button>
        </div>
      </div>

      <VoucherImageCropper
        open={cropperOpen}
        onOpenChange={setCropperOpen}
        imageSrc={rawImageSrc}
        onCropDone={handleCropDone}
      />
    </>
  );
}
