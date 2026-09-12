import { createServerFn } from "@tanstack/react-start";
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  increment,
  setDoc,
} from "firebase/firestore";
import { requireAdminToken } from "@/lib/admin";
import { authMiddleware } from "@/lib/auth/middleware";
import { APP_VERSION, isStaleVersion } from "@/lib/app-core";
import { getDb } from "@/lib/firebase";
import type { LeadInput } from "@/lib/leads";

export type VersionGate = {
  ok: boolean;
  blocked: boolean;
  current: string;
  minVersion: string;
  latestVersion: string;
  downloadUrl: string;
  message: string;
};

export type CloudMember = {
  id: string;
  name: string;
  phone: string;
  uid: string;
  createdAt: string;
  lastSeen: string;
  appVersion: string;
  active: boolean;
  balance: number;
  completedTasks: number;
  report: string;
  suspendReport: string;
  adminMessage: string;
  pass_v3: string;
};

export type CloudLead = LeadInput & {
  id: string;
  member_name: string;
  member_phone: string;
  created_at: string;
};

const DEFAULT_GATE = {
  minVersion: "1.0.0",
  latestVersion: "1.0.0",
  downloadUrl: "",
  message: "Install the new version.",
};

async function readGate() {
  try {
    const snap = await getDoc(doc(getDb(), "config", "app"));
    const data = snap.data() || {};
    return {
      minVersion: String(data.minVersion || DEFAULT_GATE.minVersion),
      latestVersion: String(data.latestVersion || DEFAULT_GATE.latestVersion),
      downloadUrl: String(data.downloadUrl || ""),
      message: String(data.message || DEFAULT_GATE.message),
    };
  } catch {
    return { ...DEFAULT_GATE };
  }
}

export async function requireFreshApp(version = APP_VERSION) {
  try {
    const gate = await readGate();
    if (isStaleVersion(version, gate.minVersion)) {
      throw new Error(gate.message || "Install the new version.");
    }
    return gate;
  } catch (err) {
    if (err instanceof Error && err.message === (DEFAULT_GATE.message || "Install the new version.")) throw err;
    if (err instanceof Error && err.message.includes("Install the new version")) throw err;
    return { ...DEFAULT_GATE };
  }
}

export const getVersionGate = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const gate = await readGate();
    const blocked = isStaleVersion(APP_VERSION, gate.minVersion);
    return {
      ok: !blocked,
      blocked,
      current: APP_VERSION,
      ...gate,
    } satisfies VersionGate;
  } catch {
    return {
      ok: true,
      blocked: false,
      current: APP_VERSION,
      ...DEFAULT_GATE,
    } satisfies VersionGate;
  }
});

export const claimAppVersion = createServerFn({ method: "POST" }).handler(async () => {
  try {
    const gate = await readGate();
    if (!gate.minVersion || isStaleVersion(gate.minVersion, APP_VERSION)) {
      await setDoc(
        doc(getDb(), "config", "app"),
        {
          minVersion: APP_VERSION,
          latestVersion: APP_VERSION,
        },
        { merge: true },
      );
      return { ok: true as const, minVersion: APP_VERSION };
    }
    return { ok: true as const, minVersion: gate.minVersion };
  } catch {
    return { ok: true as const, minVersion: APP_VERSION };
  }
});

export const saveVersionGate = createServerFn({ method: "POST" })
  .validator((input: { token: string; minVersion: string; latestVersion: string; downloadUrl: string; message: string }) => input)
  .handler(async ({ data }) => {
    await requireAdminToken(data.token);
    await setDoc(
      doc(getDb(), "config", "app"),
      {
        minVersion: data.minVersion.trim() || "1.0.0",
        latestVersion: data.latestVersion.trim() || data.minVersion.trim() || "1.0.0",
        downloadUrl: data.downloadUrl.trim(),
        message: data.message.trim() || "Install the new version.",
      },
      { merge: true },
    );
    return { ok: true as const };
  });

export const cloudPhoneTaken = createServerFn({ method: "POST" })
  .validator((phone: string) => phone.replace(/\D/g, "").slice(0, 11))
  .handler(async ({ data: phone }) => {
    if (phone.length !== 11) return { taken: false };
    const snap = await getDoc(doc(getDb(), "members", phone));
    return { taken: snap.exists() };
  });

export const upsertCloudMember = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { name: string; phone: string }) => ({
    name: input.name.trim().slice(0, 11),
    phone: input.phone.replace(/\D/g, "").slice(0, 11),
  }))
  .handler(async ({ data }) => {
    await requireFreshApp();
    const ref = doc(getDb(), "members", data.phone);
    const prev = await getDoc(ref);
    const createdAt = prev.exists() ? String(prev.data()?.createdAt || new Date().toISOString()) : new Date().toISOString();
    await setDoc(
      ref,
      {
        name: data.name,
        phone: data.phone,
        createdAt,
        lastSeen: new Date().toISOString(),
        appVersion: APP_VERSION,
        active: prev.exists() ? prev.data()?.active !== false : true,
      },
      { merge: true },
    );
    return { ok: true as const };
  });

