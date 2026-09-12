import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { LoaderCircle } from "lucide-react";
import { authClient, rememberAuthToken } from "@/lib/auth/client";
import {
  NAME_MAX,
  PHONE_MAX,
  isCompletePhone,
  phoneToEmail,
  sanitizeName,
  sanitizePhone,
} from "@/lib/app-core";
import { checkPermissionCode, createProfile, loginMember, phoneIsTaken } from "@/lib/profiles";
import { clientRegisterMember } from "@/lib/member-ops";
import { matchMemberCreds, saveMemberCreds, setLocalMember, getLocalMember, hydrateLocalMember } from "@/lib/app-core";
import { UpdateWall, useVersionGate } from "@/components/update-gate";
import { cn } from "@/lib/utils";
import { AuthTheater } from "./auth-theater";
import { CappedField, PasswordField } from "./form-fields";

export type AuthMode = "login" | "register";

type FieldErrors = {
  name?: string;
  phone?: string;
  permission?: string;
  password?: string;
  form?: string;
};

export function AuthStage({ mode }: { mode: AuthMode }) {
  const navigate = useNavigate();
  const gate = useVersionGate();

  useEffect(() => {
    if (mode !== "login") return;
    let cancelled = false;
    void (async () => {
      const local = getLocalMember() || (await hydrateLocalMember());
      if (!cancelled && local?.id) navigate({ to: "/market", replace: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, navigate]);

  if (gate?.blocked) return <UpdateWall gate={gate} />;

  return (
      <AuthTheater>
      <AuthForm
        mode={mode}
        onEnter={() => navigate({ to: "/market" })}
      />
    </AuthTheater>
  );
}

function AuthCardShell({
  children,
  shake,
}: {
  children: ReactNode;
  shake?: boolean;
}) {
  return (
    <div className={cn("auth-card-wrap", shake && "shake")}>
      <div className="auth-card">{children}</div>
    </div>
  );
}

function AuthForm({
  mode,
  onEnter,
}: {
  mode: AuthMode;
  onEnter: () => void;
}) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [permission, setPermission] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const isRegister = mode === "register";

  const title = isRegister ? "Create account" : "Sign in";
  const subtitle = isRegister
    ? "Name, phone, permission code, and password."
    : "Use your phone number and password.";

  function bumpShake() {
    setShake(false);
    requestAnimationFrame(() => setShake(true));
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    const form = event.currentTarget;
    const packed = new FormData(form);
    const passBox = form.querySelector<HTMLInputElement>('input[name="password"]');
    const phoneBox = form.querySelector<HTMLInputElement>('input[name="phone"]');
    const livePhone = sanitizePhone(String(phoneBox?.value || packed.get("phone") || phone));
    const livePass = Array.from(String(passBox?.value || packed.get("password") || password)).slice(0, 11).join("");
    const liveName = sanitizeName(String(packed.get("name") || name));
    const liveCode = String(packed.get("permission") || permission).trim();
    setPhone(livePhone);
    setPassword(livePass);
    if (isRegister) {
      setName(liveName);
      setPermission(liveCode);
    }
    const next: FieldErrors = {};

    if (isRegister) {
      if (!liveName.trim()) next.name = "Enter your name.";
    }
    if (!isCompletePhone(livePhone)) next.phone = "Enter a phone number (max 11).";
    if (isRegister && !liveCode) next.permission = "Enter your permission code.";
    if (!livePass) next.password = "Enter a password.";
    else if (livePass.length > 11) next.password = "Password must be 11 characters or fewer.";

    if (Object.keys(next).length) {
      setErrors(next);
      bumpShake();
      return;
    }

    setBusy(true);
    setErrors({});

    try {
      const phone = livePhone;
      const password = livePass;
      const name = liveName;
      const permission = liveCode;
      const email = phoneToEmail(phone);

      if (isRegister) {
        const made = await clientRegisterMember({
          name,
          phone,
          permissionCode: permission,
          password,
        });
        rememberAuthToken(`pm3.${phone}`);
        const profile = {
          id: made.id,
          displayName: made.name,
          primaryEmail: made.email,
          phone: made.phone,
        };
        setLocalMember(profile);
        saveMemberCreds(phone, password, profile);
      } else {
        let result:
          | {
              token?: string | null;
              id: string;
              name: string;
              email: string;
              phone: string;
            }
          | null = null;
        const localHit = matchMemberCreds(phone, password);
        if (localHit) {
          try {
            const { clientMemberLogin } = await import("@/lib/member-ops");
            const cloud = await clientMemberLogin(phone, password);
            if (!cloud) {
              setLocalMember(null);
              throw new Error("Account not found. Create a new account.");
            }
            result = {
              token: `pm3.${phone}`,
              id: cloud.id,
              name: cloud.displayName || localHit.displayName || phone,
              email: cloud.primaryEmail || email,
              phone: cloud.phone || phone,
            };
          } catch (err) {
            if (err instanceof Error && /not found|Create a new/i.test(err.message)) throw err;
            result = {
              token: `pm3.${phone}`,
              id: localHit.id,
              name: localHit.displayName || phone,
              email: localHit.primaryEmail || email,
              phone: localHit.phone || phone,
            };
          }
        }
        if (!result) {
          const { clientMemberLogin } = await import("@/lib/member-ops");
          const cloud = await clientMemberLogin(phone, password);
          if (!cloud) throw new Error("Phone or password is incorrect.");
          result = {
            token: `pm3.${phone}`,
            id: cloud.id,
            name: cloud.displayName || phone,
            email: cloud.primaryEmail || email,
            phone: cloud.phone || phone,
          };
        }
        rememberAuthToken(result.token || `pm3.${phone}`);
        const profile = {
          id: result.id,
          displayName: result.name,
          primaryEmail: result.email,
          phone: result.phone,
        };
        setLocalMember(profile);
        saveMemberCreds(phone, password, profile);
      }

      await navigate({ to: "/market", replace: true });
    } catch (err) {
      setErrors({ form: err instanceof Error ? err.message : "Something went wrong." });
      bumpShake();
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCardShell shake={shake}>
      <div className="relative z-10">
        <ModeSwitch mode={mode} />
        <h2 className="mt-5 font-display text-3xl leading-tight font-semibold text-fg">{title}</h2>

        <form className="mt-6 space-y-3.5" onSubmit={onSubmit} noValidate autoComplete="on">
          {isRegister ? (
            <CappedField
              key="name"
              name="name"
              label="Name"
              value={name}
              onValue={setName}
              sanitize={sanitizeName}
              max={NAME_MAX}
              autoComplete="name"
              error={errors.name}
            />
          ) : null}

          <CappedField
            key="phone"
            name="phone"
            label="Phone number"
            value={phone}
            onValue={setPhone}
            sanitize={sanitizePhone}
            max={PHONE_MAX}
            inputMode="numeric"
            autoComplete="username"
            error={errors.phone}
          />

          {isRegister ? (
            <label className="field-enter block space-y-1.5">
              <span className="text-sm font-medium text-fg">Permission code</span>
              <input
                name="permission"
                value={permission}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => setPermission(event.target.value.slice(0, 24))}
                className={cn(
                  "h-11 w-full rounded-md border bg-elevated px-3 text-sm tracking-wide text-fg outline-none",
                  "border-border placeholder:text-subtle",
                  "transition-[border-color,box-shadow] duration-150 ease-out",
                  "focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-ring/40",
                  errors.permission && "border-danger",
                )}
              />
              {errors.permission ? (
                <span className="block text-xs text-danger">{errors.permission}</span>
              ) : null}
            </label>
          ) : null}

          <PasswordField
            label="Password"
            value={password}
            onValue={setPassword}
            autoComplete={isRegister ? "new-password" : "current-password"}
            error={errors.password}
          />

          {errors.form ? (
            <p className="text-sm text-danger" role="alert">
              {errors.form}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className="field-enter flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent text-sm font-medium text-accent-fg transition-transform duration-150 ease-out active:not-disabled:scale-[0.96] disabled:opacity-70"
          >
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : null}
            {busy ? "Please wait" : isRegister ? "Create account" : "Sign in"}
          </button>
        </form>
      </div>
    </AuthCardShell>
  );
}

function ModeSwitch({ mode }: { mode: AuthMode }) {
  const options = useMemo(
    () =>
      [
        { id: "login" as const, label: "Sign in", to: "/login" },
        { id: "register" as const, label: "Register", to: "/register" },
      ] as const,
    [],
  );

  return (
    <div className="relative grid grid-cols-2 rounded-xl bg-elevated p-1">
      <span
        className="absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-lg bg-surface shadow-[0_1px_0_color-mix(in_oklab,var(--color-fg)_10%,transparent)] transition-transform duration-200 ease-out"
        style={{ transform: mode === "register" ? "translateX(calc(100% + 4px))" : "translateX(0)" }}
      />
      {options.map((option) => (
        <Link
          key={option.id}
          to={option.to}
          className={cn(
            "relative z-10 flex h-11 items-center justify-center rounded-lg text-sm font-medium transition-colors duration-150",
            mode === option.id ? "text-fg" : "text-muted hover:text-fg",
          )}
        >
          {option.label}
        </Link>
      ))}
    </div>
  );
}

function friendlyAuthError(message: string | undefined, isRegister: boolean) {
  const raw = (message ?? "").toLowerCase();
  if (raw.includes("exist") || raw.includes("already")) {
    return isRegister
      ? "This phone number is already registered."
      : "No account found for this phone number.";
  }
  if (raw.includes("password") || raw.includes("credential") || raw.includes("invalid")) {
    return "Phone number or password is incorrect.";
  }
  return message || "Could not complete that request.";
}

