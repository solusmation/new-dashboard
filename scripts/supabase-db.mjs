#!/usr/bin/env node
/**
 * Supabase DB helper via Management API (uses SUPABASE_ACCESS_TOKEN from .env).
 * Works when `supabase db push` pooler connection times out.
 *
 * Usage:
 *   node scripts/supabase-db.mjs status
 *   node scripts/supabase-db.mjs push
 *   node scripts/supabase-db.mjs query "select 1"
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadEnv() {
  const envPath = join(root, ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2];
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

function projectRef() {
  const cfg = readFileSync(join(root, "supabase", "config.toml"), "utf8");
  const m = cfg.match(/project_id\s*=\s*"([^"]+)"/);
  if (!m) throw new Error("project_id tidak ditemukan di supabase/config.toml");
  return m[1];
}

function accessToken() {
  const t = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  if (!t) {
    throw new Error(
      "SUPABASE_ACCESS_TOKEN belum di-set. Tambahkan ke .env (lihat .env.example).",
    );
  }
  return t;
}

async function runSql(sql) {
  const ref = projectRef();
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${ref}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken()}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ query: sql }),
    },
  );
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!res.ok) {
    throw new Error(
      `SQL failed HTTP ${res.status}: ${typeof body === "string" ? body : JSON.stringify(body)}`,
    );
  }
  return body;
}

function localMigrations() {
  const dir = join(root, "supabase", "migrations");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => {
      const version = f.slice(0, 14);
      const name = f.replace(/\.sql$/, "").slice(15) || f.replace(/\.sql$/, "");
      return { version, name, file: f, path: join(dir, f) };
    })
    .filter((m) => /^\d{14}$/.test(m.version))
    .sort((a, b) => a.version.localeCompare(b.version));
}

async function remoteVersions() {
  const rows = await runSql(
    "select version from supabase_migrations.schema_migrations order by version",
  );
  return new Set((rows ?? []).map((r) => String(r.version)));
}

async function cmdStatus() {
  const remote = await remoteVersions();
  const local = localMigrations();
  const remoteMax = [...remote].sort().at(-1) ?? "";
  const pending = local.filter((m) => !remote.has(m.version) && m.version > remoteMax);
  const orphanLocal = local.filter((m) => !remote.has(m.version) && m.version <= remoteMax);
  console.log(`Project: ${projectRef()}`);
  console.log(`Remote migrations: ${remote.size} (latest ${remoteMax || "—"})`);
  console.log(`Local migrations:  ${local.length}`);
  console.log(`Pending (akan di-push): ${pending.length}`);
  for (const m of pending) {
    console.log(`  - ${m.version}_${m.name}`);
  }
  if (orphanLocal.length) {
    console.log(
      `Skipped ${orphanLocal.length} local file(s) older than remote latest (shared DB / history lain).`,
    );
  }
  if (pending.length === 0) console.log("Up to date.");
}

async function cmdPush() {
  const remote = await remoteVersions();
  const remoteMax = [...remote].sort().at(-1) ?? "";
  const pending = localMigrations().filter(
    (m) => !remote.has(m.version) && m.version > remoteMax,
  );
  if (pending.length === 0) {
    console.log("No pending migrations.");
    return;
  }
  for (const m of pending) {
    console.log(`Applying ${m.file} …`);
    const sql = readFileSync(m.path, "utf8");
    const wrapped = `${sql}

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('${m.version}', '${m.name.replace(/'/g, "''")}', ARRAY[]::text[])
ON CONFLICT DO NOTHING;
`;
    await runSql(wrapped);
    console.log(`  OK ${m.version}`);
  }
  console.log(`Done. Applied ${pending.length} migration(s).`);
}

async function cmdQuery(sql) {
  if (!sql?.trim()) throw new Error("Berikan SQL: node scripts/supabase-db.mjs query \"select 1\"");
  const rows = await runSql(sql);
  console.log(JSON.stringify(rows, null, 2));
}

async function main() {
  loadEnv();
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "status") await cmdStatus();
  else if (cmd === "push") await cmdPush();
  else if (cmd === "query") await cmdQuery(rest.join(" "));
  else {
    console.log(`Usage:
  npm run db:status
  npm run db:push
  node scripts/supabase-db.mjs query "select 1"`);
    process.exit(cmd ? 1 : 0);
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
