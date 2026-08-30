import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireLearner } from "@/lib/auth";
import { loadPathForLearner } from "@/lib/study-path-queries";
import { followStudyPath, unfollowStudyPath } from "@/lib/actions/paths";
import { PathTree } from "@/components/study/path-tree";
import { SubmitButton } from "@/components/ui/button";
import { BackLink, PageHeader, PageShell } from "@/components/ui/page-header";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const learner = await requireLearner();
  const { slug } = await params;
  const path = await loadPathForLearner(learner.id, slug);
  return { title: path?.name ?? "Learning path" };
}

/** One path on its own page — the same tree the index leads with, for
 * the paths that did not get to be the lead. */
export default async function StudyPathDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const learner = await requireLearner();
  const { slug } = await params;
  const path = await loadPathForLearner(learner.id, slug);
  if (!path) notFound();

  return (
    <PageShell width="wide">
      <BackLink href="/path">Learning path</BackLink>
      <PageHeader
        title={path.name}
        subtitle={path.description ?? undefined}
        actions={
          <form
            action={
              path.enrolled
                ? unfollowStudyPath.bind(null, path.slug)
                : followStudyPath.bind(null, path.slug)
            }
          >
            <SubmitButton variant={path.enrolled ? "ghost" : "primary"}>
              {path.enrolled ? "Stop following" : "Follow this path"}
            </SubmitButton>
          </form>
        }
      >
        <p className="mt-2 text-[0.8125rem] text-fg-tertiary">
          {path.language} · {path.completedSteps} of {path.steps.length} nodes
          done
        </p>
      </PageHeader>

      <PathTree
        pathSlug={path.slug}
        pathName={path.name}
        steps={path.steps}
        nextId={path.next?.id}
      />
    </PageShell>
  );
}
