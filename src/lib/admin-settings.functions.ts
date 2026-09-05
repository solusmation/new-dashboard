import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSuperadminAuth } from "@/lib/admin-superadmin-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const getClubSettings = createServerFn({ method: "GET" })
  .middleware([requireSuperadminAuth])
  .handler(async ({ context }) => {
    const { data, error } = await supabaseAdmin
      .from("club_settings")
      .select("default_new_user_coins, updated_at")
      .eq("id", 1)
      .maybeSingle();

    if (error) throw new Error(error.message);

    if (!data) {
      const { data: inserted, error: insertErr } = await supabaseAdmin
        .from("club_settings")
        .upsert({ id: 1, default_new_user_coins: 0 })
        .select("default_new_user_coins, updated_at")
        .single();
      if (insertErr) throw new Error(insertErr.message);
      return {
        defaultNewUserCoins: inserted.default_new_user_coins,
        updatedAt: inserted.updated_at,
      };
    }

    return {
      defaultNewUserCoins: data.default_new_user_coins,
      updatedAt: data.updated_at,
    };
  });

export const updateDefaultNewUserCoins = createServerFn({ method: "POST" })
  .middleware([requireSuperadminAuth])
  .inputValidator((input) =>
    z
      .object({
        coins: z.number().int().min(0).max(1_000_000),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { data: row, error } = await supabaseAdmin
      .from("club_settings")
      .upsert({
        id: 1,
        default_new_user_coins: data.coins,
        updated_at: new Date().toISOString(),
        updated_by: context.userId,
      })
      .select("default_new_user_coins, updated_at")
      .single();

    if (error) throw new Error(error.message);

    return {
      ok: true as const,
      defaultNewUserCoins: row.default_new_user_coins,
      updatedAt: row.updated_at,
    };
  });
