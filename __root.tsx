import { useEffect } from "react";
import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { getDesktop } from "@/lib/desktop";
import appCss from "../styles.css?url";

const APP_NAME = "Painite Marketplace";
const BOOT_CSS =
  "html,body{margin:0;background:#120c1c;color:#f6eef8;overflow:hidden}svg.site-footer__orb-icon{width:18px;height:18px}";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: APP_NAME },
      { name: "description", content: "Painite Marketplace — private operator access and rental operations." },
      { name: "theme-color", content: "#120c1c" },
    ],
    links: [
      { rel: "icon", type: "image/png", href: "/favicon-64.png" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Figtree:wght@400;500;600&display=swap",
      },
    ],
    styles: [{ children: BOOT_CSS }],
  }),
  component: RootShell,
});

function RootShell() {
  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        void getDesktop()?.uiReady?.();
      });
    });
    return () => window.cancelAnimationFrame(id);
  }, []);

  return (
    <html lang="en" className="antialiased" suppressHydrationWarning style={{ background: "#120c1c" }}>
      <head>
        <HeadContent />
      </head>
      <body style={{ margin: 0, background: "#120c1c" }}>
        <PreviewHostBridge />
        <AuthProvider>
          <Outlet />
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  );
}
