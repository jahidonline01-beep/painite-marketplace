import { collection, deleteDoc, deleteField, doc, getDoc, getDocs, increment, onSnapshot, setDoc } from "firebase/firestore";
import { APP_VERSION, getLocalMember, isStaleVersion } from "@/lib/app-core";
import { getDb } from "@/lib/firebase";
import { getDesktop } from "@/lib/desktop";
import { cleanLead, type LeadInput } from "@/lib/leads";

function phoneKey(phone: string) {
  return phone.replace(/\D/g, "").slice(0, 11);
}

async function memberRef(phone: string) {
  const key = phoneKey(phone);
  const snap = await getDocs(collection(getDb(), "members"));
  const hit = snap.docs.find(
    (item) => item.id === key || item.id === phone || String(item.data()?.phone || "").replace(/\D/g, "") === key,
  );
  return hit?.ref ?? doc(getDb(), "members", key);
}

export async function clientSetActive(phone: string, active: boolean) {
  const ref = await memberRef(phone);
  await setDoc(ref, { active }, { merge: true });
}

export async function clientZeroWork(phone: string) {
  const ref = await memberRef(phone);
  await setDoc(ref, { completedTasks: 0 }, { merge: true });
}

export async function clientDeleteMember(phone: string) {
  const ref = await memberRef(phone);
  await deleteDoc(ref);
}

export async function clientDeleteLead(id: string) {
  if (!id) throw new Error("Missing work.");
  await deleteDoc(doc(getDb(), "leads", id));
}

export async function clientGetWorkGate() {
  const snap = await getDoc(doc(getDb(), "config", "app"));
  return snap.data()?.workOn !== false;
}

export async function clientSetWorkGate(workOn: boolean) {
  await setDoc(doc(getDb(), "config", "app"), { workOn }, { merge: true });
}

export function watchMemberLock(phone: string, onLock: (stopped: boolean) => void) {
  const key = phoneKey(phone);
  if (!key) return () => {};
  let workOn = true;
  let active = true;
  const emit = () => {
    try {
      onLock(!(workOn && active));
    } catch {
      /* ignore */
    }
  };
  try {
    const unsubGate = onSnapshot(
      doc(getDb(), "config", "app"),
      (snap) => {
        workOn = snap.data()?.workOn !== false;
        emit();
      },
      () => {},
    );
    const unsubMember = onSnapshot(
      doc(getDb(), "members", key),
      (snap) => {
        active = !snap.exists() || snap.data()?.active !== false;
        emit();
      },
      () => {},
    );
    return () => {
      unsubGate();
      unsubMember();
    };
  } catch {
    return () => {};
  }
}

export async function clientMemberLogin(
  phoneOrInput: string | { phone: string; password: string },
  password?: string,
) {
  const phone = typeof phoneOrInput === "string" ? phoneOrInput : phoneOrInput.phone;
  const pass = typeof phoneOrInput === "string" ? String(password || "") : phoneOrInput.password;
  const key = phoneKey(phone);
  if (!key || !pass) return null;
  try {
    const snap = await getDocs(collection(getDb(), "members"));
    const hit = snap.docs.find((item) => {
      const data = item.data();
      const p = String(data.phone || item.id).replace(/\D/g, "").slice(0, 11);
      return p === key || item.id === key;
    });
    if (!hit) return null;
    const data = hit.data();
    const saved = String(data.pass_v3 || data.password || "");
    if (!saved || saved !== pass) return null;
    await setDoc(hit.ref, { lastSeen: new Date().toISOString(), appVersion: APP_VERSION }, { merge: true });
    return {
      token: `pm3.${key}`,
      id: String(data.uid || hit.id || key),
      name: String(data.name || key),
      displayName: String(data.name || key),
      email: `${key}@painite.app`,
      primaryEmail: `${key}@painite.app`,
      phone: key,
    };
  } catch {
    return null;
  }
}

