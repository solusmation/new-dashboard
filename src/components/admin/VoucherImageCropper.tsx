"use client";

import * as React from "react";
import ReactCrop, { type Crop, type PixelCrop, centerCrop, makeAspectCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const ASPECT = 16 / 9;

function centerAspectCrop(mediaWidth: number, mediaHeight: number): Crop {
  return centerCrop(
    makeAspectCrop({ unit: "%", width: 90 }, ASPECT, mediaWidth, mediaHeight),
    mediaWidth,
    mediaHeight,
  );
}

async function getCroppedBlob(
  image: HTMLImageElement,
  crop: PixelCrop,
  outputType = "image/webp",
): Promise<{ blob: Blob; base64: string }> {
  const canvas = document.createElement("canvas");
  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;

  const pixelRatio = window.devicePixelRatio || 1;
  canvas.width = Math.floor(crop.width * scaleX * pixelRatio);
  canvas.height = Math.floor(crop.height * scaleY * pixelRatio);

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context unavailable");

  ctx.scale(pixelRatio, pixelRatio);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    image,
    crop.x * scaleX,
    crop.y * scaleY,
    crop.width * scaleX,
    crop.height * scaleY,
    0,
    0,
    crop.width * scaleX,
    crop.height * scaleY,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (!b) return reject(new Error("Gagal memotong gambar."));
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(",")[1];
          resolve({ blob: b, base64 });
        };
        reader.readAsDataURL(b);
      },
      outputType,
      0.85,
    );
  });
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageSrc: string;
  onCropDone: (result: { base64: string; blob: Blob; previewUrl: string }) => void;
};

export function VoucherImageCropper({ open, onOpenChange, imageSrc, onCropDone }: Props) {
  const imgRef = React.useRef<HTMLImageElement | null>(null);
  const [crop, setCrop] = React.useState<Crop>();
  const [completedCrop, setCompletedCrop] = React.useState<PixelCrop>();
  const [busy, setBusy] = React.useState(false);

  function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    imgRef.current = e.currentTarget;
    const { width, height } = e.currentTarget;
    setCrop(centerAspectCrop(width, height));
  }

  async function handleConfirm() {
    if (!imgRef.current || !completedCrop) return;
    setBusy(true);
    try {
      const { base64, blob } = await getCroppedBlob(imgRef.current, completedCrop);
      const previewUrl = URL.createObjectURL(blob);
      onCropDone({ base64, blob, previewUrl });
      onOpenChange(false);
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Potong gambar</DialogTitle>
          <DialogDescription>
            Atur area gambar yang ingin ditampilkan pada voucher (rasio 16:9).
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-center max-h-[60vh] overflow-auto">
          <ReactCrop
            crop={crop}
            onChange={(c) => setCrop(c)}
            onComplete={(c) => setCompletedCrop(c)}
            aspect={ASPECT}
            minHeight={40}
          >
            <img
              src={imageSrc}
              alt="Preview"
              onLoad={onImageLoad}
              style={{ maxHeight: "55vh", maxWidth: "100%" }}
              crossOrigin="anonymous"
            />
          </ReactCrop>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button disabled={busy || !completedCrop} onClick={handleConfirm}>
            {busy ? "Memotong…" : "Gunakan gambar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
