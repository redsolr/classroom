"use client";

import { useRouter } from "next/navigation";

/**
 * Mobile thread picker — the drawer holds the app nav, so the chat's
 * thread list compresses to a native select in the chat header
 * (ChatGPT keeps threads in its drawer; ours live one tap away here).
 */
export function ThreadSwitcher({
  threads,
  activeId,
}: {
  threads: { id: string; label: string }[];
  activeId: string;
}) {
  const router = useRouter();
  return (
    <select
      value={activeId}
      aria-label="Chat thread"
      onChange={(e) => {
        const value = e.target.value;
        router.push(value === "__new" ? "/study" : `/study?t=${value}`);
      }}
      className="h-8 w-full min-w-0 rounded-md border border-border-strong bg-surface px-2 text-[0.875rem] font-medium focus:border-accent focus:outline-none"
    >
      {threads.map((thread) => (
        <option key={thread.id} value={thread.id}>
          {thread.label}
        </option>
      ))}
      <option value="__new">+ New chat…</option>
    </select>
  );
}
