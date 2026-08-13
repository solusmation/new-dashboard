import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSuperadminAuth } from "@/lib/admin-superadmin-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const FNB_CATEGORIES = ["food", "drink"] as const;
export type FnbCategory = (typeof FNB_CATEGORIES)[number];

export const FNB_CATEGORY_LABELS: Record<FnbCategory, string> = {
  food: "Makanan",
  drink: "Minuman",
};

const fnbCategorySchema = z.enum(FNB_CATEGORIES);

const menuItemPayloadSchema = z.object({
  name: z.string().min(1).max(200),
  category: fnbCategorySchema,
  priceIdr: z.number().int().min(1),
  description: z.string().max(2000).optional().default(""),
  imageUrl: z.string().optional().default(""),
  imageStoragePath: z.string().nullable().optional(),
  isAvailable: z.boolean().optional().default(true),
  sortOrder: z.number().int().optional().default(0),
});

export const listFnbMenuItems = createServerFn({ method: "GET" })
  .middleware([requireSuperadminAuth])
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("fnb_menu_items")
      .select(
        "id, name, category, price_idr, image_url, image_storage_path, description, is_available, sort_order, created_at, updated_at",
      )
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return { items: data ?? [] };
  });

export const createFnbMenuItem = createServerFn({ method: "POST" })
  .middleware([requireSuperadminAuth])
  .inputValidator((input) => menuItemPayloadSchema.parse(input ?? {}))
  .handler(async ({ data }) => {
    const { data: row, error } = await supabaseAdmin
      .from("fnb_menu_items")
      .insert({
        name: data.name,
        category: data.category,
        price_idr: data.priceIdr,
        description: data.description ?? "",
        image_url: data.imageUrl || null,
        ...(data.imageStoragePath ? { image_storage_path: data.imageStoragePath } : {}),
        is_available: data.isAvailable ?? true,
        sort_order: data.sortOrder ?? 0,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const updateFnbMenuItem = createServerFn({ method: "POST" })
  .middleware([requireSuperadminAuth])
  .inputValidator((input) =>
    z
      .object({
        itemId: z.string().uuid(),
        ...menuItemPayloadSchema.shape,
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const patch: Record<string, unknown> = {
      name: data.name,
      category: data.category,
      price_idr: data.priceIdr,
      description: data.description ?? "",
      image_url: data.imageUrl || null,
      is_available: data.isAvailable ?? true,
      sort_order: data.sortOrder ?? 0,
    };
    if (data.imageStoragePath !== undefined) {
      patch.image_storage_path = data.imageStoragePath;
    }

    const { error } = await supabaseAdmin.from("fnb_menu_items").update(patch).eq("id", data.itemId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteFnbMenuItem = createServerFn({ method: "POST" })
  .middleware([requireSuperadminAuth])
  .inputValidator((input) => z.object({ itemId: z.string().uuid() }).parse(input ?? {}))
  .handler(async ({ data }) => {
    const { data: item, error: fetchErr } = await supabaseAdmin
      .from("fnb_menu_items")
      .select("id, name, image_storage_path")
      .eq("id", data.itemId)
      .maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);
    if (!item) throw new Error("Menu tidak ditemukan.");

    const { error } = await supabaseAdmin.from("fnb_menu_items").delete().eq("id", data.itemId);
    if (error) throw new Error(error.message);

    if (item.image_storage_path) {
      await supabaseAdmin.storage.from("fnb-assets").remove([item.image_storage_path]);
    }

    return { name: item.name };
  });

export const uploadFnbMenuImage = createServerFn({ method: "POST" })
  .middleware([requireSuperadminAuth])
  .inputValidator((input) =>
    z
      .object({
        itemId: z.string().uuid().optional(),
        fileName: z.string().min(1),
        fileBase64: z.string().min(1),
        contentType: z.string().min(1),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const bucket = "fnb-assets";
    const ext = data.fileName.split(".").pop() ?? "jpg";
    const path = data.itemId
      ? `menu/${data.itemId}/${Date.now()}.${ext}`
      : `menu/draft/${Date.now()}.${ext}`;

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

const ymdRegex = /^\d{4}-\d{2}-\d{2}$/;

function jakartaDayStartIso(ymd: string): string {
  return new Date(`${ymd}T00:00:00+07:00`).toISOString();
}

function jakartaDayEndIso(ymd: string): string {
  return new Date(`${ymd}T23:59:59.999+07:00`).toISOString();
}

export const listTransaksiFnb = createServerFn({ method: "GET" })
  .middleware([requireSuperadminAuth])
  .inputValidator((input) =>
    z
      .object({
        limit: z.number().int().min(1).max(200).optional().default(100),
        /** Single day (legacy). Prefer dateFrom/dateTo for ranges. */
        date: z.string().regex(ymdRegex).optional(),
        dateFrom: z.string().regex(ymdRegex).optional(),
        dateTo: z.string().regex(ymdRegex).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const todayJakarta = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    const [{ count: totalAll, error: allErr }, { count: totalToday, error: todayErr }] =
      await Promise.all([
        supabaseAdmin
          .from("transaksi_fnb")
          .select("id", { count: "exact", head: true })
          .eq("status", "paid"),
        supabaseAdmin
          .from("transaksi_fnb")
          .select("id", { count: "exact", head: true })
          .eq("status", "paid")
          .gte("created_at", jakartaDayStartIso(todayJakarta))
          .lte("created_at", jakartaDayEndIso(todayJakarta)),
      ]);
    if (allErr) throw new Error(allErr.message);
    if (todayErr) throw new Error(todayErr.message);

    let query = supabaseAdmin
      .from("transaksi_fnb")
      .select(
        "id, user_id, total_amount_idr, notes, court_number, fnb_order_id, created_at, profiles!transaksi_fnb_user_id_fkey(display_name, username)",
      )
      .eq("status", "paid")
      .order("created_at", { ascending: false })
      .limit(data.limit);

    const from = data.dateFrom ?? data.date;
    const to = data.dateTo ?? data.date;
    if (from) {
      query = query.gte("created_at", jakartaDayStartIso(from));
    }
    if (to) {
      query = query.lte("created_at", jakartaDayEndIso(to));
    }

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const txIds = (rows ?? []).map((r) => r.id);
    const itemsByTx = new Map<string, unknown[]>();

    if (txIds.length > 0) {
      const { data: items, error: itemsErr } = await supabaseAdmin
        .from("transaksi_fnb_items")
        .select(
          "id, transaksi_fnb_id, menu_name, menu_category, unit_price_idr, quantity, subtotal_idr",
        )
        .in("transaksi_fnb_id", txIds);
      if (itemsErr) throw new Error(itemsErr.message);
      (items ?? []).forEach((it) => {
        const list = itemsByTx.get(it.transaksi_fnb_id) ?? [];
        list.push(it);
        itemsByTx.set(it.transaksi_fnb_id, list);
      });
    }

    const transactions = (rows ?? []).map((r) => ({
      ...r,
      items: itemsByTx.get(r.id) ?? [],
    }));

    return {
      transactions,
      summary: {
        totalAll: totalAll ?? 0,
        totalToday: totalToday ?? 0,
      },
    };
  });
