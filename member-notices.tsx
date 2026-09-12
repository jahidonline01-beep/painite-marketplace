import { useEffect, useState } from "react";
import { collection, doc, getDocs, onSnapshot } from "firebase/firestore";
import { Check, Eye, EyeOff, Loader2, Mail, Trash2, X } from "lucide-react";
import { clearMyNotice, getMyMemberState } from "@/lib/cloud";
import { getDb } from "@/lib/firebase";
import { getMyProfile } from "@/lib/profiles";
import { getLocalMember } from "@/lib/app-core";
import { clientClearNotice } from "@/lib/member-ops";

type State = {
  uid: string;
  phone: string;
  balance: number;
  completedTasks: number;
  report: string;
  suspendReport: string;
  adminMessage: string;
};

const EMPTY: State = {
  uid: "",
  phone: "",
  balance: 0,
  completedTasks: 0,
  report: "",
  suspendReport: "",
  adminMessage: "",
};

export function useMemberLive() {
  const [state, setState] = useState<State>(EMPTY);

  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    void (async () => {
      try {
        const local = getLocalMember();
        const profile = await getMyProfile().catch(() => null);
        const phone = profile?.phone || local?.phone || "";
        const fallbackUid = profile?.uid || "";
        if (!phone) {
          const s = await getMyMemberState().catch(() => EMPTY);
          if (!cancelled) {
            setState({ ...EMPTY, ...s });
          }
          return;
        }

        const pKey = phone.replace(/\D/g, "").slice(0, 11);
        let foundDocRef = doc(getDb(), "members", pKey || phone);

        try {
          const snapAll = await getDocs(collection(getDb(), "members"));
          const hit = snapAll.docs.find(
            (item) =>
              item.id === pKey ||
              item.id === phone ||
              String(item.data()?.phone || "").replace(/\D/g, "") === pKey ||
              (fallbackUid && String(item.data()?.uid || "").toUpperCase() === fallbackUid.toUpperCase()),
          );
          if (hit) {
            foundDocRef = hit.ref;
          }
        } catch {
          /* use direct ref */
        }

        if (cancelled) return;

        stop = onSnapshot(
          foundDocRef,
          (snap) => {
            const data = snap.data() || {};
            setState({
              uid: String(data.uid || fallbackUid || ""),
              phone: String(data.phone || phone),
              balance: Number(data.balance) || 0,
              completedTasks: Number(data.completedTasks) || 0,
              report: String(data.report || ""),
              suspendReport: String(data.suspendReport || ""),
              adminMessage: String(data.adminMessage || ""),
            });
          },
          async () => {
            try {
              const s = await getMyMemberState();
              if (!cancelled) setState({ ...EMPTY, ...s });
            } catch {
              /* ignore */
            }
          },
        );
      } catch {
        try {
          const s = await getMyMemberState();
          if (!cancelled) setState({ ...EMPTY, ...s });
        } catch {
          /* skip */
        }
      }
    })();
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  const dropNotice = async (kind: "report" | "suspend" | "message") => {
    // 1. Optimistic instant local removal
    setState((prev) => ({
      ...prev,
      [kind === "report" ? "report" : kind === "suspend" ? "suspendReport" : "adminMessage"]: "",
    }));

    // 2. Client-side Firestore delete (direct and guaranteed)
    try {
      await clientClearNotice({
        phone: state.phone,
        uid: state.uid,
        kind,
      });
    } catch (err) {
      console.warn("Client clear notice warning:", err);
    }

    // 3. Server-side cloud function fallback
    try {
      await clearMyNotice({
        data: {
          kind,
          phone: state.phone,
          uid: state.uid,
        },
      });
    } catch {
      /* ignore server error if client succeeded */
    }
  };

  return {
    ...state,
    dropNotice,
  };
}

