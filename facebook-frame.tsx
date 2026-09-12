import { useLayoutEffect, useRef } from "react";
import { subscribeChromeOverlay } from "@/lib/chrome-overlay";
import { getDesktop, toProxy, type FacebookBounds, type MarketplaceListing, type PainiteDesktop } from "@/lib/desktop";
import type { FacebookProfileRow } from "@/lib/facebook-profiles";
import { cn } from "@/lib/utils";

function readBounds(node: HTMLElement): FacebookBounds {
  const rect = node.getBoundingClientRect();
  return {
    x: Math.max(0, Math.round(rect.x)),
    y: Math.max(0, Math.round(rect.y)),
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height)),
  };
}

export function FacebookFrame({
  profile,
  active,
  visible,
  listing,
  onListed,
}: {
  profile: FacebookProfileRow;
  active: boolean;
  visible: boolean;
  listing?: MarketplaceListing | null;
  onListed?: () => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const desktop = typeof window !== "undefined" ? getDesktop() : undefined;
  const on = Boolean(visible && active);
  const proxyKey = `${profile.proxy_protocol ?? ""}:${profile.proxy_host ?? ""}:${profile.proxy_port ?? ""}`;
  const listingKey = listing ? `${listing.title}|${listing.listing_url || ""}|${(listing.images || []).length}` : "";

  useLayoutEffect(() => {
    if (!desktop) return;
    const api: PainiteDesktop = desktop;
    const host = hostRef.current;
    if (!host) return;
    let overlay = false;
    let cancelled = false;
    let posted = false;

    async function sync() {
      if (cancelled || !host) return;
      if (!on || overlay) {
        await api.hideFacebook();
        return;
      }
      const bounds = readBounds(host);
      if (bounds.width < 40 || bounds.height < 40) {
        requestAnimationFrame(() => void sync());
        return;
      }
      if (listing && !posted) {
        posted = true;
        await api.postMarketplace({
          id: profile.id,
          label: profile.label,
          proxy: toProxy(profile),
          bounds,
          url: "https://www.facebook.com/marketplace/create/rental",
          listing,
        });
        onListed?.();
        return;
      }
      await api.showFacebook({
        id: profile.id,
        label: profile.label,
        proxy: toProxy(profile),
        bounds,
      });
    }

    void sync();
    const ro = new ResizeObserver(() => {
      if (!on || overlay) return;
      void api.boundsFacebook(readBounds(host));
    });
    ro.observe(host);
    const onResize = () => void sync();
    window.addEventListener("resize", onResize);
    const unsub = subscribeChromeOverlay((open) => {
      overlay = open;
      void sync();
    });
    return () => {
      cancelled = true;
      ro.disconnect();
      window.removeEventListener("resize", onResize);
      unsub();
      void api.hideFacebook();
    };
  }, [desktop, profile.id, proxyKey, on, listingKey]);

  return <div ref={hostRef} className={cn("fb-host", on && "is-on")} />;
}