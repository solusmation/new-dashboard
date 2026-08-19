"use client";

import { Calendar, Ticket } from "lucide-react";

function formatPeriodShort(validFrom: string, validUntil: string): string {
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };
  const from = new Date(validFrom).toLocaleDateString("id-ID", opts);
  const until = new Date(validUntil).toLocaleDateString("id-ID", opts);
  return `${from} – ${until}`;
}

function contrastText(hex: string): string {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.55 ? "#1a1a2e" : "#ffffff";
}

type Props = {
  name: string;
  validFrom: string;
  validUntil: string;
  bgColor: string;
  imageUrl?: string | null;
};

export function VoucherCardPreview({ name, validFrom, validUntil, bgColor, imageUrl }: Props) {
  const fg = contrastText(bgColor);
  const fgSub = fg === "#ffffff" ? "rgba(255,255,255,0.7)" : "rgba(26,26,46,0.6)";

  return (
    <div
      className="relative w-full max-w-md mx-auto rounded-2xl overflow-hidden shadow-xl"
      style={{ backgroundColor: bgColor }}
    >
      {imageUrl ? (
        <div className="relative aspect-video overflow-hidden">
          <img
            src={imageUrl}
            alt=""
            className="w-full h-full object-cover"
          />
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(to top, ${bgColor} 0%, ${bgColor}99 30%, transparent 70%)`,
            }}
          />
        </div>
      ) : (
        <div className="aspect-video relative flex items-center justify-center">
          <Ticket
            className="h-20 w-20 opacity-[0.08]"
            style={{ color: fg }}
          />
        </div>
      )}

      <div
        className="relative px-6 pb-6"
        style={{ marginTop: imageUrl ? "-3rem" : "-2rem" }}
      >
        <div className="flex items-start gap-3">
          <div
            className="shrink-0 mt-1 rounded-lg p-2"
            style={{ backgroundColor: `${fg}15` }}
          >
            <Ticket className="h-5 w-5" style={{ color: fg }} />
          </div>
          <div className="min-w-0">
            <h3
              className="text-lg font-bold leading-snug truncate"
              style={{ color: fg }}
              title={name}
            >
              {name || "Nama Voucher"}
            </h3>
            <div
              className="flex items-center gap-1.5 mt-1 text-xs"
              style={{ color: fgSub }}
            >
              <Calendar className="h-3.5 w-3.5 shrink-0" />
              <span>{formatPeriodShort(validFrom, validUntil)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden rounded-2xl">
        <div
          className="absolute -top-10 -right-10 h-32 w-32 rounded-full opacity-[0.07]"
          style={{ backgroundColor: fg }}
        />
        <div
          className="absolute -bottom-6 -left-6 h-24 w-24 rounded-full opacity-[0.05]"
          style={{ backgroundColor: fg }}
        />
      </div>

      <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 h-6 w-6 rounded-full bg-background" />
      <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 h-6 w-6 rounded-full bg-background" />
    </div>
  );
}
