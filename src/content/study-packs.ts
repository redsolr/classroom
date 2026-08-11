/**
 * The shipped curated-pack catalog — the single source of truth
 * `scripts/seed-packs.ts` syncs into `study_packs` (upsert by slug,
 * items replaced wholesale). Add a pack or item here, run
 * `npm run db:seed:packs` per environment, and it's live.
 */

export type PackItemContent = {
  term: string;
  reading?: string;
  meaning: string;
  category?: "Verb" | "Noun" | "Adjective" | "Adverb" | "Phrase" | "Expression" | "Grammar" | "Other";
  example?: string;
};

export type PackContent = {
  slug: string;
  name: string;
  language: string;
  description: string;
  items: PackItemContent[];
};

export const STUDY_PACK_CATALOG: PackContent[] = [
  {
    slug: "persona-5-japanese",
    name: "Persona 5 essentials",
    language: "Japanese",
    description:
      "The kanji and phrases you'll actually meet playing Persona 5 — palaces, phantom thieves, and Tokyo school life.",
    items: [
      { term: "怪盗", reading: "かいとう / kaitō", meaning: "phantom thief", category: "Noun" },
      { term: "心", reading: "こころ / kokoro", meaning: "heart; mind", category: "Noun" },
      { term: "改心", reading: "かいしん / kaishin", meaning: "change of heart", category: "Noun" },
      { term: "宮殿", reading: "きゅうでん / kyūden", meaning: "palace", category: "Noun" },
      { term: "認知", reading: "にんち / ninchi", meaning: "cognition", category: "Noun" },
      { term: "予告状", reading: "よこくじょう / yokokujō", meaning: "calling card (advance notice)", category: "Noun" },
      { term: "総攻撃", reading: "そうこうげき / sōkōgeki", meaning: "all-out attack", category: "Noun" },
      { term: "正義", reading: "せいぎ / seigi", meaning: "justice", category: "Noun" },
      { term: "反逆", reading: "はんぎゃく / hangyaku", meaning: "rebellion", category: "Noun" },
      { term: "絆", reading: "きずな / kizuna", meaning: "bonds; ties", category: "Noun" },
      { term: "先輩", reading: "せんぱい / senpai", meaning: "upperclassman; senior", category: "Noun" },
      { term: "放課後", reading: "ほうかご / hōkago", meaning: "after school", category: "Noun" },
      { term: "喫茶店", reading: "きっさてん / kissaten", meaning: "coffee shop; café", category: "Noun" },
      { term: "屋根裏", reading: "やねうら / yaneura", meaning: "attic", category: "Noun" },
      { term: "試験", reading: "しけん / shiken", meaning: "exam", category: "Noun" },
      { term: "盗む", reading: "ぬすむ / nusumu", meaning: "to steal", category: "Verb" },
      { term: "覚悟", reading: "かくご / kakugo", meaning: "resolve; readiness", category: "Noun" },
      { term: "オタカラ", reading: "otakara", meaning: "treasure (the palace's core desire)", category: "Noun" },
    ],
  },
  {
    slug: "anime-essentials-japanese",
    name: "Anime essentials",
    language: "Japanese",
    description:
      "The vocabulary every anime keeps reusing — heroes, rivals, training arcs, and dramatic declarations.",
    items: [
      { term: "主人公", reading: "しゅじんこう / shujinkō", meaning: "protagonist; main character", category: "Noun" },
      { term: "悪役", reading: "あくやく / akuyaku", meaning: "villain", category: "Noun" },
      { term: "必殺技", reading: "ひっさつわざ / hissatsuwaza", meaning: "signature/finishing move", category: "Noun" },
      { term: "変身", reading: "へんしん / henshin", meaning: "transformation", category: "Noun" },
      { term: "修行", reading: "しゅぎょう / shugyō", meaning: "training (arc)", category: "Noun" },
      { term: "仲間", reading: "なかま / nakama", meaning: "comrades; companions", category: "Noun" },
      { term: "魔法", reading: "まほう / mahō", meaning: "magic", category: "Noun" },
      { term: "冒険", reading: "ぼうけん / bōken", meaning: "adventure", category: "Noun" },
      { term: "運命", reading: "うんめい / unmei", meaning: "fate; destiny", category: "Noun" },
      { term: "伝説", reading: "でんせつ / densetsu", meaning: "legend", category: "Noun" },
      { term: "約束", reading: "やくそく / yakusoku", meaning: "promise", category: "Noun" },
      { term: "諦めない", reading: "あきらめない / akiramenai", meaning: "to never give up", category: "Expression" },
      { term: "戦う", reading: "たたかう / tatakau", meaning: "to fight", category: "Verb" },
      { term: "守る", reading: "まもる / mamoru", meaning: "to protect", category: "Verb" },
      { term: "強くなる", reading: "つよくなる / tsuyoku naru", meaning: "to become strong", category: "Expression" },
    ],
  },
  {
    slug: "gaming-japanese",
    name: "Gaming Japanese",
    language: "Japanese",
    description:
      "Menu-screen and RPG vocabulary — read your equipment, quests, and boss fights without a guide.",
    items: [
      { term: "攻略", reading: "こうりゃく / kōryaku", meaning: "walkthrough; strategy", category: "Noun" },
      { term: "経験値", reading: "けいけんち / keikenchi", meaning: "experience points (XP)", category: "Noun" },
      { term: "装備", reading: "そうび / sōbi", meaning: "equipment; to equip", category: "Noun" },
      { term: "回復", reading: "かいふく / kaifuku", meaning: "recovery; healing", category: "Noun" },
      { term: "勇者", reading: "ゆうしゃ / yūsha", meaning: "hero (RPG)", category: "Noun" },
      { term: "魔王", reading: "まおう / maō", meaning: "demon lord", category: "Noun" },
      { term: "剣", reading: "けん / ken", meaning: "sword", category: "Noun" },
      { term: "盾", reading: "たて / tate", meaning: "shield", category: "Noun" },
      { term: "呪文", reading: "じゅもん / jumon", meaning: "spell; incantation", category: "Noun" },
      { term: "宝箱", reading: "たからばこ / takarabako", meaning: "treasure chest", category: "Noun" },
      { term: "隠しボス", reading: "かくしボス / kakushi bosu", meaning: "hidden boss", category: "Noun" },
      { term: "敵", reading: "てき / teki", meaning: "enemy", category: "Noun" },
      { term: "味方", reading: "みかた / mikata", meaning: "ally", category: "Noun" },
      { term: "続編", reading: "ぞくへん / zokuhen", meaning: "sequel", category: "Noun" },
      { term: "体験版", reading: "たいけんばん / taikenban", meaning: "demo version", category: "Noun" },
    ],
  },
  {
    slug: "cafe-french",
    name: "Café survival French",
    language: "French",
    description:
      "Order, pay, and small-talk your way through any Parisian café politely.",
    items: [
      { term: "un café allongé", meaning: "a long black / americano-style coffee", category: "Noun" },
      { term: "une noisette", meaning: "espresso with a dash of milk", category: "Noun" },
      { term: "un café crème", meaning: "coffee with steamed milk", category: "Noun" },
      { term: "l'addition", meaning: "the bill", category: "Noun", example: "L'addition, s'il vous plaît." },
      { term: "sur place", meaning: "for here", category: "Phrase" },
      { term: "à emporter", meaning: "to go / takeaway", category: "Phrase" },
      { term: "je voudrais", meaning: "I would like (polite)", category: "Phrase", example: "Je voudrais un croissant, s'il vous plaît." },
      { term: "commander", meaning: "to order", category: "Verb" },
      { term: "payer", meaning: "to pay", category: "Verb" },
      { term: "la monnaie", meaning: "change (money)", category: "Noun" },
      { term: "un pourboire", meaning: "a tip", category: "Noun" },
      { term: "Je vous dois combien ?", meaning: "How much do I owe you?", category: "Expression" },
    ],
  },
];
