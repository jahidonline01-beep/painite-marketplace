import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";

export type FacebookProfileRow = {
  id: string;
  label: string;
  serial_no: number;
  auto_reply: number;
  proxy_host: string | null;
  proxy_port: number | null;
  proxy_protocol: string | null;
  proxy_username: string | null;
  proxy_password: string | null;
  created_at: string;
  fb_uid?: string;
  fb_live?: "" | "live" | "suspend";
};

function newId() {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  return `fp_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

function cleanLabel(raw: string) {
  return raw.trim().slice(0, 24);
}

function cleanHost(raw: string) {
  return raw.trim().slice(0, 120);
}

function cleanPort(raw: number | string | null | undefined) {
  const n = typeof raw === "number" ? raw : Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(n) || n < 1 || n > 65535) return null;
  return n;
}

export const listFacebookProfiles = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    return sql<FacebookProfileRow>`
      select id, label, coalesce(serial_no, 0) as serial_no, coalesce(auto_reply, 0) as auto_reply,
             proxy_host, proxy_port, proxy_protocol, proxy_username, proxy_password,
             created_at::text as created_at
      from facebook_profiles
      where user_id = ${context.userId}
      order by coalesce(serial_no, 0) desc, created_at desc
    `;
  });

export const createFacebookProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { label: string }) => ({ label: cleanLabel(input.label) }))
  .handler(async ({ context, data }) => {
    const label = data.label || "Profile";
    const sql = await getSql();
    const id = newId();
    const [{ max }] = await sql<{ max: number }>`
      select coalesce(max(serial_no), 0)::int as max
      from facebook_profiles
      where user_id = ${context.userId}
    `;
    const serial = Number(max) + 1;
    await sql`
      insert into facebook_profiles (id, user_id, label, serial_no)
      values (${id}, ${context.userId}, ${label}, ${serial})
    `;
    return { id, label, serial_no: serial };
  });

export const updateFacebookProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: {
    id: string;
    label: string;
    proxyHost: string;
    proxyPort: string;
    proxyProtocol: string;
    proxyUsername: string;
    proxyPassword: string;
  }) => ({
    id: input.id.trim(),
    label: cleanLabel(input.label),
    proxyHost: cleanHost(input.proxyHost),
    proxyPort: cleanPort(input.proxyPort),
    proxyProtocol: input.proxyProtocol === "socks5" ? "socks5" : "http",
    proxyUsername: input.proxyUsername.trim().slice(0, 80),
    proxyPassword: input.proxyPassword.slice(0, 120),
  }))
  .handler(async ({ context, data }) => {
    if (!data.id) throw new Error("Missing profile.");
    const label = data.label || "Profile";
    const host = data.proxyHost || null;
    const port = host ? data.proxyPort : null;
    const protocol = host ? data.proxyProtocol : null;
    const username = host ? data.proxyUsername || null : null;
    const password = host ? data.proxyPassword || null : null;
    const sql = await getSql();
    const rows = await sql<{ id: string }>`
      update facebook_profiles
      set label = ${label},
          proxy_host = ${host},
          proxy_port = ${port},
          proxy_protocol = ${protocol},
          proxy_username = ${username},
          proxy_password = ${password}
      where id = ${data.id} and user_id = ${context.userId}
      returning id
    `;
    if (!rows[0]) throw new Error("Profile not found.");
    return { ok: true as const };
  });

export const setProfileRobot = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; on: boolean }) => ({
    id: input.id.trim(),
    on: Boolean(input.on),
  }))
  .handler(async ({ context, data }) => {
    if (!data.id) throw new Error("Missing profile.");
    const sql = await getSql();
    await sql`
      update facebook_profiles
      set auto_reply = ${data.on ? 1 : 0}
      where id = ${data.id} and user_id = ${context.userId}
    `;
    return { ok: true as const, on: data.on };
  });

export const deleteFacebookProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => id.trim())
  .handler(async ({ context, data: id }) => {
    const sql = await getSql();
    await sql`
      delete from facebook_profiles where id = ${id} and user_id = ${context.userId}
    `;
    const left = await sql<{ id: string }>`
      select id from facebook_profiles
      where user_id = ${context.userId}
      order by coalesce(serial_no, 0) desc, created_at desc
    `;
    let n = left.length;
    for (const row of left) {
      await sql`update facebook_profiles set serial_no = ${n} where id = ${row.id}`;
      n -= 1;
    }
    return { ok: true as const };
  });

export const reorderFacebookProfiles = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((ids: string[]) => ids.map((id) => id.trim()).filter(Boolean))
  .handler(async ({ context, data: ids }) => {
    const sql = await getSql();
    let n = ids.length;
    for (const id of ids) {
      await sql`
        update facebook_profiles
        set serial_no = ${n}
        where id = ${id} and user_id = ${context.userId}
      `;
      n -= 1;
    }
    return { ok: true as const };
  });
