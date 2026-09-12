import { app, BrowserView, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeImage, net, session, shell } from "electron";
import fs from "node:fs/promises";
import { createWriteStream, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA_ROOT = path.join(os.homedir(), "PainiteMarketplace");
app.setPath("userData", DATA_ROOT);
app.setPath("sessionData", DATA_ROOT);
app.commandLine.appendSwitch("disable-blink-features", "AutomationControlled");
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-features", "IsolateOrigins,site-per-process,AutofillEnableAccountWalletStorage");
app.commandLine.appendSwitch("lang", "en-US");
app.commandLine.appendSwitch("force-color-profile", "srgb");
const DEV_URL = process.env.PAINITE_APP_URL ?? "http://127.0.0.1:8080";
const PACK_URL = "http://127.0.0.1:8765";
function projectRoot() {
  if (app.isPackaged) return path.join(process.resourcesPath, "app");
  return path.join(here, "..");
}
function builtIndex() {
  const rootDir = projectRoot();
  const candidates = [
    path.join(rootDir, "dist", "client", "index.html"),
    path.join(rootDir, "dist", "index.html"),
    path.join(rootDir, ".output", "public", "index.html"),
    path.join(here, "..", "dist", "client", "index.html"),
    path.join(here, "index.html"),
  ];
  return candidates.find((p) => existsSync(p)) || null;
}
function logPath() {
  return path.join(app.getPath("userData"), "ui-server.log");
}
function waitHttp(url, tries = 80) {
  return new Promise((resolve, reject) => {
    const tick = (left) => {
      try {
        const req = net.request(url);
        req.on("response", () => resolve(true));
        req.on("error", () => {
          if (left <= 0) reject(new Error("UI server failed to start."));
          else setTimeout(() => tick(left - 1), 400);
        });
        req.end();
      } catch (err) {
        if (left <= 0) reject(err);
        else setTimeout(() => tick(left - 1), 400);
      }
    };
    tick(tries);
  });
}
async function startPackagedServer() {
  const rootDir = projectRoot();
  const logFile = logPath();
  const out = createWriteStream(logFile, { flags: "a" });
  const serverEntry = path.join(rootDir, ".output", "server", "index.mjs");
  if (!existsSync(serverEntry)) {
    throw new Error("Packaged server output is missing. Rebuild the installer.");
  }
  const child = spawn(process.execPath, [serverEntry], {
    cwd: rootDir,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      HOST: "127.0.0.1",
      PORT: "8765",
      NITRO_HOST: "127.0.0.1",
      NITRO_PORT: "8765",
    },
    windowsHide: true,
  });
  child.stdout?.on("data", (d) => out.write(d));
  child.stderr?.on("data", (d) => out.write(d));
  child.on("exit", (code, signal) => {
    out.write(`\nUI server exited (code=${code}, signal=${signal})\n`);
    out.end();
  });
  await waitHttp(PACK_URL);
  return child;
}

async function loadUi(win) {
  if (!app.isPackaged) {
    await win.loadURL(DEV_URL);
    return;
  }
  try {
    await startPackagedServer();
    await win.loadURL(PACK_URL);
    return;
  } catch (err) {
    const html = builtIndex();
    if (html) {
      await win.loadFile(html);
      return;
    }
    const details = logPath();
    dialog.showErrorBox(
      "Painite Marketplace",
      `UI server failed to start.\n\n${err instanceof Error ? err.message : String(err)}\n\nDetails: ${details}`,
    );
  }
}

const CHROME_VER = process.versions.chrome || "134.0.0.0";
const CHROME_UA =
  `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_VER} Safari/537.36`;
const FACEBOOK_URL = "https://www.facebook.com/";
const MESSENGER_URL = "https://www.facebook.com/messages";
const MARKETPLACE_URL = "https://www.facebook.com/marketplace/create/rental";
const ZILLOW_SIGNIN_URL = "https://www.zillow.com/user/signin/";
const ZILLOW_RENT_URL =
  "https://www.zillow.com/homes/for_rent/?searchQueryState=%7B%22mapBounds%22%3A%7B%22north%22%3A40.909919%2C%22south%22%3A40.895244%2C%22east%22%3A-73.844728%2C%22west%22%3A-73.881033%7D%2C%22regionSelection%22%3A%5B%7B%22regionId%22%3A61810%2C%22regionType%22%3A7%7D%5D%2C%22filterState%22%3A%7B%22fr%22%3A%7B%22value%22%3Atrue%7D%2C%22fsba%22%3A%7B%22value%22%3Afalse%7D%2C%22fsbo%22%3A%7B%22value%22%3Afalse%7D%2C%22nc%22%3A%7B%22value%22%3Afalse%7D%2C%22cmsn%22%3A%7B%22value%22%3Afalse%7D%2C%22auc%22%3A%7B%22value%22%3Afalse%7D%2C%22fore%22%3A%7B%22value%22%3Afalse%7D%2C%22beds%22%3A%7B%22min%22%3A2%7D%2C%22baths%22%3A%7B%22min%22%3A1%7D%7D%2C%22mapZoom%22%3A16%2C%22usersSearchTerm%22%3A%22New+York+NY+10470%22%7D";

function isOauthUrl(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return (
      host === "accounts.google.com" ||
      host === "appleid.apple.com" ||
      host === "login.microsoftonline.com" ||
      host === "login.live.com"
    );
  } catch {
    return false;
  }
}