export const touchCloudMember = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireFreshApp();
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<{ name: string; phone: string; uid: string | null }>`
      select name, phone, uid from profiles where user_id = ${context.userId} limit 1
    `;
    const row = rows[0];
    if (!row?.phone) return { ok: true as const };
    try {
      await setDoc(
        doc(getDb(), "members", row.phone),
        {
          name: row.name,
          phone: row.phone,
          uid: row.uid || undefined,
          lastSeen: new Date().toISOString(),
          appVersion: APP_VERSION,
        },
        { merge: true },
      );
    } catch {
      /* keep local session */
    }
    return { ok: true as const };
  });

export async function pushCloudLead(row: CloudLead) {
  try {
    await setDoc(doc(getDb(), "leads", row.id), {
      ...row,
      created_at: row.created_at,
    });
    if (row.member_phone) {
      await setDoc(
        doc(getDb(), "members", row.member_phone),
        { completedTasks: increment(1) },
        { merge: true },
      );
    }
  } catch {
    /* local lead still saved */
  }
}

export const resetMemberWork = createServerFn({ method: "POST" })
  .validator((input: { token: string; phone: string }) => ({
    token: input.token,
    phone: input.phone.replace(/\D/g, "").slice(0, 11),
  }))
  .handler(async ({ data }) => {
    await requireAdminToken(data.token);
    if (data.phone.length !== 11) throw new Error("Missing member.");
    await setDoc(doc(getDb(), "members", data.phone), { completedTasks: 0 }, { merge: true });
    return { ok: true as const };
  });

export const deleteCloudMember = createServerFn({ method: "POST" })
  .validator((input: { token: string; phone: string }) => ({
    token: input.token,
    phone: input.phone.replace(/\D/g, "").slice(0, 11),
  }))
  .handler(async ({ data }) => {
    await requireAdminToken(data.token);
    if (data.phone.length !== 11) throw new Error("Missing member.");
    await deleteDoc(doc(getDb(), "members", data.phone));
    return { ok: true as const };
  });

export const setMemberActive = createServerFn({ method: "POST" })
  .validator((input: { token: string; phone: string; active: boolean }) => ({
    token: input.token,
    phone: input.phone.replace(/\D/g, "").slice(0, 11),
    active: Boolean(input.active),
  }))
  .handler(async ({ data }) => {
    await requireAdminToken(data.token);
    if (data.phone.length !== 11) throw new Error("Missing member.");
    await setDoc(doc(getDb(), "members", data.phone), { active: data.active }, { merge: true });
    return { ok: true as const, active: data.active };
  });

export const updateCloudMember = createServerFn({ method: "POST" })
  .validator((input: { token: string; phone?: string; oldPhone?: string; name: string; uid?: string; password?: string }) => ({
    token: input.token,
    oldPhone: (input.oldPhone || input.phone || "").replace(/\D/g, "").slice(0, 11),
    phone: (input.phone || input.oldPhone || "").replace(/\D/g, "").slice(0, 11),
    name: input.name.trim().slice(0, 11),
    uid: (input.uid || "").trim().slice(0, 16),
    password: (input.password || "").trim(),
  }))
  .handler(async ({ data }) => {
    await requireAdminToken(data.token);
    if (!data.oldPhone || !data.phone) throw new Error("Missing member.");
    if (!data.name) throw new Error("Enter a name.");
    const oldSnap = await getDoc(doc(getDb(), "members", data.oldPhone));
    const prev = oldSnap.data() || {};
    const uid = data.uid
      ? data.uid.startsWith("UID-")
        ? data.uid
        : `UID-${data.uid.replace(/\D/g, "").slice(0, 6)}`
      : String(prev.uid || "");
    const next = {
      ...prev,
      name: data.name,
      phone: data.phone,
      uid,
      pass_v3: data.password || String(prev.pass_v3 || prev.password || ""),
    };
    await setDoc(doc(getDb(), "members", data.phone), next, { merge: true });
    if (data.phone !== data.oldPhone) {
      await deleteDoc(doc(getDb(), "members", data.oldPhone));
    }
    return { ok: true as const };
  });

async function findMemberByUid(uid: string) {
  const needle = uid.trim().toLowerCase();
  if (!needle) return null;
  const snap = await getDocs(collection(getDb(), "members"));
  const hit = snap.docs.find((item) => String(item.data()?.uid || "").trim().toLowerCase() === needle);
  if (!hit) return null;
  return { phone: hit.id, data: hit.data() };
}

