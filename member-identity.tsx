import { useEffect, useRef, useState, type FormEvent } from "react";
import { Camera, Lock, LogOut } from "lucide-react";
import { doc, onSnapshot } from "firebase/firestore";
import { signOut } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { NAME_MAX, sanitizeName } from "@/lib/app-core";
import { getLocalMember, saveMemberCreds, setLocalMember } from "@/lib/app-core";
import { clientSaveMyProfile } from "@/lib/member-ops";
import { getDb } from "@/lib/firebase";
import { setChromeOverlay } from "@/lib/chrome-overlay";
import { CappedField } from "@/components/auth/form-fields";
import { PasswordField } from "@/components/auth/form-fields";

type Profile = { name: string; phone: string; avatar: string | null; uid: string | null };

export function MemberIdentity() {
  const { user } = useCurrentUserState();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setChromeOverlay(open);
    return () => setChromeOverlay(false);
  }, [open]);

  useEffect(() => {
    const phone = (getLocalMember()?.phone || "").replace(/\D/g, "").slice(0, 11);
    if (!phone) return;
    return onSnapshot(doc(getDb(), "members", phone), (snap) => {
      const data = snap.data();
      if (!data) return;
      setProfile({
        name: String(data.name || ""),
        phone: String(data.phone || phone),
        avatar: (data.avatar as string | null) || null,
        uid: String(data.uid || ""),
      });
    });
  }, [user?.id]);

  const local = getLocalMember();
  const name = profile?.name ?? user?.displayName ?? local?.displayName ?? "Member";
  const phone = profile?.phone || local?.phone || "";
  const avatar = profile?.avatar ?? null;
  const uid = profile?.uid ?? "";
  const initial = Array.from(name)[0]?.toUpperCase() ?? "P";

  return (
    <>
      <button type="button" className="member-id" onClick={() => setOpen(true)}>
        <span className="member-id__avatar">
          {avatar ? (
            <img src={avatar} alt="" className="size-full object-cover" />
          ) : (
            <span>{initial}</span>
          )}
        </span>
        <span className="min-w-0 text-left">
          <span className="block truncate text-sm font-medium text-fg">{name}</span>
          <span className="block truncate font-mono text-xs text-ice">{uid || phone || "Member"}</span>
        </span>
      </button>
      {open ? (
        <IdentityEditor
          profile={{ name, phone, avatar, uid }}
          onClose={() => setOpen(false)}
          onSaved={setProfile}
        />
      ) : null}
    </>
  );
}

function IdentityEditor({
  profile,
  onClose,
  onSaved,
}: {
  profile: Profile;
  onClose: () => void;
  onSaved: (next: Profile) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(profile.name);
  const [avatar, setAvatar] = useState<string | null>(profile.avatar);
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function onPick(file: File | undefined) {
    if (!file) return;
    try {
      const data = await compressAvatar(file);
      setAvatar(data);
    } catch {
      setError("Could not read that picture.");
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const local = getLocalMember();
      const phone = profile.phone || local?.phone || "";
      const saved = await clientSaveMyProfile({
        name,
        avatar,
        phone,
        password: nextPassword || undefined,
        currentPassword: nextPassword ? currentPassword : undefined,
      });
      if (local?.id) {
        const next = { ...local, displayName: saved.name, phone: saved.phone };
        setLocalMember(next);
        if (nextPassword) saveMemberCreds(saved.phone, nextPassword, next);
      }
      if (nextPassword) {
        setCurrentPassword("");
        setNextPassword("");
      }
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="member-sheet" role="dialog" aria-label="Member information">
      <button type="button" className="member-sheet__backdrop" aria-label="Close" onClick={onClose} />
      <div className="member-sheet__card">
        <div className="member-sheet__top">
          <p className="text-xs font-medium tracking-[0.22em] text-muted uppercase">Member</p>
          <button type="button" className="member-sheet__back" onClick={onClose} aria-label="Back">
            <svg viewBox="0 0 24 24" className="member-sheet__back-ico" aria-hidden="true">
              <path
                d="M14.2 6.4 8.8 12l5.4 5.6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.1"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
        <h2 className="mt-1 font-display text-2xl font-semibold">Your details</h2>
        <form className="mt-5 space-y-3.5" onSubmit={onSubmit}>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="member-id__avatar member-id__avatar--lg"
              onClick={() => fileRef.current?.click()}
            >
              {avatar ? (
                <img src={avatar} alt="" className="size-full object-cover" />
              ) : (
                <Camera className="size-5 text-muted" />
              )}
            </button>
            <div className="min-w-0">
              <p className="text-sm font-medium">Profile picture</p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => void onPick(event.target.files?.[0])}
            />
          </div>

          <CappedField
            label="Name"
            value={name}
            onValue={setName}
            sanitize={sanitizeName}
            max={NAME_MAX}
            autoComplete="name"
          />

          <label className="block space-y-1.5">
            <span className="flex items-center gap-1.5 text-sm font-medium text-fg">
              Phone
              <Lock className="size-3.5 text-subtle" />
            </span>
            <input
              value={profile.phone}
              readOnly
              className="h-11 w-full rounded-md border border-border bg-elevated px-3 text-sm text-muted outline-none"
            />
          </label>

          <PasswordField
            label="Current password"
            value={currentPassword}
            onValue={setCurrentPassword}
            autoComplete="current-password"
          />
          <PasswordField
            label="New password"
            value={nextPassword}
            onValue={setNextPassword}
            autoComplete="new-password"
          />

          {error ? <p className="text-sm text-danger">{error}</p> : null}
          {message ? <p className="text-sm text-fg">{message}</p> : null}

          <button
            type="submit"
            disabled={busy}
            className="flex h-11 w-full items-center justify-center rounded-xl bg-accent text-sm font-medium text-accent-fg transition-transform duration-150 ease-out active:not-disabled:scale-[0.96] disabled:opacity-70"
          >
            {busy ? "Saving" : "Save changes"}
          </button>
        </form>
        <button
          type="button"
          className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm text-muted transition-colors duration-150 hover:text-fg"
          onClick={() => void signOut("/login")}
        >
          <LogOut className="size-4" />
          Sign out
        </button>
      </div>
    </div>
  );
}

function compressAvatar(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      const size = 256;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("No canvas"));
        return;
      }
      const scale = Math.max(size / image.width, size / image.height);
      const w = image.width * scale;
      const h = image.height * scale;
      ctx.drawImage(image, (size - w) / 2, (size - h) / 2, w, h);
      resolve(canvas.toDataURL("image/jpeg", 0.86));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Bad image"));
    };
    image.src = url;
  });
}
