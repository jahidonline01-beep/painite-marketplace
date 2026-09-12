import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireAdminToken } from "@/lib/admin";
import type { LeadInput } from "@/lib/leads";
import { cleanLead } from "@/lib/leads";

export type ListingContext = {
  title: string;
  address: string;
  price: string;
  beds: string;
  baths: string;
  sqft: string;
  facts: string;
  listing_url: string;
  facebook_url: string;
  listing_id: string;
  images?: string[];
};

export type RobotResult = {
  reply: string;
  lead: LeadInput;
  save: boolean;
};

export type RobotStage = "first" | "followup" | "got_phone";

const DEFAULT_GEMINI_KEY = "AQ.Ab8RN6IuCCmYpdmxvs8a3i5HGBtHXizxKpvJcyqgy4Npd6KBOg";

export const GREET = "Hi! Yes, this property is still available.";
export const ASK_PHONE =
  "Could you please share your cell number so that I can give you more details and arrange a quick viewing?";
export const ASK_PHONE_ALT = "Can we talk directly? Can you please provide the phone number?";
export const THANKS =
  "Thank you very much for your interest. I will message or call you soon. Thank you.";
export const PHOTO_REPLY = "Here are the photos of this property.";
export const OFF_TOPIC = "You can only ask me about this property.";

export type BotLang = "en" | "es" | "bn";

export function detectLang(text: string): BotLang {
  const blob = String(text || "");
  if (/[\u0980-\u09FF]/.test(blob)) return "bn";
  if (
    /[áéíóúñ¿¡]/i.test(blob) ||
    /\b(hola|gracias|cu[aá]nto|fotos?|imagen(?:es)?|n[uú]mero|disponible|renta|alquiler|me llamo|por favor)\b/i.test(blob)
  ) {
    return "es";
  }
  return "en";
}

export function linesFor(lang: BotLang) {
  if (lang === "es") {
    return {
      greet: "Hola. Sí, esta propiedad sigue disponible.",
      ask: "¿Puede compartir su número de celular para darle más detalles y coordinar una visita?",
      askAlt: "¿Podemos hablar directo? ¿Me comparte su número?",
      thanks: "Muchas gracias por su interés. Le escribiré o llamaré pronto. Gracias.",
      photos: "Aquí están las fotos de esta propiedad.",
      offTopic: "Solo puede preguntarme sobre esta propiedad.",
    };
  }
  if (lang === "bn") {
    return {
      greet: GREET,
      ask: "ভিউয়িং সেট করতে আপনার সেল নাম্বারটা কি দিতে পারবেন?",
      askAlt: "সরাসরি কথা বলতে পারি? ফোন নাম্বারটা কি দিবেন?",
      thanks: "আগ্রহের জন্য ধন্যবাদ। শিগগির মেসেজ বা কল করব।",
      photos: "এই প্রপার্টির ছবিগুলো দিলাম।",
      offTopic: "শুধু এই প্রপার্টি নিয়ে জিজ্ঞাসা করতে পারবেন।",
    };
  }
  return {
    greet: GREET,
    ask: ASK_PHONE,
    askAlt: ASK_PHONE_ALT,
    thanks: THANKS,
    photos: PHOTO_REPLY,
    offTopic: OFF_TOPIC,
  };
}

export function wantsPhotos(text: string) {
  const last = String(text || "")
    .split("\n")
    .slice(-8)
    .join(" ");
  return /\b(pic(?:s|ture|tures)?|photo(?:s)?|image(?:s)?|imgs?|fotos?|imagen(?:es)?|ছবি|send (?:me )?(?:the )?(?:pic|photo)|can i see|show me|más foto|mas foto)\b/i.test(
    last,
  );
}

