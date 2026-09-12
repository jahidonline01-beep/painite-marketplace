export const DESKS = ["rent", "post", "facebook", "lead"] as const;
export type DeskId = (typeof DESKS)[number];

const KEY = "painite.desk";
const SEND_KEY = "painite.fb.send";

export type FacebookSendJob = {
  id: string;
  listing: {
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
};

export function readDesk(): DeskId {
  if (typeof window === "undefined") return "rent";
  try {
    const value = window.sessionStorage.getItem(KEY);
    if (value === "rent" || value === "post" || value === "facebook" || value === "lead") {
      return value;
    }
  } catch {
    /* ignore */
  }
  return "rent";
}

export function writeDesk(desk: DeskId) {
  try {
    window.sessionStorage.setItem(KEY, desk);
  } catch {
    /* ignore */
  }
}

export function requestFacebookSend(job: FacebookSendJob) {
  try {
    window.sessionStorage.setItem(SEND_KEY, JSON.stringify(job));
  } catch {
    /* ignore */
  }
  writeDesk("facebook");
  window.dispatchEvent(new CustomEvent("painite:open-facebook", { detail: job }));
}

export function takeFacebookSend(): FacebookSendJob | null {
  try {
    const raw = window.sessionStorage.getItem(SEND_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(SEND_KEY);
    return JSON.parse(raw) as FacebookSendJob;
  } catch {
    return null;
  }
}
