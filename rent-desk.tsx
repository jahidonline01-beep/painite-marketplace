import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, LoaderCircle, RefreshCw, RotateCcw, Send, X } from "lucide-react";
import { getDesktop } from "@/lib/desktop";
import { clientSendRentPosts } from "@/lib/member-ops";
import { CHROME_UA, RENT_SCRAPE_JS, ZILLOW_RENT_URL, type RentListing } from "@/lib/zillow";
import { cn } from "@/lib/utils";
import { RentIcon } from "./desk-icons";

type GuestView = HTMLElement & {
  src: string;
  executeJavaScript: (code: string, userGesture?: boolean) => Promise<unknown>;
  canGoBack?: () => boolean;
  goBack?: () => void;
};

let rentGuest: GuestView | null = null;
let lastRentBox = { w: 1280, h: 800 };

function placeRentGuest(view: GuestView, host: HTMLElement | null, on: boolean) {
  if (on && host) {
    const r = host.getBoundingClientRect();
    lastRentBox = { w: Math.max(80, r.width), h: Math.max(80, r.height) };
    view.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${lastRentBox.w}px;height:${lastRentBox.h}px;border:0;opacity:1;visibility:visible;pointer-events:auto;z-index:6;`;
  } else {
    view.style.cssText = `position:fixed;left:-2400px;top:0;width:${lastRentBox.w}px;height:${lastRentBox.h}px;border:0;opacity:1;visibility:visible;pointer-events:none;z-index:0;`;
  }
}

function ensureRentGuest(stealth: string) {
  if (rentGuest && document.body.contains(rentGuest)) return rentGuest;
  const view = document.createElement("webview") as GuestView;
  view.setAttribute("partition", "persist:rent-usa");
  view.setAttribute("useragent", CHROME_UA);
  view.setAttribute("allowpopups", "true");
  view.setAttribute("webpreferences", "contextIsolation=no, javascript=yes, images=yes");
  if (stealth && stealth !== "ready") {
    view.setAttribute("preload", "file://" + stealth.replace(/\\/g, "/"));
  }
  view.className = "rent-frame";
  document.body.appendChild(view);
  view.src = ZILLOW_RENT_URL;
  rentGuest = view;
  return view;
}

export function RentDesk({ visible }: { visible: boolean }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const webRef = useRef<GuestView | null>(null);
  const desktop = typeof window !== "undefined" ? getDesktop() : undefined;
  const [bag, setBag] = useState<Record<string, RentListing>>({});
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(0);
  const [clearing, setClearing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [stealthPath, setStealthPath] = useState<string>("");

  const selected = Object.values(bag);

  useEffect(() => {
    let live = true;
    void (async () => {
      let path = "";
      try {
        path = (await desktop?.getStealthPath?.()) || "";
      } catch {
        path = "";
      }
      if (live) setStealthPath(path || "ready");
    })();
    return () => {
      live = false;
    };
  }, [desktop]);

  async function scrape() {
    const view = webRef.current;
    try {
      const rows = view && typeof view.executeJavaScript === "function"
        ? ((await view.executeJavaScript(RENT_SCRAPE_JS, true)) as RentListing[])
        : desktop
          ? await desktop.scrapeRent()
          : [];
      if (!Array.isArray(rows) || !rows.length) return [] as RentListing[];
      const chosen = rows.filter((row) => row.picked);
      const take = chosen.length ? chosen : rows;
      if (!take.length) return [] as RentListing[];
      let nextBag: Record<string, RentListing> = {};
      setBag((map) => {
        const next = { ...map };
        for (const row of take) {
          const key = row.zpid || row.listing_url || row.address || `tmp_${Date.now()}`;
          next[key] = { ...row, zpid: row.zpid || key };
        }
        nextBag = next;
        return next;
      });
      return Object.values(nextBag);
    } catch {
      return [] as RentListing[];
    }
  }

  async function send() {
    let rows = selected;
    if (!rows.length) rows = await scrape();
    if (!rows.length) {
      setNotice("No listing selected");
      return;
    }
    setBusy(true);
    try {
      const result = await clientSendRentPosts(rows);
      setSent(result.added);
      setNotice(result.added ? `${result.added} sent to Post` : "Already in Post");
      if (result.added) setBag({});
    } finally {
      setBusy(false);
      window.setTimeout(() => setNotice(null), 2600);
    }
  }

  function drop(id: string) {
    setBag((map) => {
      const copy = { ...map };
      delete copy[id];
      return copy;
    });
  }

  function back() {
    const view = webRef.current;
    if (view?.canGoBack?.()) view.goBack?.();
    else if (view) view.src = ZILLOW_RENT_URL;
    else void desktop?.backRent?.();
  }

  function reload() {
    const view = webRef.current;
    if (view && typeof (view as any).reload === "function") {
      (view as any).reload();
    } else if (view) {
      view.src = view.src || ZILLOW_RENT_URL;
    } else {
      void desktop?.reloadRent?.();
    }
  }

  async function resetCookies() {
    setClearing(true);
    setNotice("Clearing cookies and cache...");
    try {
      if (desktop?.clearRent) {
        await desktop.clearRent();
      }
      const view = webRef.current;
      if (view) {
        try {
          const wc = (view as any).getWebContents?.();
          if (wc?.session) {
            await wc.session.clearStorageData();
            await wc.session.clearCache();
          }
        } catch {}
        view.src = "about:blank";
        setTimeout(() => {
          if (view) view.src = ZILLOW_RENT_URL;
        }, 150);
      }
      setNotice("Cookies and cache cleared successfully. Fresh session started.");
    } catch {
      setNotice("Failed to clear cookies");
    } finally {
      setClearing(false);
      setTimeout(() => setNotice(null), 4000);
    }
  }

  useLayoutEffect(() => {
    void getDesktop()?.hideRent();
    if (!stealthPath) return;
    const host = hostRef.current;
    const view = ensureRentGuest(stealthPath);
    webRef.current = view;
    const place = () => placeRentGuest(view, host, visible);
    place();
    if (!visible) return;
    const ro = host ? new ResizeObserver(place) : null;
    if (host && ro) ro.observe(host);
    window.addEventListener("resize", place);
    const later = window.setTimeout(place, 240);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", place);
      window.clearTimeout(later);
      placeRentGuest(view, host, false);
    };
  }, [visible, stealthPath]);

  useEffect(() => {
    if (!sent) return;
    const timer = window.setTimeout(() => setSent(0), 2200);
    return () => window.clearTimeout(timer);
  }, [sent]);

  return (
    <section className="rent-desk">
      <header className="rent-bar">
        <div className="flex items-center gap-2 mr-1">
          <span className="rent-bar__mark">
            <RentIcon />
          </span>
          <p className="rent-bar__title !flex-none">Rent USA</p>
        </div>

        <div className="flex items-center gap-1 bg-white/[0.04] p-0.5 rounded-full border border-white/10">
          <button
            type="button"
            className="group inline-flex h-6 items-center gap-1 rounded-full px-2 text-[10.5px] font-semibold text-white/75 hover:text-white hover:bg-white/15 transition-all duration-200 active:scale-90"
            aria-label="Back"
            title="Go Back"
            onClick={back}
          >
            <ArrowLeft className="size-2.5 transition-transform duration-200 group-hover:-translate-x-0.5" />
            Back
          </button>
          <button
            type="button"
            className="group inline-flex h-6 items-center gap-1 rounded-full px-2 text-[10.5px] font-semibold text-white/75 hover:text-white hover:bg-white/15 transition-all duration-200 active:scale-90"
            title="Reload Page"
            onClick={reload}
          >
            <RefreshCw className="size-2.5 transition-transform duration-500 group-hover:rotate-180" />
            Reload
          </button>
          <button
            type="button"
            disabled={clearing}
            className="group inline-flex h-6 items-center gap-1 rounded-full px-2 text-[10.5px] font-semibold text-rose-300 hover:text-rose-100 hover:bg-rose-500/25 border border-rose-500/20 hover:border-rose-500/40 transition-all duration-200 active:scale-90 disabled:opacity-50"
            title="Clear cookies & cache to fix verification loop"
            onClick={() => void resetCookies()}
          >
            <RotateCcw className={cn("size-2.5 transition-transform duration-500 group-hover:-rotate-180", clearing && "animate-spin")} />
            {clearing ? "Clearing..." : "Reset Cookies"}
          </button>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-1.5">
          <button type="button" className="rent-pick !min-h-8 !h-8 !px-3 text-xs" onClick={() => void scrape()}>
            Select
          </button>
          <span className="rent-bar__count">{selected.length}</span>
          <button
            type="button"
            className="rent-send !min-h-8 !h-8 !px-3 text-xs"
            disabled={!selected.length || busy}
            onClick={() => void send()}
          >
            {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
            Send
          </button>
        </div>
      </header>
      <div ref={hostRef} className={cn("rent-view", visible && "is-on")} />
      {selected.length ? (
        <ul className="rent-picked">
          {selected.map((row, index) => (
            <li key={row.zpid}>
              <button type="button" className="rent-chip" onClick={() => drop(row.zpid)}>
                <span className="fb-serial">{String(index + 1).padStart(2, "0")}</span>
                {row.image_url ? (
                  <img src={row.image_url} alt="" referrerPolicy="no-referrer" />
                ) : (
                  <span className="rent-card__ph" />
                )}
                <span className="min-w-0 truncate">{row.price || row.address}</span>
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {notice ? (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-50 rounded-lg border border-emerald-500/40 bg-emerald-950/90 px-4 py-2 text-xs font-medium text-emerald-200 shadow-xl backdrop-blur">
          {notice}
        </div>
      ) : null}
      {sent ? <p className="rent-toast">{sent} sent</p> : null}
    </section>
  );
}
