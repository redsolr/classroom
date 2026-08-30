import { revalidatePath } from "next/cache";

/**
 * The sidebar chat tree is LAYOUT data — all three authed layouts fetch
 * it — so every thread/project/book mutation must revalidate the layout,
 * not the page. Learned from e2e: a freshly created project stayed
 * invisible until a hard reload, because an action redirect is a soft
 * navigation and the layout was never re-rendered.
 *
 * It lives outside `src/lib/actions/` deliberately. Everything exported
 * from that directory is compiled into a public POST endpoint, so a
 * helper placed there would become callable on its own and would trip
 * the auth ratchet for not resolving a caller it was never meant to.
 * It sat inside `study.ts` while that file was the only caller; the
 * split gave it six, which is exactly when a private helper needs a
 * home of its own rather than six copies.
 */
export function revalidateStudyTree(): void {
  revalidatePath("/", "layout");
}
