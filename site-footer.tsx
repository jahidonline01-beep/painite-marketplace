import { Mail } from "lucide-react";
import {
  BRAND_NAME,
  CONTACT_EMAIL,
  COPYRIGHT_YEAR,
  MAILTO_URL,
  TELEGRAM_URL,
} from "@/lib/app-core";

export function SiteFooter({ admin = false }: { admin?: boolean }) {
  return (
    <footer className="site-footer" style={{ maxHeight: 72, overflow: "hidden" }}>
      <a
        href={TELEGRAM_URL}
        target="_blank"
        rel="noreferrer"
        className="site-footer__orb"
        aria-label="Telegram"
        onClick={(event) => event.stopPropagation()}
      >
        <span className="site-footer__orb-ring" aria-hidden="true" />
        <span className="site-footer__orb-glow" aria-hidden="true" />
        <TelegramMark />
      </a>
      <a
        href={MAILTO_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="site-footer__mail"
      >
        <span className="site-footer__mail-shine" aria-hidden="true" />
        <Mail className="size-4" strokeWidth={1.75} />
        <span>{CONTACT_EMAIL}</span>
      </a>
      {admin ? (
        <a href="/admin" className="site-footer__admin" aria-label="Admin login">
          <span className="site-footer__year">© {COPYRIGHT_YEAR}</span>
          <span>{BRAND_NAME}</span>
        </a>
      ) : (
        <p className="site-footer__admin">
          <span className="site-footer__year">© {COPYRIGHT_YEAR}</span>
          <span>{BRAND_NAME}</span>
        </p>
      )}
    </footer>
  );
}

function TelegramMark() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" className="site-footer__orb-icon" aria-hidden="true" style={{ width: 18, height: 18, flex: "none" }}>
      <path
        fill="currentColor"
        d="M12 2.1a9.9 9.9 0 1 0 0 19.8 9.9 9.9 0 0 0 0-19.8Zm4.56 6.77-1.54 7.26c-.12.52-.42.64-.84.4l-2.34-1.72-1.13 1.08c-.12.13-.23.23-.48.23l.17-2.38 4.34-3.92c.19-.17-.04-.26-.3-.1l-5.37 3.38-2.31-.72c-.5-.16-.51-.5.11-.74l9.04-3.48c.42-.16.78.1.65.71Z"
      />
    </svg>
  );
}
