import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { format } from "date-fns";
import { NotebookPen } from "lucide-react";
import { db, studyBooks, studyNotes } from "@/db";
import { requireLearner } from "@/lib/auth";
import { NoteComposer, NoteList } from "@/components/study/note-cards";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Notes" };

/**
 * Everything the learner has noted, newest first — loose notes and
 * book-filed ones (with a chip back to their book). The composer here
 * writes loose notes; the same rows are readable/writable from any chat
 * via the note tools.
 */
export default async function NotesPage() {
  const learner = await requireLearner();

  const notes = await db
    .select({
      id: studyNotes.id,
      content: studyNotes.content,
      createdAt: studyNotes.createdAt,
      bookId: studyBooks.id,
      bookTitle: studyBooks.title,
    })
    .from(studyNotes)
    .leftJoin(studyBooks, eq(studyNotes.bookId, studyBooks.id))
    .where(eq(studyNotes.learnerId, learner.id))
    .orderBy(desc(studyNotes.createdAt))
    .limit(200);

  return (
    <div className="notes-page mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="text-[1.625rem] font-semibold tracking-tight">Notes</h1>
        <p className="mt-0.5 text-[0.9375rem] text-fg-secondary">
          Ideas worth keeping — on their own, or filed under a book in your
          library.
        </p>
      </header>

      <div className="space-y-3">
        <NoteComposer placeholder="Jot something down…" />
        {notes.length === 0 ? (
          <EmptyState
            icon={<NotebookPen />}
            title="No notes yet"
            description="Save ideas here, from a book's page, or from any chat — just say “save note: …”."
          />
        ) : (
          <NoteList
            showBook
            notes={notes.map((note) => ({
              id: note.id,
              content: note.content,
              dateLabel: format(note.createdAt, "MMM d, yyyy"),
              book:
                note.bookId && note.bookTitle
                  ? { id: note.bookId, title: note.bookTitle }
                  : null,
            }))}
          />
        )}
      </div>
    </div>
  );
}
