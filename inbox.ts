import { createServerFn } from "@tanstack/react-start";
import { getDownloadURL, getStorage, ref, uploadString } from "firebase/storage";
import { authMiddleware } from "@/lib/auth/middleware";
import { getFirebaseApp } from "@/lib/firebase";

function toBlob(dataUrl: string) {
  const [head, body] = dataUrl.split(",");
  const mime = /data:(.*?);/.exec(head || "")?.[1] || "image/jpeg";
  const bytes = Buffer.from(body || "", "base64");
  return { mime, bytes };
}

function pickDirect(raw: unknown): string {
  if (!raw) return "";
  if (typeof raw === "string") {
    const text = raw.trim();
    const direct = text.match(/https?:\/\/i\.postimg\.cc\/[^\s"'<>]+/i);
    if (direct) return direct[0].replace(/[),.;]+$/, "");
    const any = text.match(/https?:\/\/(?:www\.)?postimg(?:es)?\.(?:cc|org)\/[^\s"'<>]+/i);
    if (any) return any[0].replace(/[),.;]+$/, "");
    if (/^https?:\/\//i.test(text) && text.length < 500) return text;
    try {
      return pickDirect(JSON.parse(text));
    } catch {
      return "";
    }
  }
  if (typeof raw === "object") {
    const row = raw as Record<string, unknown>;
    const nested = [row.url_direct, row.direct, row.url_full, row.full, row.image, row.url, row.link];
    for (const item of nested) {
      const hit = pickDirect(item);
      if (hit) return hit;
    }
  }
  return "";
}

async function uploadPostimages(dataUrl: string) {
  const { mime, bytes } = toBlob(dataUrl);
  const file = new Blob([bytes], { type: mime });
  const endpoints = ["https://postimages.org/json/rr", "https://postimg.cc/json/rr"];
  for (const endpoint of endpoints) {
    const form = new FormData();
    form.append("upload", file, "inbox.jpg");
    form.append("numfiles", "1");
    form.append("optsize", "0");
    form.append("expire", "0");
    form.append("session_upload", String(Date.now()));
    const res = await fetch(endpoint, { method: "POST", body: form });
    const text = await res.text();
    const url = pickDirect(text);
    if (url) return url;
  }
  throw new Error("Postimages upload failed.");
}

async function uploadCatbox(dataUrl: string) {
  const { mime, bytes } = toBlob(dataUrl);
  const form = new FormData();
  form.append("reqtype", "fileupload");
  form.append("fileToUpload", new Blob([bytes], { type: mime }), "inbox.jpg");
  const res = await fetch("https://catbox.moe/user/api.php", { method: "POST", body: form });
  const url = (await res.text()).trim();
  if (!res.ok || !url.startsWith("http")) throw new Error("Screenshot upload failed.");
  return url;
}

async function uploadFirebase(dataUrl: string) {
  const storage = getStorage(getFirebaseApp());
  const id = `shot_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const file = ref(storage, `screenshots/${id}.jpg`);
  await uploadString(file, dataUrl, "data_url", { contentType: "image/jpeg" });
  return getDownloadURL(file);
}

export const uploadInboxShot = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { dataUrl: string }) => ({
    dataUrl: input.dataUrl.slice(0, 2_500_000),
  }))
  .handler(async ({ data }) => {
    if (!data.dataUrl.startsWith("data:image/")) throw new Error("Need an image.");
    try {
      return { url: await uploadPostimages(data.dataUrl) };
    } catch {
      try {
        return { url: await uploadFirebase(data.dataUrl) };
      } catch {
        return { url: await uploadCatbox(data.dataUrl) };
      }
    }
  });