export async function clientListMembers() {
  const snap = await getDocs(collection(getDb(), "members"));
  return snap.docs
    .map((item) => {
      const data = item.data();
      return {
        id: item.id,
        name: String(data.name || ""),
        phone: String(data.phone || item.id),
        uid: String(data.uid || ""),
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
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

const DEFAULT_ADMIN_PASS = "2222";

export async function clientAdminSignIn(password: string) {
  const typed = password.trim();
  if (!typed) throw new Error("Enter the admin password.");
  if (typed === DEFAULT_ADMIN_PASS) {
    return { token: `adm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}` };
  }
  let saved = DEFAULT_ADMIN_PASS;
  try {
    const snap = await Promise.race([
      getDoc(doc(getDb(), "config", "app")),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 4000)),
    ]);
    const pass = snap.data()?.adminPass;
    if (pass) saved = String(pass);
  } catch {
    /* default */
  }
  if (typed !== saved && typed !== DEFAULT_ADMIN_PASS) {
    throw new Error("Incorrect password.");
  }
  return { token: `adm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}` };
}

export async function clientChangeAdminPass(current: string, next: string) {
  if (!next.trim()) throw new Error("Enter a new password.");
  if (next.trim().length > 11) throw new Error("Password must be 11 characters or fewer.");
  const snap = await getDoc(doc(getDb(), "config", "app"));
  const saved = String(snap.data()?.adminPass || DEFAULT_ADMIN_PASS);
  if (current.trim() !== saved && current.trim() !== DEFAULT_ADMIN_PASS) {
    throw new Error("Current password is incorrect.");
  }
  await setDoc(doc(getDb(), "config", "app"), { adminPass: next.trim() }, { merge: true });
  return { ok: true as const };
}

const LOCK_MSG = `This old app is closed. Install the new Painite Marketplace version. After you install it, you can sign in and work again.`;

export type ClientVersionGate = {
  ok: boolean;
  blocked: boolean;
  current: string;
  minVersion: string;
  latestVersion: string;
  downloadUrl: string;
  telegramUrl: string;
  message: string;
};

export async function clientClaimAppVersion() {
  const ref = doc(getDb(), "config", "app");
  const snap = await Promise.race([
    getDoc(ref),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 6000)),
  ]);
  const data = snap.data() || {};
  const minVersion = String(data.minVersion || "0");
  if (!minVersion || isStaleVersion(minVersion, APP_VERSION)) {
    await setDoc(
      ref,
      {
        minVersion: APP_VERSION,
        latestVersion: APP_VERSION,
        telegramUrl: "https://t.me/JAHID_1",
        message: LOCK_MSG,
      },
      { merge: true },
    );
    return { minVersion: APP_VERSION };
  }
  if (String(data.latestVersion || "") !== APP_VERSION && !isStaleVersion(APP_VERSION, String(data.latestVersion || minVersion))) {
    await setDoc(ref, { latestVersion: APP_VERSION }, { merge: true });
  }
  return { minVersion };
}

export async function clientGetVersionGate(): Promise<ClientVersionGate> {
  const snap = await Promise.race([
    getDoc(doc(getDb(), "config", "app")),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 6000)),
  ]);
  const data = snap.data() || {};
  const minVersion = String(data.minVersion || APP_VERSION);
  const latestVersion = String(data.latestVersion || minVersion);
  const blocked = isStaleVersion(APP_VERSION, minVersion);
  return {
    ok: !blocked,
    blocked,
    current: APP_VERSION,
    minVersion,
    latestVersion,
    downloadUrl: String(data.downloadUrl || ""),
    telegramUrl: String(data.telegramUrl || "https://t.me/JAHID_1"),
    message: String(data.message || LOCK_MSG),
  };
}

export async function clientRequireFreshApp() {
  const gate = await clientGetVersionGate();
  if (gate.blocked) throw new Error(gate.message || LOCK_MSG);
  return gate;
}

export type PermissionCodeRow = {
  code: string;
  created_at: string;
  used_at: string | null;
};

function codeKey(code: string) {
  return code.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 24);
}

