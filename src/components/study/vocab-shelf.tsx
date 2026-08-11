"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookMarked,
  Layers,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  addStudyVocab,
  createStudyVocabList,
  deleteStudyVocabList,
  renameStudyVocabList,
  toggleStudyVocabListPin,
} from "@/lib/actions/study";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownSeparator,
  DropdownTrigger,
} from "@/components/ui/dropdown";
import { Field, Input, Select } from "@/components/ui/field";
import { STUDY_LANGUAGES } from "@/lib/study-languages";
import { STUDY_VOCAB_CATEGORIES } from "@/lib/study-vocab-categories";
import type { VocabListSummary } from "@/components/study/vocab-table";

/**
 * The vocabulary landing: the learner's BOOKSHELF. All words + one row
 * per book (imported packs land here too), each openable in one tap —
 * no giant table or add-form up front. Book management (pin to sidebar,
 * rename inline, delete) lives on each row's ⋯ menu.
 */

/** "New word" for the general dictionary — the old add form, as a dialog. */
export function AddWordDialogButton() {
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        await addStudyVocab(data);
        setOpen(false);
      } catch (err) {
        console.error("vocab: failed to add word", err);
        setError("Couldn't add the word — please try again.");
      }
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="primary">New word</Button>
      </DialogTrigger>
      <DialogContent title="New word" description="Added to your dictionary.">
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Language">
              <Select name="language" defaultValue="French">
                {STUDY_LANGUAGES.map((lang) => (
                  <option key={lang} value={lang}>
                    {lang}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Type">
              <Select name="category" defaultValue="">
                <option value="">No category</option>
                {STUDY_VOCAB_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Word or phrase">
            <Input name="term" required autoFocus maxLength={200} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Reading" hint="furigana, romaji, IPA">
              <Input name="reading" maxLength={200} placeholder="Optional" />
            </Field>
            <Field label="Meaning">
              <Input name="meaning" maxLength={500} placeholder="Optional" />
            </Field>
          </div>
          <Field label="Example">
            <Input name="example" maxLength={1000} placeholder="Optional" />
          </Field>
          {error && (
            <p role="alert" className="text-[0.875rem] text-danger">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" loading={pending}>
            Add word
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NewBookDialog() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get("name") ?? "").trim();
    if (!name) return;
    startTransition(async () => {
      try {
        const { id } = await createStudyVocabList(name, []);
        setOpen(false);
        router.push(`/study/vocab?book=${id}`);
      } catch (err) {
        console.error("vocab: failed to create book", err);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-3.5" />
          New book
        </Button>
      </DialogTrigger>
      <DialogContent
        title="New book"
        description="A themed collection inside your dictionary — pin it to the sidebar for one-tap access."
      >
        <form onSubmit={onSubmit} className="flex items-center gap-2">
          <Input
            name="name"
            required
            autoFocus
            maxLength={80}
            placeholder="FF7 vocab · Travel phrases · …"
            aria-label="Book name"
          />
          <Button type="submit" variant="primary" loading={pending}>
            Create
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BookRow({ list }: { list: VocabListSummary }) {
  const router = useRouter();
  const [renaming, setRenaming] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  const commitRename = () => {
    const name = draft.trim();
    setRenaming(false);
    if (!name || name === list.name) return;
    startTransition(async () => {
      try {
        await renameStudyVocabList(list.id, name);
      } catch (err) {
        console.error("vocab: failed to rename book", err);
      }
    });
  };

  return (
    <li className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-hover">
      <BookMarked className="size-4 shrink-0 text-accent" />
      {renaming ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              commitRename();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              setRenaming(false);
            }
          }}
          maxLength={80}
          aria-label="Rename book"
          className="min-w-0 flex-1 rounded border border-accent bg-transparent px-1.5 py-0.5 text-[0.9375rem] focus:outline-none"
        />
      ) : (
        <Link
          href={`/study/vocab?book=${list.id}`}
          className="min-w-0 flex-1"
        >
          <span className="block truncate text-[0.9375rem] font-medium">
            {list.name}
            {list.pinned && (
              <Pin className="ml-1.5 inline size-3 text-fg-tertiary" />
            )}
          </span>
          <span className="text-[0.8125rem] text-fg-tertiary">
            {list.itemIds.length} word{list.itemIds.length === 1 ? "" : "s"}
          </span>
        </Link>
      )}
      <Dropdown>
        <DropdownTrigger asChild>
          <button
            type="button"
            aria-label={`${list.name} options`}
            title="Book options"
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-fg-tertiary opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 hover:text-fg max-lg:opacity-100 data-[state=open]:opacity-100 data-[state=open]:text-fg"
          >
            <MoreHorizontal className="size-4" />
          </button>
        </DropdownTrigger>
        <DropdownContent align="start" className="w-52">
          <DropdownItem
            disabled={pending}
            onSelect={() => {
              startTransition(async () => {
                try {
                  await toggleStudyVocabListPin(list.id);
                  router.refresh();
                } catch (err) {
                  console.error("vocab: failed to toggle book pin", err);
                }
              });
            }}
          >
            {list.pinned ? (
              <PinOff className="size-4 text-fg-tertiary" />
            ) : (
              <Pin className="size-4 text-fg-tertiary" />
            )}
            {list.pinned ? "Unpin from sidebar" : "Pin to sidebar"}
          </DropdownItem>
          <DropdownItem
            disabled={pending}
            onSelect={() => {
              setDraft(list.name);
              setRenaming(true);
            }}
          >
            <Pencil className="size-4 text-fg-tertiary" />
            Rename
          </DropdownItem>
          <DropdownSeparator />
          <DropdownItem
            disabled={pending}
            className="text-danger"
            onSelect={() => {
              if (
                !window.confirm(
                  `Delete “${list.name}”? Its words stay in your dictionary.`,
                )
              )
                return;
              startTransition(async () => {
                try {
                  await deleteStudyVocabList(list.id);
                } catch (err) {
                  console.error("vocab: failed to delete book", err);
                }
              });
            }}
          >
            <Trash2 className="size-4" />
            Delete book
          </DropdownItem>
        </DropdownContent>
      </Dropdown>
    </li>
  );
}

export function VocabShelf({
  lists,
  totalWords,
}: {
  lists: VocabListSummary[];
  totalWords: number;
}) {
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <AddWordDialogButton />
        <NewBookDialog />
        <Link
          href="/study/packs"
          className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-[0.9375rem] font-medium text-accent-text transition-colors hover:bg-surface-hover"
        >
          <Sparkles className="size-3.5" />
          Browse curated books
        </Link>
      </div>

      <ul className="divide-y divide-border rounded-xl bg-surface shadow-card">
        <li className="transition-colors hover:bg-surface-hover">
          <Link
            href="/study/vocab?book=all"
            className="flex items-center gap-3 px-4 py-3"
          >
            <Layers className="size-4 shrink-0 text-fg-tertiary" />
            <span className="min-w-0 flex-1">
              <span className="block text-[0.9375rem] font-medium">
                All words
              </span>
              <span className="text-[0.8125rem] text-fg-tertiary">
                {totalWords} word{totalWords === 1 ? "" : "s"} · every language
              </span>
            </span>
          </Link>
        </li>
        {lists.map((list) => (
          <BookRow key={list.id} list={list} />
        ))}
      </ul>

      {lists.length === 0 && (
        <p className="mt-3 text-[0.875rem] text-fg-tertiary">
          No books yet — create one, save a filtered view as a book, or
          import a curated one.
        </p>
      )}
    </div>
  );
}
