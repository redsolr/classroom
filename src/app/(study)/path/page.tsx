import type { Metadata } from "next";
import Link from "next/link";
import { Route, Play } from "lucide-react";
import { requireLearner } from "@/lib/auth";
import { loadPathsForLearner } from "@/lib/study-path-queries";
import { followStudyPath, unfollowStudyPath } from "@/lib/actions/paths";
import { PathTree } from "@/components/study/path-tree";
import { SubmitButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, PageShell } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Learning path" };

/**
 * THE LEARNING PATH — the answer to "what should I learn first".
 *
 * Everything else in the study surface is a place to put things you
 * already decided to learn. This is the only page with an opinion about
 * ORDER, which is the thing a beginner cannot supply for themselves and
 * the reason self-study stalls in month two: not lack of material, lack
 * of a next thing.
 *
 * It is drawn as a TREE (`components/study/path-tree.tsx`): one trunk,
 * three limbs — vocabulary, grammar, conversation — because a curriculum
 * is not one queue, and the numbered spine this replaced said it was.
 * The spine could not show the thing a learner most needs to see about
 * their own study, which is which KIND of work they have quietly stopped
 * doing. On a tree that is a whole limb sitting grey.
 *
 * One path is expanded — the one they are following, or the one we would
 * recommend — and the rest are listed underneath. Not a grid of equal
 * options: a learner who needed guidance is exactly the learner who
 * cannot pick between five curricula.
 */
export default async function StudyPathPage() {
  const learner = await requireLearner();
  const paths = await loadPathsForLearner(learner.id);

  if (paths.length === 0) {
    return (
      <PageShell>
        <PageHeader icon={Route} title="Learning path" />
        <EmptyState
          title="No paths yet"
          description="Learning paths ship with the app — if this is empty, the content seed hasn't run for this environment."
        />
      </PageShell>
    );
  }

  // Sorted already: followed first, then a language they study, then the
  // rest. The head of that list IS the recommendation.
  const [lead, ...others] = paths;

  return (
    <PageShell width="wide">
      <PageHeader
        icon={Route}
        title="Learning path"
        subtitle={
          lead.enrolled
            ? "The order we'd take it in. Jump around whenever you like — this just keeps pointing at the foundation."
            : "A guided order for the language you're learning. Nothing is locked; it just tells you what to do next."
        }
        actions={
          <form
            action={
              lead.enrolled
                ? unfollowStudyPath.bind(null, lead.slug)
                : followStudyPath.bind(null, lead.slug)
            }
          >
            <SubmitButton variant={lead.enrolled ? "ghost" : "primary"}>
              {lead.enrolled ? "Stop following" : "Follow this path"}
            </SubmitButton>
          </form>
        }
      />

      <section className="path-lead space-y-4">
        <div className="path-lead-intro max-w-3xl">
          <h2 className="text-[1.25rem] font-semibold">{lead.name}</h2>
          {lead.description && (
            // Held back on a phone: three lines of prose there push the
            // tree — the thing the page is for — entirely below the
            // fold. The name and the count still say what it is.
            <p className="mt-1 hidden text-[0.9375rem] text-fg-secondary md:block">
              {lead.description}
            </p>
          )}
          <p className="mt-2 text-[0.8125rem] text-fg-tertiary">
            {lead.language} · {lead.completedSteps} of {lead.steps.length} nodes
            done
            {lead.enrolled ? " · following" : ""}
          </p>
        </div>

        <PathTree
          pathSlug={lead.slug}
          pathName={lead.name}
          steps={lead.steps}
          nextId={lead.next?.id}
        />
      </section>

      {others.length > 0 && (
        <section className="path-others mt-8 max-w-3xl">
          <h2 className="mb-3 text-[1rem] font-semibold">Other paths</h2>
          <ul className="divide-y divide-border overflow-hidden rounded-xl bg-surface shadow-card">
            {others.map((path) => (
              <li key={path.id}>
                <Link
                  href={`/path/${path.slug}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-hover"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-text">
                    <Play className="size-4 fill-current" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.9375rem] font-semibold">
                      {path.name}
                    </span>
                    <span className="block text-[0.8125rem] text-fg-tertiary">
                      {path.language} · {path.steps.length} nodes
                      {path.completedSteps > 0 &&
                        ` · ${path.completedSteps} done`}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </PageShell>
  );
}