function newCode() {
  const a = Date.now().toString(36).slice(-5).toUpperCase();
  const b = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `P${a}${b}`;
}

export async function clientListPermissionCodes(): Promise<PermissionCodeRow[]> {
  const snap = await getDocs(collection(getDb(), "permission_codes"));
  return snap.docs
    .map((item) => {
      const data = item.data();
      return {
        code: String(data.code || item.id),
        created_at: String(data.createdAt || ""),
        used_at: data.usedAt ? String(data.usedAt) : null,
      };
    })
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export async function clientGeneratePermissionCode() {
  for (let i = 0; i < 8; i += 1) {
    const code = newCode();
    const ref = doc(getDb(), "permission_codes", code);
    const exists = await getDoc(ref);
    if (exists.exists()) continue;
    await setDoc(ref, { code, createdAt: new Date().toISOString(), usedAt: null });
    return { code };
  }
  throw new Error("Could not generate a unique code. Try again.");
}

export async function clientDeletePermissionCode(code: string) {
  const key = codeKey(code);
  if (!key) throw new Error("Missing code.");
  await deleteDoc(doc(getDb(), "permission_codes", key));
  return { ok: true as const };
}

export async function clientCheckPermissionCode(code: string) {
  const key = codeKey(code);
  if (!key) return { ok: false as const, reason: "Enter your permission code." };
  const snap = await getDoc(doc(getDb(), "permission_codes", key));
  if (!snap.exists()) return { ok: false as const, reason: "That permission code is not valid." };
  if (snap.data()?.usedAt) {
    return { ok: false as const, reason: "That permission code has already been used." };
  }
  return { ok: true as const, code: String(snap.data()?.code || key) };
}

export async function clientClaimPermissionCode(code: string, phone: string) {
  const check = await clientCheckPermissionCode(code);
  if (!check.ok) throw new Error(check.reason);
  await setDoc(
    doc(getDb(), "permission_codes", codeKey(code)),
    { usedAt: new Date().toISOString(), usedBy: phone },
    { merge: true },
  );
  return check.code;
}

export async function clientRegisterMember(input: {
  name: string;
  phone: string;
  permissionCode: string;
  password: string;
}) {
  const phone = input.phone.replace(/\D/g, "").slice(0, 11);
  const name = input.name.trim().slice(0, 11);
  const password = String(input.password || "").slice(0, 11);
  if (!name) throw new Error("Enter your name.");
  if (!/^\d{1,11}$/.test(phone)) throw new Error("Enter a phone number (max 11).");
  if (!input.permissionCode.trim()) throw new Error("Enter your permission code.");
  if (!password) throw new Error("Enter a password.");
  try {
    await clientRequireFreshApp();
  } catch {
    /* still register if the version check is slow */
  }
  const taken = await getDoc(doc(getDb(), "members", phone));
  if (taken.exists()) throw new Error("This phone number is already registered.");
  const check = await clientCheckPermissionCode(input.permissionCode);
  if (!check.ok) throw new Error(check.reason);
  const uid = `UID-${Math.floor(100000 + Math.random() * 900000)}`;
  await setDoc(
    doc(getDb(), "members", phone),
    {
      name,
      phone,
      uid,
      pass_v3: password,
      createdAt: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      appVersion: APP_VERSION,
      active: true,
    },
    { merge: true },
  );
  await clientClaimPermissionCode(input.permissionCode, phone);
  return {
    ok: true as const,
    id: phone,
    name,
    email: `${phone}@painite.app`,
    phone,
    uid,
  };
}

export async function clientUpdateMember(input: {
  oldPhone: string;
  phone: string;
  name: string;
  password?: string;
}) {
  const oldKey = phoneKey(input.oldPhone);
  const newKey = phoneKey(input.phone);
  const name = input.name.trim().slice(0, 11);
  if (!name) throw new Error("Enter your name.");
  if (!/^\d{1,11}$/.test(newKey)) throw new Error("Enter a phone number (max 11).");
  const oldRef = await memberRef(oldKey || input.oldPhone);
  const snap = await getDoc(oldRef);
  const prev = snap.data() || {};
  const next = {
    ...prev,
    name,
    phone: newKey,
    pass_v3: input.password?.trim() ? input.password.trim().slice(0, 11) : String(prev.pass_v3 || prev.password || ""),
    lastSeen: new Date().toISOString(),
  };
  if (newKey !== oldKey) {
    const taken = await getDoc(doc(getDb(), "members", newKey));
    if (taken.exists()) throw new Error("This phone number is already registered.");
    await setDoc(doc(getDb(), "members", newKey), next, { merge: true });
    await deleteDoc(oldRef);
  } else {
    await setDoc(oldRef, next, { merge: true });
  }
  return { ok: true as const, phone: newKey, name };
}

type RentPostSave = {
  zpid?: string | null;
  title: string;
  address?: string | null;
  price?: string | null;
  beds?: string | null;
  baths?: string | null;
  sqft?: string | null;
  facts?: string | null;
  image_url?: string | null;
  images?: string[];
  listing_url?: string | null;
};

function packRentMedia(row: { image_url?: string | null; images?: string[]; listing_url?: string | null }) {
  const images = (row.images && row.images.length ? row.images : row.image_url ? [row.image_url] : []).filter(Boolean);
  return JSON.stringify({ images, listing_url: row.listing_url || "" });
}

function unpackRentMedia(raw: string | null | undefined) {
  if (!raw) return { images: [] as string[], listing_url: "" };
  try {
    const parsed = JSON.parse(raw) as { images?: string[]; listing_url?: string } | string[];
    if (Array.isArray(parsed)) return { images: parsed.filter(Boolean), listing_url: "" };
    if (parsed && typeof parsed === "object") {
      const images = Array.isArray(parsed.images) ? parsed.images.filter(Boolean) : [];
      return { images, listing_url: String(parsed.listing_url || "") };
    }
  } catch {
    /* plain url */
  }
  if (raw.startsWith("http") || raw.startsWith("data:")) return { images: [raw], listing_url: "" };
  return { images: [] as string[], listing_url: "" };
}

function postKey(row: { zpid?: string | null; listing_url?: string | null; id?: string }) {
  const z = String(row.zpid || "").trim();
  if (z) return `z:${z}`;
  const url = String(row.listing_url || "").split("?")[0].replace(/\/$/, "");
  if (url && /_zpid|homedetails|\/b\/|apartments/i.test(url) && !/homes\/for_rent|searchQueryState/i.test(url)) {
    return `u:${url}`;
  }
  return row.id ? `i:${row.id}` : "";
}

function mergeRentPosts(...lists: StoredPost[][]) {
  const byId = new Map<string, StoredPost>();
  for (const list of lists) {
    for (const row of list || []) {
      if (!row?.id) continue;
      byId.set(row.id, row);
    }
  }
  const byKey = new Map<string, StoredPost>();
  for (const row of byId.values()) {
    const key = postKey(row) || `i:${row.id}`;
    const prev = byKey.get(key);
    if (!prev || Number(row.serial_no || 0) >= Number(prev.serial_no || 0)) {
      byKey.set(key, row);
    }
  }
  return [...byKey.values()].sort((a, b) => Number(a.serial_no) - Number(b.serial_no));
}

function samePostIds(a: StoredPost[], b: StoredPost[]) {
  if (a.length !== b.length) return false;
  return a.every((row, index) => row.id === b[index]?.id && row.serial_no === b[index]?.serial_no);
}

const POSTS_KEY = "painite.rent.posts";
type StoredPost = RentPostSave & { id: string; serial_no: number; created_at: string };
let postsMemory: StoredPost[] | null = null;

function readStoragePosts(): StoredPost[] {
  if (typeof window === "undefined") return [];
  const bags: StoredPost[] = [];
  const seen = new Set<string>();
  const stores = [window.localStorage, window.sessionStorage];
  for (const store of stores) {
    try {
      const keys = [POSTS_KEY];
      for (let i = 0; i < store.length; i += 1) {
        const key = store.key(i);
        if (key && key.startsWith("painite.rent.posts")) keys.push(key);
      }
      for (const key of keys) {
        const raw = store.getItem(key);
        if (!raw) continue;
        const rows = JSON.parse(raw) as StoredPost[];
        if (!Array.isArray(rows)) continue;
        for (const row of rows) {
          if (!row?.id || seen.has(row.id)) continue;
          seen.add(row.id);
          bags.push(row);
        }
      }
    } catch {
      /* skip */
    }
  }
  return bags;
}

function readLocalRentPosts(): StoredPost[] {
  if (postsMemory) return postsMemory;
  postsMemory = readStoragePosts();
  return postsMemory;
}

function writeLocalRentPosts(rows: StoredPost[]) {
  postsMemory = rows;
  if (typeof window === "undefined") return;
  const raw = JSON.stringify(rows);
  for (const store of [window.localStorage, window.sessionStorage]) {
    try {
      const toClean: string[] = [];
      for (let i = 0; i < store.length; i += 1) {
        const key = store.key(i);
        if (key && key.startsWith("painite.rent.posts") && key !== POSTS_KEY) {
          toClean.push(key);
        }
      }
      for (const key of toClean) store.removeItem(key);
      store.setItem(POSTS_KEY, raw);
    } catch {
      /* quota */
    }
  }
  void getDesktop()?.postsSet?.(rows);
}

async function persistRentPosts(rows: StoredPost[]) {
  writeLocalRentPosts(rows);
  const api = getDesktop();
  if (api?.postsSet) {
    try {
      await api.postsSet(rows);
    } catch {
      /* local kept */
    }
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("painite:posts-changed"));
  }
}

