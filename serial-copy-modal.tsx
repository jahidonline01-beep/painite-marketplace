import { useEffect, useRef, useState } from "react";
import { Check, CheckCircle2, Copy, FileSpreadsheet, Loader2, X } from "lucide-react";

export const SHEET_HEADER = [
  "FB Id Name",
  "Client name",
  "Number",
  "House detail",
  "Address",
  "Rent",
  "Facebook post link",
  "Zillow post link",
  "Status",
  "Messenger screenshot",
  "Member name",
  "UID",
].join("\t");

function sanitize(line: string) {
  return line
    .split("\t")
    .map((cell) => cell.replace(/[\r\n\v\f]+/g, " ").trim())
    .join("\t");
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const box = document.createElement("textarea");
    box.value = text;
    box.setAttribute("readonly", "");
    box.style.position = "fixed";
    box.style.left = "-9999px";
    document.body.appendChild(box);
    box.select();
    const ok = document.execCommand("copy");
    box.remove();
    return ok;
  }
}

function sheetText(lines: string[]) {
  return [SHEET_HEADER, ...lines].join("\n");
}

export function SerialCopyModal({
  open,
  title,
  lines,
  onClose,
}: {
  open: boolean;
  title: string;
  lines: string[];
  onClose: () => void;
}) {
  const clean = lines.map(sanitize).filter(Boolean);
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);
  const log = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setIndex(0);
      setDone(false);
      setCopied(false);
      return;
    }
    if (!clean.length) {
      setDone(true);
      return;
    }
    setIndex(0);
    setDone(false);
    setCopied(false);
    const delay = Math.max(18, Math.min(90, Math.floor(2500 / Math.max(1, clean.length))));
    let current = 0;
    const timer = window.setInterval(() => {
      current += 1;
      if (current >= clean.length) {
        window.clearInterval(timer);
        setIndex(clean.length);
        setDone(true);
        void copyText(sheetText(clean)).then((ok) => setCopied(ok));
      } else {
        setIndex(current);
      }
    }, delay);
    return () => window.clearInterval(timer);
  }, [open, lines]);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [index]);

  if (!open) return null;

  const total = clean.length;
  const percent = total ? Math.min(100, Math.round((index / total) * 100)) : 100;

  return (
    <div className="member-sheet" role="dialog" aria-label="Serial copy">
      <button type="button" className="member-sheet__backdrop" aria-label="Close" onClick={onClose} />
      <div className="serial-copy">
        <div className="serial-copy__top">
          <p className="serial-copy__title">
            <FileSpreadsheet className="size-3.5" />
            {title}
          </p>
          <button type="button" className="serial-copy__x" onClick={onClose} aria-label="Close">
            <X className="size-3.5" />
          </button>
        </div>

        <div className="serial-copy__body">
          <div className={done ? "serial-copy__status is-done" : "serial-copy__status"}>
            <div className="flex items-center justify-between gap-2">
              <p className="inline-flex items-center gap-1.5 text-[11px] font-bold">
                {done ? <CheckCircle2 className="size-3.5" /> : <Loader2 className="size-3 animate-spin" />}
                {done ? "100% complete" : "Counting serial…"}
              </p>
              <span className="serial-copy__count">
                {index}/{total}
              </span>
            </div>
            <div className="serial-copy__bar">
              <span style={{ width: `${percent}%` }} />
            </div>
          </div>

          {done ? (
            <p className="serial-copy__banner">
              <Check className="size-3" />
              {copied ? "Copied for Google Sheet" : "Ready — tap Copy"}
            </p>
          ) : null}

          <div ref={log} className="serial-copy__log">
            {clean.slice(0, index).map((line, i) => (
              <p key={`${i}-${line.slice(0, 18)}`}>
                <span>#{i + 1}</span>
                {line.replace(/\t/g, " | ")}
              </p>
            ))}
            {total === 0 ? <p className="text-center text-muted">No data</p> : null}
          </div>
        </div>

        <div className="serial-copy__foot">
          <button
            type="button"
            disabled={!total}
            className="serial-copy__go"
            onClick={async () => {
              const ok = await copyText(sheetText(clean));
              setCopied(ok);
              if (ok) window.setTimeout(onClose, 280);
            }}
          >
            <Copy className="size-3" />
            {copied ? "Copied" : "Copy"}
          </button>
          <button type="button" className="serial-copy__close" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
