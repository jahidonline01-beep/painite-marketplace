import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import {
  Building2,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  GripVertical,
  ImagePlus,
  Layers,
  Radio,
  Search,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { getDesktop } from "@/lib/desktop";
import { listFacebookProfiles, type FacebookProfileRow } from "@/lib/facebook-profiles";
import { type RentPostRow } from "@/lib/rent-posts";
import {
  clientDeleteRentPost,
  clientListRentPosts,
  clientReorderRentPosts,
  clientUpdateRentPost,
} from "@/lib/member-ops";
import { getLocalMember } from "@/lib/app-core";
import { requestFacebookSend } from "@/lib/desks";
import { cn } from "@/lib/utils";
import { PostIcon } from "./desk-icons";

interface FbDongleProps {
  profiles: FacebookProfileRow[];
  selectedId: string;
  onSelect: (id: string, profile: FacebookProfileRow) => void;
  className?: string;
}

function FbDongle({ profiles, selectedId, onSelect, className }: FbDongleProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const selectedProfile = profiles.find((p) => p.id === selectedId);

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setIsOpen(false);
    }
    window.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const q = search.trim().toLowerCase();
  const filtered = profiles
    .slice()
    .sort((a, b) => b.serial_no - a.serial_no)
    .filter((p) => {
      if (!q) return true;
      const serial = String(p.serial_no);
      const padded = serial.padStart(2, "0");
      return (
        p.label.toLowerCase().includes(q) ||
        serial === q ||
        padded === q ||
        `#${padded}` === q
      );
    });

  return (
    <div className={cn("relative inline-block", className)} ref={popoverRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={cn(
          "group inline-flex items-center gap-1.5 rounded-lg px-2 py-0.5 transition-all active:scale-95 shadow-sm border",
          selectedProfile
            ? "border-emerald-400/80 bg-gradient-to-r from-emerald-950 via-green-800/80 to-emerald-950 text-emerald-50 shadow-[0_0_18px_rgba(16,185,129,0.45)]"
            : "border-white/15 bg-white/5 text-white/80 hover:bg-white/10 hover:border-white/30"
        )}
        title="Select Facebook profile"
      >
        <span
          className={cn(
            "flex size-5 items-center justify-center rounded-full text-[10px] font-bold",
            selectedProfile
              ? "bg-emerald-500/30 text-emerald-200 border border-emerald-400/50"
              : "bg-white/10 text-white/60"
          )}
        >
          <Radio className={cn("size-3", selectedProfile ? "text-emerald-300 animate-pulse" : "text-white/60")} />
        </span>
        <div className="flex flex-col text-left leading-none">
          <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-300/90">Facebook</span>
          <span className="mt-0.5 text-[11px] font-semibold text-white/95 truncate max-w-[132px]">
            {selectedProfile
              ? `[${String(selectedProfile.serial_no).padStart(2, "0")}] ${selectedProfile.label}`
              : "Select Profile..."}
          </span>
        </div>
        <ChevronDown
          className={cn(
            "size-3 text-white/50 transition-transform duration-200",
            isOpen && "rotate-180 text-emerald-300"
          )}
        />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1.5 z-[300] w-56 rounded-lg border border-sky-500/30 bg-neutral-950 p-2 shadow-2xl">
          <div className="flex items-center gap-1.5 pb-1.5 mb-1.5 border-b border-white/10">
            <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-cyan-300">
              <Radio className="size-3 text-cyan-400" />
              Facebook
            </span>
            <span className="ml-auto text-[10px] font-mono text-white/40">{profiles.length}</span>
          </div>

          <div className="flex items-center gap-1 mb-1.5">
            <span className="flex size-7 items-center justify-center rounded-md bg-white/8 border border-white/10 text-cyan-300">
              <Search className="size-3.5" />
            </span>
            <input
              type="text"
              className="h-7 min-w-0 flex-1 px-2 text-[11px] rounded-md bg-white/10 border border-white/15 text-white placeholder:text-white/35 focus:outline-none focus:border-cyan-400"
              placeholder="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>

          <div className="max-h-44 overflow-y-auto space-y-0.5">
            {filtered.length ? (
              filtered.map((profile) => {
                const isSelected = selectedProfile?.id === profile.id;
                return (
                  <button
                    key={profile.id}
                    type="button"
                    className={cn(
                      "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-[11px] transition",
                      isSelected
                        ? "bg-emerald-600/35 border border-emerald-400/60 text-white font-semibold"
                        : "hover:bg-white/10 text-white/80 border border-transparent"
                    )}
                    onClick={() => {
                      onSelect(profile.id, profile);
                      setIsOpen(false);
                    }}
                  >
                    <span className="flex items-center justify-center size-5 rounded bg-white/10 text-[10px] font-mono font-bold text-cyan-300">
                      {String(profile.serial_no).padStart(2, "0")}
                    </span>
                    <span className="flex-1 truncate">{profile.label}</span>
                    {isSelected && <Check className="size-3 text-cyan-300 flex-shrink-0" />}
                  </button>
                );
              })
            ) : (
              <div className="py-4 text-center text-[11px] text-white/40">No profiles found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


interface RecordDongleProps {
  rows: RentPostRow[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onReorder: (fromId: string, toId: string) => void;
  onDelete: (id: string) => void;
}

function RecordDongle({ rows, activeId, onSelect, onReorder, onDelete }: RecordDongleProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const active = rows.find((row) => row.id === activeId) || rows[0];

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) setIsOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setIsOpen(false);
    }
    window.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const q = search.trim().toLowerCase();
  const filtered = rows.filter((row) => {
    if (!q) return true;
    const serial = String(row.serial_no || "").padStart(2, "0");
    return (
      serial === q ||
      `#${serial}` === q ||
      (row.title || "").toLowerCase().includes(q) ||
      (row.address || "").toLowerCase().includes(q) ||
      (row.price || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="relative inline-block" ref={popoverRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="group inline-flex items-center gap-2 rounded-xl px-2.5 py-1 border border-amber-400/40 bg-gradient-to-r from-amber-950/80 via-orange-950/60 to-neutral-950 text-amber-100 shadow-sm active:scale-95"
        title="Record"
      >
        <span className="flex size-6 items-center justify-center rounded-md bg-amber-500/20 border border-amber-400/40 font-mono text-[10px] font-bold text-amber-300">
          {active ? String(active.serial_no).padStart(2, "0") : "00"}
        </span>
        <div className="flex flex-col text-left leading-none">
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300">Record</span>
          <span className="mt-0.5 text-xs font-semibold text-white/95 truncate max-w-[150px]">
            {active ? (active.price || active.address || active.title || "Listing") : "No listing"}
          </span>
        </div>
        <ChevronDown className={"size-3.5 text-white/50 " + (isOpen ? "rotate-180 text-amber-300" : "")} />
      </button>
      {isOpen && (
        <div className="absolute left-0 top-full mt-1.5 z-[300] w-64 rounded-lg border border-amber-500/30 bg-neutral-950 p-2 shadow-2xl">
          <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-white/10">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300">Record</span>
            <span className="text-[11px] font-mono text-white/40">{rows.length}</span>
          </div>
          <div className="flex items-center gap-1 mb-1.5">
            <span className="flex size-7 items-center justify-center rounded-md bg-white/8 border border-white/10 text-amber-300">
              <Search className="size-3.5" />
            </span>
            <input
              type="text"
              className="h-7 min-w-0 flex-1 px-2 text-[11px] rounded-md bg-white/10 border border-white/15 text-white placeholder:text-white/35 focus:outline-none focus:border-amber-400"
              placeholder="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
          <div className="max-h-48 overflow-y-auto space-y-0.5">
            {filtered.map((row) => {
              const isCurr = row.id === active?.id;
              return (
                <div
                  key={row.id}
                  draggable
                  onDragStart={() => setDragId(row.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragId) onReorder(dragId, row.id);
                    setDragId(null);
                  }}
                  className={
                    "w-full flex items-center gap-1.5 px-1.5 py-1 rounded-md text-[11px] border " +
                    (isCurr
                      ? "bg-amber-500/20 border-amber-400/50 text-white font-semibold"
                      : "border-transparent hover:bg-white/10 text-white/80")
                  }
                >
                  <GripVertical className="size-3 text-white/30 shrink-0" />
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                    onClick={() => {
                      onSelect(row.id);
                      setIsOpen(false);
                    }}
                  >
                    <span className="flex items-center justify-center size-5 rounded bg-white/10 font-mono text-[10px] font-bold text-amber-300">
                      {String(row.serial_no).padStart(2, "0")}
                    </span>
                    <span className="flex-1 truncate">{row.price || row.address || row.title || "Listing"}</span>
                    {isCurr ? <Check className="size-3 text-amber-300" /> : null}
                  </button>
                  <button
                    type="button"
                    className="flex size-6 shrink-0 items-center justify-center rounded-md border border-rose-400/40 bg-rose-500/15 text-rose-300 hover:bg-rose-500/30"
                    title="Delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm("Delete this listing?")) onDelete(row.id);
                    }}
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              );
            })}
            {!filtered.length ? <p className="py-4 text-center text-[11px] text-white/40">No listing</p> : null}
          </div>
        </div>
      )}
    </div>
  );
}

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

function parseImages(row: RentPostRow) {
  if (row.images?.length) return row.images.filter(Boolean);
  const raw = row.image_url || "";
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { images?: string[] } | string[];
    if (Array.isArray(parsed)) return parsed.filter(Boolean);
    if (parsed?.images?.length) return parsed.images.filter(Boolean);
  } catch {
    /* url */
  }
  return raw.startsWith("http") || raw.startsWith("data:") ? [raw] : [];
}

function parseLink(row: RentPostRow) {
  if (row.listing_url) return row.listing_url;
  const raw = row.image_url || "";
  try {
    const parsed = JSON.parse(raw) as { listing_url?: string };
    return parsed?.listing_url || "";
  } catch {
    return "";
  }
}

function readFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Image failed."));
    reader.onload = () => {
      const src = String(reader.result || "");
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const max = 1200;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.86));
      };
      img.onerror = () => resolve(src);
      img.src = src;
    };
    reader.readAsDataURL(file);
  });
}

