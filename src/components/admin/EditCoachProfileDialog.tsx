"use client";

import * as React from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateCoachProfile, uploadCoachAvatar } from "@/lib/admin-coach.functions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export type CoachProfileForm = {
  display_name: string;
  bio: string | null;
  hourly_rate_idr: number;
  court_fee_included?: boolean | null;
  avatar_url?: string | null;
};

type Props = {
  coachId: string;
  coach: CoachProfileForm | null | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function EditCoachProfileDialog({ coachId, coach, open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const saveFn = useServerFn(updateCoachProfile);
  const uploadFn = useServerFn(uploadCoachAvatar);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = React.useState("");
  const [bio, setBio] = React.useState("");
  const [hourlyRate, setHourlyRate] = React.useState("150000");
  const [courtFeeIncluded, setCourtFeeIncluded] = React.useState(false);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [pendingFile, setPendingFile] = React.useState<File | null>(null);

  React.useEffect(() => {
    if (!open || !coach) return;
    setDisplayName(coach.display_name ?? "");
    setBio(coach.bio ?? "");
    setHourlyRate(String(coach.hourly_rate_idr ?? 150000));
    setCourtFeeIncluded(Boolean(coach.court_fee_included));
    setPreviewUrl(coach.avatar_url ?? null);
    setPendingFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [open, coach]);

  React.useEffect(() => {
    return () => {
      if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const rate = parseInt(hourlyRate.replace(/\D/g, ""), 10);
      let avatarUrl: string | undefined;
      let avatarStoragePath: string | null | undefined;

      if (pendingFile) {
        const uploaded = await uploadFn({
          data: {
            coachId,
            fileName: pendingFile.name,
            fileBase64: await fileToBase64(pendingFile),
            contentType: pendingFile.type || "image/jpeg",
          },
        });
        avatarUrl = uploaded.avatarUrl;
        avatarStoragePath = uploaded.avatarStoragePath;
      }

      return saveFn({
        data: {
          coachId,
          displayName,
          bio,
          hourlyRateIdr: Number.isFinite(rate) ? rate : 0,
          courtFeeIncluded,
          ...(avatarStoragePath !== undefined
            ? { avatarUrl: avatarUrl ?? "", avatarStoragePath }
            : {}),
        },
      });
    },
    onSuccess: (res) => {
      toast.success(`Profil coach ${res.displayName} berhasil disimpan.`);
      onOpenChange(false);
      void queryClient.invalidateQueries({ queryKey: ["admin", "coach", coachId] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "coaches"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "instructors"] });
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
    if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    setPendingFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  }

  const initials = (displayName || "C").slice(0, 2).toUpperCase();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Profile</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="flex items-center gap-3">
            <Avatar className="h-16 w-16">
              <AvatarImage src={previewUrl ?? undefined} alt={displayName} />
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={handleFileChange}
                disabled={saveMutation.isPending}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={saveMutation.isPending}
                onClick={() => fileInputRef.current?.click()}
              >
                {previewUrl ? "Ganti foto" : "Tambah foto"}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="coach-display-name">Nama</Label>
            <Input
              id="coach-display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              disabled={saveMutation.isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="coach-bio">Bio</Label>
            <Textarea
              id="coach-bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={4}
              disabled={saveMutation.isPending}
            />
          </div>

          <div className="rounded-lg border p-3 space-y-4">
            <div className="text-sm font-medium">Tarif</div>

            <div className="space-y-2">
              <Label htmlFor="coach-hourly-rate">Tarif per jam (IDR)</Label>
              <Input
                id="coach-hourly-rate"
                type="number"
                min={0}
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
                disabled={saveMutation.isPending}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border px-3 py-2">
              <Label htmlFor="coach-court-included">Termasuk Court</Label>
              <Switch
                id="coach-court-included"
                checked={courtFeeIncluded}
                onCheckedChange={setCourtFeeIncluded}
                disabled={saveMutation.isPending}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button
            type="button"
            disabled={saveMutation.isPending || !displayName.trim()}
            onClick={() => saveMutation.mutate()}
          >
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
