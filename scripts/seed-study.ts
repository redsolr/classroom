/**
 * Seed a learner's SELF-STUDY space with realistic demo data — projects
 * (French + Japanese) with chat history, a loose generic chat, a
 * categorized vocabulary, and one curated list. Idempotent per surface:
 * anything this script created before is wiped (by its seed names) and
 * re-created; the learner's own data is never touched.
 *
 *   npx tsx --env-file=.env.local scripts/seed-study.ts you@example.com
 *   $env:DATABASE_URL="postgres://…"; npx tsx scripts/seed-study.ts you@example.com
 *
 * The learner must have signed in at least once (the learner row is
 * created by auth, never by this script).
 */
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  learners,
  studyMessages,
  studyProjects,
  studyThreads,
  studyVocab,
  studyVocabListItems,
  studyVocabLists,
} from "../src/db";

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

const SEED_PROJECTS = ["French", "Japanese"] as const;
const SEED_LOOSE_THREADS = ["Plan my study week"] as const;
const SEED_LISTS = ["Common French verbs"] as const;

type Turn = { role: "user" | "assistant"; content: string };

const MODEL = "gpt-5.6-terra";

const FRENCH_CHATS: { title: string; ageDays: number; turns: Turn[] }[] = [
  {
    title: "Ordering coffee in Paris",
    ageDays: 2,
    turns: [
      { role: "user", content: "How do I order a coffee politely in Paris?" },
      {
        role: "assistant",
        content:
          "Walk up, smile, and start with the greeting — it matters more than the coffee: « Bonjour ! Un café, s'il vous plaît. »\n\nA few variations:\n- Un café allongé — closer to an americano\n- Un café crème — with steamed milk\n- Une noisette — espresso with a dash of milk\n\nVOCAB: s'il vous plaît — please (formal)\nVOCAB: une noisette — espresso with a dash of milk",
      },
      { role: "user", content: "Et pour payer? Je dis quoi?" },
      {
        role: "assistant",
        content:
          "Parfait, tu passes au français ! Pour payer :\n\n« L'addition, s'il vous plaît » (the bill, please) — ou au comptoir simplement « Je vous dois combien ? » (how much do I owe you?).\n\nSmall fix: « Et pour payer, qu'est-ce que je dis ? » sounds more natural than « je dis quoi » in a polite setting — keep « je dis quoi » for friends.\n\nVOCAB: l'addition — the bill",
      },
      { role: "user", content: "Je vous dois combien... d'accord. Et si je veux un croissant aussi?" },
      {
        role: "assistant",
        content:
          "Facile : « Et un croissant avec ça, s'il vous plaît. »\n\nOr order both at once: « Un café et un croissant, s'il vous plaît. » The waiter might ask « Sur place ou à emporter ? » (for here or to go?) — answer « Sur place » or « À emporter ».\n\nVOCAB: à emporter — to go / takeaway",
      },
    ],
  },
  {
    title: "Passé composé drill",
    ageDays: 1,
    turns: [
      { role: "user", content: "Drill me on passé composé with être verbs" },
      {
        role: "assistant",
        content:
          "Allons-y ! The être family (DR MRS VANDERTRAMP) — movement and change-of-state verbs. Translate this one:\n\n« She went to the station. »\n\n(Remember: with être, the participle agrees with the subject.)",
      },
      { role: "user", content: "Elle est allée à la gare" },
      {
        role: "assistant",
        content:
          "Parfait ! « Elle est allée à la gare. » — the extra -e on allée is exactly right, feminine agreement with elle.\n\nNext one, a bit harder: « We (mixed group) arrived late. »\n\nVOCAB: la gare — train station",
      },
    ],
  },
];

const JAPANESE_CHATS: { title: string; ageDays: number; turns: Turn[] }[] = [
  {
    title: "Konbini small talk",
    ageDays: 3,
    turns: [
      {
        role: "user",
        content: "What do convenience store clerks say to me in Japan?",
      },
      {
        role: "assistant",
        content:
          "The konbini script is very fixed — you'll hear these every time:\n\n- いらっしゃいませ (irasshaimase) — welcome! (no reply needed)\n- 袋はご利用ですか？ (fukuro wa goriyō desu ka?) — do you need a bag?\n- 温めますか？ (atatamemasu ka?) — shall I heat it up?\n\nYour whole toolkit as a customer: はい / いいえ、大丈夫です (hai / iie, daijōbu desu).\n\nVOCAB: 袋 — bag\nVOCAB: 温めます — to heat up (polite)",
      },
      { role: "user", content: "だいじょうぶです is like 'no thanks'?" },
      {
        role: "assistant",
        content:
          "そうです！ 大丈夫です (daijōbu desu) literally means \"it's fine\", and in context it's a soft polite refusal — exactly like \"I'm good, thanks.\"\n\nSame word also works as \"are you OK?\" → 大丈夫ですか？ Context does all the work.\n\nVOCAB: 大丈夫 — fine / OK / no problem",
      },
    ],
  },
];

