import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireAdminToken } from "@/lib/admin";
import { pushCloudLead, requireFreshApp } from "@/lib/cloud";

export const LEAD_SOURCES = [
  { id: "marketplace", label: "Facebook Marketplace" },
  { id: "zillow", label: "Zillow" },
  { id: "own", label: "Own post" },
] as const;

export const PROPERTY_TYPES = [
  { id: "1bed", label: "1 Bed" },
  { id: "2bed", label: "2 Bed" },
  { id: "3bed", label: "3 Bed" },
  { id: "share", label: "Share" },
] as const;

export const LEAD_STATUSES = [
  { id: "new", label: "New" },
  { id: "contacted", label: "Contacted" },
  { id: "interested", label: "Interested" },
  { id: "invalid", label: "Invalid" },
] as const;

export type LeadSource = (typeof LEAD_SOURCES)[number]["id"];
export type PropertyType = (typeof PROPERTY_TYPES)[number]["id"];
export type LeadStatus = (typeof LEAD_STATUSES)[number]["id"];

export type LeadInput = {
  source: LeadSource;
  listing_url: string;
  property_type: PropertyType;
  budget: string;
  status: LeadStatus;
  contact_name: string;
  contact_phone: string;
  body: string;
  profile_label: string;
  fb_name: string;
  fb_link: string;
  inbox_url: string;
  address: string;
};

export type LeadRow = LeadInput & {
  id: string;
  member_name: string;
  member_phone: string;
  created_at: string;
};

export type MemberLeadGroup = {
  user_id: string;
  name: string;
  phone: string;
  count: number;
  leads: LeadRow[];
};

function newId() {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  return `ld_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

function clip(raw: string, max: number) {
  return raw.replace(/\r\n/g, "\n").trim().slice(0, max);
}

function asSource(raw: string): LeadSource {
  return LEAD_SOURCES.some((item) => item.id === raw) ? (raw as LeadSource) : "marketplace";
}

function asType(raw: string): PropertyType {
  return PROPERTY_TYPES.some((item) => item.id === raw) ? (raw as PropertyType) : "1bed";
}

function asStatus(raw: string): LeadStatus {
  return LEAD_STATUSES.some((item) => item.id === raw) ? (raw as LeadStatus) : "new";
}

export function cleanLead(input: Partial<LeadInput>): LeadInput {
  return {
    source: asSource(String(input.source || "marketplace")),
    listing_url: clip(String(input.listing_url || ""), 500),
    property_type: asType(String(input.property_type || "1bed")),
    budget: clip(String(input.budget || ""), 40),
    status: asStatus(String(input.status || "new")),
    contact_name: clip(String(input.contact_name || ""), 80),
    contact_phone: clip(String(input.contact_phone || "").replace(/\D/g, ""), 20),
    body: clip(String(input.body || ""), 4000),
    profile_label: clip(String(input.profile_label || ""), 40),
    fb_name: clip(String(input.fb_name || ""), 80),
    fb_link: clip(String(input.fb_link || ""), 500),
    inbox_url: clip(String(input.inbox_url || ""), 500),
    address: clip(String(input.address || ""), 200),
  };
}

export const listMyLeads = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    return sql<LeadRow>`
      select id, member_name, member_phone, body,
             coalesce(source, 'marketplace') as source,
             coalesce(listing_url, '') as listing_url,
             coalesce(property_type, '1bed') as property_type,
             coalesce(budget, '') as budget,
             coalesce(status, 'new') as status,
             coalesce(contact_name, '') as contact_name,
             coalesce(contact_phone, '') as contact_phone,
             coalesce(profile_label, '') as profile_label,
             coalesce(fb_name, '') as fb_name,
             coalesce(fb_link, '') as fb_link,
             coalesce(inbox_url, '') as inbox_url,
             coalesce(address, '') as address,
             created_at::text as created_at
      from leads
      where user_id = ${context.userId}
      order by created_at desc
    `;
  });

export const submitLead = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: Partial<LeadInput>) => cleanLead(input))
  .handler(async ({ context, data }) => {
    if (!data.contact_name && !data.body && !data.contact_phone && !data.budget && !data.fb_name && !data.address) {
      throw new Error("Enter lead information.");
    }
    await requireFreshApp();
    const sql = await getSql();
    const profile = await sql<{ name: string; phone: string }>`
      select name, phone from profiles where user_id = ${context.userId} limit 1
    `;
    const name = profile[0]?.name || "Member";
    const phone = profile[0]?.phone || "";
    const id = newId();
    await sql`
      insert into leads (
        id, user_id, member_name, member_phone, body, source, listing_url,
        property_type, budget, status, contact_name, contact_phone, profile_label, fb_name, fb_link, inbox_url, address
      ) values (
        ${id}, ${context.userId}, ${name}, ${phone}, ${data.body}, ${data.source},
        ${data.listing_url}, ${data.property_type}, ${data.budget}, ${data.status},
        ${data.contact_name}, ${data.contact_phone}, ${data.profile_label}, ${data.fb_name}, ${data.fb_link}, ${data.inbox_url}, ${data.address}
      )
    `;
    const [{ n }] = await sql<{ n: number }>`
      select count(*)::int as n from leads where user_id = ${context.userId}
    `;
    await pushCloudLead({
      id,
      member_name: name,
      member_phone: phone,
      ...data,
      created_at: new Date().toISOString(),
    });
    return { ok: true as const, id, count: n };
  });

export const listAdminLeads = createServerFn({ method: "POST" })
  .validator((token: string) => token)
  .handler(async ({ data: token }) => {
    await requireAdminToken(token);
    const sql = await getSql();
    const members = await sql<{ user_id: string; name: string; phone: string }>`
      select user_id, name, phone from profiles order by name asc
    `;
    const rows = await sql<LeadRow & { user_id: string }>`
      select id, user_id, member_name, member_phone, body,
             coalesce(source, 'marketplace') as source,
             coalesce(listing_url, '') as listing_url,
             coalesce(property_type, '1bed') as property_type,
             coalesce(budget, '') as budget,
             coalesce(status, 'new') as status,
             coalesce(contact_name, '') as contact_name,
             coalesce(contact_phone, '') as contact_phone,
             coalesce(profile_label, '') as profile_label,
             coalesce(fb_name, '') as fb_name,
             coalesce(fb_link, '') as fb_link,
             coalesce(inbox_url, '') as inbox_url,
             coalesce(address, '') as address,
             created_at::text as created_at
      from leads
      order by created_at desc
    `;
    const groups: MemberLeadGroup[] = members.map((member) => ({
      user_id: member.user_id,
      name: member.name,
      phone: member.phone,
      count: rows.filter((row) => row.user_id === member.user_id).length,
      leads: rows.filter((row) => row.user_id === member.user_id),
    }));
    for (const row of rows) {
      if (groups.some((group) => group.user_id === row.user_id)) continue;
      groups.push({
        user_id: row.user_id,
        name: row.member_name,
        phone: row.member_phone,
        count: rows.filter((item) => item.user_id === row.user_id).length,
        leads: rows.filter((item) => item.user_id === row.user_id),
      });
    }
    return { total: rows.length, groups };
  });