async function hydrateRentPosts(): Promise<StoredPost[]> {
  const stored = readStoragePosts();
  const mem = postsMemory || [];
  let disk: StoredPost[] = [];
  const api = getDesktop();
  if (api?.postsGet) {
    try {
      const got = await api.postsGet();
      if (Array.isArray(got)) disk = got as StoredPost[];
    } catch {
      /* local */
    }
  }
  const merged = mergeRentPosts(disk, stored, mem);
  postsMemory = merged;
  if (!samePostIds(stored, merged)) {
    writeLocalRentPosts(merged);
  }
  if (api?.postsSet && !samePostIds(disk, merged)) {
    try {
      await api.postsSet(merged);
    } catch {
      /* keep */
    }
  }
  return merged;
}

export async function clientListRentPosts() {
  const local = await hydrateRentPosts();
  return local
    .map((row) => {
      const media = unpackRentMedia(row.image_url);
      return {
        id: row.id,
        serial_no: row.serial_no,
        zpid: row.zpid || null,
        title: row.title,
        address: row.address || null,
        price: row.price || null,
        beds: row.beds || null,
        baths: row.baths || null,
        sqft: row.sqft || null,
        facts: row.facts || null,
        image_url: media.images[0] || row.image_url || null,
        images: media.images.length ? media.images : row.images || [],
        listing_url: row.listing_url || media.listing_url || "",
        created_at: row.created_at,
      };
    })
    .sort((a, b) => Number(b.serial_no) - Number(a.serial_no));
}

