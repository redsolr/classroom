/**
 * Sync the curated-pack catalog (src/content/study-packs.ts) into the
 * database — upsert packs by slug, replace their items wholesale so the
 * checked-in catalog is always the source of truth. Learner copies are
 * their own rows and are never touched.
 *
 *   npm run db:seed:packs                              → local DB
 *   $env:DATABASE_URL="postgres://…"; npx tsx scripts/seed-packs.ts
 */
import { eq } from "drizzle-orm";
import { db, studyPackItems, studyPacks } from "../src/db";
import { STUDY_PACK_CATALOG } from "../src/content/study-packs";

async function main() {
  for (const pack of STUDY_PACK_CATALOG) {
    const existing = await db.query.studyPacks.findFirst({
      where: eq(studyPacks.slug, pack.slug),
    });
    let packId: string;
    if (existing) {
      packId = existing.id;
      await db
        .update(studyPacks)
        .set({
          name: pack.name,
          language: pack.language,
          description: pack.description,
          updatedAt: new Date(),
        })
        .where(eq(studyPacks.id, packId));
      await db.delete(studyPackItems).where(eq(studyPackItems.packId, packId));
    } else {
      const [created] = await db
        .insert(studyPacks)
        .values({
          slug: pack.slug,
          name: pack.name,
          language: pack.language,
          description: pack.description,
        })
        .returning({ id: studyPacks.id });
      packId = created.id;
    }
    await db.insert(studyPackItems).values(
      pack.items.map((item, position) => ({
        packId,
        term: item.term,
        reading: item.reading ?? null,
        meaning: item.meaning,
        example: item.example ?? null,
        category: item.category ?? null,
        position,
      })),
    );
    console.log(`✓ ${pack.slug} (${pack.items.length} items)`);
  }
  console.log(`Synced ${STUDY_PACK_CATALOG.length} packs.`);
  process.exit(0);
}

main().catch((error) => {
  console.error("seed-packs failed:", error);
  process.exit(1);
});
