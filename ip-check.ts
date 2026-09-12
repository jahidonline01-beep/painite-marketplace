import { getDesktop, type FacebookProxy } from "@/lib/desktop";

export type IpInfo = {
  ip: string;
  city: string;
  country: string;
};

function readIp(data: Record<string, unknown>): IpInfo | null {
  const ip = String(data.ip || data.query || "").trim();
  if (!ip) return null;
  return {
    ip,
    city: String(data.city || ""),
    country: String(data.country_name || data.country || data.countryCode || ""),
  };
}

async function fetchIp() {
  const endpoints = [
    {
      url: "https://ipwho.is/",
      parse: (d: any) => ({
        ip: String(d.ip || ""),
        city: String(d.city || ""),
        country: String(d.country || d.country_code || ""),
      }),
    },
    {
      url: "http://ip-api.com/json/",
      parse: (d: any) => ({
        ip: String(d.query || ""),
        city: String(d.city || ""),
        country: String(d.country || d.countryCode || ""),
      }),
    },
    {
      url: "https://api.ipify.org?format=json",
      parse: (d: any) => ({
        ip: String(d.ip || ""),
        city: "",
        country: "",
      }),
    },
  ];

  for (const ep of endpoints) {
    try {
      const response = await fetch(ep.url);
      if (!response.ok) continue;
      const data = await response.json();
      const info = ep.parse(data);
      if (info.ip) {
        // If city or country is missing, try enriching with ipwho.is using the ip
        if (!info.country && info.ip) {
          try {
            const enrich = await fetch(`https://ipwho.is/${info.ip}`);
            if (enrich.ok) {
              const ed = await enrich.json();
              info.city = String(ed.city || "");
              info.country = String(ed.country || "");
            }
          } catch {}
        }
        return info;
      }
    } catch {
      /* try next */
    }
  }
  throw new Error("IP check failed.");
}

export async function checkIp(id: string, proxy: FacebookProxy | null): Promise<IpInfo> {
  const desktop = getDesktop();
  if (desktop?.checkIp) {
    try {
      const info = await desktop.checkIp({ id, proxy });
      if (info?.ip) return info;
    } catch {
      /* browser fallback */
    }
  }
  return fetchIp();
}