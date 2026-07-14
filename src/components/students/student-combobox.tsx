"use client";

import * as React from "react";
import { Check, Search } from "lucide-react";
import { Input } from "@/components/ui/field";

export type StudentOption = { id: string; name: string };

/**
 * Type-to-filter student picker — a searchable replacement for the native
 * select, because a roster of 30+ students makes scrolling useless. Emits
 * the chosen id through a hidden input; native form validation blocks
 * submission until a student is picked.
 */
export function StudentCombobox({
  students,
  name = "studentId",
}: {
  students: StudentOption[];
  name?: string;
}) {
  const [query, setQuery] = React.useState("");
  const [selected, setSelected] = React.useState<StudentOption | null>(null);
  const [open, setOpen] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    inputRef.current?.setCustomValidity(
      selected ? "" : "Choose a student from the list",
    );
  }, [selected]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? students.filter((s) => s.name.toLowerCase().includes(q))
    : students;

  return (
    <div className="relative">
      <input type="hidden" name={name} value={selected?.id ?? ""} />
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-tertiary" />
        <Input
          ref={inputRef}
          value={selected ? selected.name : query}
          onChange={(e) => {
            setSelected(null);
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // Let option clicks land before the list closes.
            setTimeout(() => setOpen(false), 150);
          }}
          placeholder="Search students…"
          autoComplete="off"
          required
          className="pl-8"
        />
      </div>
      {open && (
        <ul
          role="listbox"
          className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-lg bg-surface-raised p-1 shadow-overlay"
        >
          {filtered.length === 0 ? (
            <li className="px-2 py-1.5 text-[0.875rem] text-fg-tertiary">
              No students match “{query}”.
            </li>
          ) : (
            filtered.slice(0, 30).map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected?.id === s.id}
                  // Select on mousedown — it fires before the input's blur,
                  // so the click can never race the list closing.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setSelected(s);
                    setQuery("");
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[0.875rem] transition-colors hover:bg-surface-hover"
                >
                  <span className="min-w-0 flex-1 truncate">{s.name}</span>
                  {selected?.id === s.id && (
                    <Check className="size-3.5 text-accent" />
                  )}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
