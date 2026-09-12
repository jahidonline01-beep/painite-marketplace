import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import type { RentListing } from "@/lib/zillow";

export type RentPostRow = {
  id: string;
  serial_no: number;
  zpid: string | null;
  title: string;
  address: string | null;
  price: string | null;
  beds: string | null;
  baths: string | null;
  sqft: string | null;
  facts: string | null;
  image_url: string | null;
  images?: string[];
  listing_url?: string | null;
  created_at: string;
};

function newId() {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  return `rp_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

function clip(raw: string, max: number) {
  return raw.replace(/\s+/g, " ").trim().slice(0, max);
}

export const listRentPosts = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    return sql<RentPostRow>`
      select id, serial_no, zpid, title, address, price, beds, baths, sqft, facts, image_url,
             created_at::text as created_at
      from rent_posts
      where user_id = ${context.userId}
      order by serial_no asc, created_at asc
    `;
  });

export const sendRentPosts = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: RentListing[]) =>
    input
      .map((row) => ({
        zpid: clip(row.zpid || "", 40),
        title: clip(row.title || row.address || "Listing", 160),
        address: clip(row.address || "", 160),
        price: clip(row.price || "", 40),
        beds: clip(row.beds || "", 12),
        baths: clip(row.baths || "", 12),
        sqft: clip(row.sqft || "", 20),
        facts: clip(row.facts || "", 2000),
        image_url: clip(row.image_url || "", 2000),
      }))
      .filter((row) => row.title),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const [{ max }] = await sql<{ max: number }>`
      select coalesce(max(serial_no), 0)::int as max
      from rent_posts
      where user_id = ${context.userId}
    `;
    let serial = Number(max);
    let added = 0;
    for (const row of data) {
      if (row.zpid) {
        const exists = await sql<{ id: string }>`
          select id from rent_posts
          where user_id = ${context.userId} and zpid = ${row.zpid}
          limit 1
        `;
        if (exists[0]) continue;
      }
      serial += 1;
      added += 1;
      const id = newId();
      await sql`
        insert into rent_posts (
          id, user_id, serial_no, zpid, title, address, price, beds, baths, sqft, facts, image_url
        ) values (
          ${id}, ${context.userId}, ${serial}, ${row.zpid || null}, ${row.title},
          ${row.address || null}, ${row.price || null}, ${row.beds || null}, ${row.baths || null},
          ${row.sqft || null}, ${row.facts || null}, ${row.image_url || null}
        )
      `;
    }
    return { ok: true as const, added };
  });

export const deleteRentPost = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => id.trim())
  .handler(async ({ context, data: id }) => {
    const sql = await getSql();
    await sql`delete from rent_posts where id = ${id} and user_id = ${context.userId}`;
    const left = await sql<{ id: string }>`
      select id from rent_posts
      where user_id = ${context.userId}
      order by serial_no asc, created_at asc
    `;
    let n = 1;
    for (const row of left) {
      await sql`update rent_posts set serial_no = ${n} where id = ${row.id}`;
      n += 1;
    }
    return { ok: true as const };
  });

export const updateRentPost = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: {
    id: string;
    title: string;
    address: string;
    price: string;
    beds: string;
    baths: string;
    sqft: string;
    facts: string;
    image_url: string;
  }) => ({
    id: input.id.trim(),
    title: clip(input.title || input.address || "Listing", 160),
    address: clip(input.address || "", 160),
    price: clip(input.price || "", 40),
    beds: clip(input.beds || "", 12),
    baths: clip(input.baths || "", 12),
    sqft: clip(input.sqft || "", 20),
    facts: clip(input.facts || "", 2000),
    image_url: String(input.image_url || "").slice(0, 1_500_000),
  }))
  .handler(async ({ context, data }) => {
    if (!data.id) throw new Error("Missing post.");
    const sql = await getSql();
    const rows = await sql<{ id: string }>`
      update rent_posts
      set title = ${data.title},
          address = ${data.address || null},
          price = ${data.price || null},
          beds = ${data.beds || null},
          baths = ${data.baths || null},
          sqft = ${data.sqft || null},
          facts = ${data.facts || null},
          image_url = ${data.image_url || null}
      where id = ${data.id} and user_id = ${context.userId}
      returning id
    `;
    if (!rows[0]) throw new Error("Post not found.");
    return { ok: true as const };
  });
