import { revalidatePath } from "next/cache";

/**
 * WHICH PAGES A STUDY MUTATION INVALIDATES — decided once, per entity.
 *
 * These live outside `src/lib/actions/` deliberately. Everything exported
 * from that directory is compiled into a public POST endpoint, so a
 * helper placed there would become callable on its own and would trip
 * the auth ratchet for not resolving a caller it was never meant to.
 *
 * ── Why per-entity and not per-action (2026-08-30) ──────────────────
 *
 * Every action used to spell its own fan-out inline, and twenty-five
 * copies of a decision drift the way twenty-five copies of anything
 * drift. They had, and each drift was a stale page a learner would see:
 *
 *   · No deck action revalidated `/decks` or `/decks/<id>` — the shelf
 *     and the deck page the books-as-containers arc had just added. You
 *     could rename a deck and watch the old name survive on its own page.
 *   · `renameStudyBook` revalidated `/books` and `/books/<id>` but not
 *     `/reading`, so renaming a book you had read left the old title on
 *     the reading list.
 *   · `toggleStudyBookRead` was the one book action that forgot the
 *     layout, so the sidebar kept the pre-toggle tree.
 *
 * The question "where does a book appear?" has ONE answer, and it is a
 * property of the entity, not of the verb that changed it. Deliberately
 * blunt: these paths are all dynamic per-learner pages, so an extra
 * invalidation costs a re-render nobody sees, while a missing one costs
 * a learner believing the app lost their edit.
 */

/**
 * The sidebar tree is LAYOUT data — all three authed layouts fetch it —
 * so a mutation must revalidate the layout, not the page. Learned from
 * e2e: a freshly created project stayed invisible until a hard reload,
 * because an action redirect is a soft navigation and the layout was
 * never re-rendered.
 */
export function revalidateStudyTree(): void {
  revalidatePath("/", "layout");
}

/**
 * Everywhere a BOOK is rendered.
 *
 * `/reading` and `/reading/<id>` are in here because the reading list is
 * a FILTER over the same rows since the 2026-08-30 merge — it is not a
 * separate thing that could have a separate answer. `/notes` is here
 * because a note wears its book's name as a chip.
 */
export function revalidateBook(bookId?: string | null): void {
  revalidateStudyTree();
  revalidatePath("/books");
  revalidatePath("/reading");
  revalidatePath("/notes");
  if (bookId) {
    revalidatePath(`/books/${bookId}`);
    revalidatePath(`/reading/${bookId}`);
  }
}

/**
 * Everywhere a DECK is rendered.
 *
 * `/books` is in the list because the deck-management list lives on that
 * page, and `/official` because a pack row shows which decks hold a word
 * and names the default deck in its heart tooltip.
 */
export function revalidateDeck(deckId?: string | null): void {
  revalidateStudyTree();
  revalidatePath("/books");
  revalidatePath("/decks");
  revalidatePath("/official");
  if (deckId) revalidatePath(`/decks/${deckId}`);
}

/**
 * Everywhere a WORD is rendered.
 *
 * A word shows wherever its decks show, plus the LIKED LAYER — which is
 * `/decks/all`, the `/decks/[deckId]` page with the id `all`. That last
 * one is why this exists: saving a word revalidated `/books` and nothing
 * else, from back when the word table lived at `/books?book=all`. The
 * 2026-08-30 merge moved the table to `/decks/all` and left every word
 * mutation pointing at the page it had left.
 *
 * NOT for grading a card. `reviewStudyVocab` deliberately revalidates
 * neither the deck nor the liked layer: the drill hands the client a
 * session snapshot, and refreshing mid-session yanks cards out from
 * under the learner and re-queues "again" cards early.
 */
export function revalidateWord(): void {
  revalidateDeck("all");
}
