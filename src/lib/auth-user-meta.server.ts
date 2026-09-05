import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type AuthUserMeta = {
  email: string | null;
  lastSignIn: string | null;
};

const AUTH_META_CACHE_TTL_MS = 60_000;
const authMetaCache = new Map<string, { value: AuthUserMeta; expiresAt: number }>();

/** Ambil email & last sign-in per user id (batch + cache singkat). */
export async function fetchAuthMetaForUserIds(
  userIds: string[],
): Promise<Map<string, AuthUserMeta>> {
  const map = new Map<string, AuthUserMeta>();
  const unique = [...new Set(userIds.filter(Boolean))];
  if (!unique.length) return map;

  const now = Date.now();
  const missing: string[] = [];
  for (const id of unique) {
    const cached = authMetaCache.get(id);
    if (cached && cached.expiresAt > now) {
      map.set(id, cached.value);
    } else {
      missing.push(id);
    }
  }

  const batchSize = 20;
  for (let i = 0; i < missing.length; i += batchSize) {
    const batch = missing.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (id) => {
        const { data, error } = await supabaseAdmin.auth.admin.getUserById(id);
        if (error || !data?.user) return;
        const value: AuthUserMeta = {
          email: data.user.email ?? null,
          lastSignIn: data.user.last_sign_in_at ?? null,
        };
        authMetaCache.set(id, { value, expiresAt: now + AUTH_META_CACHE_TTL_MS });
        map.set(id, value);
      }),
    );
  }
  return map;
}