function openAuthWindow(url) {
  const parent = BrowserWindow.getAllWindows()[0] || undefined;
  const child = new BrowserWindow({
    parent,
    width: 540,
    height: 760,
    autoHideMenuBar: true,
    title: "Sign in",
    webPreferences: {
      partition: "persist:rent-usa",
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  child.webContents.setUserAgent(CHROME_UA);
  attachStealth(child.webContents);
  child.loadURL(url);
  child.webContents.setWindowOpenHandler(({ url: next }) => {
    child.loadURL(next);
    return { action: "deny" };
  });
  const maybeClose = (_event, nav) => {
    try {
      if (new URL(nav).hostname.endsWith("zillow.com") && rentView) {
        rentView.webContents.loadURL(nav);
        if (!child.isDestroyed()) child.close();
      }
    } catch {}
  };
  child.webContents.on("did-navigate", maybeClose);
  child.webContents.on("will-redirect", maybeClose);
}

const RENT_SCRAPE_JS = `(() => {
  const abs = (u) => { try { return new URL(u, location.href).href; } catch { return ""; } };
  const isDetail = (u) => /_zpid|\\/homedetails\\/|\\/apartments\\/|\\/b\\/\\d/i.test(String(u || ""));
  const imgUrl = (img) => {
    const raw = img.currentSrc || img.src || img.getAttribute("data-src") || "";
    const srcset = img.getAttribute("srcset") || "";
    let best = abs((raw.split(" ")[0] || ""));
    let bestW = Number(img.naturalWidth || 0);
    for (const part of srcset.split(",")) {
      const bits = part.trim().split(/\\s+/);
      const href = abs(bits[0] || "");
      const w = Number(String(bits[1] || "").replace("w", "")) || 0;
      if (href && w >= bestW) { bestW = w; best = href; }
    }
    if (!best.startsWith("http")) return "";
    if (/logo|sprite|spacer|blank|pixel|tracking|static-logo|icon|mapbox|googleapis|gstatic|avatar|emoji/i.test(best)) return "";
    return best;
  };
  const zpidFrom = (href, text) => (String(href).match(/(\\d+)_zpid/) || String(text).match(/(\\d{6,})_zpid/) || [])[1] || "";
  const pickAddr = (root) => {
    const el = root.querySelector("h1, [data-testid='home-details-summary-address'], address");
    return ((el && el.textContent) || "").replace(/\\s+/g, " ").trim();
  };
  const pickPrice = (root) => {
    const h1 = root.querySelector("h1");
    const hr = h1 ? h1.getBoundingClientRect() : null;
    let best = "";
    let bestScore = -1;
    for (const el of root.querySelectorAll("span, div, p, h2, h3, strong")) {
      if (el.children.length > 3) continue;
      const t = (el.textContent || "").replace(/\\s+/g, " ").trim();
      const m = t.match(/^\\$[\\d,]+(?:\\s*\\/\\s*mo)?/i);
      if (!m) continue;
      const n = Number(m[0].replace(/[^\\d]/g, ""));
      if (n < 100 || n > 100000) continue;
      const r = el.getBoundingClientRect();
      if (r.height > 90 || r.width > 300) continue;
      let score = n;
      if (hr) {
        const dist = Math.abs(r.top - hr.bottom) + Math.abs(r.left - hr.left);
        if (dist < 240) score += 200000 - dist;
      }
      if (score > bestScore) { bestScore = score; best = m[0].replace(/\\s+/g, ""); }
    }
    return best;
  };
  const pickFacts = (root) => {
    const text = (root.innerText || "").replace(/\\s+/g, " ");
    const beds = (text.match(/(\\d+)\\s*(?:bd|bds|beds?)/i) || [])[1] || "";
    const baths = (text.match(/(\\d+(?:\\.\\d+)?)\\s*(?:ba|baths?)/i) || [])[1] || "";
    const sqft = (text.match(/([\\d,]+)\\s*sqft/i) || [])[1] || "";
    const desc = (root.querySelector("[data-testid='description'], [data-testid='ds-description']")?.textContent || "").replace(/\\s+/g, " ").trim();
    return { beds, baths, sqft, desc };
  };
  const pickImgs = (root) => {
    const items = [];
    const byKey = new Map();
    const photoKey = (href) => {
      const m = String(href).match(/\\/fp\\/([a-z0-9]+)/i);
      return (m && m[1]) || String(href).split("?")[0];
    };
    const sizeOf = (href) => Number((String(href).match(/cc_ft_(\\d+)/) || String(href).match(/within_(\\d+)/) || [])[1] || 0);
    const fbOk = (href) => /\\.(?:jpe?g|png|gif|webp|heic|tif|tiff)(?:\\?|$)/i.test(href) || /photos\\.zillowstatic/i.test(href);
    const push = (href) => {
      if (!href || !href.startsWith("http")) return;
      if (/logo|sprite|spacer|blank|pixel|tracking|static-logo|icon|mapbox|googleapis|gstatic|avatar|emoji/i.test(href)) return;
      const key = photoKey(href);
      const size = sizeOf(href);
      const prev = byKey.get(key);
      if (!prev) {
        const rec = { href, size, order: items.length };
        byKey.set(key, rec);
        items.push(rec);
      } else if (size >= prev.size) {
        prev.href = href;
        prev.size = size;
      }
    };
    for (const img of root.querySelectorAll("img")) {
      const w = img.naturalWidth || img.width || 0;
      const h = img.naturalHeight || img.height || 0;
      if (w && h && (w < 160 || h < 120)) continue;
      push(imgUrl(img));
    }
    return items
      .slice()
      .sort((a, b) => {
        const ae = fbOk(a.href) ? 0 : 1;
        const be = fbOk(b.href) ? 0 : 1;
        if (ae !== be) return ae - be;
        return a.order - b.order;
      })
      .map((x) => x.href)
      .slice(0, 50);
  };
  const findRoot = () => {
    const back = [...document.querySelectorAll("a, button, span")].find((el) => /^\\s*back to search\\s*$/i.test((el.textContent || "").trim()));
    if (back) {
      let n = back.parentElement;
      for (let i = 0; i < 18 && n; i++) {
        const r = n.getBoundingClientRect();
        if (pickAddr(n) && pickPrice(n) && r.width >= 300 && r.width < innerWidth * 0.92 && r.height >= 220) return n;
        n = n.parentElement;
      }
    }
    const dialogs = [...document.querySelectorAll('[role="dialog"], [aria-modal="true"]')];
    for (const el of dialogs) {
      const r = el.getBoundingClientRect();
      if (r.width >= 300 && r.width < innerWidth * 0.92 && r.height >= 220 && pickAddr(el) && pickPrice(el)) return el;
    }
    if (isDetail(location.href)) return document.body;
    return null;
  };
  const detailUrl = (root) => {
    const hit = [...root.querySelectorAll("a[href]")].map((a) => a.href).find((u) => isDetail(u));
    if (hit) return hit;
    if (isDetail(location.href)) return location.href.split("?")[0];
    return "";
  };
  const root = findRoot();
  if (!root) return [];
  const address = pickAddr(root);
  const price = pickPrice(root);
  if (!address && !price) return [];
  const listing_url = detailUrl(root);
  const facts = pickFacts(root);
  const images = pickImgs(root);
  const zpid = zpidFrom(listing_url, root.innerText || "") || ("p_" + (address + "|" + price).replace(/\\s+/g, "_").slice(0, 56));
  return [{
    zpid,
    title: address || "Listing",
    address: address || "",
    price,
    beds: facts.beds,
    baths: facts.baths,
    sqft: facts.sqft,
    facts: facts.desc || [facts.beds && facts.beds + " bd", facts.baths && facts.baths + " ba", facts.sqft && facts.sqft + " sqft"].filter(Boolean).join(" · "),
    image_url: images[0] || "",
    images,
    listing_url,
    picked: true
  }];
})()`;
const MESSENGER_SCRAPE_JS = `(() => {
  const root = document.querySelector('[role="main"]') || document.body;
  const name = (document.querySelector("h1, h2")?.textContent || "").trim();
  const href = [...root.querySelectorAll('a[href*="facebook.com/"]')]
    .map((a) => a.href)
    .find((h) => /facebook\\.com\\/(profile\\.php\\?id=|people\\/|[^/]{2,})/.test(h) && !/messages|marketplace|login|photo/.test(h)) || "";
  const links = [...document.querySelectorAll('a[href*="/marketplace/item/"]')];
  let listing_url = "";
  let listing_id = "";
  let listing_title = "";
  let listing_price = "";
  for (const a of links) {
    const raw = a.href || "";
    const id = (raw.match(/marketplace\\/item\\/(\\d+)/) || [])[1] || "";
    if (!id) continue;
    listing_url = raw.split("?")[0];
    listing_id = id;
    const block = a.closest('[role="article"], [role="link"], div') || a;
    const txt = (block.innerText || a.innerText || "").replace(/\\s+/g, " ").trim();
    const price = txt.match(/\\$\\s*[\\d,]+(?:\\.\\d+)?/);
    if (price) listing_price = price[0].replace(/\\s+/g, "");
    const first = txt.split(" $")[0].replace(/is this (still )?available\\??/i, "").trim();
    if (first && first.length > 2 && first.length < 160) listing_title = first;
    break;
  }
  const params = new URLSearchParams(location.search);
  const referral = params.get("listing_id") || params.get("marketplace_listing_id") || params.get("asset_id") || params.get("referral_id") || "";
  if (!listing_id && referral) listing_id = referral;
  if (!listing_url && listing_id) listing_url = "https://www.facebook.com/marketplace/item/" + listing_id;
  const nodes = [...root.querySelectorAll('[dir="auto"], [role="row"]')];
  const skip = /^(chats|marketplace|messenger|home|see all|active now|type a message)$/i;
  const lines = [];
  for (const el of nodes) {
    const t = (el.innerText || "").replace(/\\s+/g, " ").trim();
    if (!t || t.length < 2 || t.length > 360 || skip.test(t)) continue;
    lines.push(t);
  }
  const uniq = [...new Set(lines)].slice(-22);
  return {
    name,
    link: href,
    text: uniq.join("\\n"),
    listing_url,
    listing_id,
    listing_title,
    listing_price,
    page: location.href,
  };
})()`;
const MESSENGER_OPEN_UNREAD_JS = `(() => {
  const nodes = [...document.querySelectorAll("[aria-label]")];
  const hit = nodes.find((el) => {
    const label = el.getAttribute("aria-label") || "";
    return /\\bunread\\b/i.test(label) && label.length < 220;
  });
  if (hit) {
    hit.click();
    return true;
  }
  return false;
})()`;

app.userAgentFallback = CHROME_UA;
app.on("login", (event, _webContents, _request, authInfo, callback) => {
  if (authInfo.isProxy) {
    event.preventDefault();
    callback(_gProxyUser, _gProxyPass);
  }
});
process.on("uncaughtException", (err) => {
  const text = String(err?.message || err);
  if (
    [
      "ERR_TUNNEL_CONNECTION_FAILED",
      "ERR_CONNECTION_REFUSED",
      "ERR_NAME_NOT_RESOLVED",
      "ERR_PROXY_CONNECTION_FAILED",
      "ERR_TIMED_OUT",
    ].some((code) => text.includes(code))
  ) {
    return;
  }
  console.error(err);
});

const views = new Map();
const robots = new Map();
let activeId = null;
let lastBounds = { x: 0, y: 36, width: 800, height: 600 };
let rentView = null;
let rentOn = false;
let rentSeq = 0;
let rentBounds = { x: 0, y: 36, width: 800, height: 600 };
let _gProxyUser = "";
let _gProxyPass = "";

const ANTI_DETECT = `(() => {
  try {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
    if (!window.chrome) window.chrome = { runtime: {} };
  } catch (e) {}
})()`;

function isMetaHost(url) {
  try {
    const host = new URL(url).hostname;
    return /(^|\.)(facebook\.com|messenger\.com|fbcdn\.net|fbsbx\.com|instagram\.com)$/i.test(host);
  } catch {
    return false;
  }
}

function setupSession(ses) {
  ses.setUserAgent(CHROME_UA);
  ses.webRequest.onHeadersReceived(
    {
      urls: [
        "https://www.facebook.com/*",
        "https://m.facebook.com/*",
        "https://l.facebook.com/*",
        "https://www.messenger.com/*",
        "https://accountscenter.facebook.com/*",
        "https://accounts.facebook.com/*",
      ],
    },
    (details, callback) => {
      const headers = { ...(details.responseHeaders || {}) };
      for (const key of Object.keys(headers)) {
        const lower = key.toLowerCase();
        if (lower === "content-security-policy" || lower === "x-frame-options") delete headers[key];
      }
      callback({ responseHeaders: headers });
    },
  );
}


const CHROME_MAJOR = String(CHROME_VER).split(".")[0] || "134";

const STEALTH_PAYLOAD = `(() => {
  // 1. Webdriver protection
  try {
    delete Navigator.prototype.webdriver;
  } catch (e) {}
  try {
    delete navigator.webdriver;
  } catch (e) {}
  try {
    Object.defineProperty(Navigator.prototype, "webdriver", {
      get: () => false,
      set: () => {},
      enumerable: true,
      configurable: true,
    });
    Object.defineProperty(navigator, "webdriver", {
      get: () => false,
      set: () => {},
      enumerable: true,
      configurable: true,
    });
  } catch (e) {}

  const makeNative = (fn, name) => {
    try {
      Object.defineProperty(fn, "name", { value: name || "", configurable: true });
      fn.toString = () => "function " + (name || "") + "() { [native code] }";
    } catch (e) {}
    return fn;
  };

  // 2. Realistic window.chrome structure
  try {
    if (!window.chrome) window.chrome = {};
    const dummyFn = function () {};
    makeNative(dummyFn, "");

    window.chrome.app = {
      isInstalled: false,
      InstallState: { DISABLED: "disabled", INSTALLED: "installed", NOT_INSTALLED: "not_installed" },
      RunningState: { CANNOT_RUN: "cannot_run", READY_TO_RUN: "ready_to_run", RUNNING: "running" },
      getDetails: makeNative(function () { return null; }, "getDetails"),
      getIsInstalled: makeNative(function () { return false; }, "getIsInstalled"),
      runningState: makeNative(function () { return "cannot_run"; }, "runningState"),
    };

    window.chrome.csi = makeNative(function () {
      return { startE: Date.now() - 320, onloadT: Date.now(), pageT: 412.3, tran: 15 };
    }, "csi");

    window.chrome.loadTimes = makeNative(function () {
      const now = Date.now() / 1000;
      return {
        requestTime: now - 0.6,
        startLoadTime: now - 0.5,
        commitLoadTime: now - 0.3,
        finishDocumentLoadTime: now - 0.05,
        finishLoadTime: now,
        firstPaintTime: now - 0.1,
        firstPaintAfterLoadTime: 0,
        navigationType: "Other",
        wasFetchedViaSpdy: true,
        wasNpnNegotiated: true,
        npnNegotiatedProtocol: "h2",
        wasAlternateProtocolAvailable: false,
        connectionInfo: "h2",
      };
    }, "loadTimes");

    window.chrome.runtime = {
      OnInstalledReason: { CHROME_UPDATE: "chrome_update", INSTALL: "install", SHARED_MODULE_UPDATE: "shared_module_update", UPDATE: "update" },
      OnRestartRequiredReason: { APP_UPDATE: "app_update", OS_UPDATE: "os_update", PERIODIC: "periodic" },
      PlatformArch: { ARM: "arm", ARM64: "arm64", MIPS: "mips", MIPS64: "mips64", X86_32: "x86-32", X86_64: "x86-64" },
      PlatformNaclArch: { ARM: "arm", MIPS: "mips", MIPS64: "mips64", X86_32: "x86-32", X86_64: "x86-64" },
      PlatformOs: { ANDROID: "android", CROS: "cros", LINUX: "linux", MAC: "mac", OPENBSD: "openbsd", WIN: "win" },
      RequestUpdateCheckStatus: { NO_UPDATE: "no_update", THROTTLED: "throttled", UPDATE_AVAILABLE: "update_available" },
      connect: makeNative(function () {
        return {
          disconnect: dummyFn,
          name: "",
          onDisconnect: { addListener: dummyFn, removeListener: dummyFn, hasListener: () => false },
          onMessage: { addListener: dummyFn, removeListener: dummyFn, hasListener: () => false },
          postMessage: dummyFn,
        };
      }, "connect"),
      sendMessage: makeNative(dummyFn, "sendMessage"),
      id: undefined,
    };
  } catch (e) {}

  // 3. Genuine Windows Chrome plugins & mimeTypes
  try {
    const rawPlugins = [
      { name: "PDF Viewer", filename: "internal-pdf-viewer", description: "Portable Document Format", mimeTypes: [{ type: "application/pdf", suffixes: "pdf", description: "Portable Document Format" }] },
      { name: "Chrome PDF Viewer", filename: "internal-pdf-viewer", description: "Portable Document Format", mimeTypes: [{ type: "application/pdf", suffixes: "pdf", description: "Portable Document Format" }] },
      { name: "Chromium PDF Viewer", filename: "internal-pdf-viewer", description: "Portable Document Format", mimeTypes: [{ type: "application/pdf", suffixes: "pdf", description: "Portable Document Format" }] },
      { name: "Microsoft Edge PDF Viewer", filename: "internal-pdf-viewer", description: "Portable Document Format", mimeTypes: [{ type: "application/pdf", suffixes: "pdf", description: "Portable Document Format" }] },
      { name: "WebKit built-in PDF", filename: "internal-pdf-viewer", description: "Portable Document Format", mimeTypes: [{ type: "application/pdf", suffixes: "pdf", description: "Portable Document Format" }] },
    ];
    const pluginArray = Object.create(PluginArray.prototype);
    const mimeTypeArray = Object.create(MimeTypeArray.prototype);
    rawPlugins.forEach((p, i) => {
      const plugin = Object.create(Plugin.prototype);
      Object.defineProperties(plugin, {
        name: { value: p.name, enumerable: true },
        filename: { value: p.filename, enumerable: true },
        description: { value: p.description, enumerable: true },
        length: { value: p.mimeTypes.length, enumerable: true },
      });
      p.mimeTypes.forEach((m, j) => {
        const mime = Object.create(MimeType.prototype);
        Object.defineProperties(mime, {
          type: { value: m.type, enumerable: true },
          suffixes: { value: m.suffixes, enumerable: true },
          description: { value: m.description, enumerable: true },
          enabledPlugin: { value: plugin, enumerable: true },
        });
        plugin[j] = mime;
        mimeTypeArray[m.type] = mime;
      });
      pluginArray[i] = plugin;
      pluginArray[p.name] = plugin;
    });
    Object.defineProperty(pluginArray, "length", { value: rawPlugins.length, enumerable: false });
    Object.defineProperty(pluginArray, "item", { value: makeNative(function(i) { return this[i] || null; }, "item"), enumerable: false });
    Object.defineProperty(pluginArray, "namedItem", { value: makeNative(function(name) { return this[name] || null; }, "namedItem"), enumerable: false });
    Object.defineProperty(pluginArray, "refresh", { value: makeNative(function() {}, "refresh"), enumerable: false });
    Object.defineProperty(Navigator.prototype, "plugins", { get: () => pluginArray, enumerable: true, configurable: true });
    Object.defineProperty(Navigator.prototype, "mimeTypes", { get: () => mimeTypeArray, enumerable: true, configurable: true });
  } catch (e) {}

  // 4. Client Hints & userAgentData
  try {
    const brands = [
      { brand: "Chromium", version: "${CHROME_MAJOR}" },
      { brand: "Google Chrome", version: "${CHROME_MAJOR}" },
      { brand: "Not:A-Brand", version: "24" },
    ];
    const uad = {
      brands,
      mobile: false,
      platform: "Windows",
      getHighEntropyValues: makeNative(async function (hints) {
        return {
          architecture: "x86",
          bitness: "64",
          brands,
          mobile: false,
          model: "",
          platform: "Windows",
          platformVersion: "15.0.0",
          uaFullVersion: "${CHROME_VER}",
          fullVersionList: brands,
        };
      }, "getHighEntropyValues"),
      toJSON: () => ({ brands, mobile: false, platform: "Windows" }),
    };
    Object.defineProperty(Navigator.prototype, "userAgentData", {
      get: () => uad,
      enumerable: true,
      configurable: true,
    });
  } catch (e) {}

  // 5. Hardware, Language, and Touch
  try {
    Object.defineProperty(Navigator.prototype, "languages", { get: () => Object.freeze(["en-US", "en"]), enumerable: true, configurable: true });
    Object.defineProperty(Navigator.prototype, "language", { get: () => "en-US", enumerable: true, configurable: true });
    Object.defineProperty(Navigator.prototype, "platform", { get: () => "Win32", enumerable: true, configurable: true });
    Object.defineProperty(Navigator.prototype, "hardwareConcurrency", { get: () => 8, enumerable: true, configurable: true });
    Object.defineProperty(Navigator.prototype, "deviceMemory", { get: () => 8, enumerable: true, configurable: true });
    Object.defineProperty(Navigator.prototype, "maxTouchPoints", { get: () => 0, enumerable: true, configurable: true });
  } catch (e) {}

  // 6. WebGL GPU spoofing (evade SwiftShader bot detector)
  try {
    const patchGL = (proto) => {
      if (!proto || !proto.getParameter) return;
      const orig = proto.getParameter;
      proto.getParameter = function (param) {
        if (param === 37445) return "Google Inc. (NVIDIA)";
        if (param === 37446) return "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)";
        return orig.apply(this, arguments);
      };
      makeNative(proto.getParameter, "getParameter");
    };
    patchGL(window.WebGLRenderingContext?.prototype);
    patchGL(window.WebGL2RenderingContext?.prototype);
  } catch (e) {}

  // 7. Permissions query
  try {
    const origQuery = window.navigator.permissions && window.navigator.permissions.query;
    if (origQuery) {
      window.navigator.permissions.query = makeNative(function (params) {
        if (params && params.name === "notifications") {
          return Promise.resolve({
            state: typeof Notification !== "undefined" && Notification.permission === "granted" ? "granted" : "prompt",
            onchange: null,
          });
        }
        return origQuery.apply(this, arguments);
      }, "query");
    }
  } catch (e) {}

  // 8. Delete Automation and leak symbols
  try {
    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol;
    delete window.__nightmare;
    delete window._phantom;
    delete window.callPhantom;
    delete window.__puppeteer_evaluation_script__;
  } catch (e) {}
})();`;

function attachStealth(wc) {
  try {
    wc.setUserAgent(CHROME_UA);
  } catch {}
  const run = () => wc.executeJavaScript(STEALTH_PAYLOAD).catch(() => {});
  wc.on("did-start-navigation", run);
  wc.on("dom-ready", run);
  wc.on("did-finish-load", run);
}

function setupRentSession(ses) {
  ses.setUserAgent(CHROME_UA, "en-US,en");
  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = { ...details.requestHeaders };
    headers["User-Agent"] = CHROME_UA;
    headers["sec-ch-ua"] = `"Chromium";v="${CHROME_MAJOR}", "Google Chrome";v="${CHROME_MAJOR}", "Not:A-Brand";v="24"`;
    headers["sec-ch-ua-mobile"] = "?0";
    headers["sec-ch-ua-platform"] = '"Windows"';
    headers["sec-ch-ua-platform-version"] = '"15.0.0"';
    headers["sec-ch-ua-arch"] = '"x86"';
    headers["sec-ch-ua-bitness"] = '"64"';
    headers["sec-ch-ua-model"] = '""';
    if (!headers["Accept-Language"]) {
      headers["Accept-Language"] = "en-US,en;q=0.9";
    }
    callback({ requestHeaders: headers });
  });
}

async function rentStealthPath() {
  const file = path.join(app.getPath("userData"), "rent-stealth.js");
  const body = `"use strict";
// Direct document-start execution
try {
` + STEALTH_PAYLOAD + `
} catch (e) {}

// Also execute in isolated world if webFrame is accessible
try {
  const { webFrame } = require("electron");
  if (webFrame && typeof webFrame.executeJavaScriptInIsolatedWorld === "function") {
    webFrame.executeJavaScriptInIsolatedWorld(0, [{ code: ` + JSON.stringify(STEALTH_PAYLOAD) + ` }]);
  }
} catch (e) {}
`;
  await fs.writeFile(file, body, "utf8");
  return file;
}

function overlay() {
  return { color: "#1b1433", symbolColor: "#f6eef8", height: 52 };
}

function mainWindowFrom(event) {
  return BrowserWindow.fromWebContents(event.sender);
}

function sendScript(text) {
  const payload = JSON.stringify(String(text).slice(0, 700));
  return `(() => {
    const reply = ${payload};
    const box = document.querySelector('[role="textbox"][contenteditable="true"]');
    if (!box) return false;
    box.focus();
    document.execCommand("insertText", false, reply);
    box.dispatchEvent(new InputEvent("input", { bubbles: true }));
    const send = document.querySelector('[aria-label="Press Enter to send"], [aria-label*="Send"]');
    if (send) send.click();
    else box.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
    return true;
  })()`;
}

async function applyProxy(ses, proxy) {
  if (proxy?.host && proxy?.port) {
    const scheme = proxy.protocol === "socks5" ? "socks5" : "http";
    const user = encodeURIComponent(proxy.username || "");
    const pass = encodeURIComponent(proxy.password || "");
    const auth = proxy.username ? `${user}:${pass}@` : "";
    const host = String(proxy.host).replace(/^https?:\/\//i, "").split("/")[0];
    const rules = `${scheme}://${auth}${host}:${proxy.port}`;
    _gProxyUser = proxy.username || "";
    _gProxyPass = proxy.password || "";
    await ses.setProxy({ proxyRules: rules });
    try {
      ses.closeAllConnections();
    } catch {
      /* skip */
    }
    ses.removeAllListeners("login");
    ses.on("login", (event, _wc, _details, authInfo, callback) => {
      if (!authInfo?.isProxy) return;
      event.preventDefault();
      callback(proxy.username || "", proxy.password || "");
    });
    return;
  }
  _gProxyUser = "";
  _gProxyPass = "";
  ses.removeAllListeners("login");
  await ses.setProxy({ mode: "direct", proxyRules: "direct://" });
}

function attachView(win, view) {
  for (const other of views.values()) {
    if (other !== view) win.removeBrowserView(other);
  }
  if (rentView) win.removeBrowserView(rentView);
  win.addBrowserView(view);
  view.setBounds(lastBounds);
  view.setAutoResize({ width: false, height: false });
  for (const robot of robots.values()) {
    if (!win.getBrowserViews().includes(robot)) win.addBrowserView(robot);
    robot.setBounds({ x: 0, y: -4600, width: 1100, height: 820 });
  }
}

function hideFacebookViews(win) {
  for (const view of views.values()) win.removeBrowserView(view);
  activeId = null;
}

function hideRentView(win) {
  rentOn = false;
  rentSeq += 1;
  if (rentView) {
    try {
      rentView.setBounds({ x: -8000, y: -8000, width: 1, height: 1 });
    } catch {
      /* skip */
    }
    try {
      win.removeBrowserView(rentView);
    } catch {
      /* skip */
    }
  }
  try {
    const viewsNow = typeof win.getBrowserViews === "function" ? win.getBrowserViews() : [];
    for (const view of viewsNow) {
      if (view === rentView) win.removeBrowserView(view);
    }
  } catch {
    /* skip */
  }
  for (const child of BrowserWindow.getAllWindows()) {
    if (child === win || child.isDestroyed()) continue;
    const url = child.webContents.getURL() || "";
    if (/zillow\.com|px-cdn|perimeterx|humansecurity/i.test(url)) {
      try {
        child.destroy();
      } catch {
        /* skip */
      }
    }
  }
}

async function ensureRentView() {
  if (rentView) return rentView;
  const partition = "persist:rent-usa";
  const ses = session.fromPartition(partition);
  ses.setUserAgent(CHROME_UA, "en-US,en");
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(true));
  setupRentSession(ses);
  const stealth = await rentStealthPath();
  try {
    ses.setPreloads([stealth]);
  } catch {
    /* skip */
  }
  rentView = new BrowserView({
    webPreferences: {
      partition,
      preload: stealth,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
      images: true,
      javascript: true,
      webSecurity: true,
    },
  });
  rentView.setBackgroundColor("#ffffff");
  rentView.webContents.setUserAgent(CHROME_UA);
  rentView.webContents.setWindowOpenHandler(({ url }) => {
    if (isOauthUrl(url)) {
      openAuthWindow(url);
      return { action: "deny" };
    }
    return { action: "deny" };
  });
  rentView.webContents.on("will-navigate", (event, url) => {
    if (!isOauthUrl(url)) return;
    event.preventDefault();
    openAuthWindow(url);
  });
  rentView.webContents.loadURL(ZILLOW_RENT_URL);
  attachContextMenu(rentView.webContents);
  return rentView;
}

async function ensureView(id, proxy, startUrl) {
  const partition = `persist:fb-${id}`;
  const ses = session.fromPartition(partition);
  setupSession(ses);
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(true));
  await applyProxy(ses, proxy);

  let view = views.get(id);
  if (view) return view;

  view = new BrowserView({
    webPreferences: {
      session: ses,
      partition,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
      webgl: true,
      images: true,
      javascript: true,
      webSecurity: true,
      spellcheck: true,
    },
  });
  view.setBackgroundColor("#ffffff");
  view.webContents.setUserAgent(CHROME_UA);
  view.webContents.on("did-start-loading", () => {
    view.webContents.executeJavaScript(ANTI_DETECT).catch(() => {});
  });
  view.webContents.setWindowOpenHandler(({ url }) => {
    if (isMetaHost(url) || !url.startsWith("http")) {
      view.webContents.loadURL(url);
    } else {
      shell.openExternal(url).catch(() => {});
    }
    return { action: "deny" };
  });
  view.webContents.on("did-fail-load", (_e, code, _desc, url, isMain) => {
    if (!isMain || code === -3) return;
    const retry = /marketplace\/create/i.test(String(url || "")) ? (url || MARKETPLACE_URL) : FACEBOOK_URL;
    setTimeout(() => view.webContents.loadURL(retry), 900);
  });
  view.webContents.loadURL(startUrl || FACEBOOK_URL, { httpReferrer: FACEBOOK_URL });
  attachContextMenu(view.webContents);
  attachStealth(view.webContents);
  views.set(id, view);
  return view;
}

