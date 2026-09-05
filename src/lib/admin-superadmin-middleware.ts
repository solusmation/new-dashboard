import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type AdminAuthContext = {
  userId: string;
  isSuperadmin: true;
};

const SUPERADMIN_CACHE_TTL_MS = 45_000;
const superadminCache = new Map<string, { value: boolean; expiresAt: number }>();

export async function userIsSuperadmin(userId: string): Promise<boolean> {
  const now = Date.now();
  const cached = superadminCache.get(userId);
  if (cached && cached.expiresAt > now) return cached.value;

  const { data: isSuper, error: rpcErr } = await supabaseAdmin.rpc("is_superadmin", {
    p_uid: userId,
  });
  let allowed = !rpcErr && isSuper === true;

  if (!allowed) {
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();
    if (profileErr) throw new Error(profileErr.message);
    allowed = profile?.role === "superadmin";
  }

  superadminCache.set(userId, { value: allowed, expiresAt: now + SUPERADMIN_CACHE_TTL_MS });
  return allowed;
}

/** Invalidate role cache after role changes (promote/demote superadmin). */
export function invalidateSuperadminCache(userId?: string) {
  if (userId) superadminCache.delete(userId);
  else superadminCache.clear();
}

const JWT_USER_CACHE_TTL_MS = 30_000;
const jwtUserCache = new Map<string, { userId: string; expiresAt: number }>();

async function resolveUserIdFromBearer(): Promise<string> {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key =
    process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error("Konfigurasi Supabase tidak lengkap di server.");
  }

  const request = getRequest();
  if (!request?.headers) {
    throw new Error("Unauthorized: permintaan server tidak valid. Muat ulang halaman dan login lagi.");
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("Unauthorized: token tidak terkirim ke server. Login ulang.");
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) throw new Error("Unauthorized: token kosong.");

  const now = Date.now();
  const cached = jwtUserCache.get(token);
  if (cached && cached.expiresAt > now) return cached.userId;

  const authClient = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user?.id) {
    throw new Error(error?.message ?? "Unauthorized: token tidak valid.");
  }

  jwtUserCache.set(token, { userId: data.user.id, expiresAt: now + JWT_USER_CACHE_TTL_MS });
  // Bound cache size (simple eviction of oldest-ish entries)
  if (jwtUserCache.size > 200) {
    const first = jwtUserCache.keys().next().value;
    if (first) jwtUserCache.delete(first);
  }

  return data.user.id;
}

/** Wajib login + role superadmin untuk semua server function admin. */
export const requireSuperadminAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const userId = await resolveUserIdFromBearer();
  const allowed = await userIsSuperadmin(userId);
  if (!allowed) {
    throw new Error("Forbidden: Hanya superadmin yang dapat mengakses dashboard ini.");
  }

  return next({
    context: {
      userId,
      isSuperadmin: true as const,
    } satisfies AdminAuthContext,
  });
});
