import { useId } from "react";
import { cn } from "@/lib/utils";

export function PainiteMark({
  className,
  title = "Painite Marketplace",
}: {
  className?: string;
  title?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const hex = `pm-hex-${uid}`;
  const hexIn = `pm-hexin-${uid}`;
  const gem = `pm-gem-${uid}`;
  const flare = `pm-flare-${uid}`;

  return (
    <span className={cn("painite-mark", className)} title={title}>
      <span className="painite-mark__aura" aria-hidden="true" />
      <span className="painite-mark__orbit painite-mark__orbit--a" aria-hidden="true" />
      <span className="painite-mark__orbit painite-mark__orbit--b" aria-hidden="true" />
      <span className="painite-mark__orbit painite-mark__orbit--c" aria-hidden="true" />
      <span className="painite-mark__spark painite-mark__spark--1" aria-hidden="true" />
      <span className="painite-mark__spark painite-mark__spark--2" aria-hidden="true" />
      <span className="painite-mark__spark painite-mark__spark--3" aria-hidden="true" />
      <svg viewBox="0 0 64 64" className="painite-mark__sigil" aria-hidden="true">
        <defs>
          <linearGradient id={hex} x1="10" y1="4" x2="54" y2="60" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#f5f8ff" />
            <stop offset="45%" stopColor="#8e9bb8" />
            <stop offset="100%" stopColor="#2c3348" />
          </linearGradient>
          <linearGradient id={hexIn} x1="20" y1="14" x2="44" y2="52" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#2a3146" />
            <stop offset="100%" stopColor="#0d111c" />
          </linearGradient>
          <radialGradient id={gem} cx="38%" cy="32%" r="68%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="22%" stopColor="#e8f4ff" />
            <stop offset="55%" stopColor="#7ecbff" />
            <stop offset="100%" stopColor="#3a1b6e" />
          </radialGradient>
          <radialGradient id={flare} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
        </defs>
        <polygon
          points="32,5 53,17 53,47 32,59 11,47 11,17"
          fill={`url(#${hexIn})`}
          stroke={`url(#${hex})`}
          strokeWidth="3.4"
          strokeLinejoin="round"
        />
        <polygon
          points="32,11 47,19.5 47,44.5 32,53 17,44.5 17,19.5"
          fill="none"
          stroke="#d7e4ff"
          strokeOpacity="0.38"
          strokeWidth="1.15"
        />
        <g className="painite-mark__gem">
          <polygon points="32,17.5 44.5,32 32,46.5 19.5,32" fill={`url(#${gem})`} />
          <polygon points="32,17.5 38,32 32,46.5 26,32" fill="#fff" fillOpacity="0.18" />
          <polygon points="32,17.5 44.5,32 32,32" fill="#fff" fillOpacity="0.42" />
          <polygon points="32,32 44.5,32 32,46.5" fill="#2a1458" fillOpacity="0.22" />
          <circle cx="28.5" cy="26.5" r="2.3" fill={`url(#${flare})`} />
        </g>
      </svg>
    </span>
  );
}
