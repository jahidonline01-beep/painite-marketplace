import { useEffect, useState, type FormEvent } from "react";
import { Bot, ClipboardList, ExternalLink, LoaderCircle, Send } from "lucide-react";
import { LEAD_STATUSES, listMyLeads, submitLead, type LeadInput, type LeadRow } from "@/lib/leads";
import {
  clientListLeads,
  clientSubmitLead,
  listAiLeads,
  markAiLeadSent,
  onAiLeadsChange,
  updateAiLead,
  type AiLeadRow,
} from "@/lib/member-ops";
import { getLocalMember } from "@/lib/app-core";
import { LeadIcon } from "./desk-icons";

const EMPTY: LeadInput = {
  source: "marketplace",
  listing_url: "",
  property_type: "2bed",
  budget: "",
  status: "new",
  contact_name: "",
  contact_phone: "",
  body: "",
  profile_label: "",
  fb_name: "",
  fb_link: "",
  inbox_url: "",
  address: "",
};

function asInput(row: Partial<LeadInput>): LeadInput {
  return { ...EMPTY, ...row };
}

export function LeadDesk({ visible }: { visible: boolean }) {
  const [tab, setTab] = useState<"submit" | "ai">("submit");
  const [rows, setRows] = useState<LeadRow[]>([]);
  const [aiRows, setAiRows] = useState<AiLeadRow[]>([]);
  const [form, setForm] = useState<LeadInput>(EMPTY);
  const [aiForm, setAiForm] = useState<LeadInput>(EMPTY);
  const [activeAi, setActiveAi] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [toast, setToast] = useState("");

  async function reload() {
    try {
      setRows(await listMyLeads());
    } catch {
      const all = await clientListLeads().catch(() => []);
      const me = getLocalMember();
      const phone = me?.phone || "";
      setRows(
        all
          .filter((row) => !phone || row.member_phone === phone)
          .map((row) => ({
            ...EMPTY,
            ...row,
            id: row.id,
            member_name: row.member_name,
            member_phone: row.member_phone,
            created_at: row.created_at,
            address: row.address || "",
          })),
      );
    }
  }

  function pickAi(list: AiLeadRow[], keep?: string | null) {
    if (keep && list.some((row) => row.id === keep)) return keep;
    return list.find((row) => !row.sent)?.id || list[0]?.id || null;
  }

  function reloadAi(keep?: string | null) {
    const list = listAiLeads();
    setAiRows(list);
    const next = pickAi(list, keep ?? activeAi);
    setActiveAi(next);
    const row = list.find((item) => item.id === next);
    if (row) setAiForm(asInput(row));
  }

  useEffect(() => {
    if (!visible) return;
    void reload();
    reloadAi();
  }, [visible]);

  useEffect(() => onAiLeadsChange(() => reloadAi()), []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      try {
        await submitLead({ data: form });
      } catch {
        await clientSubmitLead(form);
      }
      setForm({ ...EMPTY, status: form.status });
      await reload();
      setToast("Lead submitted successfully");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setBusy(false);
    }
  }

  async function sendAi(event: FormEvent) {
    event.preventDefault();
    if (!activeAi) return;
    setAiBusy(true);
    try {
      updateAiLead(activeAi, aiForm);
      try {
        await submitLead({ data: aiForm });
      } catch {
        await clientSubmitLead(aiForm);
      }
      markAiLeadSent(activeAi);
      reloadAi(activeAi);
      await reload();
      setToast("Lead submitted successfully");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Send failed");
    } finally {
      setAiBusy(false);
    }
  }

  function patch<K extends keyof LeadInput>(key: K, value: LeadInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function patchAi<K extends keyof LeadInput>(key: K, value: LeadInput[K]) {
    setAiForm((current) => ({ ...current, [key]: value }));
    if (activeAi) updateAiLead(activeAi, { [key]: value } as Partial<LeadInput>);
  }

  function openAi(row: AiLeadRow) {
    setActiveAi(row.id);
    setAiForm(asInput(row));
  }

  const count = tab === "ai" ? aiRows.length : rows.length;
  const activeRow = aiRows.find((row) => row.id === activeAi) || null;

  return (
    <section className="lead-desk">
      <header className="rent-bar">
        <span className="rent-bar__mark rent-bar__mark--lead">
          <LeadIcon />
        </span>
        <p className="rent-bar__title">Lead</p>
        <span className="rent-bar__count">{count}</span>
      </header>

      <div className="lead-rubber" role="tablist" aria-label="Lead pages">
        <button type="button" role="tab" className={tab === "submit" ? "is-on" : ""} aria-selected={tab === "submit"} onClick={() => setTab("submit")}>
          <ClipboardList className="size-3.5" />
          Submit
        </button>
        <button type="button" role="tab" className={tab === "ai" ? "is-on" : ""} aria-selected={tab === "ai"} onClick={() => { setTab("ai"); reloadAi(); }}>
          <Bot className="size-3.5" />
          Gemini AI
        </button>
      </div>

      {tab === "submit" ? (
        <div className="lead-page">
          <LeadForm form={form} patch={patch} busy={busy} onSubmit={onSubmit} action="Submit" />
          <ul className="lead-list">
            {rows.map((row) => (
              <li key={row.id} className="lead-card">
                <span className="fb-serial">{String(row.status).slice(0, 1).toUpperCase()}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-white/95">
                    {row.fb_name || "—"} · {row.contact_name || "—"} · {row.contact_phone || "—"}
                  </p>
                  <p className="rent-card__facts">
                    {row.body || "—"} · {row.address || "—"} · {row.budget || "—"} · {row.status}
                  </p>
                  {row.fb_link ? (
                    <a href={row.fb_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-sky-300 mt-1">
                      <ExternalLink className="size-3" />
                      Facebook post
                    </a>
                  ) : null}
                  {row.listing_url ? (
                    <a href={row.listing_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-cyan-300 mt-1 ml-2">
                      <ExternalLink className="size-3" />
                      Zillow
                    </a>
                  ) : null}
                  {row.inbox_url ? (
                    <a href={row.inbox_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-emerald-300 mt-1 ml-2">
                      <ExternalLink className="size-3" />
                      Screenshot
                    </a>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="lead-page lead-ai">
          <ul className="lead-ai-list">
            {aiRows.map((row) => (
              <li key={row.id}>
                <button type="button" className={`lead-ai-row${activeAi === row.id ? " is-on" : ""}${row.sent ? " is-sent" : ""}`} onClick={() => openAi(row)}>
                  <span className="fb-serial">{String(row.serial_no).padStart(2, "0")}</span>
                  <span className="min-w-0 flex-1 text-left">
                    <strong>{row.fb_name || row.contact_name || "Customer"}</strong>
                    <em>{[row.contact_phone, row.address, row.budget].filter(Boolean).join(" · ") || row.status}</em>
                  </span>
                  <b>{row.sent ? "Sent" : "Ready"}</b>
                </button>
              </li>
            ))}
          </ul>
          {activeRow ? (
            <LeadForm
              form={aiForm}
              patch={patchAi}
              busy={aiBusy}
              onSubmit={sendAi}
              action={activeRow.sent ? "Sent" : "Send"}
              disabled={activeRow.sent}
            />
          ) : null}
        </div>
      )}
      {toast ? <MiniToast text={toast} onDone={() => setToast("")} /> : null}
    </section>
  );
}

function LeadForm({
  form,
  patch,
  busy,
  onSubmit,
  action,
  disabled,
}: {
  form: LeadInput;
  patch: <K extends keyof LeadInput>(key: K, value: LeadInput[K]) => void;
  busy: boolean;
  onSubmit: (event: FormEvent) => void;
  action: string;
  disabled?: boolean;
}) {
  return (
    <form className="lead-box" onSubmit={onSubmit}>
      <label>
        FB Id Name
        <input value={form.fb_name} onChange={(e) => patch("fb_name", e.target.value)} disabled={disabled} />
      </label>
      <label>
        Client name
        <input value={form.contact_name} onChange={(e) => patch("contact_name", e.target.value)} disabled={disabled} />
      </label>
      <label>
        Number
        <input value={form.contact_phone} onChange={(e) => patch("contact_phone", e.target.value.replace(/\D/g, "").slice(0, 15))} disabled={disabled} />
      </label>
      <label>
        House detail
        <input value={form.body} onChange={(e) => patch("body", e.target.value)} disabled={disabled} />
      </label>
      <label>
        Address
        <input value={form.address} onChange={(e) => patch("address", e.target.value)} disabled={disabled} />
      </label>
      <label>
        Rent
        <input value={form.budget} onChange={(e) => patch("budget", e.target.value)} disabled={disabled} />
      </label>
      <label className="lead-span">
        Facebook post link
        <input value={form.fb_link} onChange={(e) => patch("fb_link", e.target.value)} disabled={disabled} />
      </label>
      <label className="lead-span">
        Post link (Zillow)
        <input value={form.listing_url} onChange={(e) => patch("listing_url", e.target.value)} disabled={disabled} />
      </label>
      <label className="lead-span">
        Messenger screenshot link
        <input value={form.inbox_url} onChange={(e) => patch("inbox_url", e.target.value)} disabled={disabled} placeholder="https://i.postimg.cc/..." />
      </label>
      <label>
        Status
        <select value={form.status} onChange={(e) => patch("status", e.target.value as LeadInput["status"])} disabled={disabled}>
          {LEAD_STATUSES.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="rent-send lead-submit" disabled={busy || disabled}>
        {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}
        {action}
      </button>
    </form>
  );
}

function MiniToast({ text, onDone }: { text: string; onDone: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, 2200);
    return () => window.clearTimeout(timer);
  }, [text, onDone]);
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[80]">
      <p className="pointer-events-auto rounded-2xl border px-4 py-3 text-sm font-bold" style={{ background: "rgba(6,40,32,.94)", borderColor: "rgba(47,212,176,.45)", color: "#d1fae5" }}>{text}</p>
    </div>
  );
}