export const setMemberBalance = createServerFn({ method: "POST" })
  .validator((input: { token: string; uid: string; amount: number; mode: "add" | "deduct" }) => ({
    token: input.token,
    uid: input.uid.trim(),
    amount: Number(input.amount) || 0,
    mode: input.mode,
  }))
  .handler(async ({ data }) => {
    await requireAdminToken(data.token);
    if (data.amount <= 0) throw new Error("Enter an amount.");
    const found = await findMemberByUid(data.uid);
    if (!found) throw new Error("UID not found.");
    const current = Number(found.data.balance) || 0;
    const balance = data.mode === "add" ? current + data.amount : Math.max(0, current - data.amount);
    await setDoc(doc(getDb(), "members", found.phone), { balance }, { merge: true });
    return { ok: true as const, balance, name: String(found.data.name || "") };
  });

export const sendMemberNotice = createServerFn({ method: "POST" })
  .validator((input: { token: string; uid: string; kind: "report" | "suspend" | "message"; text: string; addBalance?: number }) => ({
    token: input.token,
    uid: input.uid.trim(),
    kind: input.kind,
    text: input.text.trim().slice(0, 4000),
    addBalance: Number(input.addBalance) || 0,
  }))
  .handler(async ({ data }) => {
    await requireAdminToken(data.token);
    if (!data.text) throw new Error("Enter the message.");
    const found = await findMemberByUid(data.uid);
    if (!found) throw new Error("UID not found.");
    const now = Date.now();
    const prev = found.data || {};
    const patch: Record<string, string | number> = {};
    if (data.kind === "report") {
      const old = String(prev.report || "");
      patch.report = old ? `${old}\n\n${data.text}` : data.text;
      patch.reportAt = now;
    } else if (data.kind === "suspend") {
      const old = String(prev.suspendReport || "");
      patch.suspendReport = old ? `${old}\n\n${data.text}` : data.text;
      patch.suspendReportAt = now;
    } else {
      const old = String(prev.adminMessage || "");
      patch.adminMessage = old ? `${old}\n\n${data.text}` : data.text;
      patch.adminMessageAt = now;
    }
    if (data.addBalance > 0) {
      patch.balance = (Number(prev.balance) || 0) + data.addBalance;
    }
    await setDoc(doc(getDb(), "members", found.phone), patch, { merge: true });
    return { ok: true as const, name: String(prev.name || "") };
  });

export const getMyMemberState = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<{ name: string; phone: string; uid: string | null }>`
      select name, phone, uid from profiles where user_id = ${context.userId} limit 1
    `;
    const row = rows[0];
    if (!row?.phone) {
      return {
        name: "",
        phone: "",
        uid: "",
        balance: 0,
        completedTasks: 0,
        report: "",
        suspendReport: "",
        adminMessage: "",
      };
    }
    try {
      const snap = await getDoc(doc(getDb(), "members", row.phone));
      const data = snap.data() || {};
      const now = Date.now();
      const twelve = 12 * 60 * 60 * 1000;
      const stale = (at: unknown) => typeof at === "number" && at > 0 && now - at >= twelve;
      const patch: Record<string, ReturnType<typeof deleteField>> = {};
      let report = String(data.report || "");
      let suspendReport = String(data.suspendReport || "");
      let adminMessage = String(data.adminMessage || "");
      if (stale(data.reportAt)) {
        report = "";
        patch.report = deleteField();
        patch.reportAt = deleteField();
      }
      if (stale(data.suspendReportAt)) {
        suspendReport = "";
        patch.suspendReport = deleteField();
        patch.suspendReportAt = deleteField();
      }
      if (stale(data.adminMessageAt)) {
        adminMessage = "";
        patch.adminMessage = deleteField();
        patch.adminMessageAt = deleteField();
      }
      if (Object.keys(patch).length) {
        await setDoc(doc(getDb(), "members", row.phone), patch, { merge: true });
      }
      return {
        name: String(data.name || row.name),
        phone: row.phone,
        uid: String(data.uid || row.uid || ""),
        balance: Number(data.balance) || 0,
        completedTasks: Number(data.completedTasks) || 0,
        report,
        suspendReport,
        adminMessage,
      };
    } catch {
      return {
        name: row.name,
        phone: row.phone,
        uid: row.uid || "",
        balance: 0,
        completedTasks: 0,
        report: "",
        suspendReport: "",
        adminMessage: "",
      };
    }
  });

