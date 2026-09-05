import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { AdminAuthContext } from "@/lib/admin-superadmin-middleware";
import { requireSuperadminAuth } from "@/lib/admin-superadmin-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type OpenStarRedeemSession = {
  id: string;
  user_id: string;
  code: string;
  status: "open";
  created_at: string;
  last_seen_at: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  coins: number;
};

export type EligibleStarVoucher = {
  id: string;
  name: string;
  description: string | null;
  how_to_get: string | null;
  how_to_use: string | null;
  terms_and_conditions: string | null;
  star_cost: number;
  image_url: string | null;
  bg_color: string | null;
  stock_limit: number | null;
  redeemed_count: number;
  valid_from: string;
  valid_until: string;
};

export type ValidateStarRedeemResult = {
  ok: true;
  session: {
    id: string;
    user_id: string;
    code: string;
    status: "open";
    created_at: string;
    last_seen_at: string;
  };
  user: {
    user_id: string;
    display_name: string | null;
    username: string | null;
    avatar_url: string | null;
    coins: number;
  };
  vouchers: EligibleStarVoucher[];
};

export type ConfirmStarRedeemResult = {
  ok: true;
  redemption_id: string;
  session_id: string;
  user_id: string;
  voucher_id: string;
  voucher_name: string;
  star_cost: number;
  coins_remaining: number;
  status: "used";
};

function asArray<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  return [];
}

function parseValidateResult(raw: unknown): ValidateStarRedeemResult {
  const data = raw as ValidateStarRedeemResult | null;
  if (!data?.ok || !data.session?.id || !data.user?.user_id) {
    throw new Error("Respons validasi tidak valid.");
  }
  return {
    ...data,
    vouchers: asArray<EligibleStarVoucher>(data.vouchers),
  };
}

function parseConfirmResult(raw: unknown): ConfirmStarRedeemResult {
  const data = raw as ConfirmStarRedeemResult | null;
  if (!data?.ok || !data.redemption_id) {
    throw new Error("Respons konfirmasi tidak valid.");
  }
  return data;
}

export const listOpenStarRedeemSessions = createServerFn({ method: "GET" })
  .middleware([requireSuperadminAuth])
  .handler(async ({ context }) => {
    const actorUserId = (context as AdminAuthContext).userId;
    const { data, error } = await supabaseAdmin.rpc("list_open_star_redeem_sessions", {
      p_actor_user_id: actorUserId,
    });
    if (error) throw new Error(error.message);
    return asArray<OpenStarRedeemSession>(data);
  });

export const validateStarRedeemCode = createServerFn({ method: "POST" })
  .middleware([requireSuperadminAuth])
  .inputValidator((input) =>
    z
      .object({
        code: z.string().min(1, "Masukkan kode redeem.").max(32),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ context, data }) => {
    const actorUserId = (context as AdminAuthContext).userId;
    const { data: raw, error } = await supabaseAdmin.rpc("validate_star_redeem_code", {
      p_actor_user_id: actorUserId,
      p_code: data.code,
    });
    if (error) throw new Error(error.message);
    return parseValidateResult(raw);
  });

export const confirmStarRedeem = createServerFn({ method: "POST" })
  .middleware([requireSuperadminAuth])
  .inputValidator((input) =>
    z
      .object({
        sessionId: z.string().uuid(),
        voucherId: z.string().uuid(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ context, data }) => {
    const actorUserId = (context as AdminAuthContext).userId;
    const { data: raw, error } = await supabaseAdmin.rpc("confirm_star_redeem", {
      p_actor_user_id: actorUserId,
      p_session_id: data.sessionId,
      p_voucher_id: data.voucherId,
    });
    if (error) throw new Error(error.message);
    return parseConfirmResult(raw);
  });
