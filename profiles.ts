import { createServerFn } from "@tanstack/react-start";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { authMiddleware } from "@/lib/auth/middleware";
import { APP_VERSION } from "@/lib/app-core";
import { requireFreshApp } from "@/lib/cloud";
import { getSql } from "@/lib/db";
import { getDb } from "@/lib/firebase";
import { NAME_MAX, PHONE_MAX, phoneToEmail, sanitizeName, sanitizePhone } from "@/lib/app-core";
import {
  clientCheckPermissionCode,
  clientClaimPermissionCode,
  clientRequireFreshApp,
} from "@/lib/member-ops";

function rollUid() {
  return `UID-${Math.floor(100000 + Math.random() * 900000)}`;
}

async function uniqueUid() {
  const sql = await getSql();
  try {
    await sql`alter table profiles add column if not exists uid text`;
  } catch {
    /* already there */
  }
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const uid = rollUid();
    try {
      const rows = await sql<{ n: number }>`select count(*)::int as n from profiles where uid = ${uid}`;
      if ((rows[0]?.n ?? 0) === 0) return uid;
    } catch {
      return uid;
    }
  }
  return `UID-${Date.now().toString().slice(-6)}`;
}

export const checkPermissionCode = createServerFn({ method: "POST" })
  .validator((code: string) => code.trim())
  .handler(async ({ data: code }) => {
    if (!code) return { ok: false as const, reason: "Enter your permission code." };
    try {
      const cloud = await clientCheckPermissionCode(code);
      if (cloud.ok) return cloud;
      if (cloud.reason.includes("already been used")) return cloud;
    } catch {
      /* SQL next */
    }
    try {
      const sql = await getSql();
      const rows = await sql<{ code: string; used_at: string | null }>`
        select code, used_at::text as used_at from permission_codes
        where lower(code) = lower(${code}) limit 1
      `;
      if (!rows[0]) return { ok: false as const, reason: "That permission code is not valid." };
      if (rows[0].used_at) {
        return { ok: false as const, reason: "That permission code has already been used." };
      }
      return { ok: true as const, code: rows[0].code };
    } catch {
      return { ok: false as const, reason: "That permission code is not valid." };
    }
  });

export const phoneIsTaken = createServerFn({ method: "POST" })
  .validator((phone: string) => sanitizePhone(phone))
  .handler(async ({ data: phone }) => {
    if (phone.length !== PHONE_MAX) return { taken: false };
    const sql = await getSql();
    const rows = await sql<{ n: number }>`
      select count(*)::int as n from profiles where phone = ${phone}
    `;
    if ((rows[0]?.n ?? 0) > 0) return { taken: true };
    try {
      const cloud = await getDoc(doc(getDb(), "members", phone));
      return { taken: cloud.exists() };
    } catch {
      return { taken: false };
    }
  });

export const createProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { name: string; phone: string; permissionCode: string; password?: string }) => ({
    name: sanitizeName(input.name.trim()),
    phone: sanitizePhone(input.phone),
    permissionCode: input.permissionCode.trim(),
    password: (input.password || "").trim(),
  }))
  .handler(async ({ context, data }) => {
    if (!data.name) throw new Error("Enter your name.");
    if (data.name.length > NAME_MAX) throw new Error("Name must be 11 characters or fewer.");
    if (!data.phone) throw new Error("Enter a phone number.");
    if (data.phone.length > PHONE_MAX) throw new Error("Phone number must be 11 digits or fewer.");
    if (!data.permissionCode) throw new Error("Enter your permission code.");
    await clientRequireFreshApp();
    const uid = await uniqueUid();

    let claimedCode = "";
    try {
      claimedCode = await clientClaimPermissionCode(data.permissionCode, data.phone);
    } catch {
      claimedCode = "";
    }

    const sql = await getSql().catch(() => null);
    if (!claimedCode) {
      if (!sql) throw new Error("That permission code is not valid or has already been used.");
      const claimed = await sql<{ code: string }>`
        update permission_codes
        set used_at = now(), used_by = ${context.userId}
        where lower(code) = lower(${data.permissionCode}) and used_at is null
        returning code
      `;
      if (!claimed[0]) {
        throw new Error("That permission code is not valid or has already been used.");
      }
      claimedCode = claimed[0].code;
    }

    if (sql) {
      try {
        const taken = await sql<{ n: number }>`
          select count(*)::int as n from profiles where phone = ${data.phone} and user_id <> ${context.userId}
        `;
        if ((taken[0]?.n ?? 0) > 0) {
          await sql`
            update permission_codes
            set used_at = null, used_by = null
            where code = ${claimedCode}
          `;
          throw new Error("This phone number is already registered.");
        }

        await sql`
          insert into profiles (user_id, name, phone, permission_code, uid)
          values (${context.userId}, ${data.name}, ${data.phone}, ${claimedCode}, ${uid})
          on conflict (user_id) do update set
            name = excluded.name,
            phone = excluded.phone,
            permission_code = excluded.permission_code,
            uid = coalesce(profiles.uid, excluded.uid)
        `;
        await sql`alter table profiles add column if not exists pass_v3 text`;
        if (data.password) {
          await sql`update profiles set pass_v3 = ${data.password} where user_id = ${context.userId}`;
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes("already registered")) throw err;
        /* firebase member row is enough */
      }
    }

    try {
      await setDoc(
        doc(getDb(), "members", data.phone),
        {
          name: data.name,
          phone: data.phone,
          uid,
          pass_v3: data.password || "",
          createdAt: new Date().toISOString(),
          lastSeen: new Date().toISOString(),
          appVersion: APP_VERSION,
          active: true,
        },
        { merge: true },
      );
    } catch {
      /* local account still works */
    }

    return { ok: true as const, uid };
  });

