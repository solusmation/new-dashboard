import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { AdminAuthContext } from "@/lib/admin-superadmin-middleware";
import { requireSuperadminAuth } from "@/lib/admin-superadmin-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  getRewardStatus,
  type RewardStatus,
  type RewardType,
} from "@/lib/reward-display";

const rewardTypeSchema = z.enum([
  "voucher_discount",
  "goods",
  "fnb_discount",
  "free_fnb",
  "other",
]);

function refineRewardPayload(
  data: {
    name: string;
    description: string;
    rewardType: z.infer<typeof rewardTypeSchema>;
    voucherId: string | null;
  },
  ctx: z.RefinementCtx,
) {
  if (data.rewardType === "voucher_discount") {
    if (!data.voucherId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Pilih voucher yang akan ditukar dengan Star.",
        path: ["voucherId"],
      });
    }
    return;
  }
  if (data.voucherId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Hanya tipe voucher potongan yang dapat tertaut ke voucher.",
      path: ["voucherId"],
    });
  }
  if (!data.name.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Nama reward wajib diisi.",
      path: ["name"],
    });
  }
  if (!data.description.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Deskripsi wajib diisi.",
      path: ["description"],
    });
  }
}

const rewardPayloadObjectSchema = z.object({
  name: z.string().trim().max(200).optional().default(""),
  description: z.string().trim().max(4000).optional().default(""),
  howToUse: z.string().max(4000).optional().default(""),
  termsAndConditions: z.string().max(8000).optional().default(""),
  starCost: z.number().int().min(1, "Harga Star minimal 1."),
  rewardType: rewardTypeSchema,
  stockLimit: z.number().int().min(1).nullable().optional().default(null),
  imageUrl: z.string().optional().default(""),
  imageStoragePath: z.string().nullable().optional(),
  voucherId: z.string().uuid().nullable().optional().default(null),
});

const rewardPayloadSchema = rewardPayloadObjectSchema.superRefine(refineRewardPayload);

export type RewardLinkedVoucher = {
  id: string;
  name: string;
  valid_from: string;
  valid_until: string;
  bg_color: string;
  image_url: string | null;
};

export type RewardListItem = {
  id: string;
  name: string;
  description: string;
  how_to_use: string;
  terms_and_conditions: string;
  star_cost: number;
  reward_type: RewardType;
  stock_limit: number | null;
  redeemed_count: number;
  is_active: boolean;
  image_url: string | null;
  image_storage_path: string | null;
  voucher_id: string | null;
  created_at: string;
  updated_at: string;
  status: RewardStatus;
};

export type RewardDetail = RewardListItem & {
  created_by: string | null;
  linked_voucher: RewardLinkedVoucher | null;
};

export type LinkableVoucherOption = {
  id: string;
  name: string;
  valid_from: string;
  valid_until: string;
  bg_color: string;
  image_url: string | null;
  description: string;
  how_to_use: string;
  terms_and_conditions: string;
};

function mapRewardRow(
  row: {
    id: string;
    name: string;
    description: string;
    how_to_use: string;
    terms_and_conditions: string;
    star_cost: number;
    reward_type: string;
    stock_limit: number | null;
    redeemed_count: number;
    is_active: boolean;
    image_url: string | null;
    image_storage_path: string | null;
    voucher_id?: string | null;
    created_at: string;
    updated_at: string;
    created_by?: string | null;
  },
): RewardListItem {
  const status = getRewardStatus(row.is_active, row.stock_limit, row.redeemed_count);
  return {
    ...row,
    voucher_id: row.voucher_id ?? null,
    reward_type: row.reward_type as RewardType,
    status,
  };
}

function computeIsActive(
  stockLimit: number | null | undefined,
  redeemedCount: number,
  requestedActive = true,
): boolean {
  if (stockLimit !== null && stockLimit !== undefined && redeemedCount >= stockLimit) {
    return false;
  }
  return requestedActive;
}

function assertStockLimit(stockLimit: number | null | undefined, redeemedCount: number) {
  if (stockLimit !== null && stockLimit !== undefined && stockLimit < redeemedCount) {
    throw new Error(
      `Batas stok (${stockLimit}) tidak boleh kurang dari jumlah sudah ditukar (${redeemedCount}).`,
    );
  }
}

async function loadVoucherForReward(voucherId: string) {
  const { data: voucher, error } = await supabaseAdmin
    .from("vouchers")
    .select(
      "id, name, description, how_to_use, terms_and_conditions, image_url, bg_color, valid_from, valid_until",
    )
    .eq("id", voucherId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!voucher) throw new Error("Voucher tidak ditemukan.");
  return voucher;
}