export function MemberNotices() {
  const state = useMemberLive();

  if (!state.report && !state.suspendReport && !state.adminMessage) return null;

  return (
    <div className="space-y-2 px-4 pb-1">
      {state.report ? (
        <Notice title="Work report" tone="violet" text={state.report} onClear={() => state.dropNotice("report")} />
      ) : null}
      {state.adminMessage ? (
        <Notice title="Admin message" tone="sky" text={state.adminMessage} onClear={() => state.dropNotice("message")} />
      ) : null}
      {state.suspendReport ? (
        <Notice title="Suspend report" tone="rose" text={state.suspendReport} onClear={() => state.dropNotice("suspend")} />
      ) : null}
    </div>
  );
}

function Notice({
  title,
  text,
  tone,
  onClear,
}: {
  title: string;
  text: string;
  tone: "violet" | "sky" | "rose";
  onClear: () => Promise<void> | void;
}) {
  const [hide, setHide] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const theme =
    tone === "rose"
      ? { border: "rgba(244,63,94,.4)", title: "#fda4af", bg: "rgba(76,5,25,.45)", chip: "rgba(136,19,55,.45)" }
      : tone === "sky"
        ? { border: "rgba(56,189,248,.3)", title: "#7dd3fc", bg: "rgba(8,47,73,.4)", chip: "rgba(7,89,133,.4)" }
        : { border: "rgba(167,139,250,.3)", title: "#c4b5fd", bg: "rgba(46,16,101,.4)", chip: "rgba(76,29,149,.4)" };

  async function handleDelete() {
    setBusy(true);
    try {
      await onClear();
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <article className="space-y-2 rounded-xl p-3.5 transition-all" style={{ background: theme.bg, border: `1px solid ${theme.border}` }}>
      <div className="flex items-center justify-between gap-2">
        <p className="inline-flex items-center gap-1.5 text-xs font-bold" style={{ color: theme.title }}>
          <Mail className="size-4" />
          {title}
        </p>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-bold transition-opacity hover:opacity-80"
            style={{ color: theme.title, borderColor: theme.border, background: theme.chip }}
            onClick={() => setHide((v) => !v)}
          >
            {hide ? <Eye className="size-3" /> : <EyeOff className="size-3" />}
            {hide ? "Show" : "Hide"}
          </button>

          {confirming ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={busy}
                className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ background: "#e11d48", borderColor: "#f43f5e" }}
                onClick={() => void handleDelete()}
              >
                {busy ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                Delete?
              </button>
              <button
                type="button"
                disabled={busy}
                className="rounded border p-1 text-zinc-400 hover:text-white"
                style={{ borderColor: "rgba(255,255,255,.15)", background: "rgba(255,255,255,.05)" }}
                onClick={() => setConfirming(false)}
                title="Cancel"
              >
                <X className="size-3" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-bold transition-opacity hover:opacity-80"
              style={{ color: "#fda4af", borderColor: "rgba(244,63,94,.4)", background: "rgba(244,63,94,.2)" }}
              onClick={() => setConfirming(true)}
              aria-label="Delete"
              title="Delete this notice"
            >
              <Trash2 className="size-3" />
              <span>Delete</span>
            </button>
          )}
        </div>
      </div>
      {hide ? null : (
        <div
          className="max-h-28 overflow-y-auto whitespace-pre-wrap break-words rounded-lg p-2.5 text-xs select-text"
          style={{ background: "rgba(2,6,23,.6)", border: `1px solid ${theme.border}` }}
        >
          {text}
        </div>
      )}
    </article>
  );
}

export function MemberStats() {
  const state = useMemberLive();
  return (
    <div className="flex items-center gap-2 rounded-xl bg-surface px-3 py-1.5 text-right">
      <div>
        <p className="text-[10px] tracking-wide text-muted uppercase">Balance</p>
        <p className="text-sm font-bold" style={{ color: "var(--color-lead)" }}>
          {state.balance} Tk
        </p>
      </div>
      <div className="h-7 w-px bg-border" />
      <div>
        <p className="text-[10px] tracking-wide text-muted uppercase">Done</p>
        <p className="text-sm font-bold" style={{ color: "var(--color-gold)" }}>
          {state.completedTasks} pcs
        </p>
      </div>
    </div>
  );
}