const GENERIC_CHAT: { title: string; ageDays: number; turns: Turn[] } = {
  title: "Plan my study week",
  ageDays: 0,
  turns: [
    {
      role: "user",
      content:
        "Help me plan a study week: 30 min/day, French is the priority, Japanese on weekends.",
    },
    {
      role: "assistant",
      content:
        "Here's a light structure that fits 30 minutes:\n\nMon–Fri (French)\n- 10 min: vocabulary review (your due cards first)\n- 15 min: one chat session with me — pick a scenario (café, train, meeting)\n- 5 min: save the new words you met\n\nSat–Sun (Japanese)\n- 10 min: kana/vocab review\n- 20 min: one konbini/travel dialogue practice\n\nWant me to hold you to it? Start each session by telling me the day's slot.",
    },
  ],
};

/** French vocab — categorized so the filter/list features show off. */
const FRENCH_VOCAB: {
  term: string;
  meaning: string;
  category: string | null;
  example?: string;
}[] = [
  { term: "aller", meaning: "to go", category: "Verb", example: "Je vais à la gare." },
  { term: "faire", meaning: "to do / to make", category: "Verb", example: "Qu'est-ce que tu fais ?" },
  { term: "prendre", meaning: "to take / to have (food)", category: "Verb", example: "Je prends un café." },
  { term: "vouloir", meaning: "to want", category: "Verb", example: "Je voudrais un croissant." },
  { term: "pouvoir", meaning: "can / to be able to", category: "Verb" },
  { term: "devoir", meaning: "must / to owe", category: "Verb", example: "Je vous dois combien ?" },
  { term: "la gare", meaning: "train station", category: "Noun" },
  { term: "l'addition", meaning: "the bill", category: "Noun", example: "L'addition, s'il vous plaît." },
  { term: "le billet", meaning: "ticket", category: "Noun" },
  { term: "s'il vous plaît", meaning: "please (formal)", category: "Phrase" },
  { term: "à emporter", meaning: "to go / takeaway", category: "Phrase" },
  { term: "ça marche", meaning: "that works / OK", category: "Expression" },
  { term: "en fait", meaning: "actually", category: "Adverb" },
];

const JAPANESE_VOCAB: {
  term: string;
  reading: string;
  meaning: string;
  category: string | null;
}[] = [
  { term: "行く", reading: "iku", meaning: "to go", category: "Verb" },
  { term: "食べる", reading: "taberu", meaning: "to eat", category: "Verb" },
  { term: "飲む", reading: "nomu", meaning: "to drink", category: "Verb" },
  { term: "温める", reading: "atatameru", meaning: "to heat up", category: "Verb" },
  { term: "袋", reading: "fukuro", meaning: "bag", category: "Noun" },
  { term: "駅", reading: "eki", meaning: "station", category: "Noun" },
  { term: "切符", reading: "kippu", meaning: "ticket", category: "Noun" },
  { term: "大丈夫", reading: "daijōbu", meaning: "fine / OK / no problem", category: "Expression" },
  { term: "いらっしゃいませ", reading: "irasshaimase", meaning: "welcome (to a shop)", category: "Phrase" },
  { term: "お願いします", reading: "onegai shimasu", meaning: "please / I request", category: "Phrase" },
];