export function PostDesk({ visible }: { visible: boolean }) {
  const [rows, setRows] = useState<RentPostRow[]>([]);
  const [profiles, setProfiles] = useState<FacebookProfileRow[]>([]);
  const [pick, setPick] = useState<Record<string, string>>({});
  const [dragId, setDragId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [photoIndex, setPhotoIndex] = useState<number>(0);
  const [linkCopied, setLinkCopied] = useState(false);
  const saveTimer = useRef(0);
  const rowsRef = useRef<RentPostRow[]>([]);
  const knownIds = useRef<Set<string>>(new Set());
  rowsRef.current = rows;

  async function reload() {
    try {
      const [list, people] = await Promise.all([
        clientListRentPosts(),
        listFacebookProfiles().catch(() => readLocalProfiles()),
      ]);
      setRows(list);
      setProfiles(people.length ? people : readLocalProfiles());
    } catch {
      const list = await clientListRentPosts().catch(() => []);
      setRows(list);
      setProfiles(readLocalProfiles());
    }
  }

  useEffect(() => {
    if (!visible) return;
    void reload();
    void getDesktop()?.hideFacebook();
    const onChange = () => {
      const tag = (document.activeElement && document.activeElement.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      void reload();
    };
    window.addEventListener("painite:posts-changed", onChange);
    return () => window.removeEventListener("painite:posts-changed", onChange);
  }, [visible]);

  // Newest send is always top + the open/running view. Older rows stay in the dongle closed.
  useEffect(() => {
    if (!rows.length) return;
    const newest = rows[0];
    const fresh = Boolean(newest && !knownIds.current.has(newest.id));
    for (const row of rows) knownIds.current.add(row.id);
    if (fresh) {
      setActiveId(newest.id);
      setPhotoIndex(0);
      return;
    }
    if (!activeId || !rows.some((r) => r.id === activeId)) {
      setActiveId(newest.id);
      setPhotoIndex(0);
    }
  }, [rows, activeId]);

  async function persist(row: RentPostRow) {
    const images = parseImages(row);
    await clientUpdateRentPost({
      id: row.id,
      title: row.title,
      address: row.address ?? "",
      price: row.price ?? "",
      beds: row.beds ?? "",
      baths: row.baths ?? "",
      sqft: row.sqft ?? "",
      facts: row.facts ?? "",
      images,
      listing_url: row.listing_url || parseLink(row),
    });
  }

  function patch(id: string, next: Partial<RentPostRow>) {
    setRows((list) => {
      const updated = list.map((row) => (row.id === id ? { ...row, ...next } : row));
      const row = updated.find((item) => item.id === id);
      if (row) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = window.setTimeout(() => {
          void persist(row);
        }, 400);
      }
      return updated;
    });
  }

  function commit(id: string) {
    window.clearTimeout(saveTimer.current);
    const row = rowsRef.current.find((item) => item.id === id);
    if (row) void persist(row);
  }

  async function onImages(id: string, event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files || [])];
    event.target.value = "";
    if (!files.length) return;
    const extras = await Promise.all(files.map((file) => readFile(file)));
    const targetRow = rows.find((r) => r.id === id);
    if (!targetRow) return;
    const images = [...parseImages(targetRow), ...extras];
    const updated = { ...targetRow, images, image_url: images[0] || targetRow.image_url };
    setRows((list) => list.map((r) => (r.id === id ? updated : r)));
    await persist(updated);
  }

  function dropPhoto(id: string, src: string) {
    const targetRow = rows.find((r) => r.id === id);
    if (!targetRow) return;
    const images = parseImages(targetRow).filter((item) => item !== src);
    const updated = { ...targetRow, images, image_url: images[0] || "" };
    setRows((list) => list.map((r) => (r.id === id ? updated : r)));
    if (photoIndex >= images.length) {
      setPhotoIndex(Math.max(0, images.length - 1));
    }
    void persist(updated);
  }

  async function remove(id: string) {
    const remaining = rows.filter((item) => item.id !== id);
    setRows(remaining);
    if (activeId === id) {
      setActiveId(remaining[0]?.id || null);
    }
    await clientDeleteRentPost(id);
    await reload();
  }

  function send(row: RentPostRow) {
    const profileId = pick[row.id];
    const profile = profiles.find((item) => item.id === profileId);
    if (!profile) return;
    const images = parseImages(row);
    void persist(row);
    requestFacebookSend({
      id: profile.id,
      listing: {
        title: row.title || row.address || "Listing",
        address: row.address || row.title,
        price: row.price || "",
        beds: row.beds || "",
        baths: row.baths || "",
        sqft: row.sqft || "",
        facts: row.facts || "",
        image_url: images[0] || "",
        images,
        listing_url: parseLink(row),
      },
    });
  }

  function onDragStart(id: string) {
    setDragId(id);
  }

  async function onDrop(id: string, fromOverride?: string) {
    const source = fromOverride || dragId;
    if (!source || source === id) {
      setDragId(null);
      return;
    }
    const ids = rows.map((row) => row.id);
    const from = ids.indexOf(source);
    const to = ids.indexOf(id);
    if (from < 0 || to < 0) {
      setDragId(null);
      return;
    }
    ids.splice(from, 1);
    ids.splice(to, 0, source);
    const next = ids.map((item, index) => {
      const row = rows.find((entry) => entry.id === item)!;
      return { ...row, serial_no: rows.length - index };
    });
    setRows(next);
    setDragId(null);
    await clientReorderRentPosts(ids);
  }

  const activeRow = rows.find((r) => r.id === activeId) || rows[0];
  const activeImages = activeRow ? parseImages(activeRow) : [];
  const activeLink = activeRow ? parseLink(activeRow) : "";
  const selectedProfileId = activeRow ? pick[activeRow.id] ?? "" : "";
  const selectedProfile = profiles.find((p) => p.id === selectedProfileId);

  return (
    <section className="post-desk">
      {/* HEADER BAR */}
      <header className="rent-bar !px-3 !py-2 border-b border-white/10">
        <div className="flex items-center gap-2">
          <span className="rent-bar__mark rent-bar__mark--post">
            <PostIcon />
          </span>
          <span className="rent-bar__count">
            {rows.length} {rows.length === 1 ? "Listing" : "Listings"}
          </span>
        </div>

        {rows.length > 0 ? (
          <RecordDongle
            rows={rows}
            activeId={activeId}
            onSelect={(id) => {
              setActiveId(id);
              setPhotoIndex(0);
            }}
            onReorder={(fromId, toId) => {
              void onDrop(toId, fromId);
            }}
            onDelete={(id) => {
              void remove(id);
            }}
          />
        ) : null}

        <div className="flex-1" />

        {activeRow ? (
          <div className="flex items-center gap-2">
            <FbDongle
              profiles={profiles}
              selectedId={selectedProfileId}
              onSelect={(id) => setPick((prev) => ({ ...prev, [activeRow.id]: id }))}
            />
            <button
              type="button"
              className="rent-send !min-h-9 !h-9 !px-3.5 text-xs font-bold"
              disabled={!selectedProfileId}
              onClick={() => send(activeRow)}
              title={selectedProfileId ? "Send to Facebook Marketplace" : "Select Facebook first"}
            >
              <Send className="size-3.5" />
              Send
            </button>
          </div>
        ) : null}
      </header>

      {/* LIVE MARKETPLACE WEBVIEW */}

      {/* FULL WINDOW ZILLOW RENTALS VIEW */}
      <div className="w-full flex-1 overflow-y-auto overflow-x-hidden pb-32 custom-scrollbar">
          {rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center px-4">
              <div className="size-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <PostIcon />
              </div>
              <h3 className="text-lg font-bold text-white/90">No Properties to Post</h3>
              <p className="text-xs text-white/50 max-w-sm">
                Open Rent USA to search Zillow rentals, click Select on any property, and send it here.
              </p>
            </div>
          ) : activeRow ? (
            <div className="max-w-5xl mx-auto px-3 sm:px-6 pt-4 space-y-6">
              {/* TOP: ZILLOW RENTALS PHOTO GALLERY */}
              <section className="space-y-2.5">
                {/* HERO FEATURED IMAGE */}
                <div className="relative w-full h-64 sm:h-80 md:h-[400px] rounded-2xl overflow-hidden bg-neutral-900 border border-white/10 shadow-2xl group">
                  {activeImages.length > 0 && activeImages[photoIndex] ? (
                    <img
                      src={activeImages[photoIndex]}
                      alt="Property"
                      className="w-full h-full object-contain bg-neutral-950"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-white/30">
                      <Building2 className="size-12 stroke-1" />
                      <span className="text-xs font-semibold">No photos uploaded yet</span>
                    </div>
                  )}

                  {/* PHOTO NAVIGATION ARROWS */}
                  {activeImages.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          setPhotoIndex((prev) => (prev > 0 ? prev - 1 : activeImages.length - 1))
                        }
                        className="absolute left-3 top-1/2 -translate-y-1/2 size-9 rounded-full bg-black/60 hover:bg-black/90 text-white flex items-center justify-center backdrop-blur transition active:scale-95 shadow-lg border border-white/20"
                        aria-label="Previous photo"
                      >
                        <ChevronLeft className="size-5" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setPhotoIndex((prev) => (prev < activeImages.length - 1 ? prev + 1 : 0))
                        }
                        className="absolute right-3 top-1/2 -translate-y-1/2 size-9 rounded-full bg-black/60 hover:bg-black/90 text-white flex items-center justify-center backdrop-blur transition active:scale-95 shadow-lg border border-white/20"
                        aria-label="Next photo"
                      >
                        <ChevronRight className="size-5" />
                      </button>
                    </>
                  )}

                  {/* PHOTO BADGE & FAST UPLOAD IN OVERLAY */}
                  <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between pointer-events-none">
                    <span className="pointer-events-auto inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/70 backdrop-blur border border-white/20 text-xs font-medium text-white shadow">
                      📷 {activeImages.length > 0 ? `${photoIndex + 1} / ${activeImages.length}` : "0 photos"}
                    </span>

                    <label className="pointer-events-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-bold cursor-pointer transition active:scale-95 shadow-lg">
                      <ImagePlus className="size-3.5" />
                      <span>Upload Photos</span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        hidden
                        onChange={(e) => void onImages(activeRow.id, e)}
                      />
                    </label>
                  </div>
                </div>

                {/* THUMBNAILS STRIP */}
                <div className="flex items-center gap-2 overflow-x-auto py-1 custom-scrollbar">
                  {activeImages.map((src, index) => {
                    const isSelected = index === photoIndex;
                    return (
                      <div
                        key={src + index}
                        className={cn(
                          "relative group flex-shrink-0 size-16 sm:size-20 rounded-xl overflow-hidden cursor-pointer border-2 transition active:scale-95",
                          isSelected
                            ? "border-amber-400 shadow-md shadow-amber-500/20"
                            : "border-transparent opacity-70 hover:opacity-100"
                        )}
                        onClick={() => setPhotoIndex(index)}
                      >
                        <img
                          src={src}
                          alt={`Thumbnail ${index + 1}`}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            dropPhoto(activeRow.id, src);
                          }}
                          className="absolute top-1 right-1 size-5 rounded-full bg-black/80 hover:bg-rose-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition shadow"
                          title="Delete photo"
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                    );
                  })}

                  {/* ADD THUMBNAIL BUTTON */}
                  <label className="flex-shrink-0 size-16 sm:size-20 rounded-xl border border-dashed border-white/25 hover:border-amber-400/60 bg-white/5 hover:bg-white/10 flex flex-col items-center justify-center gap-1 text-white/50 hover:text-amber-300 cursor-pointer transition active:scale-95">
                    <ImagePlus className="size-4" />
                    <span className="text-[10px] font-semibold">Add</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      hidden
                      onChange={(e) => void onImages(activeRow.id, e)}
                    />
                  </label>
                </div>
              </section>

              {/* DETAILS BELOW (EXACTLY LIKE ZILLOW RENTALS) */}
              <section className="space-y-5">
                {/* HEADLINE: PRICE & DONGLE ROW */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/10">
                  <div className="space-y-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl sm:text-3xl font-extrabold text-amber-300">
                        {activeRow.price || "Contact for Price"}
                      </span>
                      {activeRow.price && !activeRow.price.includes("/") && (
                        <span className="text-sm font-semibold text-white/60">/mo</span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-white/90">
                      {activeRow.address || activeRow.title || "Address unlisted"}
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      {activeRow.beds && (
                        <span className="px-2.5 py-0.5 rounded-full bg-white/10 text-xs font-semibold text-white/90">
                          {activeRow.beds} Beds
                        </span>
                      )}
                      {activeRow.baths && (
                        <span className="px-2.5 py-0.5 rounded-full bg-white/10 text-xs font-semibold text-white/90">
                          {activeRow.baths} Baths
                        </span>
                      )}
                      {activeRow.sqft && (
                        <span className="px-2.5 py-0.5 rounded-full bg-white/10 text-xs font-semibold text-white/90">
                          {activeRow.sqft} sqft
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col sm:items-end gap-1.5">
                    <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider">
                      Facebook
                    </span>
                    <FbDongle
                      profiles={profiles}
                      selectedId={selectedProfileId}
                      onSelect={(id) => setPick((prev) => ({ ...prev, [activeRow.id]: id }))}
                    />
                  </div>
                </div>

                {/* EDITABLE FIELDS */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void persist(activeRow);
                  }}
                  className="space-y-4"
                >
                  {/* TITLE & ADDRESS */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-amber-300/90 uppercase tracking-wider">
                        Property Title
                      </label>
                      <input
                        type="text"
                        value={activeRow.title || ""}
                        onChange={(e) => patch(activeRow.id, { title: e.target.value })}
                        onBlur={() => commit(activeRow.id)}
                        className="w-full h-11 px-3.5 rounded-xl bg-white/10 border border-white/15 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-amber-400"
                        placeholder="e.g. Spacious 2 Bed Apartment with Pool"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-amber-300/90 uppercase tracking-wider">
                        Full Address
                      </label>
                      <input
                        type="text"
                        value={activeRow.address || ""}
                        onChange={(e) => patch(activeRow.id, { address: e.target.value })}
                        onBlur={() => commit(activeRow.id)}
                        className="w-full h-11 px-3.5 rounded-xl bg-white/10 border border-white/15 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-amber-400"
                        placeholder="Street, City, State, ZIP"
                      />
                    </div>
                  </div>

                  {/* PRICE & SPECS ROW */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-amber-300/90 uppercase tracking-wider">
                        Rent Price
                      </label>
                      <input
                        type="text"
                        value={activeRow.price || ""}
                        onChange={(e) => patch(activeRow.id, { price: e.target.value })}
                        onBlur={() => commit(activeRow.id)}
                        className="w-full h-11 px-3.5 rounded-xl bg-white/10 border border-white/15 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-amber-400"
                        placeholder="$2,400"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-amber-300/90 uppercase tracking-wider">
                        Beds
                      </label>
                      <input
                        type="text"
                        value={activeRow.beds || ""}
                        onChange={(e) => patch(activeRow.id, { beds: e.target.value })}
                        onBlur={() => commit(activeRow.id)}
                        className="w-full h-11 px-3.5 rounded-xl bg-white/10 border border-white/15 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-amber-400"
                        placeholder="2"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-amber-300/90 uppercase tracking-wider">
                        Baths
                      </label>
                      <input
                        type="text"
                        value={activeRow.baths || ""}
                        onChange={(e) => patch(activeRow.id, { baths: e.target.value })}
                        onBlur={() => commit(activeRow.id)}
                        className="w-full h-11 px-3.5 rounded-xl bg-white/10 border border-white/15 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-amber-400"
                        placeholder="1"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-amber-300/90 uppercase tracking-wider">
                        Sqft
                      </label>
                      <input
                        type="text"
                        value={activeRow.sqft || ""}
                        onChange={(e) => patch(activeRow.id, { sqft: e.target.value })}
                        onBlur={() => commit(activeRow.id)}
                        className="w-full h-11 px-3.5 rounded-xl bg-white/10 border border-white/15 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-amber-400"
                        placeholder="850"
                      />
                    </div>
                  </div>

                  {/* DETAILS & DESCRIPTION */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-amber-300/90 uppercase tracking-wider flex items-center justify-between">
                      <span>Property Description & Amenities (Details)</span>
                      <span className="text-[11px] text-white/40 normal-case font-normal">
                        Syncs to Facebook Marketplace description
                      </span>
                    </label>
                    <textarea
                      rows={5}
                      value={activeRow.facts || ""}
                      onChange={(e) => patch(activeRow.id, { facts: e.target.value })}
                      onBlur={() => commit(activeRow.id)}
                      className="w-full p-3.5 rounded-xl bg-white/10 border border-white/15 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-amber-400 leading-relaxed resize-y min-h-[120px]"
                      placeholder="Enter property details, lease terms, amenities, pet policy, utilities included..."
                    />
                  </div>

                  {/* LISTING LINK */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-amber-300/90 uppercase tracking-wider flex items-center justify-between">
                      <span>Zillow Listing Link</span>
                      {activeLink && (
                        <a
                          href={activeLink}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-cyan-300 hover:text-cyan-200 underline"
                        >
                          <ExternalLink className="size-3" />
                          View on Zillow
                        </a>
                      )}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={activeLink}
                        onChange={(e) => patch(activeRow.id, { listing_url: e.target.value })}
                        onBlur={() => commit(activeRow.id)}
                        className="flex-1 min-w-0 h-11 px-3.5 rounded-xl bg-white/10 border border-white/15 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-amber-400"
                        placeholder="https://www.zillow.com/homedetails/..."
                      />
                      <button
                        type="button"
                        disabled={!activeLink}
                        onClick={async () => {
                          if (!activeLink) return;
                          try {
                            await navigator.clipboard.writeText(activeLink);
                            setLinkCopied(true);
                            window.setTimeout(() => setLinkCopied(false), 1400);
                          } catch {
                            /* skip */
                          }
                        }}
                        className="inline-flex items-center gap-1.5 h-11 px-3.5 rounded-xl bg-cyan-500/90 hover:bg-cyan-400 text-neutral-950 text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed transition active:scale-95"
                      >
                        {linkCopied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                        {linkCopied ? "Copied" : "Copy"}
                      </button>
                    </div>
                  </div>

                  {/* BOTTOM ACTION BUTTONS */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-white/10">
                    <button
                      type="button"
                      className="inline-flex items-center gap-2.5 px-6 py-3.5 rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-neutral-950 font-bold text-sm tracking-wide transition active:scale-95 shadow-[0_6px_20px_-3px_rgba(245,158,11,0.5)] disabled:opacity-40 disabled:cursor-not-allowed"
                      disabled={!selectedProfileId}
                      onClick={() => send(activeRow)}
                    >
                      <Send className="size-4" />
                      <span>
                        {selectedProfile
                          ? `Post to Marketplace (${selectedProfile.label})`
                          : "Select Facebook to Post"}
                      </span>
                    </button>

                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-semibold transition active:scale-95"
                      onClick={() => void remove(activeRow.id)}
                    >
                      <Trash2 className="size-3.5" />
                      Delete Listing
                    </button>
                  </div>
                </form>
              </section>
            </div>
          ) : null}
        </div>
    </section>
  );
}
