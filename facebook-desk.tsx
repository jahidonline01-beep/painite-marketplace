import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from "react";
import { ArrowLeft, Bot, Check, Copy, Globe, GripVertical, LoaderCircle, MapPin, Pencil, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { setChromeOverlay } from "@/lib/chrome-overlay";
import { getDesktop, toProxy, type MarketplaceListing } from "@/lib/desktop";
import { checkIp, type IpInfo } from "@/lib/ip-check";
import {
  createFacebookProfile,
  deleteFacebookProfile,
  listFacebookProfiles,
  reorderFacebookProfiles,
  setProfileRobot,
  updateFacebookProfile,
  type FacebookProfileRow,
} from "@/lib/facebook-profiles";
import { getLocalMember } from "@/lib/app-core";
import { takeFacebookSend, type FacebookSendJob } from "@/lib/desks";
import { cn } from "@/lib/utils";
import { FacebookIcon, ProxyIcon } from "./desk-icons";
import { FacebookFrame } from "./facebook-frame";


function ownerKey() {
  const member = getLocalMember();
  return member?.phone || member?.id || "local";
}

function readLocalProfiles(): FacebookProfileRow[] {
  try {
    const raw = window.localStorage.getItem(`painite.fb.profiles.${ownerKey()}`);
    return raw ? (JSON.parse(raw) as FacebookProfileRow[]) : [];
  } catch {
    return [];
  }
}

function writeLocalProfiles(rows: FacebookProfileRow[]) {
  try {
    window.localStorage.setItem(`painite.fb.profiles.${ownerKey()}`, JSON.stringify(rows));
  } catch {
    /* ignore */
  }
}

type LiveStatus = "" | "live" | "suspend";
type LiveMap = Record<string, { uid: string; status: LiveStatus }>;

function liveStoreKey() {
  return `painite.fb.live.${ownerKey()}`;
}

function readLiveMap(): LiveMap {
  try {
    const raw = window.localStorage.getItem(liveStoreKey());
    return raw ? (JSON.parse(raw) as LiveMap) : {};
  } catch {
    return {};
  }
}

function writeLiveMap(map: LiveMap) {
  try {
    window.localStorage.setItem(liveStoreKey(), JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

function liveOf(map: LiveMap, id: string): LiveStatus {
  return map[id]?.status || "";
}

export function FacebookDesk({ visible }: { visible: boolean }) {
  const [rows, setRows] = useState<FacebookProfileRow[]>([]);
  const [openedId, setOpenedId] = useState<string | null>(null);
  const [booted, setBooted] = useState<Record<string, true>>({});
  const [query, setQuery] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [proxyFor, setProxyFor] = useState<FacebookProfileRow | null>(null);
  const [renameFor, setRenameFor] = useState<FacebookProfileRow | null>(null);
  const [robotFor, setRobotFor] = useState<FacebookProfileRow | null>(null);
  const [deleteFor, setDeleteFor] = useState<FacebookProfileRow | null>(null);
  const [liveMap, setLiveMap] = useState<LiveMap>({});
  const [liveFilter, setLiveFilter] = useState<"" | "live" | "suspend">("");
  const [picked, setPicked] = useState<Record<string, true>>({});
  const [sendListing, setSendListing] = useState<MarketplaceListing | null>(null);
  const [botNote, setBotNote] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      const status = liveOf(liveMap, row.id);
      if (liveFilter === "live" && status !== "live") return false;
      if (liveFilter === "suspend" && status !== "suspend") return false;
      if (!q) return true;
      if (q === "live" || q === "active") return status === "live";
      if (q === "suspend" || q === "suspended") return status === "suspend";
      const serial = String(row.serial_no ?? "");
      const padded = serial.padStart(2, "0");
      return (
        row.label.toLowerCase().includes(q) ||
        serial === q ||
        padded === q ||
        `#${serial}` === q ||
        `#${padded}` === q
      );
    });
  }, [rows, query, liveMap, liveFilter]);

  const opened = rows.find((row) => row.id === openedId) ?? null;
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  async function reload() {
    try {
      const list = await listFacebookProfiles();
      setRows(list);
      writeLocalProfiles(list);
      return list;
    } catch {
      const list = readLocalProfiles();
      setRows(list);
      return list;
    }
  }

  useEffect(() => {
    let cancelled = false;
    void reload().then((list) => {
      if (cancelled) return;
      setRows(list);
      setLiveMap(readLiveMap());
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const desktop = getDesktop();
    const checkLive = desktop?.checkFacebookLive;
    if (!checkLive) return;
    const runCheck = checkLive;
    let cancelled = false;

    async function applyUidNames(hits: Record<string, string>) {
      const list = rowsRef.current;
      const next = list.map((row) => {
        const uid = hits[row.id];
        return uid && row.label !== uid ? { ...row, label: uid } : row;
      });
      const changed = next.some((row, i) => row.label !== list[i]?.label);
      if (!changed) return;
      setRows(next);
      writeLocalProfiles(next);
      for (const row of next) {
        const uid = hits[row.id];
        const prev = list.find((item) => item.id === row.id);
        if (!uid || prev?.label === uid) continue;
        try {
          await updateFacebookProfile({
            data: {
              id: row.id,
              label: uid,
              proxyHost: row.proxy_host || "",
              proxyPort: String(row.proxy_port || ""),
              proxyProtocol: row.proxy_protocol || "http",
              proxyUsername: row.proxy_username || "",
              proxyPassword: row.proxy_password || "",
            },
          });
        } catch {
          /* keep local name */
        }
      }
    }

    async function run() {
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      const map = { ...readLiveMap() };
      const ids = rowsRef.current.map((row) => row.id);
      const names: Record<string, string> = {};
      for (let i = 0; i < ids.length; i += 4) {
        if (cancelled) return;
        const chunk = ids.slice(i, i + 4);
        const results = await Promise.all(chunk.map((id) => runCheck(id)));
        chunk.forEach((id, idx) => {
          const hit = results[idx];
          if (!hit || hit.ok === false) return;
          if (!hit.status) {
            delete map[id];
            return;
          }
          map[id] = { uid: hit.uid || "", status: hit.status };
          if (hit.uid) names[id] = hit.uid;
        });
        if (!cancelled) {
          writeLiveMap(map);
          setLiveMap({ ...map });
        }
      }
      if (!cancelled) await applyUidNames(names);
    }

    void run();
    const timer = window.setInterval(() => void run(), 20000);
    const onOnline = () => void run();
    window.addEventListener("online", onOnline);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("online", onOnline);
    };
  }, [openedId]);

  useEffect(() => {
    if (!botNote) return;
    const timer = window.setTimeout(() => setBotNote(""), 2200);
    return () => window.clearTimeout(timer);
  }, [botNote]);

  useEffect(() => {
    setChromeOverlay(Boolean(proxyFor || renameFor || robotFor || deleteFor));
    return () => setChromeOverlay(false);
  }, [proxyFor, renameFor, robotFor, deleteFor]);

  useEffect(() => {
    if (visible && !openedId) void getDesktop()?.hideFacebook();
  }, [visible, openedId]);

  async function toggleRobot(row: FacebookProfileRow) {
    const on = !row.auto_reply;
    try {
      await setProfileRobot({ data: { id: row.id, on } });
    } catch {
      /* local still applies */
    }
    const next = rows.map((item) => (item.id === row.id ? { ...item, auto_reply: on ? 1 : 0 } : item));
    setRows(next);
    writeLocalProfiles(next);
    const live = next.find((item) => item.id === row.id) ?? { ...row, auto_reply: on ? 1 : 0 };
    setRobotFor(live);
    const desktop = getDesktop();
    try {
      if (on) await desktop?.robotStart({ id: row.id, proxy: toProxy(row) });
      else await desktop?.robotStop(row.id);
    } catch {
      /* popup still reports state */
    }
    setBotNote(on ? "Bot started" : "Bot stopped");
  }

  function consumeJob(job: FacebookSendJob | null) {
    if (!job?.id) return;
    setOpenedId(job.id);
    setBooted((map) => ({ ...map, [job.id]: true }));
    setSendListing(job.listing);
  }

  useEffect(() => {
    consumeJob(takeFacebookSend());
    function onOpen(event: Event) {
      const job = (event as CustomEvent<FacebookSendJob>).detail;
      consumeJob(job || takeFacebookSend());
    }
    window.addEventListener("painite:open-facebook", onOpen);
    return () => window.removeEventListener("painite:open-facebook", onOpen);
  }, []);

  async function addProfile() {
    const label = `Profile ${rows.length + 1}`;
    try {
      await createFacebookProfile({ data: { label } });
      await reload();
    } catch {
      const serial = (rows[0]?.serial_no || 0) + 1;
      const row: FacebookProfileRow = {
        id: `fp_${Date.now().toString(36)}`,
        label,
        serial_no: serial,
        auto_reply: 0,
        proxy_host: null,
        proxy_port: null,
        proxy_protocol: null,
        proxy_username: null,
        proxy_password: null,
        created_at: new Date().toISOString(),
      };
      const next = [row, ...rows];
      setRows(next);
      writeLocalProfiles(next);
    }
  }

  function openProfile(row: FacebookProfileRow) {
    setOpenedId(row.id);
    setBooted((map) => ({ ...map, [row.id]: true }));
  }

  async function removeProfile(id: string) {
    const desktop = getDesktop();
    if (desktop) {
      await desktop.closeFacebook(id);
      await desktop.wipeFacebook?.(id);
    }
    try {
      await deleteFacebookProfile({ data: id });
    } catch {
      /* local still drops */
    }
    const next = rows.filter((row) => row.id !== id).map((row, index, all) => ({
      ...row,
      serial_no: all.length - index,
    }));
    writeLocalProfiles(next);
    setRows(next);
    setDeleteFor(null);
    const map = { ...readLiveMap() };
    delete map[id];
    writeLiveMap(map);
    setLiveMap(map);
    setPicked((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
    setBooted((map) => {
      const copy = { ...map };
      delete copy[id];
      return copy;
    });
    if (openedId === id) setOpenedId(null);
  }

  async function removePicked() {
    const ids = Object.keys(picked);
    if (!ids.length) return;
    if (!window.confirm(`Delete ${ids.length} profile${ids.length > 1 ? "s" : ""}?`)) return;
    for (const id of ids) {
      await removeProfile(id);
    }
    setPicked({});
  }

  function togglePick(id: string) {
    setPicked((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = true;
      return next;
    });
  }

  function togglePickAll() {
    const ids = filtered.map((row) => row.id);
    const allOn = ids.length > 0 && ids.every((id) => picked[id]);
    if (allOn) {
      setPicked((prev) => {
        const next = { ...prev };
        for (const id of ids) delete next[id];
        return next;
      });
      return;
    }
    setPicked((prev) => {
      const next = { ...prev };
      for (const id of ids) next[id] = true;
      return next;
    });
  }

  async function dropOn(targetId: string) {
    if (!dragId || dragId === targetId || query.trim()) return;
    const from = rows.findIndex((row) => row.id === dragId);
    const to = rows.findIndex((row) => row.id === targetId);
    if (from < 0 || to < 0) return;
    const next = [...rows];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    const numbered = next.map((row, index) => ({ ...row, serial_no: next.length - index }));
    setRows(numbered);
    setDragId(null);
    await reorderFacebookProfiles({ data: numbered.map((row) => row.id) });
  }

  return (
    <section className={cn("fb-desk", opened && "is-open")}>
      {opened ? (
        <div className="fb-session">
          <button type="button" className="fb-back" onClick={() => setOpenedId(null)}>
            <ArrowLeft className="size-4" />
            Back
          </button>
          <span className="fb-serial">{String(opened.serial_no).padStart(2, "0")}</span>
          <p className="fb-session__name truncate">{opened.label}</p>
          <button
            type="button"
            className="fb-refresh"
            aria-label="Refresh"
            onClick={() =>
              void getDesktop()?.reloadFacebook({
                id: opened.id,
                label: opened.label,
                proxy: toProxy(opened),
              })
            }
          >
            <RefreshCw className="size-3.5" />
          </button>
        </div>
      ) : (
        <aside className="fb-rail">
          <div className="fb-rail__top">
            <div className="fb-search">
              <Search className="size-4" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search"
                aria-label="Search"
              />
            </div>
            <button
              type="button"
              className={cn("fb-live-dongle is-live", liveFilter === "live" && "is-on")}
              onClick={() => setLiveFilter((cur) => (cur === "live" ? "" : "live"))}
            >
              live
            </button>
            <button
              type="button"
              className={cn("fb-live-dongle is-suspend", liveFilter === "suspend" && "is-on")}
              onClick={() => setLiveFilter((cur) => (cur === "suspend" ? "" : "suspend"))}
            >
              suspend
            </button>
            <button type="button" className="fb-add" onClick={() => void addProfile()}>
              <Plus className="size-4" />
            </button>
          </div>
          {filtered.length ? (
            <div className="fb-pickbar">
              <button type="button" className="fb-pickbar__all" onClick={togglePickAll}>
                {filtered.every((row) => picked[row.id]) ? "Unselect" : "Select"}
              </button>
              {Object.keys(picked).length ? (
                <button type="button" className="fb-pickbar__del" onClick={() => void removePicked()}>
                  Delete {Object.keys(picked).length}
                </button>
              ) : null}
            </div>
          ) : null}
          <ul className="fb-list">
            {filtered.map((row, index) => {
              const status = liveOf(liveMap, row.id);
              const isPicked = Boolean(picked[row.id]);
              return (
                <li
                  key={row.id}
                  onDragOver={(event: DragEvent) => event.preventDefault()}
                  onDrop={() => void dropOn(row.id)}
                >
                  <div
                    className={cn("fb-row", dragId === row.id && "is-drag", isPicked && "is-picked")}
                    style={{ animationDelay: `${index * 40}ms` }}
                  >
                    <button
                      type="button"
                      className={cn("fb-row__pick", isPicked && "is-on")}
                      aria-label="Select"
                      onClick={() => togglePick(row.id)}
                    >
                      {isPicked ? <Check className="size-3.5" /> : null}
                    </button>
                    <button
                      type="button"
                      className="fb-row__grip"
                      draggable={!query.trim()}
                      aria-label="Move"
                      onDragStart={() => setDragId(row.id)}
                      onDragEnd={() => setDragId(null)}
                    >
                      <GripVertical className="size-4" />
                    </button>
                    <button type="button" className="fb-row__open" onClick={() => openProfile(row)}>
                      <span className="fb-serial">{String(row.serial_no).padStart(2, "0")}</span>
                      <FacebookIcon />
                      <span className="min-w-0 truncate">{row.label}</span>
                      {status === "live" ? (
                        <span className="fb-live-tag is-live">
                          <span className="fb-dot is-live" />
                          live
                        </span>
                      ) : status === "suspend" ? (
                        <span className="fb-live-tag is-suspend">
                          <span className="fb-dot is-suspend" />
                          suspend
                        </span>
                      ) : null}
                    </button>
                    <button
                      type="button"
                      className="fb-row__name"
                      aria-label="Rename"
                      onClick={() => setRenameFor(row)}
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      className="fb-row__proxy"
                      aria-label="Proxy"
                      onClick={() => setProxyFor(row)}
                    >
                      <ProxyIcon />
                    </button>
                    <button
                      type="button"
                      className={cn("fb-row__bot", row.auto_reply && "is-on")}
                      aria-label="Robot"
                      onClick={() => setRobotFor(row)}
                    >
                      <Bot className="size-4" />
                    </button>
                    <button
                      type="button"
                      className="fb-row__del"
                      aria-label="Delete"
                      onClick={() => setDeleteFor(row)}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </aside>
      )}

      <div className="fb-viewport">
        {rows.map((row) =>
          booted[row.id] ? (
            <FacebookFrame
              key={row.id}
              profile={row}
              active={openedId === row.id}
              visible={visible && openedId === row.id}
              listing={openedId === row.id ? sendListing : null}
              onListed={() => setSendListing(null)}
            />
          ) : null,
        )}
      </div>

      {proxyFor ? (
        <ProxyPopup
          row={rows.find((row) => row.id === proxyFor.id) ?? proxyFor}
          onClose={() => setProxyFor(null)}
          onChanged={async () => {
            const list = await reload();
            setProxyFor(null);
            const desktop = getDesktop();
            const live = openedId ? list.find((row) => row.id === openedId) : null;
            if (desktop && live) {
              await desktop.reloadFacebook({
                id: live.id,
                label: live.label,
                proxy: toProxy(live),
                url: "https://www.facebook.com/",
              });
            }
          }}
        />
      ) : null}

      {renameFor ? (
        <NamePopup
          row={rows.find((row) => row.id === renameFor.id) ?? renameFor}
          onClose={() => setRenameFor(null)}
          onChanged={async () => {
            await reload();
            setRenameFor(null);
          }}
        />
      ) : null}

      {botNote ? (
        <div className="fb-bot-toast" role="status">
          {botNote}
        </div>
      ) : null}

      {robotFor ? (
        <RobotPopup
          row={rows.find((row) => row.id === robotFor.id) ?? robotFor}
          onClose={() => setRobotFor(null)}
          onToggle={() => void toggleRobot(robotFor)}
        />
      ) : null}

      {deleteFor ? (
        <ConfirmDelete
          name={deleteFor.label}
          onKeep={() => setDeleteFor(null)}
          onDelete={() => void removeProfile(deleteFor.id)}
        />
      ) : null}
    </section>
  );
}

function NamePopup({
  row,
  onClose,
  onChanged,
}: {
  row: FacebookProfileRow;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [label, setLabel] = useState(row.label);
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    const next = label.trim().slice(0, 24) || row.label;
    setBusy(true);
    try {
      await updateFacebookProfile({
        data: {
          id: row.id,
          label: next,
          proxyHost: row.proxy_host || "",
          proxyPort: row.proxy_port ? String(row.proxy_port) : "",
          proxyProtocol: row.proxy_protocol || "http",
          proxyUsername: row.proxy_username || "",
          proxyPassword: row.proxy_password || "",
        },
      });
      onChanged();
    } catch {
      const list = readLocalProfiles().map((item) => (item.id === row.id ? { ...item, label: next } : item));
      writeLocalProfiles(list);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="member-sheet" role="dialog" aria-label="Rename">
      <button type="button" className="member-sheet__backdrop" aria-label="Close" onClick={onClose} />
      <form className="member-sheet__card fb-proxy-card" onSubmit={save}>
        <div className="fb-proxy-card__head">
          <span className="fb-proxy-card__mark">
            <Pencil className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium tracking-[0.22em] text-ice uppercase">Name</p>
            <h2 className="mt-1 truncate font-display text-2xl font-semibold">{row.label}</h2>
          </div>
          <button type="button" className="fb-pop-close" aria-label="Close" onClick={onClose}>
            <X className="size-4" />
          </button>
        </div>
        <label className="mt-4 block space-y-1.5">
          <span className="text-sm font-medium">Profile name</span>
          <input
            value={label}
            maxLength={24}
            onChange={(event) => setLabel(event.target.value.slice(0, 24))}
            className="fb-input"
          />
        </label>
        <button type="submit" disabled={busy} className="fb-save mt-4 w-full">
          Save
        </button>
      </form>
    </div>
  );
}

function ProxyPopup({
  row,
  onClose,
  onChanged,
}: {
  row: FacebookProfileRow;
  onClose: () => void;
  onChanged: (row: FacebookProfileRow) => void;
}) {
  const [mode, setMode] = useState<"local" | "http" | "socks5">(
    row.proxy_host ? (row.proxy_protocol === "socks5" ? "socks5" : "http") : "local",
  );
  const [host, setHost] = useState(row.proxy_host ?? "");
  const [port, setPort] = useState(row.proxy_port ? String(row.proxy_port) : "");
  const [username, setUsername] = useState(row.proxy_username ?? "");
  const [password, setPassword] = useState(row.proxy_password ?? "");
  const [busy, setBusy] = useState(false);
  const [ipBusy, setIpBusy] = useState(true);
  const [ip, setIp] = useState<IpInfo | null>(null);
  const [copied, setCopied] = useState(false);

  async function runIp() {
    setIpBusy(true);
    try {
      const proxy =
        mode === "local" || !host || !port
          ? null
          : {
              host,
              port: Number(port),
              protocol: mode === "socks5" ? ("socks5" as const) : ("http" as const),
              username: username || undefined,
              password: password || undefined,
            };
      setIp(await checkIp(row.id, proxy));
    } catch {
      setIp(null);
    } finally {
      setIpBusy(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void runIp(), 280);
    return () => window.clearTimeout(timer);
  }, [row.id, mode, host, port, username, password]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await updateFacebookProfile({
        data: {
          id: row.id,
          label: row.label,
          proxyHost: mode === "local" ? "" : host,
          proxyPort: mode === "local" ? "" : port,
          proxyProtocol: mode === "socks5" ? "socks5" : "http",
          proxyUsername: mode === "local" ? "" : username,
          proxyPassword: mode === "local" ? "" : password,
        },
      });
      await runIp();
      onChanged({ ...row, label: row.label });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="member-sheet" role="dialog" aria-label="Proxy">
      <button type="button" className="member-sheet__backdrop" aria-label="Close" onClick={onClose} />
      <form className="member-sheet__card fb-proxy-card" onSubmit={save}>
        <div className="fb-proxy-card__head">
          <span className="fb-proxy-card__mark">
            <ProxyIcon />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium tracking-[0.22em] text-ice uppercase">Proxy</p>
            <h2 className="mt-1 truncate font-display text-2xl font-semibold">{row.label}</h2>
          </div>
          <button type="button" className="fb-pop-close" aria-label="Close" onClick={onClose}>
            <X className="size-4" />
          </button>
        </div>
        <div className="fb-modes">
          {(["local", "http", "socks5"] as const).map((item) => (
            <button
              key={item}
              type="button"
              className={cn("fb-mode", mode === item && "is-on")}
              onClick={() => setMode(item)}
            >
              {item === "local" ? "Local" : item === "http" ? "HTTP" : "SOCKS5"}
            </button>
          ))}
        </div>
        <div className={cn("fb-proxy__grid", mode === "local" && "is-off")}>
          <input className="fb-input" value={host} onChange={(event) => setHost(event.target.value)} placeholder="Host" aria-label="Host" />
          <input
            className="fb-input"
            value={port}
            inputMode="numeric"
            onChange={(event) => setPort(event.target.value.replace(/\D/g, "").slice(0, 5))}
            placeholder="Port"
            aria-label="Port"
          />
          <input className="fb-input" value={username} autoComplete="off" onChange={(event) => setUsername(event.target.value)} placeholder="User" aria-label="User" />
          <input className="fb-input" type="password" value={password} autoComplete="off" onChange={(event) => setPassword(event.target.value)} placeholder="Password" aria-label="Password" />
        </div>
        {/* PREMIUM NETWORK / IP VERIFICATION CARD */}
        <div className="mt-3.5 rounded-xl border border-cyan-500/25 bg-slate-950/80 p-3.5 shadow-xl shadow-black/50 backdrop-blur-md space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="relative flex size-2.5 items-center justify-center shrink-0">
                {ipBusy ? (
                  <span className="absolute size-2.5 animate-ping rounded-full bg-cyan-400 opacity-75" />
                ) : ip?.ip ? (
                  <span className="absolute size-2.5 rounded-full bg-emerald-400/50 blur-[2px]" />
                ) : null}
                <span
                  className={cn(
                    "size-2 rounded-full transition-colors",
                    ipBusy
                      ? "bg-cyan-400"
                      : ip?.ip
                      ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]"
                      : "bg-white/25",
                  )}
                />
              </span>
              <span className="text-[10.5px] font-bold tracking-wider text-cyan-300 uppercase truncate">
                Network & Location
              </span>
            </div>

            <button
              type="button"
              className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg border border-cyan-500/35 bg-cyan-500/15 px-2.5 text-[11px] font-semibold text-cyan-200 transition-all hover:bg-cyan-500/25 hover:border-cyan-400/70 active:scale-95 disabled:opacity-50"
              onClick={() => void runIp()}
              disabled={ipBusy}
              title="Verify IP & Location"
            >
              {ipBusy ? (
                <LoaderCircle className="size-3 animate-spin text-cyan-300" />
              ) : (
                <Globe className="size-3 text-cyan-300" />
              )}
              <span>{ipBusy ? "Checking..." : "Verify IP"}</span>
            </button>
          </div>

          {/* Monospace IP Address Box */}
          <div className="flex items-center justify-between rounded-lg border border-white/10 bg-black/45 px-3 py-2">
            <div className="min-w-0 flex-1">
              <span className="block text-[9.5px] font-medium tracking-wider text-white/40 uppercase">
                Public IP Address
              </span>
              <p className="font-mono text-sm font-bold tracking-wider text-white truncate">
                {ipBusy ? (
                  <span className="text-white/40 text-xs font-normal">Detecting gateway...</span>
                ) : ip?.ip ? (
                  ip.ip
                ) : (
                  <span className="text-white/30 text-xs font-normal">No IP detected</span>
                )}
              </p>
            </div>
            {ip?.ip && !ipBusy ? (
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(ip.ip);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="ml-2 flex size-7 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/70 transition hover:border-white/20 hover:bg-white/10 hover:text-white active:scale-90"
                title="Copy IP address"
              >
                {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
              </button>
            ) : null}
          </div>

          {/* Country & City Badges (100% English, sleek & premium) */}
          {!ipBusy && (ip?.country || ip?.city) ? (
            <div className="grid grid-cols-2 gap-2 pt-0.5">
              <div className="flex items-center gap-2 rounded-lg border border-cyan-500/20 bg-cyan-950/25 px-2.5 py-1.5 min-w-0">
                <Globe className="size-3.5 shrink-0 text-cyan-400" />
                <div className="min-w-0 flex-1">
                  <span className="block text-[9px] font-medium tracking-wider text-cyan-300/60 uppercase">Country</span>
                  <span className="block truncate text-xs font-semibold text-white">{ip.country || "Unknown"}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-950/25 px-2.5 py-1.5 min-w-0">
                <MapPin className="size-3.5 shrink-0 text-amber-400" />
                <div className="min-w-0 flex-1">
                  <span className="block text-[9px] font-medium tracking-wider text-amber-300/60 uppercase">City</span>
                  <span className="block truncate text-xs font-semibold text-white">{ip.city || "Unknown"}</span>
                </div>
              </div>
            </div>
          ) : null}
        </div>
        <button type="submit" disabled={busy} className="fb-save mt-4 w-full">
          Save
        </button>
      </form>
    </div>
  );
}

function ConfirmDelete({
  name,
  onKeep,
  onDelete,
}: {
  name: string;
  onKeep: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="member-sheet" role="dialog" aria-label="Delete">
      <button type="button" className="member-sheet__backdrop" aria-label="Close" onClick={onKeep} />
      <div className="member-sheet__card fb-confirm">
        <p className="text-xs font-medium tracking-[0.22em] text-danger uppercase">Delete</p>
        <h2 className="mt-2 font-display text-3xl font-semibold">{name}</h2>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" className="fb-keep" onClick={onKeep}>
            Keep
          </button>
          <button type="button" className="fb-kill" onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function RobotPopup({
  row,
  onClose,
  onToggle,
}: {
  row: FacebookProfileRow;
  onClose: () => void;
  onToggle: () => void;
}) {
  const on = Boolean(row.auto_reply);
  return (
    <div className="member-sheet" role="dialog" aria-label="Robot">
      <button type="button" className="member-sheet__backdrop" aria-label="Close" onClick={onClose} />
      <div className="member-sheet__card fb-proxy-card">
        <div className="fb-proxy-card__head">
          <span className="fb-proxy-card__mark" style={{ background: "color-mix(in oklab, var(--color-lead) 28%, transparent)", color: "var(--color-lead)" }}>
            <Bot className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium tracking-[0.22em] uppercase" style={{ color: "var(--color-lead)" }}>
              Bot AI
            </p>
            <p className="truncate font-display text-xl font-semibold">
              {String(row.serial_no).padStart(2, "0")} · {row.label}
            </p>
          </div>
          <button type="button" className="fb-pop-close" onClick={onClose} aria-label="Close">
            <X className="size-4" />
          </button>
        </div>
        <ul className="mt-4 space-y-2 text-sm text-muted">
          <li>Detects the Marketplace listing from the chat card / listing ID</li>
          <li>Replies only about that property — never asks which post</li>
          <li>Confirms availability and asks for a cell number</li>
          <li>Sends that listing’s photos in Messenger when the customer asks</li>
          <li>Saves filled lead fields to Lead → Gemini AI for manual Send</li>
        </ul>
        <p className="mt-4 text-sm font-semibold" style={{ color: on ? "var(--color-lead)" : "var(--color-muted)" }}>
          {on ? "Running" : "Stopped"}
        </p>
        <button
          type="button"
          className="fb-save mt-4 w-full"
          onClick={onToggle}
          style={on ? { background: "var(--color-lead)", color: "#041410" } : undefined}
        >
          {on ? "Stop" : "Start"}
        </button>
      </div>
    </div>
  );
}