export function stripClientLinks(text: string) {
  return String(text || "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\b(?:www\.)?zillow\.[^\s]+/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function extractName(text: string, fallback = "") {
  const hit = String(text || "").match(
    /(?:my name is|this is|i am|i'm|name['’]?s|soy|me llamo|mi nombre es|amar naam|আমার নাম)\s*[:\-–]?\s*([A-Za-z\u00C0-\u024F\u0980-\u09FF][A-Za-z\u00C0-\u024F\u0980-\u09FF .'-]{1,42})/i,
  );
  if (hit?.[1]) return hit[1].replace(/[.,!?].*$/, "").trim().slice(0, 80);
  return String(fallback || "").trim().slice(0, 80);
}

async function googleKey() {
  const env = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_KEY || "";
  if (env.trim()) return env.trim();
  const sql = await getSql();
  try {
    const rows = await sql<{ gemini_key: string | null }>`
      select gemini_key from admin_settings where id = 1 limit 1
    `;
    if (rows[0]?.gemini_key?.trim()) return rows[0].gemini_key.trim();
  } catch {
    /* use default */
  }
  return DEFAULT_GEMINI_KEY;
}

export function extractPhone(text: string) {
  const hit = String(text || "").match(/(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/);
  if (!hit) {
    const digits = String(text || "").match(/(?<!\d)\d{10,11}(?!\d)/);
    return digits ? digits[0] : "";
  }
  return hit[0].replace(/\D/g, "");
}

export function listingFacts(listing: ListingContext) {
  return [listing.beds && `${listing.beds} bed`, listing.baths && `${listing.baths} bath`, listing.address, listing.price]
    .filter(Boolean)
    .join(" · ");
}

export function firstReply(listing: ListingContext) {
  const facts = listingFacts(listing);
  return facts ? `${GREET} ${facts}. ${ASK_PHONE}` : `${GREET} ${ASK_PHONE}`;
}

function houseDetail(listing: ListingContext) {
  return [listing.beds && `${listing.beds} Bed`, listing.baths && `${listing.baths} Bath`, listing.sqft && `${listing.sqft} sqft`]
    .filter(Boolean)
    .join(" ");
}

function leadFrom(listing: ListingContext, extra: Partial<LeadInput>): LeadInput {
  return cleanLead({
    source: "marketplace",
    status: extra.status || "contacted",
    listing_url: listing.listing_url || extra.listing_url,
    fb_link: listing.facebook_url || extra.fb_link,
    address: listing.address || extra.address,
    budget: listing.price || extra.budget,
    body: extra.body || houseDetail(listing) || listing.facts,
    contact_name: extra.contact_name,
    contact_phone: extra.contact_phone,
    fb_name: extra.fb_name,
    profile_label: extra.profile_label,
    inbox_url: extra.inbox_url,
  });
}

function parseRobot(text: string, listing: ListingContext, fallback: Partial<LeadInput>, thread: string): RobotResult {
  const match = text.match(/\{[\s\S]*\}/);
  let parsed: Record<string, string> = {};
  if (match) {
    try {
      parsed = JSON.parse(match[0]) as Record<string, string>;
    } catch {
      parsed = {};
    }
  }
  const reply = stripClientLinks(String(parsed.reply || text.replace(/```[\s\S]*```/g, "").trim())).slice(0, 700);
  const phone = extractPhone(parsed.contact_phone || fallback.contact_phone || thread);
  const givenName = extractName(parsed.contact_name || thread, fallback.contact_name || "");
  return {
    reply,
    save: Boolean(phone),
    lead: leadFrom(listing, {
      ...fallback,
      contact_name: givenName || fallback.contact_name,
      contact_phone: phone,
      fb_name: parsed.fb_name || fallback.fb_name,
      fb_link: listing.facebook_url || parsed.fb_link || fallback.fb_link,
      listing_url: listing.listing_url,
      budget: listing.price || parsed.budget || fallback.budget,
      address: listing.address || parsed.address || fallback.address,
      body: houseDetail(listing) || parsed.notes || parsed.body || fallback.body,
      status: (parsed.status as LeadInput["status"]) || (phone ? "interested" : "contacted"),
    }),
  };
}

const SYSTEM = `You are a professional human leasing agent for a US real estate agency on Facebook Messenger.

Default language: US English.
If the customer writes in another language, understand it and reply in THAT language. Do not mix languages in one reply.

Mission:
- Talk like a real person about THIS Facebook Marketplace post only.
- Use ONLY DETECTED PROPERTY for rent/amount, beds, baths, address, and facts. That amount is the Facebook post price. Never invent pricing.
- Collect full name and cell number to schedule a viewing.
- Fill JSON lead fields from the conversation + DETECTED PROPERTY.

Hard limits:
- NEVER send Zillow links, Google links, other listing links, or any URL in "reply".
- NEVER mention Zillow.
- NEVER search the web. NEVER offer a different property.
- If they ask for other listings, other links, or change the subject, reply with ONLY this sentence in the customer's language:
  "You can only ask me about this property."
  Do not use that sentence unless they went off-topic.
- If they ask about THIS post (rent, photos, utilities, location, availability, viewing), answer normally and still ask for name/phone if missing.
- Photos of THIS post are attached in Messenger separately. Do not invent photo links.
- Never say you are an AI.

First customer message (if you must greet): start with "Hi! Yes, this property is still available."
Ask for a phone with:
"Could you please share your cell number so that I can give you more details and arrange a quick viewing?"
or "Can we talk directly? Can you please provide the phone number?"
Translate those asks if the customer is not writing English.
When name and phone are both known, reply:
"Thank you very much for your interest. I will message or call you soon. Thank you."
Translate if the customer is not writing English.

INTERNAL URLs in DETECTED PROPERTY are for JSON only. Put listing_url and fb_link in JSON. Never put them in reply.

Return ONLY JSON:
{"reply":"","contact_name":"","contact_phone":"","fb_name":"","fb_link":"","budget":"","address":"","listing_url":"","status":"contacted","notes":""}`;

function listingBlock(listing: ListingContext) {
  return `DETECTED PROPERTY (this Facebook Marketplace post — never send URLs to the customer):
Title: ${listing.title || "n/a"}
Address: ${listing.address || "n/a"}
Rent / amount (use this exact amount): ${listing.price || "n/a"}
Beds: ${listing.beds || "n/a"}
Baths: ${listing.baths || "n/a"}
Sqft: ${listing.sqft || "n/a"}
Facts: ${listing.facts || "n/a"}
INTERNAL Zillow URL (JSON listing_url only, never in reply): ${listing.listing_url || "n/a"}
INTERNAL Facebook URL (JSON fb_link only, never in reply): ${listing.facebook_url || "n/a"}`;
}

function geminiHeaders(key: string) {
  return {
    "Content-Type": "application/json",
    "X-goog-api-key": key,
  };
}

async function readGemini(res: Response) {
  const body = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    error?: { message?: string };
  };
  return body.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function geminiReply(key: string, prompt: string) {
  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent";
  const payload = {
    contents: [{ parts: [{ text: `${SYSTEM}\n\n${prompt}` }] }],
  };
  let last = "Google AI failed.";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const res = await fetch(url, {
      method: "POST",
      headers: geminiHeaders(key),
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const text = await readGemini(res);
      if (text) return text;
      last = "Google AI returned empty.";
    } else {
      last = `Google AI ${res.status}`;
      if (res.status !== 503 && res.status !== 429) break;
    }
    await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
  }
  throw new Error(last);
}

async function grokReply(prompt: string) {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return "";
  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "grok-4.5",
      max_tokens: 280,
      temperature: 0.3,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) return "";
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return body.choices?.[0]?.message?.content || "";
}

export const robotReply = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: {
    thread: string;
    profile: string;
    stage?: RobotStage;
    phone?: string;
    customerName?: string;
    customerLink?: string;
    listing?: Partial<ListingContext>;
  }) => ({
    thread: String(input.thread || "").slice(0, 3500),
    profile: String(input.profile || "").slice(0, 40),
    stage: (input.stage || "followup") as RobotStage,
    phone: extractPhone(input.phone || ""),
    customerName: String(input.customerName || "").slice(0, 80),
    customerLink: String(input.customerLink || "").slice(0, 500),
    listing: {
      title: String(input.listing?.title || "").slice(0, 160),
      address: String(input.listing?.address || "").slice(0, 200),
      price: String(input.listing?.price || "").slice(0, 40),
      beds: String(input.listing?.beds || "").slice(0, 12),
      baths: String(input.listing?.baths || "").slice(0, 12),
      sqft: String(input.listing?.sqft || "").slice(0, 20),
      facts: String(input.listing?.facts || "").slice(0, 800),
      listing_url: String(input.listing?.listing_url || "").slice(0, 500),
      facebook_url: String(input.listing?.facebook_url || "").slice(0, 500),
      listing_id: String(input.listing?.listing_id || "").slice(0, 40),
    } satisfies ListingContext,
  }))
  .handler(async ({ data }) => {
    const listing = data.listing;
    const phone = data.phone || extractPhone(data.thread);
    const givenName = extractName(data.thread, data.customerName);
    const lang = detectLang(data.thread);
    const say = linesFor(lang);
    const baseLead = leadFrom(listing, {
      profile_label: data.profile,
      contact_name: givenName || data.customerName,
      contact_phone: phone,
      fb_name: data.customerName,
      fb_link: listing.facebook_url || data.customerLink,
      status: phone ? "interested" : "contacted",
    });

    if (data.stage === "got_phone" || phone) {
      return {
        reply: say.thanks,
        lead: { ...baseLead, contact_phone: phone || baseLead.contact_phone, contact_name: givenName || baseLead.contact_name },
        save: Boolean(phone),
      };
    }
    if (data.stage === "first") {
      return { reply: firstReply(listing), lead: baseLead, save: false };
    }

    const prompt = `Profile: ${data.profile}
Customer name: ${data.customerName || "unknown"}
Customer Facebook: ${data.customerLink || "unknown"}
Stage: follow-up (greeting already sent)
${listingBlock(listing)}

Messenger thread:
${data.thread}`;

    const key = await googleKey();
    let text = "";
    try {
      text = key ? await geminiReply(key, prompt) : "";
    } catch {
      text = await grokReply(prompt);
    }
    if (!text) text = await grokReply(prompt);
    if (!text) {
      return { reply: `${listingFacts(listing) || GREET} ${say.askAlt}`, lead: baseLead, save: false };
    }
    const result = parseRobot(text, listing, baseLead, data.thread);
    result.lead.profile_label = data.profile;
    result.lead.listing_url = listing.listing_url || result.lead.listing_url;
    result.lead.fb_link = listing.facebook_url || result.lead.fb_link;
    result.lead.budget = listing.price || result.lead.budget;
    result.lead.address = listing.address || result.lead.address;
    result.lead.body = houseDetail(listing) || result.lead.body;
    result.reply = stripClientLinks(result.reply);
    if (!result.lead.body) result.lead.body = data.thread.slice(-500);
    if (!result.lead.contact_phone) result.save = false;
    return result;
  });

export const saveGeminiKey = createServerFn({ method: "POST" })
  .validator((input: { token: string; key: string }) => ({
    token: input.token,
    key: input.key.trim().slice(0, 200),
  }))
  .handler(async ({ data }) => {
    await requireAdminToken(data.token);
    const sql = await getSql();
    await sql`alter table admin_settings add column if not exists gemini_key text`;
    await sql`
      update admin_settings set gemini_key = ${data.key || null}, updated_at = now() where id = 1
    `;
    return { ok: true as const };
  });

export const geminiKeySet = createServerFn({ method: "POST" })
  .validator((token: string) => token)
  .handler(async ({ data: token }) => {
    await requireAdminToken(token);
    const key = await googleKey();
    return { set: Boolean(key) };
  });
