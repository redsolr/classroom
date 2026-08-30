/**
 * Sync the learning-path catalog (src/content/study-paths.ts) into the
 * database — upsert paths by slug, replace their steps wholesale so the
 * checked-in catalog stays the source of truth. Learner ENROLMENTS are
 * their own rows and are never touched, which is why steps can be
 * rewritten safely: progress is derived from review evidence, not stored
 * against a step id.
 *
 *   npm run db:seed:paths                              → local DB
 *   $env:DATABASE_URL="postgres://…"; npx tsx scripts/seed-paths.ts
 *
 * ALSO RUNS ON EVERY DEPLOY (`vercel-build`, right after the packs) for
 * the same reason they do: shipped content travels with the deploy
 * instead of waiting on someone to remember a manual seed per
 * environment.
 */
import { eq } from "drizzle-orm";
import { db, studyPacks, studyPathSteps, studyPaths } from "../src/db";
import { STUDY_PATH_CATALOG } from "../src/content/study-paths";

async function main() {
  // A step pointing at a pack that does not exist would render as a
  // dead link and, worse, could never be completed — so this fails the
  // seed rather than shipping it. Checked against the DATABASE, not the
  // catalog file, because the packs seed is what makes them real.
  const packSlugs = new Set(
    (await db.select({ slug: studyPacks.slug }).from(studyPacks)).map(
      (row) => row.slug,
    ),
  );
  for (const path of STUDY_PATH_CATALOG) {
    for (const step of path.steps) {
      if (step.packSlug && !packSlugs.has(step.packSlug)) {
        throw new Error(
          `Path "${path.slug}" step "${step.title}" points at unknown pack "${step.packSlug}". ` +
            `Run db:seed:packs first, or fix the slug in src/content/study-paths.ts.`,
        );
      }
    }
  }

  for (const [position, path] of STUDY_PATH_CATALOG.entries()) {
    const existing = await db.query.studyPaths.findFirst({
      where: eq(studyPaths.slug, path.slug),
    });

    let pathId: string;
    if (existing) {
      pathId = existing.id;
      await db
        .update(studyPaths)
        .set({
          name: path.name,
          language: path.language,
          description: path.description,
          position,
          updatedAt: new Date(),
        })
        .where(eq(studyPaths.id, pathId));
      await db.delete(studyPathSteps).where(eq(studyPathSteps.pathId, pathId));
    } else {
      const [created] = await db
        .insert(studyPaths)
        .values({
          slug: path.slug,
          name: path.name,
          language: path.language,
          description: path.description,
          position,
        })
        .returning({ id: studyPaths.id });
      pathId = created.id;
    }

    await db.insert(studyPathSteps).values(
      path.steps.map((step, stepPosition) => ({
        pathId,
        position: stepPosition,
        kind: step.kind,
        title: step.title,
        detail: step.detail,
        packSlug: step.packSlug ?? null,
        target: step.target,
      })),
    );

    console.log(`✓ ${path.name} — ${path.steps.length} steps`);
  }

  console.log(`Seeded ${STUDY_PATH_CATALOG.length} learning paths.`);
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error("seed-paths failed", error);
  process.exit(1);
});
