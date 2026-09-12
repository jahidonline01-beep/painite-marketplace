export type FacebookProxy = {
  host: string;
  port: number;
  protocol?: "http" | "socks5";
  username?: string;
  password?: string;
};

export type FacebookBounds = { x: number; y: number; width: number; height: number };

export type FacebookOpenPayload = {
  id: string;
  label: string;
  proxy: FacebookProxy | null;
  bounds?: FacebookBounds;
  url?: string;
};

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

export type MarketplaceListing = {
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
};

export type PainiteDesktop = {
  isDesktop: true;
  prepareFacebook: (input: { id: string; proxy: FacebookProxy | null }) => Promise<void>;
  showFacebook: (profile: FacebookOpenPayload) => Promise<void>;
  hideFacebook: () => Promise<void>;
  boundsFacebook: (bounds: FacebookBounds) => Promise<void>;
  reloadFacebook: (profile: FacebookOpenPayload) => Promise<void>;
  closeFacebook: (id: string) => Promise<void>;
  wipeFacebook: (id: string) => Promise<void>;
  postMarketplace: (input: FacebookOpenPayload & { listing: MarketplaceListing }) => Promise<{ ok: boolean }>;
  showRent: (input: { bounds: FacebookBounds; url?: string }) => Promise<void>;
  hideRent: () => Promise<void>;
  backRent: () => Promise<void>;
  reloadRent?: () => Promise<{ ok: boolean }>;
  clearRent?: () => Promise<{ ok: boolean; error?: string }>;
  getStealthPath?: () => Promise<string>;
  listingsRent: () => Promise<void>;
  boundsRent: (bounds: FacebookBounds) => Promise<void>;
  scrapeRent: () => Promise<RentListing[]>;
  scrapeMessenger: () => Promise<{ name: string; text: string; link: string; listing_url?: string; listing_id?: string; listing_title?: string; listing_price?: string }>;
  sendMessenger: (text: string) => Promise<boolean>;
  robotStart: (input: { id: string; proxy: FacebookProxy | null }) => Promise<void>;
  robotStop: (id: string) => Promise<void>;
  robotScrape: (id: string) => Promise<{
    name: string;
    text: string;
    link: string;
    listing_url?: string;
    listing_id?: string;
    listing_title?: string;
    listing_price?: string;
  }>;
  robotSend: (id: string, text: string) => Promise<boolean>;
  robotSendPhotos?: (id: string, images: string[]) => Promise<boolean>;
  robotOpenUnread?: (id: string) => Promise<boolean>;
  captureInbox: (id: string) => Promise<string>;
  checkFacebookLive?: (id: string) => Promise<{ uid: string; status: "" | "live" | "suspend"; ok?: boolean }>;
  checkIp: (input: { id: string; proxy: FacebookProxy | null }) => Promise<{
    ip: string;
    city: string;
    country: string;
  }>;
  copyText: (text: string) => Promise<boolean>;
  uiReady: () => Promise<void>;
  sessionGet: () => Promise<{ member?: LocalMemberLike; credsRaw?: string | null } | null>;
  sessionSet: (data: { member: LocalMemberLike; credsRaw?: string | null } | null) => Promise<boolean>;
  postsGet: () => Promise<unknown[]>;
  postsSet: (rows: unknown[]) => Promise<boolean>;
};

type LocalMemberLike = {
  id: string;
  displayName: string | null;
  primaryEmail: string | null;
  phone: string | null;
};

declare global {
  interface Window {
    painiteDesktop?: PainiteDesktop;
  }
}

export function getDesktop(): PainiteDesktop | undefined {
  if (typeof window === "undefined") return undefined;
  return window.painiteDesktop;
}

export function toProxy(profile: {
  proxy_host: string | null;
  proxy_port: number | null;
  proxy_protocol: string | null;
  proxy_username: string | null;
  proxy_password: string | null;
}): FacebookProxy | null {
  if (!profile.proxy_host || !profile.proxy_port) return null;
  return {
    host: profile.proxy_host,
    port: profile.proxy_port,
    protocol: profile.proxy_protocol === "socks5" ? "socks5" : "http",
    username: profile.proxy_username ?? undefined,
    password: profile.proxy_password ?? undefined,
  };
}
