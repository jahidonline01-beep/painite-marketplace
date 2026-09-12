import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Coins, Copy, Eye, EyeOff, KeyRound, LoaderCircle, Power, Trash2, Users, Wallet } from "lucide-react";
import { PainiteMark } from "@/components/brand/painite-mark";
import {
  clientChangeAdminPass,
  clientDeleteLead,
  clientDeleteMember,
  clientDeletePermissionCode,
  clientGeneratePermissionCode,
  clientGetWorkGate,
  clientListPermissionCodes,
  clientSetActive,
  clientSetWorkGate,
  clientUpdateMember,
  clientZeroWork,
  clientListMembers,
  clientListLeads,
  clientSendMemberNotice,
  clientSetMemberBalance,
  type PermissionCodeRow,
} from "@/lib/member-ops";
import { type MemberLeadGroup } from "@/lib/leads";
import {
  sendMemberNotice,
  type CloudMember,
} from "@/lib/cloud";
import { getAdminToken, setAdminToken } from "@/lib/admin-session";
import { SiteFooter } from "@/components/site-footer";
import { SerialCopyModal } from "@/components/admin/serial-copy-modal";
import { PasswordField } from "@/components/auth/form-fields";
import { cn } from "@/lib/utils";

type Panel = "members" | "report" | "admin";
type AdminPage = "edit" | "code" | "password";

