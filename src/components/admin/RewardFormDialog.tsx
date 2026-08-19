"use client";

import * as React from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createReward,
  listLinkableVouchers,
  updateReward,
  uploadRewardImage,
  type LinkableVoucherOption,
} from "@/lib/admin-reward.functions";
import { REWARD_TYPE_OPTIONS, type RewardType } from "@/lib/reward-display";
import { formatVoucherPeriod } from "@/lib/voucher-display";
import { VoucherCardPreview } from "@/components/admin/VoucherCardPreview";
import { VoucherImageCropper } from "@/components/admin/VoucherImageCropper";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ImagePlus, X } from "lucide-react";
import { toast } from "sonner";

export type RewardFormInitial = {
  id: string;
  name: string;
  description: string;
  how_to_use: string;
  terms_and_conditions: string;
  star_cost: number;
  reward_type: RewardType;
  stock_limit: number | null;
  image_url?: string | null;
  image_storage_path?: string | null;
  voucher_id?: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reward?: RewardFormInitial | null;
};

export function RewardFormDialog({ open, onOpenChange, reward }: Props) {
  const isEdit = Boolean(reward);
  const queryClient = useQueryClient();
  const voucherLocked = Boolean(reward?.voucher_id);

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [howToUse, setHowToUse] = React.useState("");
  const [terms, setTerms] = React.useState("");
  const [starCost, setStarCost] = React.useState("");
  const [rewardType, setRewardType] = React.useState<RewardType>("other");
  const [voucherId, setVoucherId] = React.useState<string>("");
  const [stockMode, setStockMode] = React.useState<"unlimited" | "limited">("unlimited");
  const [stockLimit, setStockLimit] = React.useState("");

  const [imagePreview, setImagePreview] = React.useState<string | null>(null);
  const [imageBase64, setImageBase64] = React.useState<string | null>(null);
  const [imageStoragePath, setImageStoragePath] = React.useState<string | null>(null);
  const [imageUrl, setImageUrl] = React.useState("");
  const [imageChanged, setImageChanged] = React.useState(false);

  const [cropperOpen, setCropperOpen] = React.useState(false);
  const [rawImageSrc, setRawImageSrc] = React.useState("");
  const [rawFileName, setRawFileName] = React.useState("image.webp");
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) return;
    if (reward) {
      setName(reward.name);
      setDescription(reward.description ?? "");
      setHowToUse(reward.how_to_use ?? "");
      setTerms(reward.terms_and_conditions ?? "");
      setStarCost(String(reward.star_cost));
      setRewardType(reward.reward_type);
      setVoucherId(reward.voucher_id ?? "");
      if (reward.stock_limit === null) {
        setStockMode("unlimited");
        setStockLimit("");
      } else {
        setStockMode("limited");
        setStockLimit(String(reward.stock_limit));
      }
      setImagePreview(reward.image_url ?? null);
      setImageBase64(null);
      setImageStoragePath(reward.image_storage_path ?? null);
      setImageUrl(reward.image_url ?? "");
      setImageChanged(false);
    } else {
      setName("");
      setDescription("");
      setHowToUse("");
      setTerms("");
      setStarCost("");
      setRewardType("other");
      setVoucherId("");
      setStockMode("unlimited");
      setStockLimit("");
      setImagePreview(null);
      setImageBase64(null);
      setImageStoragePath(null);
      setImageUrl("");
      setImageChanged(false);
    }
  }, [open, reward]);

  const isVoucherType = rewardType === "voucher_discount";

  const fetchLinkable = useServerFn(listLinkableVouchers);
  const { data: voucherData } = useQuery({
    queryKey: ["admin", "reward", "linkable-vouchers", reward?.voucher_id ?? null],
    queryFn: () => fetchLinkable({ data: { includeVoucherId: reward?.voucher_id ?? null } }),
    enabled: open && isVoucherType,
  });

  const linkableVouchers = voucherData?.items ?? [];
  const selectedVoucher: LinkableVoucherOption | undefined = linkableVouchers.find(
    (v) => v.id === voucherId,
  );

  const createFn = useServerFn(createReward);
  const updateFn = useServerFn(updateReward);
  const uploadFn = useServerFn(uploadRewardImage);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const parsedStarCost = parseInt(starCost, 10);
      if (!Number.isFinite(parsedStarCost) || parsedStarCost < 1) {
        throw new Error("Harga Star wajib diisi (minimal 1).");
      }

      let parsedStockLimit: number | null = null;
      if (stockMode === "limited") {
        parsedStockLimit = parseInt(stockLimit, 10);
        if (!Number.isFinite(parsedStockLimit) || parsedStockLimit < 1) {
          throw new Error("Jumlah diedarkan wajib diisi (minimal 1).");
        }
      }

      if (isVoucherType) {
        if (!voucherId) throw new Error("Pilih voucher yang akan ditukar dengan Star.");
        const payload = {
          name: "",
          description: "",
          howToUse: "",
          termsAndConditions: "",
          starCost: parsedStarCost,
          rewardType,
          stockLimit: parsedStockLimit,
          imageUrl: "",
          voucherId,
        };
        if (isEdit && reward) {
          return updateFn({ data: { rewardId: reward.id, ...payload } });
        }
        return createFn({ data: payload });
      }

      let finalImageUrl = imageUrl;
      let finalImageStoragePath = imageStoragePath;

      if (imageBase64 && imageChanged) {
        const uploaded = await uploadFn({
          data: {
            rewardId: reward?.id,
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
        howToUse: howToUse.trim(),
        termsAndConditions: terms.trim(),
        starCost: parsedStarCost,
        rewardType,
        stockLimit: parsedStockLimit,
        imageUrl: finalImageUrl,
        imageStoragePath: imageChanged ? finalImageStoragePath : undefined,
        voucherId: null,
      };

      if (isEdit && reward) {
        return updateFn({ data: { rewardId: reward.id, ...payload } });
      }
      return createFn({ data: payload });
    },
    onSuccess: () => {
      toast.success(isEdit ? "Reward berhasil diperbarui." : "Reward berhasil dibuat.");
      onOpenChange(false);
      void queryClient.invalidateQueries({ queryKey: ["admin", "reward"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "voucher"] });
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

  function handleTypeChange(next: RewardType) {
    if (voucherLocked) return;
    setRewardType(next);
    if (next !== "voucher_discount") setVoucherId("");
  }

  const canSave = isVoucherType
    ? voucherId.length > 0 && starCost.trim().length > 0
    : name.trim().length > 0 && description.trim().length > 0 && starCost.trim().length > 0;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEdit ? "Edit reward" : "Buat reward"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="reward-type">Tipe Reward</Label>
                <Select
                  value={rewardType}
                  onValueChange={(v) => handleTypeChange(v as RewardType)}
                  disabled={voucherLocked}
                >
                  <SelectTrigger id="reward-type">
                    <SelectValue placeholder="Pilih tipe" />
                  </SelectTrigger>
                  <SelectContent>
                    {REWARD_TYPE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reward-star">Harga Star</Label>
                <Input
                  id="reward-star"
                  type="number"
                  min={1}
                  value={starCost}
                  onChange={(e) => setStarCost(e.target.value)}
                  placeholder="60"
                />
              </div>
            </div>

            {isVoucherType ? (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="reward-voucher">Voucher</Label>
                  <Select
                    value={voucherId || undefined}
                    onValueChange={setVoucherId}
                    disabled={voucherLocked}
                  >
                    <SelectTrigger id="reward-voucher">
                      <SelectValue placeholder="Pilih voucher" />
                    </SelectTrigger>
                    <SelectContent>
                      {linkableVouchers.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {linkableVouchers.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Tidak ada voucher yang bisa ditautkan. Buat voucher dulu, atau voucher yang ada
                      sudah menjadi reward.
                    </p>
                  ) : null}
                </div>
                {selectedVoucher ? (
                  <div className="space-y-2">
                    <VoucherCardPreview
                      name={selectedVoucher.name}
                      validFrom={selectedVoucher.valid_from}
                      validUntil={selectedVoucher.valid_until}
                      bgColor={selectedVoucher.bg_color || "#1a1a2e"}
                      imageUrl={selectedVoucher.image_url}
                    />
                    <p className="text-xs text-muted-foreground text-center">
                      {formatVoucherPeriod(selectedVoucher.valid_from, selectedVoucher.valid_until)}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="reward-name">Nama Reward</Label>
                  <Input
                    id="reward-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Contoh: Voucher gratis lapangan 2 jam"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="reward-desc">Deskripsi</Label>
                  <Textarea
                    id="reward-desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    placeholder="Jelaskan manfaat reward"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Gambar reward</Label>
                  {imagePreview ? (
                    <div className="relative rounded-lg overflow-hidden border">
                      <img src={imagePreview} alt="Preview" className="w-full aspect-video object-cover" />
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
                  <Label htmlFor="reward-how">How to use (opsional)</Label>
                  <Textarea
                    id="reward-how"
                    value={howToUse}
                    onChange={(e) => setHowToUse(e.target.value)}
                    rows={2}
                    placeholder="Cara menukar reward di venue"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="reward-tnc">Terms & Condition (opsional)</Label>
                  <Textarea
                    id="reward-tnc"
                    value={terms}
                    onChange={(e) => setTerms(e.target.value)}
                    rows={3}
                    placeholder="Syarat dan ketentuan berlaku"
                  />
                </div>
              </>
            )}

            <div className="space-y-3">
              <Label>Jumlah</Label>
              <RadioGroup
                value={stockMode}
                onValueChange={(v) => setStockMode(v as "unlimited" | "limited")}
                className="gap-3"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="unlimited" id="stock-unlimited" />
                  <Label htmlFor="stock-unlimited" className="font-normal cursor-pointer">
                    Tanpa batas
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="limited" id="stock-limited" />
                  <Label htmlFor="stock-limited" className="font-normal cursor-pointer">
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

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <Button
              type="button"
              disabled={saveMutation.isPending || !canSave}
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
