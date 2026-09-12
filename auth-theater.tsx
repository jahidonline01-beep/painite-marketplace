import { useEffect, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { SiteFooter } from "@/components/site-footer";
import { PainiteCrystal } from "./crystal";

const MOTES = [
  { left: "8%", top: "78%", delay: "0s", duration: "13s" },
  { left: "18%", top: "62%", delay: "2s", duration: "16s" },
  { left: "32%", top: "84%", delay: "4.2s", duration: "12s" },
  { left: "54%", top: "70%", delay: "1.1s", duration: "15s" },
  { left: "71%", top: "58%", delay: "3.4s", duration: "14s" },
  { left: "86%", top: "76%", delay: "0.6s", duration: "17s" },
  { left: "44%", top: "48%", delay: "5s", duration: "11s" },
  { left: "62%", top: "88%", delay: "2.8s", duration: "13s" },
];

export function AuthTheater({
  kicker = "Painite",
  title = "Marketplace",
  tagline = "Authorized member access",
  children,
}: {
  kicker?: string;
  title?: string;
  subtitle?: string;
  tagline?: string;
  hideSocial?: boolean;
  children: ReactNode;
}) {
  const [tilt, setTilt] = useState({ x: 0, y: 0, px: 0, py: 0 });
  const reduced = usePrefersReducedMotion();

  const stageStyle = {
    "--tilt-x": reduced ? "0deg" : `${tilt.x}deg`,
    "--tilt-y": reduced ? "0deg" : `${tilt.y}deg`,
    "--parx": reduced ? "0px" : `${tilt.px}px`,
    "--pary": reduced ? "0px" : `${tilt.py}px`,
  } as CSSProperties;

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (reduced) return;
    const { innerWidth, innerHeight } = window;
    const nx = (event.clientX / innerWidth) * 2 - 1;
    const ny = (event.clientY / innerHeight) * 2 - 1;
    setTilt({
      x: ny * -5,
      y: nx * 7,
      px: nx * 16,
      py: ny * 12,
    });
  }

  return (
    <div className="auth-stage" style={stageStyle} onPointerMove={onPointerMove}>
      <div className="auth-stage__grid" />
      <div className="auth-stage__vignette" />
      <div className="auth-stage__motes">
        {MOTES.map((mote, index) => (
          <span
            key={index}
            className="auth-stage__mote"
            style={{
              left: mote.left,
              top: mote.top,
              animationDelay: mote.delay,
              animationDuration: mote.duration,
            }}
          />
        ))}
      </div>

      <div className="auth-stage__layout">
        <div className="flex w-full flex-col items-center">
          <PainiteCrystal />
          <div className="hero-copy">
            <p className="hero-copy__mark">
              {kicker}
            </p>
            <h1 className="hero-copy__title">
              {title}
            </h1>
          </div>
        </div>
        {children}
      </div>
      <SiteFooter admin />
    </div>
  );
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return reduced;
}
