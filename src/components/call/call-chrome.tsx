"use client";

import * as React from "react";

/**
 * The call's chrome: the centred shell its non-live screens sit in, the
 * round toggles, and the device pickers. No state and no SDK — pulled
 * out of the room so that file is about the CALL, not about buttons.
 */

export function CallShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center px-4 py-10">{children}</div>
  );
}

export function ControlButton({
  on,
  onClick,
  label,
  dark,
  children,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  dark?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label} ${on ? "on" : "off"}`}
      aria-pressed={on}
      className={
        dark
          ? `grid h-12 w-12 place-items-center rounded-full backdrop-blur ${on ? "bg-white/10 text-white hover:bg-white/20" : "bg-white text-black"}`
          : `grid h-10 w-10 place-items-center rounded-lg border border-border ${on ? "bg-surface" : "bg-danger/10 text-danger"}`
      }
    >
      {children}
    </button>
  );
}

export function DeviceSelect({
  label,
  kind,
  devices,
  value,
  onChange,
}: {
  label: string;
  kind: MediaDeviceKind;
  devices: MediaDeviceInfo[];
  value: string;
  onChange: (id: string) => void;
}) {
  const options = devices.filter((d) => d.kind === kind);
  if (options.length === 0) return null;
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-fg-secondary">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="truncate rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-fg"
      >
        <option value="">Default</option>
        {options.map((d) => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label || "Unnamed device"}
          </option>
        ))}
      </select>
    </label>
  );
}
