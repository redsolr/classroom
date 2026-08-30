"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createStudyDeck } from "@/lib/actions/decks";
import { moveDeckToBook } from "@/lib/actions/books";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";

/**
 * A new, empty deck inside a book.
 *
 * `createStudyDeck` takes the word ids to seed a deck with — it was
 * built for "save this filtered view as a deck", which is still the main
 * way decks get made. An empty one is the other way: you know the
 * chapter is coming before you know the words in it.
 *
 * Two calls rather than a new action with a bookId parameter, because
 * the second is `moveDeckToBook`, which already exists and already does
 * exactly this. A third action that creates-and-files would be a third
 * place for "which book does this deck belong to" to be decided.
 */
export function NewDeckInBookDialog({
  bookId,
  children,
}: {
  bookId: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent
        title="New deck"
        description="A list of words you can drill. Add the words as you meet them."
      >
        <form
          action={async (formData) => {
            const name = String(formData.get("name") ?? "").trim();
            if (!name) return;
            const deck = await createStudyDeck(name, []);
            await moveDeckToBook(deck.id, bookId);
            setOpen(false);
            toast.success(`Added ${name}`);
            router.refresh();
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
