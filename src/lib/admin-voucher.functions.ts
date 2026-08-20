import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { AdminAuthContext } from "@/lib/admin-superadmin-middleware";
import { requireSuperadminAuth } from "@/lib/admin-superadmin-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  getVoucherCampaignStatus,
  getVoucherCodeStatus,
  type VoucherIssuedVia,
} from "@/lib/voucher-display";

const voucherPayloadSchema = z.object({
  name: z.string().trim().min(1, "Nama voucher wajib diisi.").max(200),
  description: z.string().max(4000).optional().default(""),
  howToGet: z.string().max(4000).optional().default(""),
  howToUse: z.string().max(4000).optional().default(""),
  termsAndConditions: z.string().max(8000).optional().default(""),
  validFrom: z.string().min(1, "Tanggal mulai wajib diisi."),
  validUntil: z.string().min(1, "Tanggal selesai wajib diisi."),
  bgColor: z.string().max(30).optional().default("#1a1a2e"),
  imageUrl: z.string().optional().default(""),
  imageStoragePath: z.string().nullable().optional(),
  isPurchasable: z.boolean().optional().default(false),
  starCost: z.number().int().min(1).nullable().optional().default(null),
  stockLimit: z.number().int().min(1).nullable().optional().default(null),
});

export type VoucherListItem = {
  id: string;
  category: "regular" | "reward";
  name: string;
  description: string;
  how_to_get: string;
  how_to_use: string;
  terms_and_conditions: string;
  valid_from: string;
  valid_until: string;
  assign_to_all: boolean;
  created_at: string;
  updated_at: string;
  is_purchasable: boolean;
  star_cost: number | null;
  stock_limit: number | null;
  redeemed_count: number;
  issued_count: number;
  used_count: number;
  unused_count: number;
  expired_unused_count: number;
  status: ReturnType<typeof getVoucherCampaignStatus>;
};

export type VoucherRecipient = {
  id: string;
  user_id: string;
  code: string;
  issued_via: VoucherIssuedVia;
  used_at: string | null;
  redeemed_by: string | null;
  created_at: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  status: ReturnType<typeof getVoucherCodeStatus>;
};

