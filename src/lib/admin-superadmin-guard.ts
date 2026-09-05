import { userIsSuperadmin } from "@/lib/admin-superadmin-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ADMIN_ROLES = ["user", "admin", "superadmin"] as const;
export type AdminProfileRole = (typeof ADMIN_ROLES)[number];

export function parseAdminRole(role: string): AdminProfileRole {
  const r = role.trim().toLowerCase();
  if (r === "user" || r === "admin" || r === "superadmin") return r;
  throw new Error(`Role tidak valid. Gunakan: ${ADMIN_ROLES.join(", ")}`);
}

/**
 * Verifikasi superadmin untuk path tanpa middleware.
 * Handler yang sudah memakai `requireSuperadminAuth` tidak perlu memanggil ini lagi.
 */
export async function assertSuperadmin(actorUserId?: string): Promise<void> {
  if (actorUserId) {
    const allowed = await userIsSuperadmin(actorUserId);
    if (!allowed) throw new Error("Hanya superadmin yang dapat melakukan aksi ini.");
    return;
  }

  const envActor = process.env.SUPERADMIN_ACTOR_USER_ID?.trim();
  if (envActor) {
    const allowed = await userIsSuperadmin(envActor);
    if (!allowed) throw new Error("Hanya superadmin yang dapat melakukan aksi ini.");
    return;
  }

  throw new Error("Tidak dapat memverifikasi superadmin: sesi login diperlukan.");
}

export async function countSuperadmins(): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("profiles")
    .select("user_id", { count: "exact", head: true })
    .eq("role", "superadmin");
  if (error) throw new Error(error.message);
  return count ?? 0;
}