export const loginMember = createServerFn({ method: "POST" })
  .validator((input: { phone: string; password: string }) => ({
    phone: sanitizePhone(input.phone),
    password: String(input.password || ""),
  }))
  .handler(async ({ data }) => {
    if (!data.phone) throw new Error("Enter a phone number.");
    if (!data.password) throw new Error("Enter a password.");
    await clientRequireFreshApp();
    const email = phoneToEmail(data.phone);
    const token = `pm3.${data.phone}`;

    try {
      const sql = await getSql();
      await sql`alter table profiles add column if not exists pass_v3 text`;
      const rows = await sql<{ name: string; phone: string; uid: string | null; pass_v3: string | null }>`
        select name, phone, uid, pass_v3 from profiles where phone = ${data.phone} limit 1
      `;
      const local = rows[0];
      if (local?.pass_v3 && local.pass_v3 === data.password) {
        return {
          token,
          id: String(local.uid || data.phone),
          name: String(local.name || data.phone),
          email,
          phone: data.phone,
        };
      }
    } catch {
      /* firebase next */
    }

    try {
      const snap = await Promise.race([
        getDoc(doc(getDb(), "members", data.phone)),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("timeout")), 5000);
        }),
      ]);
      const row = snap.data();
      const saved = String(row?.pass_v3 || row?.password || "");
      if (snap.exists() && row?.active === false) throw new Error("This member is stopped.");
      if (snap.exists() && (!saved || saved === data.password)) {
        if (!saved) {
          await setDoc(doc(getDb(), "members", data.phone), { pass_v3: data.password }, { merge: true }).catch(() => {});
        }
        if (row?.active === false) throw new Error("This member is stopped.");
        void setDoc(
          doc(getDb(), "members", data.phone),
          { lastSeen: new Date().toISOString(), appVersion: APP_VERSION },
          { merge: true },
        ).catch(() => {});
        return {
          token,
          id: String(row?.uid || data.phone),
          name: String(row?.name || data.phone),
          email,
          phone: data.phone,
        };
      }
    } catch (err) {
      if (err instanceof Error && err.message === "This member is stopped.") throw err;
    }

    throw new Error("Incorrect phone or password.");
  });

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    try {
      await sql`alter table profiles add column if not exists uid text`;
    } catch {
      /* skip */
    }
    const rows = await sql<{ name: string; phone: string; avatar: string | null; uid: string | null }>`
      select name, phone, avatar, uid from profiles where user_id = ${context.userId} limit 1
    `;
    const row = rows[0] ?? null;
    if (row && !row.uid) {
      const uid = await uniqueUid();
      await sql`update profiles set uid = ${uid} where user_id = ${context.userId}`;
      row.uid = uid;
      try {
        await setDoc(doc(getDb(), "members", row.phone), { uid, name: row.name, phone: row.phone }, { merge: true });
      } catch {
        /* skip */
      }
    }
    return row;
  });

const AVATAR_MAX = 350_000;

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { name: string; avatar?: string | null }) => ({
    name: sanitizeName(input.name.trim()),
    avatar: input.avatar,
  }))
  .handler(async ({ context, data }) => {
    if (!data.name) throw new Error("Enter your name.");
    if (data.name.length > NAME_MAX) throw new Error("Name must be 11 characters or fewer.");
    if (data.avatar && data.avatar.length > AVATAR_MAX) {
      throw new Error("Picture is too large.");
    }
    if (data.avatar && !data.avatar.startsWith("data:image/")) {
      throw new Error("Invalid picture.");
    }

    const sql = await getSql();
    const rows =
      data.avatar === undefined
        ? await sql<{ name: string; phone: string; avatar: string | null; uid: string | null }>`
            update profiles set name = ${data.name} where user_id = ${context.userId}
            returning name, phone, avatar, uid
          `
        : await sql<{ name: string; phone: string; avatar: string | null; uid: string | null }>`
            update profiles set name = ${data.name}, avatar = ${data.avatar} where user_id = ${context.userId}
            returning name, phone, avatar, uid
          `;
    const row = rows[0];
    if (!row) throw new Error("Profile not found.");
    try {
      await setDoc(
        doc(getDb(), "members", row.phone),
        { name: row.name, lastSeen: new Date().toISOString() },
        { merge: true },
      );
    } catch {
      /* skip */
    }
    return row;
  });
