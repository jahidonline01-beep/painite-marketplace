import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { hashSecret, newPermissionCode, newSalt, newToken, secretsMatch, sha256Hex } from "@/lib/secret-hash";

const DEFAULT_ADMIN_PASSWORD = "2222";

type AdminRow = { password_hash: string; password_salt: string };

async function ensureAdminSettings() {
  const sql = await getSql();
  const rows = await sql<AdminRow>`select password_hash, password_salt from admin_settings where id = 1 limit 1`;
  if (rows[0]) return;
  const salt = newSalt();
  const password_hash = await hashSecret(DEFAULT_ADMIN_PASSWORD, salt);
  await sql`
    insert into admin_settings (id, password_hash, password_salt)
    values (1, ${password_hash}, ${salt})
    on conflict (id) do nothing
  `;
}

async function requireAdmin(token: string) {
  if (!token) throw new Error("Admin session required.");
  const sql = await getSql();
  const hash = sha256Hex(token);
  const rows = await sql<{ token_hash: string }>`
    select token_hash from admin_sessions
    where token_hash = ${hash} and expires_at > now()
    limit 1
  `;
  if (!rows[0]) throw new Error("Admin session expired. Sign in again.");
}

export async function requireAdminToken(token: string) {
  await requireAdmin(token);
}

export const adminSignIn = createServerFn({ method: "POST" })
  .validator((password: string) => password)
  .handler(async ({ data: password }) => {
    await ensureAdminSettings();
    const sql = await getSql();
    const rows = await sql<AdminRow>`select password_hash, password_salt from admin_settings where id = 1 limit 1`;
    const row = rows[0];
    if (!row) throw new Error("Admin is not configured.");
    const incoming = await hashSecret(password, row.password_salt);
    if (!secretsMatch(incoming, row.password_hash)) {
      throw new Error("Incorrect password.");
    }
    await sql`delete from admin_sessions where expires_at <= now()`;
    const token = newToken();
    await sql`
      insert into admin_sessions (token_hash, expires_at)
      values (${sha256Hex(token)}, now() + interval '12 hours')
    `;
    return { token };
  });

export const adminSignOut = createServerFn({ method: "POST" })
  .validator((token: string) => token)
  .handler(async ({ data: token }) => {
    if (!token) return { ok: true as const };
    const sql = await getSql();
    await sql`delete from admin_sessions where token_hash = ${sha256Hex(token)}`;
    return { ok: true as const };
  });

export const changeAdminPassword = createServerFn({ method: "POST" })
  .validator((input: { token: string; current: string; next: string }) => input)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    if (data.next.trim().length < 4) throw new Error("New password must be at least 4 characters.");
    const sql = await getSql();
    const rows = await sql<AdminRow>`select password_hash, password_salt from admin_settings where id = 1 limit 1`;
    const row = rows[0];
    if (!row) throw new Error("Admin is not configured.");
    const incoming = await hashSecret(data.current, row.password_salt);
    if (!secretsMatch(incoming, row.password_hash)) {
      throw new Error("Current password is incorrect.");
    }
    const salt = newSalt();
    const password_hash = await hashSecret(data.next.trim(), salt);
    await sql`
      update admin_settings
      set password_hash = ${password_hash}, password_salt = ${salt}, updated_at = now()
      where id = 1
    `;
    return { ok: true as const };
  });

export type PermissionCodeRow = {
  code: string;
  created_at: string;
  used_at: string | null;
};

export const listPermissionCodes = createServerFn({ method: "POST" })
  .validator((token: string) => token)
  .handler(async ({ data: token }) => {
    await requireAdmin(token);
    const sql = await getSql();
    return sql<PermissionCodeRow>`
      select code, created_at::text as created_at, used_at::text as used_at
      from permission_codes
      order by created_at desc
    `;
  });

export const generatePermissionCode = createServerFn({ method: "POST" })
  .validator((token: string) => token)
  .handler(async ({ data: token }) => {
    await requireAdmin(token);
    const sql = await getSql();
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const code = newPermissionCode();
      try {
        await sql`insert into permission_codes (code) values (${code})`;
        return { code };
      } catch {
        /* unique collision — retry */
      }
    }
    throw new Error("Could not generate a unique code. Try again.");
  });

export const deletePermissionCode = createServerFn({ method: "POST" })
  .validator((input: { token: string; code: string }) => ({
    token: input.token,
    code: input.code.trim(),
  }))
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    if (!data.code) throw new Error("Missing code.");
    const sql = await getSql();
    await sql`delete from permission_codes where code = ${data.code}`;
    return { ok: true as const };
  });