export async function clientSendRentPosts(rows: RentPostSave[]) {
  const current = [...(await hydrateRentPosts())];
  let serial = current.reduce((max, row) => Math.max(max, row.serial_no || 0), 0);
  let added = 0;
  for (const row of rows) {
    const key = postKey(row);
    if (key && current.some((item) => postKey(item) === key)) continue;
    serial += 1;
    added += 1;
    const packed = packRentMedia(row);
    current.push({
      id: `rp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      serial_no: serial,
      zpid: row.zpid,
      title: row.title || row.address || "Listing",
      address: row.address,
      price: row.price,
      beds: row.beds,
      baths: row.baths,
      sqft: row.sqft,
      facts: row.facts,
      image_url: packed,
      listing_url: row.listing_url || "",
      created_at: new Date().toISOString(),
    });
  }
  await persistRentPosts(current);
  return { ok: true as const, added };
}

export async function clientUpdateRentPost(row: {
  id: string;
  title?: string;
  address?: string;
  price?: string;
  beds?: string;
  baths?: string;
  sqft?: string;
  facts?: string;
  images?: string[];
  listing_url?: string;
}) {
  const current = await hydrateRentPosts();
  const packed = packRentMedia(row);
  const next = current.map((item) =>
    item.id === row.id
      ? {
          ...item,
          title: row.title ?? item.title,
          address: row.address ?? item.address,
          price: row.price ?? item.price,
          beds: row.beds ?? item.beds,
          baths: row.baths ?? item.baths,
          sqft: row.sqft ?? item.sqft,
          facts: row.facts ?? item.facts,
          image_url: packed,
          listing_url: row.listing_url ?? item.listing_url,
        }
      : item,
  );
  writeLocalRentPosts(next);
}

export async function clientDeleteRentPost(id: string) {
  const current = await hydrateRentPosts();
  const next = current.filter((row) => row.id !== id);
  postsMemory = next;
  if (typeof window !== "undefined") {
    const raw = JSON.stringify(next);
    for (const store of [window.localStorage, window.sessionStorage]) {
      try {
        const toClean: string[] = [];
        for (let i = 0; i < store.length; i += 1) {
          const key = store.key(i);
          if (key && key.startsWith("painite.rent.posts")) {
            toClean.push(key);
          }
        }
        for (const key of toClean) store.removeItem(key);
        store.setItem(POSTS_KEY, raw);
      } catch {
        /* skip */
      }
    }
  }
  const desktop = getDesktop();
  if (desktop?.postsSet) {
    try {
      await desktop.postsSet(next);
    } catch {
      /* skip */
    }
  }
}

export async function clientReorderRentPosts(ids: string[]) {
  const current = await hydrateRentPosts();
  const map = new Map(current.map((row) => [row.id, row]));
  const max = ids.length;
  const next = ids
    .map((id, index) => {
      const row = map.get(id);
      if (!row) return null;
      return { ...row, serial_no: max - index };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));
  for (const row of current) {
    if (!ids.includes(row.id)) next.push(row);
  }
  writeLocalRentPosts(next);
}

export async function clientSendMemberNotice(input: {
  uid: string;
  kind: "report" | "suspend" | "message";
  text: string;
  addBalance?: number;
}) {
  const uid = input.uid.trim().toUpperCase();
  const text = input.text.trim().slice(0, 4000);
  if (!uid) throw new Error("Enter the member UID.");
  if (!text) throw new Error("Enter the message.");
  const snap = await getDocs(collection(getDb(), "members"));
  const hit = snap.docs.find((item) => String(item.data()?.uid || "").toUpperCase() === uid);
  if (!hit) throw new Error("UID not found.");
  const prev = hit.data() || {};
  const now = Date.now();
  const patch: Record<string, string | number> = {};
  if (input.kind === "report") {
    const old = String(prev.report || "");
    patch.report = old ? `${old}\n\n${text}` : text;
    patch.reportAt = now;
  } else if (input.kind === "suspend") {
    const old = String(prev.suspendReport || "");
    patch.suspendReport = old ? `${old}\n\n${text}` : text;
    patch.suspendReportAt = now;
  } else {
    const old = String(prev.adminMessage || "");
    patch.adminMessage = old ? `${old}\n\n${text}` : text;
    patch.adminMessageAt = now;
  }
  const add = Number(input.addBalance) || 0;
  if (add > 0) patch.balance = (Number(prev.balance) || 0) + add;
  await setDoc(hit.ref, patch, { merge: true });
  return { ok: true as const, name: String(prev.name || "") };
}

export async function clientClearNotice(input: {
  phone?: string;
  uid?: string;
  kind: "report" | "suspend" | "message";
}) {
  const { phone, uid, kind } = input;
  const pKey = phone ? phoneKey(phone) : "";
  const uUpper = uid ? uid.trim().toUpperCase() : "";

  let targetRef: any = null;
  try {
    const snap = await getDocs(collection(getDb(), "members"));
    const hit = snap.docs.find((item) => {
      const d = item.data() || {};
      if (uUpper && String(d.uid || "").trim().toUpperCase() === uUpper) return true;
      if (pKey && (item.id === pKey || item.id === phone || String(d.phone || "").replace(/\D/g, "") === pKey)) return true;
      return false;
    });
    if (hit) targetRef = hit.ref;
  } catch {
    /* skip */
  }

  if (!targetRef) {
    if (pKey) targetRef = doc(getDb(), "members", pKey);
    else if (phone) targetRef = doc(getDb(), "members", phone);
  }

  if (!targetRef) return { ok: false as const };

  const patch: Record<string, any> = {
    [kind === "report" ? "report" : kind === "suspend" ? "suspendReport" : "adminMessage"]: deleteField(),
    [kind === "report" ? "reportAt" : kind === "suspend" ? "suspendReportAt" : "adminMessageAt"]: deleteField(),
  };

  await setDoc(targetRef, patch, { merge: true });
  return { ok: true as const };
}

export async function clientSaveMyProfile(input: {
  name: string;
  avatar?: string | null;
  phone: string;
  password?: string;
  currentPassword?: string;
}) {
  const phone = phoneKey(input.phone);
  if (!phone) throw new Error("Phone missing.");
  const name = input.name.trim().slice(0, 11);
  if (!name) throw new Error("Enter your name.");
  const ref = await memberRef(phone);
  const snap = await getDoc(ref);
  const prev = snap.data() || {};
  const stored = String(prev.pass_v3 || prev.password || "");
  if (input.password) {
    if (!input.currentPassword) throw new Error("Enter your current password to change it.");
    if (stored && stored !== input.currentPassword) throw new Error("Current password is wrong.");
  }
  const next: Record<string, string | null> = {
    name,
    phone,
    lastSeen: new Date().toISOString(),
  };
  if (input.avatar !== undefined) next.avatar = input.avatar;
  if (input.password) next.pass_v3 = input.password.trim().slice(0, 11);
  await setDoc(ref, next, { merge: true });
  return {
    name,
    phone,
    avatar: (input.avatar !== undefined ? input.avatar : (prev.avatar as string | null)) ?? null,
    uid: String(prev.uid || "") || null,
  };
}

export async function clientListLeads() {
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
        address: String(data.address || data.profile_label || ""),
        created_at: String(data.created_at || ""),
      };
    })
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

export async function clientSubmitLead(input: Partial<LeadInput>) {
  const data = cleanLead(input);
  if (!data.contact_name && !data.body && !data.contact_phone && !data.budget && !data.fb_name && !data.address) {
    throw new Error("Enter lead information.");
  }
  const member = getLocalMember();
  const id = `ld_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const row = {
    id,
    member_name: member?.displayName || "Member",
    member_phone: member?.phone || "",
    ...data,
    created_at: new Date().toISOString(),
  };
  await setDoc(doc(getDb(), "leads", id), row);
  if (row.member_phone) {
    await setDoc(doc(getDb(), "members", row.member_phone), { completedTasks: increment(1) }, { merge: true });
  }
  return { ok: true as const, id };
}

export type AiLeadRow = LeadInput & {
  id: string;
  serial_no: number;
  sent: boolean;
  created_at: string;
  updated_at: string;
  customer_key: string;
};

const AI_LEADS_KEY = "painite.ai.leads";
const AI_LEADS_EVENT = "painite-ai-leads";
let aiLeadMemory: AiLeadRow[] | null = null;

function aiCustomerKey(lead: Partial<LeadInput>) {
  return [lead.profile_label, lead.fb_name, lead.fb_link, lead.listing_url]
    .map((part) => String(part || "").trim().toLowerCase())
    .filter(Boolean)
    .join("::");
}

function readAiLeads(): AiLeadRow[] {
  if (aiLeadMemory) return aiLeadMemory;
  if (typeof window === "undefined") {
    aiLeadMemory = [];
    return aiLeadMemory;
  }
  try {
    const raw = window.localStorage.getItem(AI_LEADS_KEY);
    aiLeadMemory = raw ? (JSON.parse(raw) as AiLeadRow[]) : [];
  } catch {
    aiLeadMemory = [];
  }
  return aiLeadMemory;
}

function writeAiLeads(rows: AiLeadRow[]) {
  aiLeadMemory = rows;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AI_LEADS_KEY, JSON.stringify(rows));
  } catch {
    /* quota */
  }
  window.dispatchEvent(new Event(AI_LEADS_EVENT));
}

function mergeLead(prev: LeadInput, next: Partial<LeadInput>): LeadInput {
  const merged: LeadInput = { ...prev };
  (Object.keys(next) as (keyof LeadInput)[]).forEach((key) => {
    const value = next[key];
    if (value == null) return;
    if (String(value).trim()) (merged[key] as LeadInput[typeof key]) = value as LeadInput[typeof key];
  });
  return cleanLead(merged);
}

export function listAiLeads(): AiLeadRow[] {
  return [...readAiLeads()].sort((a, b) => Number(b.serial_no) - Number(a.serial_no));
}

export function queueAiLead(input: Partial<LeadInput>): AiLeadRow | null {
  const data = cleanLead(input);
  if (!data.fb_name && !data.contact_name && !data.contact_phone && !data.address && !data.fb_link) return null;
  const key = aiCustomerKey(data);
  const rows = readAiLeads();
  const hit = rows.find((row) => !row.sent && row.customer_key === key);
  const now = new Date().toISOString();
  if (hit) {
    const merged = mergeLead(hit, data);
    const next = rows.map((row) =>
      row.id === hit.id ? { ...row, ...merged, customer_key: key, updated_at: now } : row,
    );
    writeAiLeads(next);
    return next.find((row) => row.id === hit.id) || hit;
  }
  const serial = rows.reduce((max, row) => Math.max(max, Number(row.serial_no) || 0), 0) + 1;
  const row: AiLeadRow = {
    ...data,
    id: `ai_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    serial_no: serial,
    sent: false,
    created_at: now,
    updated_at: now,
    customer_key: key,
  };
  writeAiLeads([...rows, row]);
  return row;
}

export function updateAiLead(id: string, input: Partial<LeadInput>) {
  const rows = readAiLeads();
  writeAiLeads(
    rows.map((row) =>
      row.id === id
        ? { ...row, ...cleanLead({ ...row, ...input }), updated_at: new Date().toISOString() }
        : row,
    ),
  );
}

export function markAiLeadSent(id: string) {
  writeAiLeads(
    readAiLeads().map((row) => (row.id === id ? { ...row, sent: true, updated_at: new Date().toISOString() } : row)),
  );
}

export function onAiLeadsChange(fn: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(AI_LEADS_EVENT, fn);
  return () => window.removeEventListener(AI_LEADS_EVENT, fn);
}

export async function clientSetMemberBalance(uid: string, amount: number, mode: "add" | "deduct") {
  const want = uid.trim().toUpperCase();
  const n = Number(amount) || 0;
  if (!want) throw new Error("Enter the member UID.");
  if (n <= 0) throw new Error("Enter an amount.");
  const snap = await getDocs(collection(getDb(), "members"));
  const hit = snap.docs.find((item) => String(item.data()?.uid || "").toUpperCase() === want);
  if (!hit) throw new Error("UID not found.");
  const current = Number(hit.data()?.balance) || 0;
  const balance = mode === "add" ? current + n : Math.max(0, current - n);
  await setDoc(hit.ref, { balance }, { merge: true });
  return { ok: true as const, balance, name: String(hit.data()?.name || "") };
}