function fieldsFromVoucher(voucher: {
  name: string;
  description: string;
  how_to_use: string;
  terms_and_conditions: string;
  image_url: string | null;
}) {
  return {
    name: voucher.name,
    description: voucher.description.trim() || voucher.name,
    how_to_use: voucher.how_to_use ?? "",
    terms_and_conditions: voucher.terms_and_conditions ?? "",
    image_url: voucher.image_url,
    image_storage_path: null as string | null,
  };
}

const REWARD_SELECT =
  "id, name, description, how_to_use, terms_and_conditions, star_cost, reward_type, stock_limit, redeemed_count, is_active, image_url, image_storage_path, voucher_id, created_at, updated_at";

export const listRewards = createServerFn({ method: "GET" })
  .middleware([requireSuperadminAuth])
  .handler(async () => {
    const { data: rows, error } = await supabaseAdmin
      .from("rewards")
      .select(REWARD_SELECT)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const items: RewardListItem[] = (rows ?? []).map((row) => mapRewardRow(row));
    return { items };
  });

export const getRewardDetail = createServerFn({ method: "POST" })
  .middleware([requireSuperadminAuth])
  .inputValidator((input) => z.object({ rewardId: z.string().uuid() }).parse(input ?? {}))
  .handler(async ({ data }) => {
    const { data: row, error } = await supabaseAdmin
      .from("rewards")
      .select(`${REWARD_SELECT}, created_by`)
      .eq("id", data.rewardId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Reward tidak ditemukan.");

    let linkedVoucher: RewardLinkedVoucher | null = null;
    if (row.voucher_id) {
      const voucher = await loadVoucherForReward(row.voucher_id);
      linkedVoucher = {
        id: voucher.id,
        name: voucher.name,
        valid_from: voucher.valid_from,
        valid_until: voucher.valid_until,
        bg_color: voucher.bg_color,
        image_url: voucher.image_url,
      };
    }

    return {
      reward: {
        ...mapRewardRow(row),
        created_by: row.created_by,
        linked_voucher: linkedVoucher,
      } satisfies RewardDetail,
    };
  });

export const listLinkableVouchers = createServerFn({ method: "POST" })
  .middleware([requireSuperadminAuth])
  .inputValidator((input) =>
    z
      .object({
        includeVoucherId: z.string().uuid().nullable().optional().default(null),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { data: linkedRows, error: linkedErr } = await supabaseAdmin
      .from("rewards")
      .select("voucher_id")
      .not("voucher_id", "is", null);
    if (linkedErr) throw new Error(linkedErr.message);

    const taken = new Set(
      (linkedRows ?? [])
        .map((r) => r.voucher_id)
        .filter((id): id is string => Boolean(id) && id !== data.includeVoucherId),
    );

    const { data: vouchers, error } = await supabaseAdmin
      .from("vouchers")
      .select(
        "id, name, description, how_to_use, terms_and_conditions, valid_from, valid_until, bg_color, image_url",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const items: LinkableVoucherOption[] = (vouchers ?? []).filter((v) => !taken.has(v.id));
    return { items };
  });

export const createReward = createServerFn({ method: "POST" })
  .middleware([requireSuperadminAuth])
  .inputValidator((input) => rewardPayloadSchema.parse(input ?? {}))
  .handler(async ({ context, data }) => {
    const actorUserId = (context as AdminAuthContext).userId;
    const stockLimit = data.stockLimit ?? null;
    const voucherId = data.rewardType === "voucher_discount" ? data.voucherId : null;

    let name = data.name.trim();
    let description = data.description.trim();
    let howToUse = data.howToUse ?? "";
    let termsAndConditions = data.termsAndConditions ?? "";
    let imageUrl = data.imageUrl || null;
    let imageStoragePath = data.imageStoragePath ?? null;

    if (voucherId) {
      const voucher = await loadVoucherForReward(voucherId);
      const copied = fieldsFromVoucher(voucher);
      name = copied.name;
      description = copied.description;
      howToUse = copied.how_to_use;
      termsAndConditions = copied.terms_and_conditions;
      imageUrl = copied.image_url;
      imageStoragePath = null;
    }

    const { data: row, error } = await supabaseAdmin
      .from("rewards")
      .insert({
        name,
        description,
        how_to_use: howToUse,
        terms_and_conditions: termsAndConditions,
        star_cost: data.starCost,
        reward_type: data.rewardType,
        stock_limit: stockLimit,
        redeemed_count: 0,
        is_active: computeIsActive(stockLimit, 0),
        created_by: actorUserId,
        image_url: imageUrl,
        image_storage_path: imageStoragePath,
        voucher_id: voucherId,
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") {
        throw new Error("Voucher ini sudah tertaut ke reward lain.");
      }
      throw new Error(error.message);
    }
    return { id: row.id };
  });

export const updateReward = createServerFn({ method: "POST" })
  .middleware([requireSuperadminAuth])
  .inputValidator((input) =>
    rewardPayloadObjectSchema
      .extend({ rewardId: z.string().uuid() })
      .superRefine(refineRewardPayload)
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from("rewards")
      .select("id, image_storage_path, redeemed_count, is_active, voucher_id")
      .eq("id", data.rewardId)
      .maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);
    if (!existing) throw new Error("Reward tidak ditemukan.");

    if (existing.voucher_id) {
      if (data.rewardType !== "voucher_discount") {
        throw new Error("Tipe reward yang tertaut voucher tidak dapat diganti.");
      }
      if (data.voucherId && data.voucherId !== existing.voucher_id) {
        throw new Error("Voucher tertaut tidak dapat diganti.");
      }
    }

    const stockLimit = data.stockLimit ?? null;
    assertStockLimit(stockLimit, existing.redeemed_count);

    const voucherId =
      existing.voucher_id ??
      (data.rewardType === "voucher_discount" ? data.voucherId : null);

    const patch: {
      star_cost: number;
      reward_type: RewardType;
      stock_limit: number | null;
      is_active: boolean;
      voucher_id: string | null;
      name?: string;
      description?: string;
      how_to_use?: string;
      terms_and_conditions?: string;
      image_url?: string | null;
      image_storage_path?: string | null;
    } = {
      star_cost: data.starCost,
      reward_type: data.rewardType,
      stock_limit: stockLimit,
      is_active: computeIsActive(stockLimit, existing.redeemed_count, existing.is_active),
      voucher_id: voucherId,
    };

    if (voucherId) {
      const voucher = await loadVoucherForReward(voucherId);
      const copied = fieldsFromVoucher(voucher);
      Object.assign(patch, copied);
    } else {
      patch.name = data.name;
      patch.description = data.description;
      patch.how_to_use = data.howToUse ?? "";
      patch.terms_and_conditions = data.termsAndConditions ?? "";
      if (data.imageStoragePath !== undefined) {
        patch.image_url = data.imageUrl || null;
        patch.image_storage_path = data.imageStoragePath;
        if (
          existing.image_storage_path &&
          existing.image_storage_path !== data.imageStoragePath
        ) {
          await supabaseAdmin.storage
            .from("reward-assets")
            .remove([existing.image_storage_path]);
        }
      }
    }

    const { error } = await supabaseAdmin.from("rewards").update(patch).eq("id", data.rewardId);
    if (error) {
      if (error.code === "23505") {
        throw new Error("Voucher ini sudah tertaut ke reward lain.");
      }
      throw new Error(error.message);
    }
    return { id: data.rewardId };
  });

export const uploadRewardImage = createServerFn({ method: "POST" })
  .middleware([requireSuperadminAuth])
  .inputValidator((input) =>
    z
      .object({
        rewardId: z.string().uuid().optional(),
        fileName: z.string().min(1),
        fileBase64: z.string().min(1),
        contentType: z.string().min(1),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const bucket = "reward-assets";
    const ext =
      (data.fileName.split(".").pop() ?? "webp").toLowerCase().replace(/[^a-z0-9]/g, "") || "webp";
    const path = data.rewardId
      ? `images/${data.rewardId}/${Date.now()}.${ext}`
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

export const deleteReward = createServerFn({ method: "POST" })
  .middleware([requireSuperadminAuth])
  .inputValidator((input) => z.object({ rewardId: z.string().uuid() }).parse(input ?? {}))
  .handler(async ({ data }) => {
    const { data: row, error: fetchErr } = await supabaseAdmin
      .from("rewards")
      .select("id, name, image_storage_path")
      .eq("id", data.rewardId)
      .maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);
    if (!row) throw new Error("Reward tidak ditemukan.");

    const { error } = await supabaseAdmin.from("rewards").delete().eq("id", data.rewardId);
    if (error) throw new Error(error.message);

    if (row.image_storage_path) {
      await supabaseAdmin.storage.from("reward-assets").remove([row.image_storage_path]);
    }

    return { id: row.id, name: row.name };
  });
