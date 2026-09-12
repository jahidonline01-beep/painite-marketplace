import { useEffect, useState } from "react";
import { APP_VERSION } from "@/lib/app-core";
import { TELEGRAM_URL } from "@/lib/app-core";
import { clientClaimAppVersion, clientGetVersionGate, type ClientVersionGate } from "@/lib/member-ops";
import { AuthTheater } from "@/components/auth/auth-theater";

export type VersionGate = ClientVersionGate;

export function useVersionGate() {
  const [gate, setGate] = useState<VersionGate | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        await clientClaimAppVersion();
        const row = await clientGetVersionGate();
        if (!cancelled) setGate(row);
      } catch {
        try {
          const row = await clientGetVersionGate();
          if (!cancelled) setGate(row);
        } catch {
          if (!cancelled) {
            setGate({
              ok: true,
              blocked: false,
              current: APP_VERSION,
              minVersion: APP_VERSION,
              latestVersion: APP_VERSION,
              downloadUrl: "",
              telegramUrl: TELEGRAM_URL,
              message: "",
            });
          }
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return gate;
}

export function UpdateWall({ gate }: { gate: VersionGate }) {
  const telegram = gate.telegramUrl || TELEGRAM_URL;
  const latest = gate.latestVersion || gate.minVersion || APP_VERSION;
  return (
    <AuthTheater subtitle="Update required">
      <div className="auth-card-wrap">
        <div className="auth-card lock-card">
          <p className="lock-card__kicker">Update required</p>
          <h2 className="lock-card__title">Install v{latest}</h2>
          <p className="lock-card__copy">
            This old app is closed. You cannot sign in on this version. Install Painite Marketplace v{latest}. After you install the new app, you can sign in and work again.
          </p>
          <div className="lock-card__versions">
            <span className="lock-card__chip lock-card__chip--old">Old app v{gate.current}</span>
            <span aria-hidden="true">→</span>
            <span className="lock-card__chip lock-card__chip--new">New app v{latest}</span>
          </div>
          {gate.downloadUrl ? (
            <a href={gate.downloadUrl} className="lock-card__download">
              Download v{latest}
            </a>
          ) : (
            <p className="lock-card__copy">Ask your admin for the new installer. After install, this screen goes away.</p>
          )}
          <a href={telegram} target="_blank" rel="noreferrer" className="lock-card__telegram">
            <TelegramGlyph />
            Message admin
          </a>
        </div>
      </div>
    </AuthTheater>
  );
}

function TelegramGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="lock-card__tg" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2.1a9.9 9.9 0 1 0 0 19.8 9.9 9.9 0 0 0 0-19.8Zm4.56 6.77-1.54 7.26c-.12.52-.42.64-.84.4l-2.34-1.72-1.13 1.08c-.12.13-.23.23-.48.23l.17-2.38 4.34-3.92c.19-.17-.04-.26-.3-.1l-5.37 3.38-2.31-.72c-.5-.16-.51-.5.11-.74l9.04-3.48c.42-.16.78.1.65.71Z"
      />
    </svg>
  );
}