async function ensureRobot(id, proxy) {
  const partition = `persist:fb-${id}`;
  const ses = session.fromPartition(partition);
  setupSession(ses);
  await applyProxy(ses, proxy ?? null);
  let view = robots.get(id);
  if (view) return view;
  view = new BrowserView({
    webPreferences: {
      session: ses,
      partition,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
      webgl: true,
      images: true,
      javascript: true,
      webSecurity: true,
    },
  });
  view.webContents.setUserAgent(CHROME_UA);
  view.webContents.on("did-start-loading", () => {
    view.webContents.executeJavaScript(ANTI_DETECT).catch(() => {});
  });
  view.webContents.setWindowOpenHandler(({ url }) => {
    view.webContents.loadURL(url);
    return { action: "deny" };
  });
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    win.addBrowserView(view);
    view.setBounds({ x: 0, y: -4600, width: 1100, height: 820 });
  }
  view.webContents.loadURL(MESSENGER_URL);
  attachContextMenu(view.webContents);
  robots.set(id, view);
  return view;
}

function waitLoad(wc, ms = 20000) {
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      wc.removeListener("did-finish-load", done);
      resolve();
    }
    wc.once("did-finish-load", done);
  });
}

async function waitMarketplaceComposer(wc) {
  const target = MARKETPLACE_URL;
  const jump = async () => {
    try {
      wc.stop();
    } catch {
      /* skip */
    }
    wc.loadURL(target, { httpReferrer: FACEBOOK_URL });
    await waitLoad(wc);
    await new Promise((resolve) => setTimeout(resolve, 900));
  };
  if (!/marketplace\/create/i.test(wc.getURL() || "")) await jump();
  if (!/marketplace\/create/i.test(wc.getURL() || "")) {
    try {
      await wc.executeJavaScript(`location.assign(${JSON.stringify(target)})`);
    } catch {
      /* skip */
    }
    await waitLoad(wc);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  const deadline = Date.now() + 18000;
  while (Date.now() < deadline) {
    if (/marketplace\/create/i.test(wc.getURL() || "")) {
      await new Promise((resolve) => setTimeout(resolve, 700));
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  await jump();
  return /marketplace\/create/i.test(wc.getURL() || "");
}

async function waitPhotoInput(wc) {
  for (let i = 0; i < 24; i++) {
    try {
      const ready = await wc.executeJavaScript(`(() => {
        if (document.querySelector('input[type="file"]')) return true;
        const add = [...document.querySelectorAll('[role="button"], button, div, span')].find((n) =>
          /add photo|upload photo|add images|^photos$/i.test(
            ((n.textContent || "") + " " + (n.getAttribute("aria-label") || "")).trim(),
          ),
        );
        if (add) add.click();
        return false;
      })()`);
      if (ready) return true;
    } catch {
      /* skip */
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  return false;
}

async function isJpegFile(filePath) {
  try {
    const buf = await fs.readFile(filePath);
    return buf.length > 100 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  } catch {
    return false;
  }
}

async function shrinkJpeg(filePath) {
  try {
    let img = nativeImage.createFromPath(filePath);
    if (img.isEmpty()) {
      img = nativeImage.createFromBuffer(await fs.readFile(filePath));
    }
    if (img.isEmpty()) return null;
    const { width, height } = img.getSize();
    if (!width || !height) return null;
    const max = 1400;
    let out = img;
    if (Math.max(width, height) > max) {
      const scale = max / Math.max(width, height);
      out = img.resize({
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
        quality: "best",
      });
    }
    let jpg = out.toJPEG(82);
    if (jpg && jpg.length > 7.5 * 1024 * 1024) {
      const size = out.getSize();
      jpg = out
        .resize({
          width: Math.max(1, Math.round(size.width * 0.7)),
          height: Math.max(1, Math.round(size.height * 0.7)),
        })
        .toJPEG(70);
    }
    if (!jpg || !jpg.length || jpg[0] !== 0xff || jpg[1] !== 0xd8) return null;
    await fs.writeFile(filePath, jpg);
    if (!(await isJpegFile(filePath))) return null;
    return filePath;
  } catch {
    return null;
  }
}

async function materializeImage(src) {
  if (!src) return null;
  try {
    let buf;
    if (src.startsWith("data:")) {
      const match = src.match(/^data:image\/[a-zA-Z0-9+.-]+;base64,(.+)$/);
      buf = Buffer.from((match ? match[1] : src.split(",")[1]) || "", "base64");
    } else {
      const res = await net.fetch(src);
      if (!res.ok) return null;
      buf = Buffer.from(await res.arrayBuffer());
    }
    if (!buf || buf.length < 100) return null;
    const head = buf.slice(0, 80).toString("utf8").toLowerCase();
    if (head.includes("<html") || head.includes("<!doctype") || head.includes("<?xml")) return null;
    if (buf.length > 10 * 1024 * 1024) return null;
    let ext = ".jpg";
    if (buf[0] === 0x89 && buf[1] === 0x50) ext = ".png";
    else if (buf[0] === 0x47 && buf[1] === 0x49) ext = ".gif";
    else if (buf[0] === 0xff && buf[1] === 0xd8) ext = ".jpg";
    else if (buf.slice(0, 4).toString("ascii") === "RIFF" && buf.slice(8, 12).toString("ascii") === "WEBP") ext = ".webp";
    else if (buf.slice(4, 8).toString("ascii") === "ftyp") ext = ".heic";
    else if ((buf[0] === 0x49 && buf[1] === 0x49) || (buf[0] === 0x4d && buf[1] === 0x4d)) ext = ".tif";
    const dest = path.join(os.tmpdir(), `painite-${Date.now()}-${Math.random().toString(36).slice(2, 6)}${ext}`);
    await fs.writeFile(dest, buf);
    return dest;
  } catch {
    return null;
  }
}

async function attachImages(view, filePaths) {
  const files = (filePaths || []).filter(Boolean).slice(0, 10);
  if (!files.length) return false;
  const wc = view.webContents;
  try {
    if (!wc.debugger.isAttached()) wc.debugger.attach("1.3");
    const { root } = await wc.debugger.sendCommand("DOM.getDocument");
    const { nodeId } = await wc.debugger.sendCommand("DOM.querySelector", {
      nodeId: root.nodeId,
      selector: 'input[type="file"]',
    });
    if (nodeId) {
      await wc.debugger.sendCommand("DOM.setFileInputFiles", { nodeId, files });
      return true;
    }
  } catch {
    /* skip */
  } finally {
    try {
      wc.debugger.detach();
    } catch {
      /* skip */
    }
  }
  return false;
}

async function attachImage(view, filePath) {
  const wc = view.webContents;
  try {
    if (!wc.debugger.isAttached()) wc.debugger.attach("1.3");
    const { root } = await wc.debugger.sendCommand("DOM.getDocument");
    const { nodeId } = await wc.debugger.sendCommand("DOM.querySelector", {
      nodeId: root.nodeId,
      selector: 'input[type="file"]',
    });
    if (nodeId) {
      await wc.debugger.sendCommand("DOM.setFileInputFiles", { nodeId, files: [filePath] });
    }
  } catch {
    /* skip */
  } finally {
    try {
      wc.debugger.detach();
    } catch {
      /* skip */
    }
  }
}

async function pasteImage(view, filePath) {
  try {
    const img = nativeImage.createFromPath(filePath);
    if (img.isEmpty()) return false;
    clipboard.writeImage(img);
    const focused = await view.webContents.executeJavaScript(`(() => {
      const box = document.querySelector('[role="textbox"][contenteditable="true"]');
      if (!box) return false;
      box.focus();
      return true;
    })()`);
    if (!focused) return false;
    view.webContents.paste();
    return true;
  } catch {
    return false;
  }
}

async function sendMessengerPhotos(view, images) {
  const files = [];
  for (const src of (images || []).slice(0, 6)) {
    const file = await materializeImage(src);
    if (file) files.push(file);
  }
  if (!files.length) return false;
  try {
    await view.webContents.executeJavaScript(`(() => {
      const box = document.querySelector('[role="textbox"][contenteditable="true"]');
      if (box) box.focus();
      const hit = [...document.querySelectorAll("[aria-label]")].find((el) =>
        /attach a file|attach files|send a photo|add files|open more actions|photo|image/i.test(el.getAttribute("aria-label") || "")
      );
      if (hit) hit.click();
      return true;
    })()`);
  } catch {
    /* continue */
  }
  await new Promise((resolve) => setTimeout(resolve, 450));
  let ok = false;
  for (const file of files) {
    const attached = await attachImage(view, file);
    if (!attached) await pasteImage(view, file);
    else ok = true;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
  return ok || files.length > 0;
}


function attachContextMenu(wc) {
  if (!wc || wc.__painiteMenu) return;
  wc.__painiteMenu = true;
  wc.on("context-menu", (_event, params) => {
    const flags = params.editFlags || {};
    const win = BrowserWindow.fromWebContents(wc) || BrowserWindow.getFocusedWindow();
    const menu = Menu.buildFromTemplate([
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut", enabled: Boolean(flags.canCut) },
      { role: "copy", enabled: Boolean(flags.canCopy) },
      { role: "paste", enabled: Boolean(flags.canPaste) },
      { role: "delete" },
      { type: "separator" },
      { role: "selectAll" },
    ]);
    if (win && !win.isDestroyed()) menu.popup({ window: win });
    else menu.popup();
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: "#120c1c",
    show: false,
    autoHideMenuBar: true,
    roundedCorners: false,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(here, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      sandbox: false,
    },
  });
  win.setFullScreenable(false);
  win.on("enter-full-screen", () => {
    try {
      win.setFullScreen(false);
    } catch {
      /* skip */
    }
  });
  attachContextMenu(win.webContents);
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url && url !== "about:blank") {
      shell.openExternal(url).catch(() => {});
    }
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (
      url.startsWith("mailto:") ||
      url.startsWith("tg:") ||
      /https?:\/\/(t\.me|telegram\.me)\//i.test(url)
    ) {
      event.preventDefault();
      shell.openExternal(url).catch(() => {});
    }
  });
  win.webContents.on("did-finish-load", () => {
    setTimeout(() => {
      if (!win.isDestroyed() && !win.isVisible()) win.show();
    }, 220);
  });
  void loadUi(win);
}

ipcMain.handle("painite:copy-text", (_event, text) => {
  clipboard.writeText(String(text || ""));
  return true;
});

const SESSION_FILE = path.join(DATA_ROOT, "member-session.json");
ipcMain.handle("painite:session-get", async () => {
  try {
    return JSON.parse(await fs.readFile(SESSION_FILE, "utf8"));
  } catch {
    return null;
  }
});
ipcMain.handle("painite:session-set", async (_event, data) => {
  try {
    if (!data) {
      await fs.unlink(SESSION_FILE).catch(() => {});
      return true;
    }
    await fs.writeFile(SESSION_FILE, JSON.stringify(data), "utf8");
    return true;
  } catch {
    return false;
  }
});

const POSTS_FILE = path.join(DATA_ROOT, "rent-posts.json");
ipcMain.handle("painite:posts-get", async () => {
  try {
    return JSON.parse(await fs.readFile(POSTS_FILE, "utf8"));
  } catch {
    return [];
  }
});
ipcMain.handle("painite:posts-set", async (_event, rows) => {
  try {
    await fs.writeFile(POSTS_FILE, JSON.stringify(rows || []), "utf8");
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle("painite:ui-ready", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed() && !win.isVisible()) win.show();
  return { ok: true };
});

ipcMain.handle("painite:prepare-session", async (_event, input) => {
  if (!input?.id) throw new Error("Missing profile.");
  const ses = session.fromPartition(`persist:fb-${input.id}`);
  ses.setUserAgent(CHROME_UA, "en-US,en");
  await applyProxy(ses, input.proxy ?? null);
  return { ok: true };
});

ipcMain.handle("painite:facebook-show", async (event, profile) => {
  if (!profile?.id) throw new Error("Missing profile.");
  const win = mainWindowFrom(event);
  if (!win) return { ok: false };
  if (profile.bounds) lastBounds = profile.bounds;
  hideRentView(win);
  const view = await ensureView(profile.id, profile.proxy ?? null);
  attachView(win, view);
  activeId = profile.id;
  const url = profile.url || FACEBOOK_URL;
  const current = view.webContents.getURL();
  const blank = !current || current === "about:blank" || current.startsWith("chrome-error://");
  if (blank) view.webContents.loadURL(url);
  return { ok: true };
});

ipcMain.handle("painite:facebook-hide", async (event) => {
  const win = mainWindowFrom(event);
  if (win) hideFacebookViews(win);
  return { ok: true };
});

ipcMain.handle("painite:facebook-bounds", async (event, bounds) => {
  if (!bounds) return { ok: false };
  lastBounds = bounds;
  const win = mainWindowFrom(event);
  if (!win || !activeId) return { ok: true };
  const view = views.get(activeId);
  if (view) view.setBounds(lastBounds);
  return { ok: true };
});

ipcMain.handle("painite:facebook-reload", async (event, profile) => {
  if (!profile?.id) throw new Error("Missing profile.");
  const win = mainWindowFrom(event);
  const view = views.get(profile.id);
  if (view && !view.webContents.isDestroyed()) {
    view.webContents.reload();
    if (win && activeId === profile.id) attachView(win, view);
  }
  return { ok: true };
});

ipcMain.handle("painite:facebook-close", async (event, id) => {
  const win = mainWindowFrom(event);
  const view = views.get(id);
  if (view && win) win.removeBrowserView(view);
  if (view) {
    view.webContents.destroy();
    views.delete(id);
  }
  const robot = robots.get(id);
  if (robot && win) win.removeBrowserView(robot);
  if (robot) {
    try {
      robot.webContents.destroy();
    } catch {
      /* skip */
    }
    robots.delete(id);
  }
  if (activeId === id) activeId = null;
  return { ok: true };
});

ipcMain.handle("painite:wipe-profile", async (_event, id) => {
  const key = String(id || "");
  if (!key) return { ok: false };
  try {
    const ses = session.fromPartition(`persist:fb-${key}`);
    await ses.clearStorageData();
    await ses.clearCache();
  } catch {}
  return { ok: true };
});

ipcMain.handle("painite:marketplace-post", async (event, input) => {
  if (!input?.id) throw new Error("Missing profile.");
  const win = mainWindowFrom(event);
  if (!win) return { ok: false };
  if (input.bounds) lastBounds = input.bounds;
  hideRentView(win);
  const view = await ensureView(input.id, input.proxy ?? null, MARKETPLACE_URL);
  attachView(win, view);
  activeId = input.id;
  const listing = input.listing || {};
  let here = view.webContents.getURL() || "";
  if (!/marketplace\/create/i.test(here)) {
    if (!here || here === "about:blank") await waitLoad(view.webContents);
    here = view.webContents.getURL() || "";
  }
  if (!/marketplace\/create/i.test(here)) {
    view.webContents.loadURL(input.url || MARKETPLACE_URL, { httpReferrer: FACEBOOK_URL });
    await waitLoad(view.webContents);
  }
  await waitMarketplaceComposer(view.webContents);
  await new Promise((resolve) => setTimeout(resolve, 1600));
  const images = Array.isArray(listing.images) && listing.images.length
    ? listing.images
    : listing.image_url
      ? [listing.image_url]
      : [];
  for (const src of images.slice(0, 12)) {
    const filePath = await materializeImage(src);
    if (!filePath) continue;
    await attachImage(view, filePath);
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  const hideZillow = (text) =>
    String(text || "")
      .replace(/https?:\/\/[^\s]*zillow[^\s]*/gi, "")
      .replace(/\b(?:www\.)?zillow\.[^\s]+/gi, "")
      .replace(/original listing link:?/gi, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  const payload = JSON.stringify({
    title: hideZillow(listing.title || listing.address || "Rental Property"),
    address: hideZillow(listing.address || ""),
    price: String(listing.price || "").replace(/[^\d]/g, ""),
    beds: String(listing.beds || "").replace(/[^\d]/g, ""),
    baths: String(listing.baths || "").replace(/[^\d.]/g, ""),
    sqft: String(listing.sqft || "").replace(/[^\d]/g, ""),
    description: hideZillow(
      [
        listing.title && listing.title !== listing.address ? listing.title : "",
        listing.address ? `Address: ${listing.address}` : "",
        listing.price ? `Rent: ${listing.price}` : "",
        listing.beds ? `Bedrooms: ${listing.beds}` : "",
        listing.baths ? `Bathrooms: ${listing.baths}` : "",
        listing.sqft ? `Square Feet: ${listing.sqft} sqft` : "",
        listing.facts ? `\nAbout the Property & Lease Terms:\n${listing.facts}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    ),
  });
  await view.webContents.executeJavaScript(`(async () => {
    const listing = ${payload};
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const setReact = (el, value) => {
      if (!el || value === undefined || value === null) return;
      el.focus();
      const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, "value");
      desc && desc.set && desc.set.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    const labeled = (re) => [...document.querySelectorAll("input, textarea, [contenteditable='true']")].find((n) => {
      const blob = ((n.getAttribute("aria-label") || "") + " " + (n.getAttribute("placeholder") || "") + " " + (n.closest("label")?.textContent || "") + " " + (n.name || "")).toLowerCase();
      return re.test(blob);
    });
    const inForm = (el) => {
      if (!el || !el.getBoundingClientRect) return false;
      const r = el.getBoundingClientRect();
      if (r.width < 40 || r.height < 12) return false;
      if (r.top < 96) return false;
      if (r.left > innerWidth * 0.58) return false;
      const blob = ((el.getAttribute("aria-label") || "") + " " + (el.getAttribute("placeholder") || "")).toLowerCase();
      if (/search facebook|search marketplace|^search$/.test(blob)) return false;
      if (el.closest("header, [role='banner'], [role='search']")) return false;
      return true;
    };
    const tap = (re) => {
      const el = [...document.querySelectorAll('[role="button"], [role="radio"], [role="option"], button, span, div')].find((n) => {
        if (!inForm(n)) return false;
        const txt = (n.textContent || "").trim();
        const aria = (n.getAttribute("aria-label") || "").trim();
        return re.test(txt) || re.test(aria);
      });
      if (el) {
        el.click();
        return true;
      }
      return false;
    };
    async function pickCombo(labelRe, optionRe) {
      const btn = [...document.querySelectorAll('[role="combobox"], [aria-haspopup="listbox"], label, div')].find((n) => {
        if (!inForm(n)) return false;
        const text = ((n.getAttribute("aria-label") || "") + " " + (n.textContent || "")).replace(/\\s+/g, " ").trim().slice(0, 200);
        return labelRe.test(text);
      });
      if (!btn) return false;
      btn.scrollIntoView({ block: "center" });
      btn.click();
      await sleep(450);
      const hit = [...document.querySelectorAll('[role="option"]')].find((n) => optionRe.test((n.textContent || "").trim()));
      if (hit) {
        hit.click();
        await sleep(400);
        return true;
      }
      return false;
    }

    await pickCombo(/home for sale or rent|for sale or rent/i, /^rent$/i);
    await sleep(500);
    await pickCombo(/rental type|property type/i, /^house$/i);
    await sleep(300);

    // Step 2: Fill Title
    setReact(labeled(/title|listing title|property title|listing name/i), listing.title);

    // Step 3: Fill Price
    setReact(labeled(/price|rent|monthly rent/i), listing.price);

    // Step 4: Location search box — type then pick Facebook Places suggestion
    async function fillAddress() {
      if (!listing.address) return;
      const priceEl = labeled(/price|rent|monthly rent/i);
      const descEl = labeled(/description|more details|about this rental|property description/i);
      const pr = priceEl && priceEl.getBoundingClientRect();
      const dr = descEl && descEl.getBoundingClientRect();
      const loc = [...document.querySelectorAll("input")].find((n) => {
        if (!inForm(n)) return false;
        const blob = (
          (n.getAttribute("aria-label") || "") + " " +
          (n.getAttribute("placeholder") || "") + " " +
          (n.closest("label")?.textContent || "")
        ).toLowerCase();
        if (/search facebook|search marketplace|^search$|description|title|price|bedroom|bathroom|sqft|square/.test(blob)) return false;
        const r = n.getBoundingClientRect();
        if (pr && dr && (r.top < pr.bottom - 12 || r.top > dr.top + 24)) return false;
        if (pr && !dr && r.top < pr.bottom - 12) return false;
        return n.getAttribute("role") === "combobox"
          || /location|neighborhood|city|address|where/.test(blob)
          || n.getAttribute("aria-autocomplete") === "list"
          || (pr && dr);
      });
      if (!loc) return;
      loc.scrollIntoView({ block: "center" });
      loc.focus();
      loc.click();
      await sleep(200);
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter && setter.call(loc, "");
      loc.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }));
      await sleep(80);
      setter && setter.call(loc, listing.address);
      loc.dispatchEvent(new InputEvent("input", { bubbles: true, data: listing.address, inputType: "insertFromPaste" }));
      loc.dispatchEvent(new Event("change", { bubbles: true }));
      await sleep(1400);
      let opts = [];
      for (let i = 0; i < 12; i++) {
        opts = [...document.querySelectorAll('[role="listbox"] [role="option"], [role="option"]')];
        if (opts.length) break;
        await sleep(200);
      }
      const addr = listing.address.toLowerCase();
      const zip = (listing.address.match(/\\d{5}/) || [])[0];
      const hit = opts.find((o) => zip && (o.textContent || "").includes(zip))
        || opts.find((o) => {
          const t = (o.textContent || "").toLowerCase();
          return addr.split(",").some((part) => part.trim().length > 5 && t.includes(part.trim().slice(0, 16)));
        })
        || opts[0];
      if (hit) {
        hit.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        hit.click();
        await sleep(400);
        return;
      }
      loc.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", code: "ArrowDown", bubbles: true }));
      await sleep(200);
      loc.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
      await sleep(300);
    }
    await fillAddress();

    // Step 5: Fill Bedrooms count
    if (listing.beds) {
      const bedsInput = labeled(/number of bedrooms|bedrooms|beds/i);
      if (bedsInput) {
        setReact(bedsInput, listing.beds);
      } else {
        // May be a dropdown
        const bedsDropdown = [...document.querySelectorAll('[role="combobox"], [aria-haspopup="listbox"], div')].find((n) => /bedrooms|beds/i.test(n.textContent || ""));
        if (bedsDropdown) {
          bedsDropdown.click();
          await sleep(300);
          const bedOpt = [...document.querySelectorAll('[role="option"], span')].find((n) => (n.textContent || "").trim() === listing.beds);
          if (bedOpt) bedOpt.click();
          await sleep(200);
        }
      }
    }

    // Step 6: Fill Bathrooms count
    if (listing.baths) {
      const bathsInput = labeled(/number of bathrooms|bathrooms|baths/i);
      if (bathsInput) {
        setReact(bathsInput, listing.baths);
      } else {
        const bathsDropdown = [...document.querySelectorAll('[role="combobox"], [aria-haspopup="listbox"], div')].find((n) => /bathrooms|baths/i.test(n.textContent || ""));
        if (bathsDropdown) {
          bathsDropdown.click();
          await sleep(300);
          const bathOpt = [...document.querySelectorAll('[role="option"], span')].find((n) => (n.textContent || "").trim() === listing.baths);
          if (bathOpt) bathOpt.click();
          await sleep(200);
        }
      }
    }

    // Step 7: Fill Square feet
    if (listing.sqft) {
      const sqftInput = labeled(/square feet|sqft|property square feet/i);
      if (sqftInput) setReact(sqftInput, listing.sqft);
    }

    // Step 8: Fill Description (handles textarea or contenteditable div)
    const desc = labeled(/description|more details|about this rental|property description/i);
    if (desc) {
      if (desc.getAttribute && desc.getAttribute("contenteditable") === "true") {
        desc.focus();
        desc.textContent = listing.description;
        desc.dispatchEvent(new InputEvent("input", { bubbles: true }));
      } else {
        setReact(desc, listing.description);
      }
    }

    await sleep(600);
    return true;
  })()`);
  return { ok: true };
});

ipcMain.handle("painite:messenger-scrape", async () => {
  if (!activeId) return { name: "", text: "", link: "" };
  const view = views.get(activeId);
  if (!view) return { name: "", text: "", link: "" };
  try {
    return await view.webContents.executeJavaScript(MESSENGER_SCRAPE_JS, true);
  } catch {
    return { name: "", text: "", link: "" };
  }
});

ipcMain.handle("painite:messenger-send", async (_event, text) => {
  if (!activeId || !text) return false;
  const view = views.get(activeId);
  if (!view) return false;
  try {
    return await view.webContents.executeJavaScript(sendScript(text), true);
  } catch {
    return false;
  }
});

ipcMain.handle("painite:robot-start", async (_event, input) => {
  if (!input?.id) return { ok: false };
  await ensureRobot(input.id, input.proxy ?? null);
  return { ok: true };
});

ipcMain.handle("painite:robot-stop", async (event, id) => {
  const view = robots.get(id);
  if (!view) return { ok: true };
  const win = mainWindowFrom(event) || BrowserWindow.getAllWindows()[0];
  if (win) win.removeBrowserView(view);
  try {
    view.webContents.destroy();
  } catch {
    /* skip */
  }
  robots.delete(id);
  return { ok: true };
});

ipcMain.handle("painite:robot-scrape", async (_event, id) => {
  const view = robots.get(id);
  if (!view) return { name: "", text: "", link: "", listing_url: "", listing_id: "", listing_title: "", listing_price: "" };
  try {
    return await view.webContents.executeJavaScript(MESSENGER_SCRAPE_JS, true);
  } catch {
    return { name: "", text: "", link: "", listing_url: "", listing_id: "", listing_title: "", listing_price: "" };
  }
});

ipcMain.handle("painite:robot-open-unread", async (_event, id) => {
  const view = robots.get(id);
  if (!view) return false;
  try {
    return await view.webContents.executeJavaScript(MESSENGER_OPEN_UNREAD_JS, true);
  } catch {
    return false;
  }
});

ipcMain.handle("painite:robot-send", async (_event, input) => {
  const view = robots.get(input?.id);
  if (!view || !input?.text) return false;
  try {
    return await view.webContents.executeJavaScript(sendScript(input.text), true);
  } catch {
    return false;
  }
});

ipcMain.handle("painite:robot-send-photos", async (_event, input) => {
  const view = robots.get(input?.id);
  if (!view) return false;
  const images = Array.isArray(input?.images) ? input.images.filter(Boolean) : [];
  if (!images.length) return false;
  try {
    return await sendMessengerPhotos(view, images);
  } catch {
    return false;
  }
});

ipcMain.handle("painite:capture-inbox", async (_event, id) => {
  const view = robots.get(id) || views.get(id);
  if (!view) return "";
  try {
    const image = await view.webContents.capturePage();
    return image.toDataURL();
  } catch {
    return "";
  }
});

ipcMain.handle("painite:rent-show", async (event) => {
  const win = mainWindowFrom(event);
  if (win) hideRentView(win);
  return { ok: true };
});

ipcMain.handle("painite:rent-hide", async (event) => {
  const win = mainWindowFrom(event);
  if (win) hideRentView(win);
  return { ok: true };
});

ipcMain.handle("painite:rent-back", async () => {
  if (!rentView) return { ok: false };
  const wc = rentView.webContents;
  if (wc.canGoBack()) wc.goBack();
  else wc.loadURL(ZILLOW_SIGNIN_URL);
  return { ok: true };
});

ipcMain.handle("painite:rent-listings", async () => {
  if (!rentView) return { ok: false };
  rentView.webContents.loadURL(ZILLOW_RENT_URL);
  return { ok: true };
});

ipcMain.handle("painite:rent-bounds", async (event, bounds) => {
  if (!bounds) return { ok: false };
  rentBounds = bounds;
  const win = mainWindowFrom(event);
  if (win && rentOn && rentView) rentView.setBounds(rentBounds);
  return { ok: true };
});

ipcMain.handle("painite:rent-scrape", async () => {
  if (!rentView) return [];
  try {
    return await rentView.webContents.executeJavaScript(RENT_SCRAPE_JS, true);
  } catch {
    return [];
  }
});

ipcMain.handle("painite:rent-reload", async () => {
  if (rentView && !rentView.webContents.isDestroyed()) {
    rentView.webContents.reload();
  }
  return { ok: true };
});

ipcMain.handle("painite:rent-clear", async () => {
  try {
    const ses = session.fromPartition("persist:rent-usa");
    await ses.clearStorageData({
      storages: ["cookies", "filesystem", "indexdb", "localstorage", "shadercache", "websql", "serviceworkers", "cachestorage"],
    });
    await ses.clearCache();
    await ses.clearAuthCache();
    if (rentView && !rentView.webContents.isDestroyed()) {
      try {
        await rentView.webContents.session.clearStorageData();
        await rentView.webContents.session.clearCache();
      } catch {}
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
});

ipcMain.handle("painite:rent-stealth-path", async () => {
  try {
    return await rentStealthPath();
  } catch {
    return "";
  }
});

ipcMain.handle("painite:fb-live-check", async (_event, id) => {
  const key = String(id || "");
  if (!key) return { uid: "", status: "", ok: true };
  try {
    const ses = session.fromPartition(`persist:fb-${key}`);
    const cookies = await ses.cookies.get({ domain: ".facebook.com" });
    const uid = String(cookies.find((item) => item.name === "c_user")?.value || "").replace(/\D/g, "");
    if (uid.length < 4) return { uid: "", status: "", ok: true };
    const res = await net.fetch("https://www.facebook.com/", {
      session: ses,
      headers: {
        "User-Agent": CHROME_UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    const finalUrl = String(res.url || "");
    const html = String(await res.text()).slice(0, 120000);
    const blob = `${finalUrl}\n${html}`.toLowerCase();
    const disabled =
      /account has been disabled|this account has been disabled|we suspended your account|unavailable because it was disabled|\/checkpoint\/block|hacked_and_disabled|disabled_checkpoint|your account is disabled/.test(
        blob,
      );
    if (disabled) return { uid, status: "suspend", ok: true };
    const loggedOut = /facebook\.com\/login|facebook\.com\/checkpoint\/1501092823525282/.test(finalUrl) && !/currentuserinitialdata|"actorid"/.test(blob);
    if (loggedOut) return { uid: "", status: "", ok: true };
    const hasSession = cookies.some((item) => item.name === "xs" && item.value);
    const livePage = /currentuserinitialdata|"actorid"|"userid":\s*"?\d+|news feed|marketplace/.test(blob);
    if (hasSession || livePage || /facebook\.com/.test(finalUrl)) {
      return { uid, status: "live", ok: true };
    }
    return { uid, status: "", ok: false };
  } catch {
    return { uid: "", status: "", ok: false };
  }
});

ipcMain.handle("painite:check-ip", async (_event, input) => {
  const partition = input?.id ? `persist:fb-${input.id}` : "persist:ip-check";
  const ses = session.fromPartition(partition);
  await applyProxy(ses, input?.proxy ?? null);
  const endpoints = [
    {
      url: "https://ipwho.is/",
      parse: (d) => ({
        ip: String(d.ip || ""),
        city: String(d.city || ""),
        country: String(d.country || d.country_code || ""),
      }),
    },
    {
      url: "http://ip-api.com/json/",
      parse: (d) => ({
        ip: String(d.query || ""),
        city: String(d.city || ""),
        country: String(d.country || d.countryCode || ""),
      }),
    },
    {
      url: "https://api.ipify.org?format=json",
      parse: (d) => ({
        ip: String(d.ip || ""),
        city: "",
        country: "",
      }),
    },
  ];
  for (const ep of endpoints) {
    try {
      const res = await net.fetch(ep.url, { session: ses });
      if (!res.ok) continue;
      const body = await res.json();
      const info = ep.parse(body);
      if (info.ip) {
        if (!info.country && info.ip) {
          try {
            const enrichRes = await net.fetch(`https://ipwho.is/${info.ip}`, { session: ses });
            if (enrichRes.ok) {
              const enrichData = await enrichRes.json();
              info.city = String(enrichData.city || "");
              info.country = String(enrichData.country || "");
            }
          } catch {}
        }
        return info;
      }
    } catch {}
  }
  throw new Error("IP check failed.");
});

app.on("web-contents-created", (_event, contents) => {
  attachStealth(contents);
  try {
    if (typeof contents.getType === "function" && contents.getType() === "webview") {
      attachContextMenu(contents);
    }
  } catch {
    /* skip */
  }
});

app.whenReady().then(async () => {
  try {
    const rentSes = session.fromPartition("persist:rent-usa");
    setupRentSession(rentSes);
    const stealth = await rentStealthPath();
    rentSes.setPreloads([stealth]);
  } catch {}

  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
