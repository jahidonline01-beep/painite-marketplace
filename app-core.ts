export const APP_VERSION = "3.48";
export const BRAND_NAME = "Painite Marketplace";
export const COPYRIGHT_YEAR = 2026;
export const CONTACT_EMAIL = "marketplace@painitemail.online";
export const TELEGRAM_USER = "JAHID_1";
export const TELEGRAM_URL = `https://t.me/${TELEGRAM_USER}`;
export const MAILTO_URL = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Painite Marketplace")}`;

export const NAME_MAX = 11;
export const PHONE_MAX = 11;
export function sanitizeName(raw: string): string { return Array.from(raw).slice(0, NAME_MAX).join(""); }
export function sanitizePhone(raw: string): string { return raw.replace(/\D/g, "").slice(0, PHONE_MAX); }
export function phoneToEmail(phone: string): string { return `${phone}@painite.app`; }
export function isCompletePhone(phone: string): boolean { return /^\d{1,11}$/.test(phone); }

export function compareVersions(a: string, b: string) {
  const pa = String(a || "0").replace(/^v/i, "").split(/[^0-9]+/).map((n) => Number.parseInt(n, 10) || 0);
  const pb = String(b || "0").replace(/^v/i, "").split(/[^0-9]+/).map((n) => Number.parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) { const x = pa[i] || 0; const y = pb[i] || 0; if (x < y) return -1; if (x > y) return 1; }
  return 0;
}
export function isStaleVersion(current: string, minimum: string) { if (!minimum || !String(minimum).trim()) return false; return compareVersions(current, String(minimum).trim()) < 0; }

export type LocalMember = { id: string; displayName: string; primaryEmail: string; phone: string };
type CredRow = LocalMember & { password: string };
const MEMBER_KEY = "painite.member";
const CREDS_KEY = "painite.member.creds";
let memory: LocalMember | null = null;
function readJson<T>(key: string): T | null { if (typeof window === "undefined") return null; for (const store of [window.sessionStorage, window.localStorage]) { try { const raw = store.getItem(key); if (raw) return JSON.parse(raw) as T; } catch {} } return null; }
function writeJson(key: string, value: unknown) { if (typeof window === "undefined") return; const raw = value == null ? null : JSON.stringify(value); for (const store of [window.sessionStorage, window.localStorage]) { try { if (raw) store.setItem(key, raw); else store.removeItem(key); } catch {} } }
function persistDisk() {
  const api = typeof window !== "undefined" ? window.painiteDesktop : undefined;
  if (!api?.sessionSet) return;
  const creds = readJson<CredRow[]>(CREDS_KEY);
  void api.sessionSet(memory ? { member: memory, credsRaw: creds ? JSON.stringify(creds) : null } : null);
}
export function getLocalMember(): LocalMember | null { if (memory) return memory; memory = readJson<LocalMember>(MEMBER_KEY); return memory; }
export function setLocalMember(row: LocalMember | null) { memory = row; writeJson(MEMBER_KEY, row); persistDisk(); }
export async function hydrateLocalMember(): Promise<LocalMember | null> {
  const local = getLocalMember();
  if (local) return local;
  const api = typeof window !== "undefined" ? window.painiteDesktop : undefined;
  if (!api?.sessionGet) return null;
  try {
    const disk = await api.sessionGet();
    const row = disk?.member as LocalMember | undefined;
    if (row && (row as LocalMember).id) {
      memory = row;
      writeJson(MEMBER_KEY, row);
      if (disk?.credsRaw) {
        try { writeJson(CREDS_KEY, JSON.parse(String(disk.credsRaw))); } catch {}
      }
      return row;
    }
  } catch {}
  return null;
}
export function saveMemberCreds(phone: string, password: string, profile: LocalMember) { const rows = readJson<CredRow[]>(CREDS_KEY) || []; const next = rows.filter((row) => row.phone !== phone); next.push({ ...profile, phone, password }); writeJson(CREDS_KEY, next); persistDisk(); }
export function matchMemberCreds(phone: string, password: string): LocalMember | null { const rows = readJson<CredRow[]>(CREDS_KEY) || []; const hit = rows.find((row) => row.phone === phone && row.password === password); if (!hit) return null; const { password: _pw, ...profile } = hit; return profile; }
