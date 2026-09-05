# Mobile contract: FO Star Redeem

Kontrak event/RPC untuk aplikasi user. Penukaran Star **tidak** dilakukan di app; user hanya membuka session Redeem, menunjukkan kode sementara ke Front Office (FO). FO menyelesaikan penukaran di dashboard.

## Breaking change

Jangan panggil `redeem_voucher_with_stars` lagi.

RPC tersebut sekarang selalu gagal dengan pesan:

> Penukaran Star hanya melalui Front Office. Buka bagian Redeem di aplikasi lalu tunjukkan kode ke kasir.

## Lifecycle

```
User buka bagian Redeem
  → open_star_redeem_session()
  → tampilkan code (8 karakter) ke FO
  → heartbeat_star_redeem_session(session_id) setiap ~5 detik
  → (opsional) subscribe Realtime session milik user

User tutup bagian Redeem / unmount / background kill
  → close_star_redeem_session(session_id)
  → atau otomatis closed jika last_seen_at > 30 detik (tanpa heartbeat)

FO konfirmasi di dashboard
  → session status = completed
  → coins wallet terpotong
  → baris baru di Voucher Saya (status used)
```

## Session TTL

| Aturan | Nilai |
|--------|--------|
| Heartbeat interval (app) | ~5 detik |
| Stale threshold (server) | 30 detik tanpa `last_seen_at` |
| Kode | 8 karakter `[A-HJ-NP-Z2-9]` (tanpa I/O/0/1) |
| Open session per user | Maksimal 1; `open` baru menutup session `open` lama |

## RPC — session

### `open_star_redeem_session()`

Caller: authenticated user (`auth.uid()`).

```ts
const { data, error } = await supabase.rpc("open_star_redeem_session");
```

Contoh response:

```json
{
  "ok": true,
  "session_id": "uuid",
  "code": "AB3K7M2P",
  "status": "open",
  "created_at": "2026-09-06T10:00:00.000Z",
  "last_seen_at": "2026-09-06T10:00:00.000Z"
}
```

### `heartbeat_star_redeem_session(p_session_id uuid)`

Panggil selama UI Redeem tetap terbuka.

```ts
await supabase.rpc("heartbeat_star_redeem_session", {
  p_session_id: sessionId,
});
```

Contoh response:

```json
{
  "ok": true,
  "session_id": "uuid",
  "status": "open",
  "last_seen_at": "2026-09-06T10:00:05.000Z"
}
```

Error jika session bukan milik user atau status bukan `open` (sudah `closed` / `completed` / stale).

### `close_star_redeem_session(p_session_id uuid)`

Panggil saat user menutup bagian Redeem.

```ts
await supabase.rpc("close_star_redeem_session", {
  p_session_id: sessionId,
});
```

Idempotent untuk `closed` / `completed`.

## RPC — Voucher Saya (history)

### `list_my_star_voucher_redemptions()`

```ts
const { data, error } = await supabase.rpc("list_my_star_voucher_redemptions");
```

Contoh response (array JSON):

```json
[
  {
    "id": "uuid",
    "voucher_id": "uuid-or-null",
    "name": "Free Drink",
    "description": "...",
    "how_to_get": null,
    "how_to_use": "Tunjukkan ke kasir",
    "terms_and_conditions": "...",
    "star_cost": 120,
    "image_url": "https://...",
    "bg_color": "#1a1a2e",
    "status": "used",
    "redeemed_at": "2026-09-06T10:05:00.000Z"
  }
]
```

Tidak memakai `voucher_codes`. Semua entry sudah `used` (history penukaran FO).

## Realtime (disarankan di app)

Subscribe perubahan session milik user agar UI Redeem bisa menutup otomatis saat FO selesai / session stale.

```ts
const channel = supabase
  .channel(`star-redeem-${userId}`)
  .on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: "star_redeem_sessions",
      filter: `user_id=eq.${userId}`,
    },
    (payload) => {
      const row = payload.new as { status?: string; id?: string };
      if (!row?.status) return;
      if (row.status === "completed") {
        // FO sudah menukar → refresh coins + Voucher Saya, tutup UI Redeem
      }
      if (row.status === "closed") {
        // Session ditutup / stale → hentikan heartbeat, clear code
      }
    },
  )
  .subscribe();
```

Setelah `completed`, refresh:

1. Saldo Star (`profiles.coins`)
2. `list_my_star_voucher_redemptions()`

## Katalog Star di app

App boleh tetap menampilkan katalog voucher `is_purchasable = true` (informasi harga), tetapi **tombol tukar tidak memanggil** `redeem_voucher_with_stars`. Arahkan user ke alur Redeem → FO.

## Edge cases

| Kasus | Perilaku |
|-------|----------|
| User buka Redeem dua kali | Session open lama ditutup; kode baru dibuat |
| App crash tanpa `close` | Hilang dari antrian FO setelah ~30s tanpa heartbeat |
| FO validasi tapi user tutup Redeem | Session `closed`; konfirmasi FO gagal |
| Coin kurang saat FO konfirmasi | Error `Star tidak cukup.` |
| Stok habis saat FO konfirmasi | Error `Stok voucher habis.` |
| Double confirm | Session sudah `completed` → error session tidak aktif |
| `lifetime_coins` / tier | **Tidak** berkurang saat tukar; hanya `profiles.coins` (wallet) |

## Status session

| Status | Arti |
|--------|------|
| `open` | Muncul di antrian dashboard FO |
| `closed` | User menutup / stale TTL |
| `completed` | FO berhasil menukar voucher |

## Checklist implementasi app

1. Screen Redeem: `open` → tampilkan `code` besar → loop heartbeat 5s → `close` on exit
2. Hapus / disable call ke `redeem_voucher_with_stars`
3. Tab **Voucher Saya**: `list_my_star_voucher_redemptions`
4. (Opsional) Realtime session → auto-close UI + refresh wallet/history
5. Copy UI: “Tunjukkan kode ini ke Front Office untuk menukar Star”
