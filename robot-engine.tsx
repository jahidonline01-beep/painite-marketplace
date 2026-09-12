import { useEffect, useRef } from "react";
import {
  detectLang,
  extractName,
  extractPhone,
  linesFor,
  robotReply,
  wantsPhotos,
  type ListingContext,
  type RobotStage,
} from "@/lib/ai-robot";
import { getDesktop, toProxy } from "@/lib/desktop";
import { listFacebookProfiles, type FacebookProfileRow } from "@/lib/facebook-profiles";
import { getLocalMember } from "@/lib/app-core";
import { uploadInboxShot } from "@/lib/inbox";
import { clientListRentPosts, queueAiLead } from "@/lib/member-ops";

type ThreadSnap = {
  name: string;
  text: string;
  link: string;
  listing_url?: string;
  listing_id?: string;
  listing_title?: string;
  listing_price?: string;
};

type ThreadState = {
  greeted: boolean;
  saved: boolean;
  photosSent: boolean;
  lastText: string;
  lastReply: string;
};

type PostRow = {
  title: string;
  address: string | null;
  price: string | null;
  beds: string | null;
  baths: string | null;
  sqft: string | null;
  facts: string | null;
  listing_url?: string | null;
  image_url?: string | null;
  images?: string[];
};

function scorePost(post: PostRow, thread: ThreadSnap) {
  const blob = `${thread.text} ${thread.listing_title || ""} ${thread.listing_url || ""} ${thread.listing_price || ""}`.toLowerCase();
  let score = 0;
  const title = (post.title || "").toLowerCase();
  const address = (post.address || "").toLowerCase();
  const price = String(post.price || "").replace(/[^\d]/g, "");
  const zillow = (post.listing_url || "").toLowerCase();
  const item = (thread.listing_id || "").trim();
  if (item && zillow.includes(item)) score += 12;
  if (zillow && blob.includes(zillow.slice(0, 28))) score += 10;
  if (address && address.length > 6 && blob.includes(address.slice(0, 18))) score += 8;
  if (title && title.length > 4 && blob.includes(title.slice(0, 18))) score += 5;
  if (thread.listing_title && title && thread.listing_title.toLowerCase().includes(title.slice(0, 12))) score += 6;
  if (price && blob.includes(price)) score += 3;
  if (thread.listing_price && price && thread.listing_price.replace(/[^\d]/g, "") === price) score += 4;
  return score;
}

function matchListing(posts: PostRow[], thread: ThreadSnap): ListingContext {
  let best: PostRow | null = null;
  let top = 0;
  for (const post of posts) {
    const score = scorePost(post, thread);
    if (score > top) {
      top = score;
      best = post;
    }
  }
  if (!best && posts.length === 1 && (thread.listing_id || thread.listing_title)) best = posts[0];
  if (!best && top < 3) {
    return {
      title: thread.listing_title || "",
      address: "",
      price: thread.listing_price || "",
      beds: "",
      baths: "",
      sqft: "",
      facts: "",
      listing_url: "",
      facebook_url: thread.listing_url || "",
      listing_id: thread.listing_id || "",
      images: [],
    };
  }
  const post = best!;
  const photos = (post.images?.length ? post.images : post.image_url ? [post.image_url] : []).filter(Boolean);
  return {
    title: post.title || thread.listing_title || "",
    address: post.address || "",
    price: post.price || thread.listing_price || "",
    beds: post.beds || "",
    baths: post.baths || "",
    sqft: post.sqft || "",
    facts: post.facts || "",
    listing_url: post.listing_url || "",
    facebook_url: thread.listing_url || "",
    listing_id: thread.listing_id || "",
    images: photos,
  };
}

function isMarketplaceInquiry(thread: ThreadSnap) {
  if (thread.listing_id) return true;
  const blob = `${thread.listing_url || ""} ${thread.link || ""} ${thread.listing_title || ""}`.toLowerCase();
  return /marketplace/.test(blob);
}

function threadKey(profileId: string, thread: ThreadSnap) {
  return `${profileId}::${thread.listing_id || ""}::${thread.name || ""}::${thread.link || ""}`;
}

function overlayRobot(people: FacebookProfileRow[]) {
  try {
    const member = getLocalMember();
    const key = member?.phone || member?.id || "local";
    const raw = window.localStorage.getItem(`painite.fb.profiles.${key}`);
    const local = raw ? (JSON.parse(raw) as FacebookProfileRow[]) : [];
    const byId = new Map(people.map((row) => [row.id, row]));
    for (const row of local) {
      const cur = byId.get(row.id);
      if (cur) byId.set(row.id, { ...cur, auto_reply: row.auto_reply ? 1 : 0 });
      else byId.set(row.id, row);
    }
    return [...byId.values()];
  } catch {
    return people;
  }
}

