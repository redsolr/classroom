"use client";

/**
 * Auth form primitives — light-context (white card) components mirroring
 * web-app's PasswordInput / FieldError / SubmitButton / SocialButton /
 * AuthDivider / AuthFooterLink / ToggleSwitch.
 */

import * as React from "react";
import Link from "next/link";
import { Eye, EyeOff, Loader2 } from "lucide-react";

export function AuthField({
  label,
  rightLabel,
  error,
  children,
  htmlFor,
}: {
  label: string;
  rightLabel?: React.ReactNode;
  error?: string;
  children: React.ReactNode;
  /** Control id when the child isn't a direct input (e.g. PasswordInput). */
  htmlFor?: string;
}) {
  const autoId = React.useId();
  // Associate label ↔ control: direct input children get an auto id.
  let controlId = htmlFor;
  let child = children;
  if (!controlId && React.isValidElement(children)) {
    const el = children as React.ReactElement<{ id?: string }>;
    controlId = el.props.id ?? autoId;
    child = React.cloneElement(el, { id: controlId });
  }
  return (
    <div>
      <span className="flex items-baseline justify-between">
        <label htmlFor={controlId} className="auth-label">
          {label}
        </label>
        {rightLabel}
      </span>
      {child}
      {error && <p className="auth-error-text">{error}</p>}
    </div>
  );
}

export function PasswordInput({
  name,
  error,
  autoComplete,
  rightLabel,
  label = "Password",
}: {
  name: string;
  error?: string;
  autoComplete?: string;
  rightLabel?: React.ReactNode;
  label?: string;
}) {
  const [visible, setVisible] = React.useState(false);
  const inputId = React.useId();
  return (
    <AuthField label={label} rightLabel={rightLabel} error={error} htmlFor={inputId}>
      <span className="relative block">
        <input
          id={inputId}
          name={name}
          type={visible ? "text" : "password"}
          required
          autoComplete={autoComplete}
          className={`auth-input pr-11 ${error ? "auth-input-error" : ""}`}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setVisible((v) => !v)}
          className="auth-icon-btn absolute right-3 top-1/2 -translate-y-1/2"
          aria-label={visible ? "Hide password" : "Show password"}
        >
          {visible ? <EyeOff className="size-4.5" /> : <Eye className="size-4.5" />}
        </button>
      </span>
    </AuthField>
  );
}

export function ToggleSwitch({
  name,
  label,
  defaultChecked = false,
}: {
  name: string;
  label: string;
  defaultChecked?: boolean;
}) {
  const [checked, setChecked] = React.useState(defaultChecked);
  return (
    <label className="flex cursor-pointer items-center gap-2.5 select-none">
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={(e) => setChecked(e.target.checked)}
        className="sr-only"
      />
      <span
        aria-hidden
        className="relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors"
        style={{
          background: checked ? "var(--auth-accent)" : "var(--auth-toggle-off)",
        }}
      >
        <span
          className="absolute top-0.5 size-4 rounded-full bg-white shadow transition-all"
          style={{ left: checked ? "1.125rem" : "0.125rem" }}
        />
      </span>
      <span className="auth-strong text-[0.8125rem]">{label}</span>
    </label>
  );
}

export function AuthSubmit({
  label,
  pendingLabel,
  isPending,
}: {
  label: string;
  pendingLabel: string;
  isPending: boolean;
}) {
  return (
    <button type="submit" disabled={isPending} className="auth-submit">
      {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
      {isPending ? pendingLabel : label}
    </button>
  );
}

export function AuthDivider() {
  return (
    <div className="my-5 flex items-center gap-3">
      <span className="h-px flex-1 bg-[var(--auth-border)]" />
      <span className="text-[0.72rem] font-semibold uppercase tracking-wide text-[var(--auth-text-muted)]">
        or
      </span>
      <span className="h-px flex-1 bg-[var(--auth-border)]" />
    </div>
  );
}

/** Direct-to-provider OAuth buttons — plain <a>: these routes 307 to the
 *  provider, and RSC prefetch of an external redirect trips CORS. */
export function SocialButton({
  provider,
  action = "Sign in",
}: {
  provider: "google" | "apple";
  action?: string;
}) {
  return (
    <a href={`/login/${provider}`} className="auth-social">
      {provider === "google" ? (
        <svg viewBox="0 0 24 24" className="size-4.5" aria-hidden>
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="size-4.5 fill-current" aria-hidden>
          <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.53 4.08ZM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25Z" />
        </svg>
      )}
      {action} with {provider === "google" ? "Google" : "Apple"}
    </a>
  );
}

export function AuthFooterLink({
  text,
  linkText,
  href,
}: {
  text: string;
  linkText: string;
  href: string;
}) {
  return (
    <div className="auth-footer-strip mt-6">
      {text}{" "}
      <Link href={href} className="auth-link font-semibold">
        {linkText}
      </Link>
    </div>
  );
}