export type VoucherUserOption = {
  user_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

export type RedeemVoucherResult = {
  ok: true;
  voucher_id: string;
  voucher_name: string;
  user_id: string;
  display_name: string;
  username: string;
  code: string;
  used_at: string;
};

function assertPeriod(validFrom: string, validUntil: string) {
  const from = new Date(validFrom);
  const until = new Date(validUntil);
  if (Number.isNaN(from.getTime()) || Number.isNaN(until.getTime())) {
    throw new Error("Format tanggal tidak valid.");
  }
  if (until.getTime() <= from.getTime()) {
    throw new Error("Tanggal selesai harus setelah tanggal mulai.");
  }
}

function parseRedeemResult(raw: unknown): RedeemVoucherResult {
  if (!raw || typeof raw !== "object") {
    throw new Error("Respons penukaran tidak valid.");
  }
  const o = raw as Record<string, unknown>;
  return {
    ok: true,
    voucher_id: String(o.voucher_id ?? ""),
    voucher_name: String(o.voucher_name ?? ""),
    user_id: String(o.user_id ?? ""),
    display_name: String(o.display_name ?? ""),
    username: String(o.username ?? ""),
    code: String(o.code ?? ""),
    used_at: String(o.used_at ?? ""),
  };
}

export const listVouchers = createServerFn({ method: "GET" })
  .middleware([requireSuperadminAuth])
  .handler(async () => {
    const { data: vouchers, error } = await supabaseAdmin
      .from("vouchers")
      .select(
        "id, category, name, description, how_to_get, how_to_use, terms_and_conditions, valid_from, valid_until, assign_to_all, created_at, updated_at, bg_color, image_url, image_storage_path, is_purchasable, star_cost, stock_limit, redeemed_count",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const ids = (vouchers ?? []).map((v) => v.id);
    const counts = new Map<string, { issued: number; used: number }>();
    if (ids.length > 0) {
      const { data: codes, error: codesErr } = await supabaseAdmin
        .from("voucher_codes")
        .select("voucher_id, used_at")
        .in("voucher_id", ids);
      if (codesErr) throw new Error(codesErr.message);
      for (const row of codes ?? []) {
        const cur = counts.get(row.voucher_id) ?? { issued: 0, used: 0 };
        cur.issued += 1;
        if (row.used_at) cur.used += 1;
        counts.set(row.voucher_id, cur);
      }

    }

    const now = new Date();
    const items: VoucherListItem[] = (vouchers ?? []).map((v) => {
      const c = counts.get(v.id) ?? { issued: 0, used: 0 };
      const status = getVoucherCampaignStatus(v.valid_from, v.valid_until, now);
      const expiredUnused = status === "expired" ? Math.max(0, c.issued - c.used) : 0;
      return {
        ...v,
        issued_count: c.issued,
        used_count: c.used,
        unused_count: Math.max(0, c.issued - c.used),
        expired_unused_count: expiredUnused,
        status,
      };
    });

    return { items };
  });

export const getVoucherDetail = createServerFn({ method: "POST" })
  .middleware([requireSuperadminAuth])
  .inputValidator((input) => z.object({ voucherId: z.string().uuid() }).parse(input ?? {}))
  .handler(async ({ data }) => {
    const { data: voucher, error } = await supabaseAdmin
      .from("vouchers")
      .select(
        "id, category, name, description, how_to_get, how_to_use, terms_and_conditions, valid_from, valid_until, assign_to_all, created_at, updated_at, created_by, bg_color, image_url, image_storage_path, is_purchasable, star_cost, stock_limit, redeemed_count",
      )
      .eq("id", data.voucherId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!voucher) throw new Error("Voucher tidak ditemukan.");

    const { data: codes, error: codesErr } = await supabaseAdmin
      .from("voucher_codes")
      .select("id, user_id, code, issued_via, used_at, redeemed_by, created_at")
      .eq("voucher_id", data.voucherId)
      .order("created_at", { ascending: false });
    if (codesErr) throw new Error(codesErr.message);

    const userIds = [...new Set((codes ?? []).map((c) => c.user_id))];
    const profileMap = new Map<
      string,
      { display_name: string | null; username: string | null; avatar_url: string | null }
    >();
    if (userIds.length > 0) {
      const { data: profiles, error: pErr } = await supabaseAdmin
        .from("profiles")
        .select("user_id, display_name, username, avatar_url")
        .in("user_id", userIds);
      if (pErr) throw new Error(pErr.message);
      for (const p of profiles ?? []) {
        profileMap.set(p.user_id, {
          display_name: p.display_name,
          username: p.username,
          avatar_url: p.avatar_url,
        });
      }
    }

    const now = new Date();
    const recipients: VoucherRecipient[] = (codes ?? []).map((c) => {
      const p = profileMap.get(c.user_id);
      return {
        ...c,
        issued_via: (c.issued_via === "star_reward" ? "star_reward" : "admin") as VoucherIssuedVia,
        display_name: p?.display_name ?? null,
        username: p?.username ?? null,
        avatar_url: p?.avatar_url ?? null,
        status: getVoucherCodeStatus(voucher.valid_from, voucher.valid_until, c.used_at, now),
      };
    });

    const used = recipients.filter((r) => r.used_at);
    const byHour = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
    for (const r of used) {
      const hour = parseInt(
        new Intl.DateTimeFormat("en-GB", {
          timeZone: "Asia/Jakarta",
          hour: "numeric",
          hour12: false,
        }).format(new Date(r.used_at as string)),
        10,
      );
      const idx = hour === 24 ? 0 : hour;
      if (idx >= 0 && idx < 24) byHour[idx].count += 1;
    }
    const peak = byHour.reduce(
      (best, cur) => (cur.count > best.count ? cur : best),
      { hour: 0, count: 0 },
    );

    return {
      voucher: {
        ...voucher,
        status: getVoucherCampaignStatus(voucher.valid_from, voucher.valid_until, now),
      },
      recipients,
      analytics: {
        issued_count: recipients.length,
        used_count: used.length,
        unused_count: recipients.filter((r) => !r.used_at).length,
        expired_count: recipients.filter((r) => r.status === "expired").length,
        byHour,
        peakHour: peak.count > 0 ? peak.hour : null,
        usedRecipients: used.map((r) => ({
          user_id: r.user_id,
          display_name: r.display_name,
          username: r.username,
          avatar_url: r.avatar_url,
          code: r.code,
          used_at: r.used_at as string,
        })),
      },
    };
  });

export const searchVoucherUsers = createServerFn({ method: "POST" })
  .middleware([requireSuperadminAuth])
  .inputValidator((input) =>
    z
      .object({
        search: z.string().max(120).optional().default(""),
        limit: z.number().int().min(1).max(200).optional().default(80),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    let q = supabaseAdmin
      .from("profiles")
      .select("user_id, display_name, username, avatar_url")
      .order("display_name", { ascending: true })
      .limit(data.limit);

    const search = data.search.trim();
    if (search) {
      const s = `%${search}%`;
      q = q.or(`display_name.ilike.${s},username.ilike.${s}`);
    }

    const { data: users, error } = await q;
    if (error) throw new Error(error.message);
    return { users: (users ?? []) as VoucherUserOption[] };
  });

async function issueCodes(voucherId: string, assignToAll: boolean, userIds: string[]) {
  const { data, error } = await supabaseAdmin.rpc("issue_voucher_codes", {
    p_voucher_id: voucherId,
    p_user_ids: assignToAll ? [] : userIds,
    p_assign_to_all: assignToAll,
  });
  if (error) throw new Error(error.message);
  return typeof data === "number" ? data : 0;
}

export const createVoucher = createServerFn({ method: "POST" })
  .middleware([requireSuperadminAuth])
  .inputValidator((input) => voucherPayloadSchema.parse(input ?? {}))
  .handler(async ({ context, data }) => {
    assertPeriod(data.validFrom, data.validUntil);

    const actorUserId = (context as AdminAuthContext).userId;
    const { data: row, error } = await supabaseAdmin
      .from("vouchers")
      .insert({
        name: data.name,
        description: data.description ?? "",
        how_to_get: data.howToGet ?? "",
        how_to_use: data.howToUse ?? "",
        terms_and_conditions: data.termsAndConditions ?? "",
        valid_from: data.validFrom,
        valid_until: data.validUntil,
        assign_to_all: false,
        created_by: actorUserId,
        bg_color: data.bgColor ?? "#1a1a2e",
        image_url: data.imageUrl || null,
        image_storage_path: data.imageStoragePath ?? null,
        is_purchasable: data.isPurchasable ?? false,
        star_cost: data.isPurchasable ? data.starCost : null,
        stock_limit: data.stockLimit ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const updateVoucher = createServerFn({ method: "POST" })
  .middleware([requireSuperadminAuth])
  .inputValidator((input) =>
    z
      .object({
        voucherId: z.string().uuid(),
        ...voucherPayloadSchema.shape,
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    assertPeriod(data.validFrom, data.validUntil);

    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from("vouchers")
      .select("id, image_storage_path")
      .eq("id", data.voucherId)
      .maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);
    if (!existing) throw new Error("Voucher tidak ditemukan.");

    const patch: {
      name: string;
      description: string;
      how_to_get: string;
      how_to_use: string;
      terms_and_conditions: string;
      valid_from: string;
      valid_until: string;
      bg_color: string;
      is_purchasable: boolean;
      star_cost: number | null;
      stock_limit: number | null;
      image_url?: string | null;
      image_storage_path?: string | null;
    } = {
      name: data.name,
      description: data.description ?? "",
      how_to_get: data.howToGet ?? "",
      how_to_use: data.howToUse ?? "",
      terms_and_conditions: data.termsAndConditions ?? "",
      valid_from: data.validFrom,
      valid_until: data.validUntil,
      bg_color: data.bgColor ?? "#1a1a2e",
      is_purchasable: data.isPurchasable ?? false,
      star_cost: data.isPurchasable ? data.starCost ?? null : null,
      stock_limit: data.stockLimit ?? null,
    };

    if (data.imageStoragePath !== undefined) {
      patch.image_url = data.imageUrl || null;
      patch.image_storage_path = data.imageStoragePath;
      if (
        existing.image_storage_path &&
        existing.image_storage_path !== data.imageStoragePath
      ) {
        await supabaseAdmin.storage
          .from("voucher-assets")
          .remove([existing.image_storage_path]);
      }
    }

    const { error } = await supabaseAdmin
      .from("vouchers")
      .update(patch)
      .eq("id", data.voucherId);
    if (error) throw new Error(error.message);

    return { id: data.voucherId };
  });

export const uploadVoucherImage = createServerFn({ method: "POST" })
  .middleware([requireSuperadminAuth])
  .inputValidator((input) =>
    z
      .object({
        voucherId: z.string().uuid().optional(),
        fileName: z.string().min(1),
        fileBase64: z.string().min(1),
        contentType: z.string().min(1),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const bucket = "voucher-assets";
    const ext =
      (data.fileName.split(".").pop() ?? "webp").toLowerCase().replace(/[^a-z0-9]/g, "") || "webp";
    const path = data.voucherId
      ? `images/${data.voucherId}/${Date.now()}.${ext}`
      : `images/draft/${Date.now()}.${ext}`;

    const buffer = Buffer.from(data.fileBase64, "base64");
    const { error: uploadErr } = await supabaseAdmin.storage.from(bucket).upload(path, buffer, {
      contentType: data.contentType,
      upsert: true,
    });
    if (uploadErr) throw new Error(uploadErr.message);

    const { data: urlData } = supabaseAdmin.storage.from(bucket).getPublicUrl(path);
    return {
      imageUrl: urlData.publicUrl,
      imageStoragePath: path,
    };
  });

export const addVoucherRecipients = createServerFn({ method: "POST" })
  .middleware([requireSuperadminAuth])
  .inputValidator((input) =>
    z
      .object({
        voucherId: z.string().uuid(),
        assignToAll: z.boolean(),
        userIds: z.array(z.string().uuid()).optional().default([]),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from("vouchers")
      .select("id")
      .eq("id", data.voucherId)
      .maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);
    if (!existing) throw new Error("Voucher tidak ditemukan.");

    if (!data.assignToAll && data.userIds.length === 0) {
      throw new Error("Pilih minimal satu pengguna.");
    }

    if (data.assignToAll) {
      const { error } = await supabaseAdmin
        .from("vouchers")
        .update({ assign_to_all: true })
        .eq("id", data.voucherId);
      if (error) throw new Error(error.message);
    }

    const issued = await issueCodes(data.voucherId, data.assignToAll, data.userIds);
    return { issued };
  });

export const deleteVoucher = createServerFn({ method: "POST" })
  .middleware([requireSuperadminAuth])
  .inputValidator((input) => z.object({ voucherId: z.string().uuid() }).parse(input ?? {}))
  .handler(async ({ data }) => {
    const { data: row, error: fetchErr } = await supabaseAdmin
      .from("vouchers")
      .select("id, name, image_storage_path")
      .eq("id", data.voucherId)
      .maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);
    if (!row) throw new Error("Voucher tidak ditemukan.");

    const { error } = await supabaseAdmin.from("vouchers").delete().eq("id", data.voucherId);
    if (error) throw new Error(error.message);

    if (row.image_storage_path) {
      await supabaseAdmin.storage.from("voucher-assets").remove([row.image_storage_path]);
    }

    return { id: row.id, name: row.name };
  });

export const redeemVoucherCode = createServerFn({ method: "POST" })
  .middleware([requireSuperadminAuth])
  .inputValidator((input) =>
    z
      .object({
        code: z.string().min(1, "Masukkan kode voucher.").max(32),
        voucherId: z.string().uuid(),
        userId: z.string().uuid(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ context, data }) => {
    const actorUserId = (context as AdminAuthContext).userId;
    const { data: raw, error } = await supabaseAdmin.rpc("admin_redeem_voucher_code", {
      p_actor_user_id: actorUserId,
      p_code: data.code,
      p_voucher_id: data.voucherId,
      p_user_id: data.userId,
    });
    if (error) throw new Error(error.message);
    return parseRedeemResult(raw);
  });