async function main() {
  const email = process.env.SEED_LEARNER_EMAIL ?? process.argv[2];
  if (!email) {
    console.error(
      "Usage: npx tsx --env-file=.env.local scripts/seed-study.ts <learner-email>",
    );
    process.exit(1);
  }

  const learner = await db.query.learners.findFirst({
    where: eq(learners.email, email),
  });
  if (!learner) {
    console.error(
      `No learner found for ${email} in this database.\n` +
        "Sign in to the app once with that account (the learner row is created by auth), then re-run.",
    );
    process.exit(1);
  }
  console.log(`Seeding self-study data for ${email} (${learner.id})`);

  // -------------------------------------------------------------------
  // Wipe THIS SCRIPT's previous output only — matched by the fixed seed
  // names. The learner's own projects/chats/vocab are left alone.
  // -------------------------------------------------------------------
  const oldProjects = await db
    .select({ id: studyProjects.id })
    .from(studyProjects)
    .where(
      and(
        eq(studyProjects.learnerId, learner.id),
        inArray(studyProjects.name, [...SEED_PROJECTS]),
      ),
    );
  if (oldProjects.length > 0) {
    const ids = oldProjects.map((p) => p.id);
    // Threads cascade their messages; project delete would only null the
    // FK, so remove the threads explicitly first.
    await db.delete(studyThreads).where(inArray(studyThreads.projectId, ids));
    await db.delete(studyProjects).where(inArray(studyProjects.id, ids));
  }
  await db
    .delete(studyThreads)
    .where(
      and(
        eq(studyThreads.learnerId, learner.id),
        inArray(studyThreads.title, [...SEED_LOOSE_THREADS]),
      ),
    );
  await db
    .delete(studyVocabLists)
    .where(
      and(
        eq(studyVocabLists.learnerId, learner.id),
        inArray(studyVocabLists.name, [...SEED_LISTS]),
      ),
    );
  const seedTerms = [
    ...FRENCH_VOCAB.map((v) => v.term),
    ...JAPANESE_VOCAB.map((v) => v.term),
  ];
  await db
    .delete(studyVocab)
    .where(
      and(
        eq(studyVocab.learnerId, learner.id),
        inArray(studyVocab.term, seedTerms),
      ),
    );

  // -------------------------------------------------------------------
  // Projects + chats
  // -------------------------------------------------------------------
  const [french] = await db
    .insert(studyProjects)
    .values({
      learnerId: learner.id,
      name: "French",
      language: "French",
      instructions:
        "Correct my mistakes briefly and kindly, keep replies short, and always give one follow-up question so the conversation keeps moving.",
    })
    .returning({ id: studyProjects.id });

  const [japanese] = await db
    .insert(studyProjects)
    .values({
      learnerId: learner.id,
      name: "Japanese",
      language: "Japanese",
      instructions:
        "Always include readings (romaji) for kanji. Keep explanations compact.",
    })
    .returning({ id: studyProjects.id });

  async function seedThread(
    projectId: string | null,
    language: string | null,
    chat: { title: string; ageDays: number; turns: Turn[] },
  ) {
    const base = Date.now() - chat.ageDays * DAY;
    const [thread] = await db
      .insert(studyThreads)
      .values({
        learnerId: learner!.id,
        projectId,
        language,
        title: chat.title,
        createdAt: new Date(base),
        updatedAt: new Date(base + chat.turns.length * 2 * MINUTE),
      })
      .returning({ id: studyThreads.id });
    await db.insert(studyMessages).values(
      chat.turns.map((turn, i) => ({
        learnerId: learner!.id,
        threadId: thread.id,
        role: turn.role,
        content: turn.content,
        model: turn.role === "assistant" ? MODEL : null,
        createdAt: new Date(base + i * 2 * MINUTE),
      })),
    );
  }

  for (const chat of FRENCH_CHATS) await seedThread(french.id, "French", chat);
  for (const chat of JAPANESE_CHATS)
    await seedThread(japanese.id, "Japanese", chat);
  await seedThread(null, null, GENERIC_CHAT);

  // -------------------------------------------------------------------
  // Vocabulary + the curated list
  // -------------------------------------------------------------------
  const frenchRows = await db
    .insert(studyVocab)
    .values(
      FRENCH_VOCAB.map((v, i) => ({
        learnerId: learner!.id,
        language: "French",
        term: v.term,
        meaning: v.meaning,
        example: v.example ?? null,
        category: v.category,
        createdAt: new Date(Date.now() - 2 * DAY + i * MINUTE),
      })),
    )
    .returning({ id: studyVocab.id, term: studyVocab.term });

  await db.insert(studyVocab).values(
    JAPANESE_VOCAB.map((v, i) => ({
      learnerId: learner!.id,
      language: "Japanese",
      term: v.term,
      reading: v.reading,
      meaning: v.meaning,
      category: v.category,
      createdAt: new Date(Date.now() - 3 * DAY + i * MINUTE),
    })),
  );

  const verbTerms = new Set(
    FRENCH_VOCAB.filter((v) => v.category === "Verb").map((v) => v.term),
  );
  const verbRows = frenchRows.filter((r) => verbTerms.has(r.term));
  const [list] = await db
    .insert(studyVocabLists)
    .values({ learnerId: learner.id, name: "Common French verbs" })
    .returning({ id: studyVocabLists.id });
  await db.insert(studyVocabListItems).values(
    verbRows.map((row, position) => ({
      listId: list.id,
      vocabId: row.id,
      position,
    })),
  );

  console.log(
    `Seeded: 2 projects, ${FRENCH_CHATS.length + JAPANESE_CHATS.length + 1} chats, ` +
      `${FRENCH_VOCAB.length + JAPANESE_VOCAB.length} vocab words, ` +
      `1 list (${verbRows.length} verbs).`,
  );
  process.exit(0);
}

main().catch((error) => {
  console.error("seed-study failed:", error);
  process.exit(1);
});
