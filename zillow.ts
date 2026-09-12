export const CHROME_VER = "134.0.0.0";
export const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36";

export const ZILLOW_SIGNIN_URL = "https://www.zillow.com/user/signin/";
export const ZILLOW_RENT_URL =
  "https://www.zillow.com/homes/for_rent/?searchQueryState=%7B%22mapBounds%22%3A%7B%22north%22%3A40.909919%2C%22south%22%3A40.895244%2C%22east%22%3A-73.844728%2C%22west%22%3A-73.881033%7D%2C%22regionSelection%22%3A%5B%7B%22regionId%22%3A61810%2C%22regionType%22%3A7%7D%5D%2C%22filterState%22%3A%7B%22fr%22%3A%7B%22value%22%3Atrue%7D%2C%22fsba%22%3A%7B%22value%22%3Afalse%7D%2C%22fsbo%22%3A%7B%22value%22%3Afalse%7D%2C%22nc%22%3A%7B%22value%22%3Afalse%7D%2C%22cmsn%22%3A%7B%22value%22%3Afalse%7D%2C%22auc%22%3A%7B%22value%22%3Afalse%7D%2C%22fore%22%3A%7B%22value%22%3Afalse%7D%2C%22beds%22%3A%7B%22min%22%3A2%7D%2C%22baths%22%3A%7B%22min%22%3A1%7D%7D%2C%22mapZoom%22%3A16%2C%22usersSearchTerm%22%3A%22New+York+NY+10470%22%7D";

export type RentListing = {
  zpid: string;
  title: string;
  address: string;
  price: string;
  beds: string;
  baths: string;
  sqft: string;
  facts: string;
  image_url: string;
  images?: string[];
  listing_url?: string;
  picked?: boolean;
};

export const RENT_SCRAPE_JS = `(() => {
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