export function AdminConsole() {
  const navigate = useNavigate();
  const [token, setToken] = useState<string | null>(() => getAdminToken());
  const [ready] = useState(true);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [adminPage, setAdminPage] = useState<AdminPage | null>("edit");
  const [dashRows, setDashRows] = useState<CloudMember[]>([]);
  const [workOn, setWorkOn] = useState(true);
  const [dashToast, setDashToast] = useState("");

  useEffect(() => {
    if (!token) void navigate({ to: "/admin" });
  }, [token, navigate]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function load() {
      try {
        const members = await clientListMembers();
        const gate = await clientGetWorkGate().catch(() => true);
        if (cancelled) return;
        setDashRows(members);
        setWorkOn(gate);
      } catch {
        /* keep last */
      }
    }
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [token]);

  if (!ready || !token) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg text-sm text-muted">
        Loading console
      </div>
    );
  }

  const expire = () => {
    setAdminToken(null);
    setToken(null);
    void navigate({ to: "/login" });
  };

  async function allWork() {
    try {
      await clientSetWorkGate(!workOn);
      setWorkOn(!workOn);
      setDashToast(!workOn ? "All work ON" : "All work OFF");
    } catch (err) {
      setDashToast(err instanceof Error ? err.message : "Could not update.");
    }
  }

  const pcs = dashRows.reduce((sum, row) => sum + (row.completedTasks || 0), 0);
  const money = dashRows.reduce((sum, row) => sum + (row.balance || 0), 0);

  return (
    <div className="flex min-h-dvh flex-col bg-bg text-fg">
      <header className="border-b border-border">
        <div className="mx-auto flex min-h-16 max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-1">
          <div className="flex items-center gap-2.5">
            <PainiteMark />
            <div className="min-w-0">
              <p className="member-brand__kicker">Painite</p>
              <p className="member-brand__title">Marketplace</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="h-11 px-3 text-sm text-muted transition-colors duration-150 hover:text-fg"
              onClick={() => {
                setAdminToken(null);
                void navigate({ to: "/login" });
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-5 px-4 py-6">
        <div className="admin-dash-grid">
          <Dash label="Members" value={String(dashRows.length)} icon={<Users className="size-5" />} tone="#9ee7ff" />
          <Dash label="Work" value={`${pcs} pcs`} icon={<Coins className="size-5" />} tone="#ffe08a" />
          <Dash label="Balance" value={`${money} Tk`} icon={<Wallet className="size-5" />} tone="#5ff0c8" />
          <Dash
            label="All work"
            value={workOn ? "ON" : "OFF"}
            icon={<Power className="size-5" />}
            tone={workOn ? "#5ff0c8" : "#ff6b7a"}
            onClick={() => void allWork()}
          />
        </div>

        <nav className="grid grid-cols-3 gap-2">
          {(
            [
              ["members", "Members"],
              ["report", "Report"],
              ["admin", "Admin"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={cn(
                "h-12 rounded-xl text-sm font-semibold transition-colors",
                panel === id ? "bg-accent text-accent-fg" : "bg-surface text-muted hover:text-fg",
              )}
              onClick={() => setPanel((cur) => (cur === id ? null : id))}
            >
              {label}
            </button>
          ))}
        </nav>

        {panel === "members" ? <MembersPanel token={token} onExpired={expire} /> : null}
        {panel === "report" ? <ReportPanel token={token} onExpired={expire} /> : null}
        {panel === "admin" ? (
          <div className="space-y-4">
            <nav className="grid grid-cols-3 gap-2">
              {(
                [
                  ["edit", "Edit"],
                  ["code", "Code"],
                  ["password", "Password"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={cn(
                    "h-11 rounded-xl text-sm font-semibold",
                    adminPage === id ? "bg-accent text-accent-fg" : "bg-elevated text-muted hover:text-fg",
                  )}
                  onClick={() => setAdminPage((cur) => (cur === id ? null : id))}
                >
                  {label}
                </button>
              ))}
            </nav>
            {adminPage === "edit" ? <EditPanel token={token} onExpired={expire} /> : null}
            {adminPage === "code" ? <PermissionPanel token={token} onExpired={expire} /> : null}
            {adminPage === "password" ? <AdminPassPanel token={token} onExpired={expire} /> : null}
          </div>
        ) : null}
      </main>
      <SiteFooter />
      {dashToast ? <MiniToast text={dashToast} onDone={() => setDashToast("")} /> : null}
    </div>
  );
}

async function copyText(text: string) {
  try {
    const desk = (window as Window & { painiteDesktop?: { copyText?: (value: string) => Promise<boolean> } }).painiteDesktop;
    if (desk?.copyText) {
      await desk.copyText(text);
      return true;
    }
  } catch {
    /* next */
  }
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

function workLine(lead: {
  serial?: number;
  member_name: string;
  member_phone: string;
  member_uid?: string;
  contact_name: string;
  contact_phone: string;
  fb_name: string;
  fb_link: string;
  listing_url: string;
  address?: string;
  body: string;
  budget: string;
  status: string;
  inbox_url?: string;
}) {
  return [
    lead.fb_name,
    lead.contact_name,
    lead.contact_phone,
    lead.body.replace(/[\t\r\n]+/g, " "),
    (lead.address || "").replace(/[\t\r\n]+/g, " "),
    lead.budget,
    lead.fb_link,
    lead.listing_url,
    lead.status,
    (lead.inbox_url || "").replace(/[\t\r\n]+/g, " "),
    lead.member_name,
    lead.member_uid || "",
  ].join("\t");
}

function Dash({
  label,
  value,
  icon,
  tone,
  onClick,
}: {
  label: string;
  value: string;
  icon: ReactNode;
  tone: string;
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      {...(onClick ? { type: "button" as const } : {})}
      className="admin-dash"
      style={{ ["--dash" as string]: tone }}
      onClick={onClick}
    >
      <span className="admin-dash__icon">{icon}</span>
      <div>
        <p className="admin-dash__label">{label}</p>
        <p className="admin-dash__value">{value}</p>
      </div>
    </Tag>
  );
}

function MembersPanel({ token, onExpired }: { token: string; onExpired: () => void }) {
  const [rows, setRows] = useState<CloudMember[]>([]);
  const [groups, setGroups] = useState<MemberLeadGroup[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetLines, setSheetLines] = useState<string[]>([]);
  const [toast, setToast] = useState("");
  const [kill, setKill] = useState<CloudMember | null>(null);
  const [payUid, setPayUid] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payBusy, setPayBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [members, cloud] = await Promise.all([
          clientListMembers(),
          clientListLeads(),
        ]);
        const list: CloudMember[] = members;
        if (cancelled) return;
        const next: MemberLeadGroup[] = [];
        for (const lead of cloud) {
          let group = next.find((item) => item.phone === lead.member_phone);
          if (!group) {
            group = {
              user_id: lead.member_phone,
              name: lead.member_name,
              phone: lead.member_phone,
              count: 0,
              leads: [],
            };
            next.push(group);
          }
          if (!group.leads.some((item) => item.id === lead.id)) {
            group.leads.push(lead as MemberLeadGroup["leads"][number]);
            group.count = group.leads.length;
          }
        }
        setRows(list);
        setGroups(next);
      } catch (err) {
        const text = err instanceof Error ? err.message : "";
        if (text.includes("Admin session expired")) {
          setAdminToken(null);
          onExpired();
        }
      }
    }
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [token, onExpired]);

  async function toggle(row: CloudMember) {
    try {
      await clientSetActive(row.phone, !row.active);
      setRows((list) => list.map((item) => (item.phone === row.phone ? { ...item, active: !item.active } : item)));
      setToast(row.active ? "Work off" : "Work on");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Could not update.");
    }
  }

  async function zero(row: CloudMember) {
    try {
      await clientZeroWork(row.phone);
      setRows((list) => list.map((item) => (item.phone === row.phone ? { ...item, completedTasks: 0 } : item)));
      setToast(`${row.name} work zero`);
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Could not reset.");
    }
  }

  async function remove(row: CloudMember) {
    try {
      await clientDeleteMember(row.phone);
      setRows((list) => list.filter((item) => item.phone !== row.phone && item.id !== row.id));
      setKill(null);
      setToast(`${row.name} deleted`);
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Could not delete.");
    }
  }

  async function pay(mode: "add" | "deduct") {
    setPayBusy(true);
    try {
      const result = await clientSetMemberBalance(payUid, Number(payAmount) || 0, mode);
      setRows((list) =>
        list.map((item) =>
          item.uid.toLowerCase() === payUid.trim().toLowerCase() ? { ...item, balance: result.balance } : item,
        ),
      );
      setPayAmount("");
      setToast(mode === "add" ? `Balance added · ${result.balance} Tk` : `Balance deducted · ${result.balance} Tk`);
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Could not update.");
    } finally {
      setPayBusy(false);
    }
  }

  async function dropLead(id: string) {
    if (!window.confirm("Delete this work?")) return;
    try {
      await clientDeleteLead(id);
      setGroups((list) =>
        list.map((group) => ({
          ...group,
          leads: group.leads.filter((lead) => lead.id !== id),
          count: group.leads.filter((lead) => lead.id !== id).length,
        })),
      );
      setToast("Work deleted");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Could not delete.");
    }
  }

  const work = groups
    .flatMap((group) =>
      group.leads.map((lead) => ({
        ...lead,
        member_name: group.name,
        member_phone: group.phone,
        member_uid: rows.find((row) => row.phone === group.phone)?.uid || "",
      })),
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((lead, index, list) => ({ ...lead, serial: list.length - index }));

  const money = rows.reduce((sum, row) => sum + (row.balance || 0), 0);

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
          <h2 className="text-sm font-bold">Success · Leads ({work.length})</h2>
          <button
            type="button"
            className="h-7 rounded-md bg-accent px-2 text-[10px] font-bold text-accent-fg"
            onClick={() => {
              void (async () => {
                try {
                  const cloud = await clientListLeads();
                  const mapped = cloud
                    .sort((a, b) => b.created_at.localeCompare(a.created_at))
                    .map((lead, index, list) => ({
                      ...lead,
                      serial: list.length - index,
                      member_uid: rows.find((row) => row.phone === lead.member_phone)?.uid || "",
                    }));
                  if (!mapped.length) {
                    setToast("No data to copy");
                    return;
                  }
                  setSheetLines(mapped.map((lead) => workLine(lead)));
                  setSheetOpen(true);
                } catch {
                  if (!work.length) {
                    setToast("No data to copy");
                    return;
                  }
                  setSheetLines(work.map((lead) => workLine(lead)));
                  setSheetOpen(true);
                }
              })();
            }}
          >
            Copy all
          </button>
        </div>
        <div className="max-h-64 overflow-auto bg-elevated">
          {work.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted">No work yet.</p>
          ) : (
            <table className="w-full border-collapse text-left font-mono text-[11px]">
              <thead className="sticky top-0 bg-surface">
                <tr className="border-b border-border text-muted">
                  <th className="p-2 font-bold">Member</th>
                  <th className="p-2 font-bold">Details</th>
                  <th className="p-2 font-bold">Submit</th>
                  <th className="p-2 text-center font-bold">Action</th>
                </tr>
              </thead>
              <tbody>
                {work.map((lead) => {
                  const member = rows.find((row) => row.phone === lead.member_phone);
                  return (
                    <tr key={lead.id} className="border-b border-border/60">
                      <td className="p-2">
                        <p className="font-bold">{lead.member_name}</p>
                        <p className="text-[10px] text-ice">{member?.uid || lead.member_phone}</p>
                      </td>
                      <td className="p-2 text-[10px]">
                        <p>FB Id: {lead.fb_name || "—"}</p>
                        <p>Client: {lead.contact_name || "—"}</p>
                        <p>Number: {lead.contact_phone || "—"}</p>
                        <p>House: {lead.body || "—"}</p>
                      </td>
                      <td className="p-2 text-[10px]">
                        <p>Address: {lead.address || "—"}</p>
                        <p>Rent: {lead.budget || "—"}</p>
                        <p>Status: {lead.status || "—"}</p>
                        {lead.listing_url ? <p className="break-all text-ice">Zillow: {lead.listing_url}</p> : null}
                        {lead.fb_link ? <p className="break-all">FB post: {lead.fb_link}</p> : null}
                      </td>
                      <td className="p-2 text-center">
                        <button
                          type="button"
                          className="mb-1 w-full rounded bg-sky-600 py-1 font-bold text-white"
                          onClick={() => {
                            setSheetLines([workLine(lead)]);
                            setSheetOpen(true);
                          }}
                        >
                          Copy
                        </button>
                        <button
                          type="button"
                          className="w-full rounded bg-danger py-1 font-bold text-white"
                          onClick={() => void dropLead(lead.id)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
          <h2 className="text-sm font-bold">Balance</h2>
          <p className="text-[11px] font-bold" style={{ color: "var(--color-lead)" }}>
            {money} Tk
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2 p-3">
          <label className="min-w-40 flex-1 text-[10px] font-bold tracking-wide text-muted uppercase">
            UID
            <input
              value={payUid}
              onChange={(e) => setPayUid(e.target.value)}
              placeholder="UID-849201"
              className="mt-1 h-10 w-full rounded-lg border border-border bg-elevated px-2 font-mono text-sm"
            />
          </label>
          <label className="w-28 text-[10px] font-bold tracking-wide text-muted uppercase">
            Amount
            <input
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-border bg-elevated px-2 text-sm"
            />
          </label>
          <button type="button" disabled={payBusy} className="h-10 rounded-lg bg-accent px-4 text-xs font-bold text-accent-fg disabled:opacity-70" onClick={() => void pay("add")}>
            Add
          </button>
          <button type="button" disabled={payBusy} className="h-10 rounded-lg bg-danger px-4 text-xs font-bold text-white disabled:opacity-70" onClick={() => void pay("deduct")}>
            Deduct
          </button>
        </div>
      </section>

      <div className="space-y-1.5">
        {rows.map((row) => (
          <section key={row.phone} className="rounded-xl border border-border bg-surface px-3 py-1.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="min-w-24 truncate text-sm font-semibold">{row.name}</p>
              <p className="font-mono text-[11px] text-muted">{row.phone}</p>
              <button
                type="button"
                className="rounded-md bg-elevated px-1.5 py-0.5 font-mono text-[11px] font-bold text-ice"
                onClick={() => void copyText(row.uid).then((ok) => setToast(ok ? "UID copied" : "Copy failed"))}
              >
                {row.uid || "UID"}
              </button>
              <p className="admin-num">{row.completedTasks} pcs</p>
              <p className="admin-num" style={{ color: "#5ff0c8" }}>
                {row.balance} Tk
              </p>
              <div className="ml-auto flex flex-wrap gap-1">
                <button
                  type="button"
                  className={cn("h-7 rounded-md px-2 text-[10px] font-bold", row.active ? "bg-accent text-accent-fg" : "bg-danger text-white")}
                  onClick={() => void toggle(row)}
                >
                  {row.active ? "Work on" : "Work off"}
                </button>
                <button type="button" className="h-7 rounded-md bg-amber-400 px-2 text-[10px] font-bold text-neutral-950" onClick={() => void zero(row)}>
                  Zero
                </button>
                <button type="button" className="h-7 rounded-md bg-danger px-2 text-[10px] font-bold text-white" onClick={() => setKill(row)}>
                  Delete
                </button>
              </div>
            </div>
          </section>
        ))}
        {rows.length === 0 ? <p className="text-sm text-muted">No members yet.</p> : null}
      </div>
      <SerialCopyModal open={sheetOpen} title="Success serial copy · Google Sheet" lines={sheetLines} onClose={() => setSheetOpen(false)} />
      {kill ? (
        <div className="member-sheet" role="dialog" aria-label="Delete member">
          <button type="button" className="member-sheet__backdrop" onClick={() => setKill(null)} />
          <div className="member-sheet__card" style={{ maxWidth: 340 }}>
            <p className="font-display text-xl font-semibold">Delete {kill.name}?</p>
            <p className="mt-1 font-mono text-sm text-muted">{kill.uid || kill.phone}</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" className="h-11 rounded-xl bg-elevated text-sm" onClick={() => setKill(null)}>
                Cancel
              </button>
              <button type="button" className="h-11 rounded-xl bg-danger text-sm font-bold text-white" onClick={() => void remove(kill)}>
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {toast ? <MiniToast text={toast} onDone={() => setToast("")} /> : null}
    </div>
  );
}

function EditPanel({ token, onExpired }: { token: string; onExpired: () => void }) {
  const [rows, setRows] = useState<CloudMember[]>([]);
  const [toast, setToast] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const list = await clientListMembers();
        if (cancelled) return;
        setRows(list);
      } catch (err) {
        const text = err instanceof Error ? err.message : "";
        if (text.includes("Admin session expired")) {
          setAdminToken(null);
          onExpired();
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, onExpired, toast]);

  return (
    <section className="space-y-2">
      <h2 className="font-display text-2xl font-semibold">Edit member</h2>
      {rows.length === 0 ? <p className="text-sm text-muted">No members yet.</p> : null}
      {rows.map((row) => (
        <MemberEditRow key={row.id || row.phone} token={token} row={row} onSaved={setToast} />
      ))}
      {toast ? <MiniToast text={toast} onDone={() => setToast("")} /> : null}
    </section>
  );
}

function MemberEditRow({
  token,
  row,
  onSaved,
}: {
  token: string;
  row: CloudMember;
  onSaved: (text: string) => void;
}) {
  const [name, setName] = useState(row.name);
  const [phone, setPhone] = useState(row.phone);
  const [nextPass, setNextPass] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await clientUpdateMember({
        oldPhone: row.phone,
        name,
        phone,
        password: nextPass,
      });
      setNextPass("");
      onSaved("Saved");
    } catch (err) {
      onSaved(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-2 rounded-xl border border-border bg-surface p-3" onSubmit={save}>
      <p className="font-mono text-[11px] text-ice">{row.uid || "UID"}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <input value={name} maxLength={11} onChange={(e) => setName(e.target.value.slice(0, 11))} className="h-9 rounded-lg border border-border bg-elevated px-2 text-sm" placeholder="Name" />
        <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))} className="h-9 rounded-lg border border-border bg-elevated px-2 font-mono text-sm" placeholder="Phone" />
        <div className="flex gap-1">
          <input type={show ? "text" : "password"} readOnly value={row.pass_v3 || ""} className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-elevated px-2 font-mono text-sm" />
          <button type="button" className="h-9 w-9 rounded-lg bg-elevated" onClick={() => setShow((v) => !v)}>
            {show ? <EyeOff className="mx-auto size-4" /> : <Eye className="mx-auto size-4" />}
          </button>
        </div>
        <input value={nextPass} maxLength={11} onChange={(e) => setNextPass(e.target.value.slice(0, 11))} className="h-9 rounded-lg border border-border bg-elevated px-2 text-sm" placeholder="New password" />
      </div>
      <button type="submit" disabled={busy} className="h-8 rounded-lg bg-accent px-3 text-[11px] font-bold text-accent-fg disabled:opacity-70">
        {busy ? "…" : "Save"}
      </button>
    </form>
  );
}

function PermissionPanel({ token, onExpired }: { token: string; onExpired: () => void }) {
  const [rows, setRows] = useState<PermissionCodeRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState("");
  const [toast, setToast] = useState("");

  async function load() {
    try {
      setRows(await clientListPermissionCodes());
    } catch (err) {
      const text = err instanceof Error ? err.message : "";
      if (text.toLowerCase().includes("expired") || text.toLowerCase().includes("session")) {
        setAdminToken(null);
        onExpired();
        return;
      }
      setToast(text || "Could not load codes.");
    }
  }

  useEffect(() => {
    void load();
  }, [token]);

  async function make() {
    setBusy(true);
    try {
      const made = await clientGeneratePermissionCode();
      await load();
      const ok = await copyText(made.code);
      setCopied(ok ? made.code : "");
      setToast(ok ? `Code ${made.code} copied` : `Code ${made.code}`);
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Could not generate code.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4">
        <h2 className="font-display text-2xl font-semibold">Permission</h2>
        <button type="button" disabled={busy} onClick={() => void make()} className="h-11 rounded-xl bg-accent px-4 text-sm font-medium text-accent-fg disabled:opacity-70">
          {busy ? <LoaderCircle className="size-4 animate-spin" /> : "New code"}
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-80 text-left text-sm">
          <thead className="text-xs tracking-wide text-muted uppercase">
            <tr>
              <th className="px-6 py-3 font-medium">Code</th>
              <th className="px-6 py-3 font-medium">Status</th>
              <th className="px-6 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="px-6 py-8 text-muted" colSpan={3}>
                  No codes yet.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.code} className="border-t border-border">
                  <td className="px-6 py-3 font-mono tracking-wide">{row.code}</td>
                  <td className="px-6 py-3">{row.used_at ? "Used" : "Open"}</td>
                  <td className="px-6 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        className="inline-flex h-10 items-center gap-1 rounded-xl bg-elevated px-3"
                        onClick={async () => {
                          const ok = await copyText(row.code);
                          setCopied(ok ? row.code : "");
                          setToast(ok ? `Copied ${row.code}` : "Copy failed");
                        }}
                      >
                        <Copy className="size-4" />
                        {copied === row.code ? "Copied" : "Copy"}
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-10 items-center gap-1 rounded-xl bg-danger px-3 text-white"
                        onClick={async () => {
                          try {
                            await clientDeletePermissionCode(row.code);
                            await load();
                            setToast("Code deleted");
                          } catch (err) {
                            setToast(err instanceof Error ? err.message : "Delete failed");
                          }
                        }}
                      >
                        <Trash2 className="size-4" />
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {toast ? <MiniToast text={toast} onDone={() => setToast("")} /> : null}
    </section>
  );
}

function ReportPanel({ token, onExpired }: { token: string; onExpired: () => void }) {
  const [uid, setUid] = useState("");
  const [text, setText] = useState("");
  const [kind, setKind] = useState<"report" | "suspend" | "message">("report");
  const [addBalance, setAddBalance] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function send() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      let result: { name?: string };
      try {
        result = await sendMemberNotice({
          data: { token, uid, kind, text, addBalance: Number(addBalance) || 0 },
        });
      } catch {
        result = await clientSendMemberNotice({
          uid,
          kind,
          text,
          addBalance: Number(addBalance) || 0,
        });
      }
      setMessage(`Sent to ${result.name || uid}.`);
      setText("");
    } catch (err) {
      const note = err instanceof Error ? err.message : "Could not send.";
      if (note.toLowerCase().includes("expired") || note.toLowerCase().includes("session")) {
        setAdminToken(null);
        onExpired();
        return;
      }
      setError(note);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-6">
      <h2 className="font-display text-2xl font-semibold">Report</h2>
      <div className="mt-5 grid gap-3">
        <label className="text-sm">
          Member UID
          <input value={uid} onChange={(e) => setUid(e.target.value)} placeholder="UID-849201" className="mt-1 h-11 w-full rounded-xl border border-border bg-elevated px-3 font-mono text-sm" />
        </label>
        <div className="flex flex-wrap gap-2">
          {(["report", "suspend", "message"] as const).map((id) => (
            <button
              key={id}
              type="button"
              className={cn("h-10 rounded-xl px-4 text-sm font-semibold", kind === id ? "bg-accent text-accent-fg" : "bg-elevated text-muted")}
              onClick={() => setKind(id)}
            >
              {id === "report" ? "Work report" : id === "suspend" ? "Suspend report" : "Message"}
            </button>
          ))}
        </div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} className="rounded-xl border border-border bg-elevated p-3 text-sm" placeholder="Report text" />
        {kind === "report" ? (
          <label className="text-sm">
            Add balance
            <input value={addBalance} onChange={(e) => setAddBalance(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-border bg-elevated px-3 text-sm" />
          </label>
        ) : null}
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {message ? <p className="text-sm text-muted">{message}</p> : null}
        <button type="button" disabled={busy} onClick={() => void send()} className="h-11 rounded-xl bg-accent text-sm font-medium text-accent-fg disabled:opacity-70">
          {busy ? <LoaderCircle className="mx-auto size-4 animate-spin" /> : "Send"}
        </button>
      </div>
    </section>
  );
}

function AdminPassPanel({ token, onExpired }: { token: string; onExpired: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (next.trim() !== again.trim()) throw new Error("New passwords do not match.");
      await clientChangeAdminPass(current, next);
      setCurrent("");
      setNext("");
      setAgain("");
      setMessage("Admin password updated.");
    } catch (err) {
      const text = err instanceof Error ? err.message : "Could not update password.";
      if (text.toLowerCase().includes("expired") || text.toLowerCase().includes("session")) {
        setAdminToken(null);
        onExpired();
        return;
      }
      setError(text);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="flex items-center gap-3 border-b border-border px-6 py-4">
        <span className="inline-flex size-10 items-center justify-center rounded-xl bg-elevated">
          <KeyRound className="size-5" style={{ color: "var(--color-gold)" }} />
        </span>
        <div>
          <h2 className="font-display text-2xl font-semibold">Admin password</h2>
          <p className="text-sm text-muted">Current password required</p>
        </div>
      </div>
      <form className="grid gap-4 p-6 sm:max-w-md" onSubmit={onSubmit}>
        <PasswordField label="Current password" value={current} onValue={setCurrent} autoComplete="current-password" />
        <PasswordField label="New password" value={next} onValue={setNext} autoComplete="new-password" />
        <PasswordField label="Confirm new" value={again} onValue={setAgain} autoComplete="new-password" />
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {message ? (
          <p className="text-sm" style={{ color: "var(--color-lead)" }}>
            {message}
          </p>
        ) : null}
        <button type="submit" disabled={busy} className="h-12 rounded-xl bg-accent text-sm font-bold text-accent-fg disabled:opacity-70">
          {busy ? <LoaderCircle className="mx-auto size-4 animate-spin" /> : "Update password"}
        </button>
      </form>
    </section>
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