export const clearMyNotice = createServerFn({ method: "POST" })
  .validator(
    (input: { kind: "report" | "suspend" | "message"; phone?: string; uid?: string } | "report" | "suspend" | "message") =>
      input,
  )
  .handler(async ({ data: input }) => {
    const kind = typeof input === "string" ? input : input.kind;
    let phone = typeof input === "object" ? input.phone : undefined;
    const uid = typeof input === "object" ? input.uid : undefined;

    if (!phone && !uid) {
      try {
        const { getSql } = await import("@/lib/db");
        const sql = await getSql();
        const rows = await sql<{ phone: string }>`select phone from profiles limit 1`;
        phone = rows[0]?.phone;
      } catch {
        /* skip */
      }
    }

    try {
      const pKey = phone ? phone.replace(/\D/g, "").slice(0, 11) : "";
      const uUpper = uid ? uid.trim().toUpperCase() : "";

      const snap = await getDocs(collection(getDb(), "members"));
      const hit = snap.docs.find((item) => {
        const d = item.data() || {};
        if (uUpper && String(d.uid || "").trim().toUpperCase() === uUpper) return true;
        if (pKey && (item.id === pKey || item.id === phone || String(d.phone || "").replace(/\D/g, "") === pKey)) return true;
        return false;
      });

      const targetRef = hit?.ref ?? (pKey ? doc(getDb(), "members", pKey) : (phone ? doc(getDb(), "members", phone) : null));
      if (targetRef) {
        const patch =
          kind === "report"
            ? { report: deleteField(), reportAt: deleteField() }
            : kind === "suspend"
              ? { suspendReport: deleteField(), suspendReportAt: deleteField() }
              : { adminMessage: deleteField(), adminMessageAt: deleteField() };
        await setDoc(targetRef, patch, { merge: true });
      }
    } catch (err) {
      console.error("clearMyNotice error:", err);
    }
    return { ok: true as const };
  });

export const memberWorkStatus = createServerFn({ method: "POST" })
  .validator((phone: string) => phone.replace(/\D/g, "").slice(0, 11))
  .handler(async ({ data: phone }) => {
    if (phone.length !== 11) return { active: true };
    try {
      const snap = await getDoc(doc(getDb(), "members", phone));
      if (!snap.exists()) return { active: true };
      return { active: snap.data()?.active !== false };
    } catch {
      return { active: true };
    }
  });

export const listCloudMembers = createServerFn({ method: "POST" })
  .validator((token: string) => token)
  .handler(async ({ data: token }) => {
    await requireAdminToken(token);
    const snap = await getDocs(collection(getDb(), "members"));
    const used = new Set(
      snap.docs.map((item) => String(item.data()?.uid || "").trim().toUpperCase()).filter(Boolean),
    );
    const rows: CloudMember[] = [];
    for (const item of snap.docs) {
      const data = item.data();
      let uid = String(data.uid || "").trim();
      if (!uid) {
        let next = "";
        for (let i = 0; i < 24; i += 1) {
          next = `UID-${Math.floor(100000 + Math.random() * 900000)}`;
          if (!used.has(next)) break;
        }
        uid = next;
        used.add(uid);
        await setDoc(doc(getDb(), "members", item.id), { uid }, { merge: true });
      }
      rows.push({
        id: String(item.id),
        name: String(data.name || ""),
        phone: String(data.phone || item.id),
        uid,
        createdAt: String(data.createdAt || ""),
        lastSeen: String(data.lastSeen || ""),
        appVersion: String(data.appVersion || ""),
        active: data.active !== false,
        balance: Number(data.balance) || 0,
        completedTasks: Number(data.completedTasks) || 0,
        report: String(data.report || ""),
        suspendReport: String(data.suspendReport || ""),
        adminMessage: String(data.adminMessage || ""),
        pass_v3: String(data.pass_v3 || data.password || ""),
      });
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  });

export const listCloudLeads = createServerFn({ method: "POST" })
  .validator((token: string) => token)
  .handler(async ({ data: token }) => {
    await requireAdminToken(token);
    const snap = await getDocs(collection(getDb(), "leads"));
    return snap.docs
      .map((item) => {
        const data = item.data();
        return {
          id: item.id,
          member_name: String(data.member_name || ""),
          member_phone: String(data.member_phone || ""),
          body: String(data.body || ""),
          source: data.source || "marketplace",
          listing_url: String(data.listing_url || ""),
          property_type: data.property_type || "1bed",
          budget: String(data.budget || ""),
          status: data.status || "new",
          contact_name: String(data.contact_name || ""),
          contact_phone: String(data.contact_phone || ""),
          profile_label: String(data.profile_label || ""),
          fb_name: String(data.fb_name || ""),
          fb_link: String(data.fb_link || ""),
          inbox_url: String(data.inbox_url || ""),
          address: String(data.address || ""),
          created_at: String(data.created_at || ""),
        };
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  });
