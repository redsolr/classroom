"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createStudyDeck } from "@/lib/actions/decks";
import { moveDeckToBook } from "@/lib/actions/books";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { Button, SubmitButton } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";

/**
 * A new, empty deck — loose, or inside a book.
 *
 * ONE dialog, because there was briefly one per surface: the deck list on
 * `/books` had its own copy and the book page had this one, and they had
 * already drifted on their submit label. Two components that both make a
 * `study_decks` row is two places for "how a deck gets made" to be
 * decided — the same reason `notes.ts` refuses to keep a second
 * `createStudyBook`. `bookId` is DATA, not a variant flag: it is the one
 * fact that differs, and it is what decides where you land afterwards.
 *
 * `createStudyDeck` takes the word ids to seed a deck with — it was built
 * for "save this filtered view as a deck", which is still the main way
 * decks get made. An empty one is the other way: you know the chapter is
 * coming before you know the words in it.
 *
 * Filing goes through `moveDeckToBook` rather than a bookId parameter on
 * the create action, because that action already exists and already does
 * exactly this. A third action that creates-and-files would be a third
 * place for "which book does this deck belong to" to be decided.
 */
export function NewDeckDialog({
  bookId,
  children,
}: {
  /** File the new deck into this book. Omit for a loose deck. */
  bookId?: string;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children ?? (
          <Button>
            <Plus className="size-3.5" />
            New deck
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        title="New deck"
        description="A list of words you can drill. Add the words as you meet them."
      >
        <form
          action={async (formData) => {
            const name = String(formData.get("name") ?? "").trim();
            if (!name) return;
            try {
              const deck = await createStudyDeck(name, []);
              if (bookId) await moveDeckToBook(deck.id, bookId);
              setOpen(false);
              toast.success(`Added ${name}`);
              // Inside a book you are already looking at the list the
              // deck just joined, so a refresh shows it in place. A loose
              // deck has no such page to appear on — landing in it is the
              // only way the learner sees what they just made.
              if (bookId) router.refresh();
              else router.push(`/decks/${deck.id}`);
            } catch (err) {
              console.error("study: failed to create deck", err);
              toast.error("Could not create that deck.");
            }
          }}
          className="space-y-4"
        >
          <Field label="Deck name">
            <Input
              name="name"
              required
              maxLength={80}
              autoFocus
              placeholder="Chapter 1 vocabulary"
            />
          </Field>
          <SubmitButton className="w-full">Create deck</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
