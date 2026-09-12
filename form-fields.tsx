import { useId, useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

type CappedProps = {
  label: string;
  value: string;
  onValue: (next: string) => void;
  sanitize: (raw: string) => string;
  max: number;
  hint?: string;
  error?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "maxLength">;

export function CappedField({
  label,
  value,
  onValue,
  sanitize,
  max,
  hint,
  error,
  className,
  id: idProp,
  ...inputProps
}: CappedProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const used = Array.from(value).length;

  function apply(raw: string) {
    onValue(sanitize(raw));
  }

  return (
    <label className="field-enter block space-y-1.5" htmlFor={id}>
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-fg">{label}</span>
        <span className="text-xs tabular-nums text-subtle">{used}/{max}</span>
      </span>
      <input
        id={id}
        value={value}
        maxLength={max}
        autoComplete={inputProps.autoComplete}
        onChange={(event) => apply(event.target.value)}
        onPaste={(event) => {
          event.preventDefault();
          apply(event.clipboardData.getData("text"));
        }}
        onDrop={(event) => {
          event.preventDefault();
          apply(event.dataTransfer.getData("text"));
        }}
        className={cn(
          "h-11 w-full rounded-md border bg-elevated px-3 text-sm text-fg outline-none",
          "border-border placeholder:text-subtle",
          "transition-[border-color,box-shadow] duration-150 ease-out",
          "focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-ring/40",
          error && "border-danger",
          className,
        )}
        {...inputProps}
      />
      {error ? (
        <span className="block text-xs text-danger">{error}</span>
      ) : hint ? (
        <span className="block text-xs text-subtle">{hint}</span>
      ) : null}
    </label>
  );
}


type PasswordProps = {
  label: string;
  value?: string;
  onValue?: (next: string) => void;
  autoComplete?: string;
  name?: string;
  error?: string;
};

export function PasswordField({
  label,
  onValue,
  autoComplete = "current-password",
  name = "password",
  error,
}: PasswordProps) {
  const id = useId();
  const [visible, setVisible] = useState(false);

  return (
    <label className="field-enter block space-y-1.5" htmlFor={id}>
      <span className="text-sm font-medium text-fg">{label}</span>
      <span className="relative block">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          maxLength={11}
          autoComplete={autoComplete}
          autoCapitalize="none"
          spellCheck={false}
          onInput={(event) => onValue?.(Array.from(event.currentTarget.value).slice(0, 11).join(""))}
          className={cn(
            "h-11 w-full rounded-md border bg-elevated px-3 pr-11 text-sm text-fg outline-none",
            "border-border placeholder:text-subtle",
            "transition-[border-color,box-shadow] duration-150 ease-out",
            "focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-ring/40",
            error && "border-danger",
          )}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted transition-colors duration-150 hover:text-fg"
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </span>
      {error ? <span className="block text-xs text-danger">{error}</span> : null}
    </label>
  );
}