export function RobotEngine() {
  const seen = useRef<Record<string, ThreadState>>({});
  const busy = useRef<Record<string, boolean>>({});

  useEffect(() => {
    const desktop = getDesktop();
    if (!desktop) return;
    const api = desktop;
    let cancelled = false;

    async function tick() {
      if (cancelled) return;
      const people = overlayRobot(await listFacebookProfiles().catch(() => [] as FacebookProfileRow[]));
      const live = people.filter((row) => row.auto_reply);
      const ids = new Set(live.map((row) => row.id));
      for (const row of people) {
        if (!ids.has(row.id)) await api.robotStop(row.id);
      }
      const posts = live.length ? await clientListRentPosts().catch(() => []) : [];
      for (const row of live) {
        await api.robotStart({ id: row.id, proxy: toProxy(row) });
        if (busy.current[row.id]) continue;
        let thread = (await api.robotScrape(row.id)) as ThreadSnap;
        if (!thread?.text && api.robotOpenUnread) {
          const opened = await api.robotOpenUnread(row.id);
          if (opened) {
            await new Promise((resolve) => setTimeout(resolve, 900));
            thread = (await api.robotScrape(row.id)) as ThreadSnap;
          }
        }
        if (!thread?.text) continue;
        if (!isMarketplaceInquiry(thread)) {
          if (api.robotOpenUnread) await api.robotOpenUnread(row.id);
          continue;
        }
        const key = threadKey(row.id, thread);
        const state = seen.current[key] || { greeted: false, saved: false, photosSent: false, lastText: "", lastReply: "" };
        if (thread.text === state.lastText) {
          if (api.robotOpenUnread) await api.robotOpenUnread(row.id);
          continue;
        }
        if (state.lastReply && thread.text.trim().endsWith(state.lastReply.slice(0, 48))) {
          seen.current[key] = { ...state, lastText: thread.text };
          continue;
        }
        busy.current[row.id] = true;
        try {
          const listing = matchListing(posts, thread);
          const phone = extractPhone(thread.text);
          const inbound = state.lastReply ? thread.text.split(state.lastReply).pop() || thread.text : thread.text;
          const askPics = wantsPhotos(inbound);
          const photos = (listing.images || []).filter(Boolean).slice(0, 6);
          const givenName = extractName(thread.text, thread.name);
          if (askPics && photos.length && api.robotSendPhotos) {
            await api.robotSendPhotos(row.id, photos);
            const say = linesFor(detectLang(inbound));
            const caption = phone ? say.photos : `${say.photos} ${say.ask}`;
            await api.robotSend(row.id, caption);
            seen.current[key] = {
              greeted: true,
              saved: state.saved,
              photosSent: true,
              lastText: thread.text,
              lastReply: caption.trim(),
            };
            queueAiLead({
              source: "marketplace",
              status: phone ? "interested" : "contacted",
              profile_label: row.label,
              fb_name: thread.name,
              fb_link: listing.facebook_url || thread.link,
              listing_url: listing.listing_url,
              address: listing.address,
              budget: listing.price,
              body: [listing.beds && `${listing.beds} Bed`, listing.baths && `${listing.baths} Bath`].filter(Boolean).join(" "),
              contact_name: givenName,
              contact_phone: phone,
            });
            continue;
          }
          const stage: RobotStage = phone ? "got_phone" : state.greeted ? "followup" : "first";
          const result = await robotReply({
            data: {
              thread: `${thread.name}\n${thread.link}\n${thread.listing_title || ""}\n${thread.listing_url || ""}\n${thread.text}`,
              profile: row.label,
              stage,
              phone,
              customerName: givenName || thread.name,
              customerLink: thread.link,
              listing,
            },
          });
          await api.robotSend(row.id, result.reply);
          const next: ThreadState = {
            greeted: true,
            saved: state.saved || result.save,
            photosSent: state.photosSent,
            lastText: thread.text,
            lastReply: result.reply.trim(),
          };
          seen.current[key] = next;
          let inbox_url = "";
          if (phone) {
            try {
              const shot = await api.captureInbox(row.id);
              if (shot) inbox_url = (await uploadInboxShot({ data: { dataUrl: shot } })).url;
            } catch {
              /* queue still saves */
            }
          }
          queueAiLead({
            ...result.lead,
            source: "marketplace",
            status: phone ? "interested" : "contacted",
            profile_label: row.label,
            fb_name: result.lead.fb_name || thread.name,
            fb_link: result.lead.fb_link || listing.facebook_url || thread.link,
            listing_url: listing.listing_url || result.lead.listing_url,
            address: listing.address || result.lead.address,
            budget: listing.price || result.lead.budget,
            body: result.lead.body || [listing.beds && `${listing.beds} Bed`, listing.baths && `${listing.baths} Bath`].filter(Boolean).join(" "),
            contact_name: result.lead.contact_name || givenName,
            contact_phone: result.lead.contact_phone || phone,
            inbox_url,
          });
        } catch {
          /* keep ticking */
        } finally {
          busy.current[row.id] = false;
        }
      }
    }

    void tick();
    const timer = window.setInterval(() => void tick(), 12000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return null;
}
