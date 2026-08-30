"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen, Pencil } from "lucide-react";
import {
  createStudyNote,
  deleteStudyNote,
  updateStudyNote,
} from "@/lib/actions/notes";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Textarea } from "@/components/ui/field";
import { NoteBlocks } from "@/components/study/note-blocks";
import {
  NoteBlockEditor,
  type NoteEditorHandle,
} from "@/components/study/note-editor";

/**
 * The notes surface shared by the book page (filed notes) and the Notes
 * tab (everything, loose notes included): a composer on top, atomic
 * note cards below — each editable in place. One idea per note; the
 * chat tools (save_note/list_notes) read and write the same rows.
 */

export type NoteItem = {
  id: string;
  content: string;
  /** Preformatted server-side (fixed shape — no hydration drift). */
  dateLabel: string;
  book: { id: string; title: string } | null;
};

export function NoteComposer({
  bookId,
  placeholder,
}: {
  /** Omitted = the Notes tab's loose-note composer. */
  bookId?: string;
  placeholder?: string;
}) {
  const router = useRouter();
  const [value, setValue] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  const submit = () => {
    const content = value.trim();
    if (!content || pending) return;
    startTransition(async () => {
      try {
        await createStudyNote({ content, bookId });
        setValue("");
        router.refresh();
      } catch (error) {
        console.error("library: failed to add note", error);
      }
    });
  };

  return (
    <form
      className="note-composer flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Textarea
        aria-label="New note"
        rows={2}
        maxLength={4000}
        value={value}
        placeholder={placeholder ?? "One idea worth keeping…"}
        onChange={(e) => setValue(e.target.value)}
      />
      <div className="flex justify-end">
        <Button type="submit" loading={pending} disabled={!value.trim()}>
          Add note
        </Button>
      </div>
    </form>
  );
}

function NoteCard({ note, showBook }: { note: NoteItem; showBook: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [closing, setClosing] = React.useState(false);
  const editor = React.useRef<NoteEditorHandle>(null);

  /**
   * Done AWAITS the pending write before refreshing.
   *
   * Without it, pressing Done inside the autosave debounce refreshes the
   * card from the server copy — which is still the old text — and the
   * edit is silently gone. The one failure a notes feature may not have.
   */
  const done = async () => {
    setClosing(true);
    try {
      await editor.current?.flush();
    } finally {
      setClosing(false);
      setEditing(false);
      router.refresh();
    }
  };

  return (
    <article className="note-card rounded-lg bg-surface p-3.5 shadow-card">
      {editing ? (
        <div className="space-y-2">
          {/* Blocks, stored as markdown — `lib/notes/blocks.ts` explains
              why the storage did not change. It AUTOSAVES, so there is no
              Save button to forget and no Cancel to promise an undo we
              do not have; Done just stops editing. */}
          <NoteBlockEditor
            ref={editor}
            initialContent={note.content}
            onSave={(markdown) => updateStudyNote(note.id, markdown)}
          />
          <div className="flex items-center justify-end">
            <Button
              type="button"
              variant="primary"
              loading={closing}
              onClick={() => void done()}
            >
              Done
            </Button>
          </div>
        </div>
      ) : (
        <>
          <NoteBlocks content={note.content} />
          <div className="mt-2.5 flex items-center gap-2 text-[0.8125rem] text-fg-tertiary">
            <span>{note.dateLabel}</span>
            {showBook && note.book && (
              <Link
                href={`/reading/${note.book.id}`}
                className="inline-flex min-w-0 items-center gap-1 rounded-full bg-surface-hover px-2 py-0.5 transition-colors hover:text-fg"
              >
                <BookOpen className="size-3 shrink-0" />
                <span className="truncate">{note.book.title}</span>
              </Link>
            )}
            <span className="flex-1" />
            <button
              type="button"
              aria-label="Edit note"
              title="Edit note"
              className="flex size-6 items-center justify-center rounded text-fg-tertiary transition-colors hover:bg-surface-hover hover:text-fg"
              onClick={() => setEditing(true)}
            >
              <Pencil className="size-3.5" />
            </button>
            <ConfirmButton
              title="Delete note"
              action={async () => {
                await deleteStudyNote(note.id);
                router.refresh();
              }}
            />
          </div>
        </>
      )}
    </article>
  );
}

export function NoteList({
  notes,
  showBook = false,
}: {
  notes: NoteItem[];
  showBook?: boolean;
}) {
  if (notes.length === 0) return null;
  return (
    <div className="note-list space-y-2">
      {notes.map((note) => (
        <NoteCard key={note.id} note={note} showBook={showBook} />
      ))}
    </div>
  );
}
