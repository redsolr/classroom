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

/**
 * The shelf a book belongs on.
 *
 * Editorial, and authored here beside the book itself — the same kind of
 * thing as its description. It exists so Home can group books into rows
 * that mean something ("From anime & manga") instead of one long
 * alphabetical wall, and so the grouping still holds as the catalog
 * grows.
 *
 * Deliberately NOT derived from the name or the description. Guessing a
 * theme from a string is the kind of signal that looks right across
 * today's nine books and is quietly wrong on the twentieth.
 */
export type PackTheme = "anime" | "games" | "everyday";

/** Fixed display order for the themed shelves. */
export const PACK_THEME_ORDER: PackTheme[] = ["anime", "games", "everyday"];

export const PACK_THEME_LABEL: Record<PackTheme, string> = {
  anime: "From anime & manga",
  games: "From games",
  everyday: "Out in the world",
};

export type PackContent = {
  slug: string;
  name: string;
  language: string;
  theme: PackTheme;
  description: string;
  items: PackItemContent[];
};

export const STUDY_PACK_CATALOG: PackContent[] = [
  {
    slug: "persona-5-japanese",
    name: "Persona 5 essentials",
    language: "Japanese",
    theme: "games",
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
    slug: "dragon-ball-japanese",
    name: "Dragon Ball essentials",
    language: "Japanese",
    theme: "anime",
    description:
      "Ki, training arcs, and wish-granting dragons — the words Dragon Ball built a generation of shōnen vocabulary on.",
    items: [
      { term: "気", reading: "き / ki", meaning: "ki; life energy", category: "Noun" },
      { term: "戦闘力", reading: "せんとうりょく / sentōryoku", meaning: "power level (battle power)", category: "Noun" },
      { term: "スカウター", reading: "sukautā", meaning: "scouter (the power-level reader)", category: "Noun" },
      { term: "かめはめ波", reading: "かめはめは / kamehameha", meaning: "Kamehameha — the signature energy wave", category: "Noun" },
      { term: "元気玉", reading: "げんきだま / genkidama", meaning: "Spirit Bomb (lit. energy sphere)", category: "Noun" },
      { term: "界王拳", reading: "かいおうけん / kaiōken", meaning: "Kaiō-ken — the power-multiplying technique", category: "Noun" },
      { term: "超サイヤ人", reading: "スーパーサイヤじん / sūpā saiya-jin", meaning: "Super Saiyan", category: "Noun" },
      { term: "修行", reading: "しゅぎょう / shugyō", meaning: "training; ascetic practice", category: "Noun" },
      { term: "師匠", reading: "ししょう / shishō", meaning: "master; one's teacher", category: "Noun" },
      { term: "弟子", reading: "でし / deshi", meaning: "disciple; apprentice", category: "Noun" },
      { term: "仙豆", reading: "せんず / senzu", meaning: "senzu bean (the full-heal bean)", category: "Noun" },
      { term: "神龍", reading: "シェンロン / Shenron", meaning: "Shenron — the wish-granting dragon", category: "Noun" },
      { term: "願い", reading: "ねがい / negai", meaning: "wish", category: "Noun" },
      { term: "生き返る", reading: "いきかえる / ikikaeru", meaning: "to come back to life", category: "Verb" },
      { term: "集める", reading: "あつめる / atsumeru", meaning: "to collect; to gather", category: "Verb" },
      { term: "大猿", reading: "おおざる / ōzaru", meaning: "Great Ape (the full-moon transformation)", category: "Noun" },
      { term: "尻尾", reading: "しっぽ / shippo", meaning: "tail", category: "Noun" },
      { term: "天下一武道会", reading: "てんかいちぶどうかい / tenkaichi budōkai", meaning: "World Martial Arts Tournament", category: "Noun" },
      { term: "強敵", reading: "きょうてき / kyōteki", meaning: "formidable foe", category: "Noun" },
    ],
  },
  {
    slug: "death-note-japanese",
    name: "Death Note essentials",
    language: "Japanese",
    theme: "anime",
    description:
      "Death gods, criminal investigation, and the vocabulary of judgment — the darker, more adult register of shōnen.",
    items: [
      { term: "死神", reading: "しにがみ / shinigami", meaning: "death god; god of death", category: "Noun" },
      { term: "死神の目", reading: "しにがみのめ / shinigami no me", meaning: "the shinigami eyes (see a person's name and lifespan)", category: "Noun" },
      { term: "寿命", reading: "じゅみょう / jumyō", meaning: "lifespan", category: "Noun" },
      { term: "名前", reading: "なまえ / namae", meaning: "name", category: "Noun" },
      { term: "書く", reading: "かく / kaku", meaning: "to write", category: "Verb" },
      { term: "死因", reading: "しいん / shiin", meaning: "cause of death", category: "Noun" },
      { term: "心臓麻痺", reading: "しんぞうまひ / shinzō mahi", meaning: "cardiac arrest; heart failure", category: "Noun" },
      { term: "正義", reading: "せいぎ / seigi", meaning: "justice", category: "Noun" },
      { term: "裁く", reading: "さばく / sabaku", meaning: "to judge; to pass judgment on", category: "Verb" },
      { term: "犯罪者", reading: "はんざいしゃ / hanzaisha", meaning: "criminal", category: "Noun" },
      { term: "容疑者", reading: "ようぎしゃ / yōgisha", meaning: "suspect", category: "Noun" },
      { term: "捜査", reading: "そうさ / sōsa", meaning: "(criminal) investigation", category: "Noun" },
      { term: "探偵", reading: "たんてい / tantei", meaning: "detective", category: "Noun" },
      { term: "疑う", reading: "うたがう / utagau", meaning: "to doubt; to suspect", category: "Verb" },
      { term: "罠", reading: "わな / wana", meaning: "trap", category: "Noun" },
      { term: "計画", reading: "けいかく / keikaku", meaning: "plan; scheme", category: "Noun" },
      { term: "取引", reading: "とりひき / torihiki", meaning: "deal; bargain", category: "Noun" },
      { term: "支配", reading: "しはい / shihai", meaning: "rule; domination", category: "Noun" },
    ],
  },
  {
    slug: "one-piece-japanese",
    name: "One Piece essentials",
    language: "Japanese",
    theme: "anime",
    description:
      "Pirates, bounties, and Devil Fruits — the seafaring vocabulary of the best-selling manga ever printed.",
    items: [
      { term: "海賊", reading: "かいぞく / kaizoku", meaning: "pirate", category: "Noun" },
      { term: "海賊王", reading: "かいぞくおう / kaizokuō", meaning: "Pirate King", category: "Noun" },
      { term: "麦わら帽子", reading: "むぎわらぼうし / mugiwara bōshi", meaning: "straw hat", category: "Noun" },
      { term: "悪魔の実", reading: "あくまのみ / akuma no mi", meaning: "Devil Fruit", category: "Noun" },
      { term: "能力者", reading: "のうりょくしゃ / nōryokusha", meaning: "an ability user (Devil Fruit eater)", category: "Noun" },
      { term: "覇気", reading: "はき / haki", meaning: "Haki — force of will", category: "Noun" },
      { term: "船長", reading: "せんちょう / senchō", meaning: "captain (of a ship)", category: "Noun" },
      { term: "航海士", reading: "こうかいし / kōkaishi", meaning: "navigator", category: "Noun" },
      { term: "剣士", reading: "けんし / kenshi", meaning: "swordsman", category: "Noun" },
      { term: "賞金首", reading: "しょうきんくび / shōkinkubi", meaning: "wanted man (a head with a price)", category: "Noun" },
      { term: "懸賞金", reading: "けんしょうきん / kenshōkin", meaning: "bounty; reward money", category: "Noun" },
      { term: "海軍", reading: "かいぐん / kaigun", meaning: "the Navy; the Marines", category: "Noun" },
      { term: "偉大なる航路", reading: "いだいなるこうろ / idai naru kōro", meaning: "the Grand Line (lit. great sea route)", category: "Noun" },
      { term: "出航", reading: "しゅっこう / shukkō", meaning: "setting sail; departure", category: "Noun" },
      { term: "航海", reading: "こうかい / kōkai", meaning: "voyage; sea travel", category: "Noun" },
      { term: "島", reading: "しま / shima", meaning: "island", category: "Noun" },
      { term: "宝", reading: "たから / takara", meaning: "treasure", category: "Noun" },
      { term: "夢", reading: "ゆめ / yume", meaning: "dream; ambition", category: "Noun" },
    ],
  },
  {
    slug: "naruto-japanese",
    name: "Naruto essentials",
    language: "Japanese",
    theme: "anime",
    description:
      "Ninja ranks, hand seals, and hidden villages — the words that carry almost every shinobi story.",
    items: [
      { term: "忍者", reading: "にんじゃ / ninja", meaning: "ninja; shinobi", category: "Noun" },
      { term: "忍術", reading: "にんじゅつ / ninjutsu", meaning: "ninja technique", category: "Noun" },
      { term: "チャクラ", reading: "chakura", meaning: "chakra — the energy techniques run on", category: "Noun" },
      { term: "印", reading: "いん / in", meaning: "hand seal (formed to cast a technique)", category: "Noun" },
      { term: "影分身", reading: "かげぶんしん / kage bunshin", meaning: "shadow clone", category: "Noun" },
      { term: "火影", reading: "ほかげ / Hokage", meaning: "Hokage — the village leader (lit. Fire Shadow)", category: "Noun" },
      { term: "里", reading: "さと / sato", meaning: "village; home village", category: "Noun" },
      { term: "木ノ葉", reading: "このは / Konoha", meaning: "the Leaf (Village)", category: "Noun" },
      { term: "下忍", reading: "げにん / genin", meaning: "genin — novice ninja rank", category: "Noun" },
      { term: "上忍", reading: "じょうにん / jōnin", meaning: "jōnin — elite ninja rank", category: "Noun" },
      { term: "中忍試験", reading: "ちゅうにんしけん / chūnin shiken", meaning: "the Chūnin Exams", category: "Noun" },
      { term: "抜け忍", reading: "ぬけにん / nukenin", meaning: "rogue ninja; village deserter", category: "Noun" },
      { term: "任務", reading: "にんむ / ninmu", meaning: "mission; assignment", category: "Noun" },
      { term: "手裏剣", reading: "しゅりけん / shuriken", meaning: "shuriken; throwing star", category: "Noun" },
      { term: "苦無", reading: "くない / kunai", meaning: "kunai — the throwing knife", category: "Noun" },
      { term: "巻物", reading: "まきもの / makimono", meaning: "scroll", category: "Noun" },
      { term: "封印", reading: "ふういん / fūin", meaning: "sealing; a seal", category: "Noun" },
      { term: "尾獣", reading: "びじゅう / bijū", meaning: "tailed beast", category: "Noun" },
      { term: "写輪眼", reading: "しゃりんがん / Sharingan", meaning: "Sharingan — the copy-wheel eye", category: "Noun" },
      { term: "忍道", reading: "にんどう / nindō", meaning: "one's ninja way (personal creed)", category: "Noun" },
      { term: "根性", reading: "こんじょう / konjō", meaning: "guts; willpower", category: "Noun" },
    ],
  },
  {
    slug: "final-fantasy-vii-japanese",
    name: "Final Fantasy VII essentials",
    language: "Japanese",
    theme: "games",
    description:
      "Mako, Materia, and a planet worth saving — the vocabulary of Japan's most-quoted RPG, remake included.",
    items: [
      { term: "魔晄", reading: "まこう / makō", meaning: "Mako — the planet's drawn-up life energy", category: "Noun" },
      { term: "魔晄炉", reading: "まこうろ / makōro", meaning: "Mako reactor", category: "Noun" },
      { term: "マテリア", reading: "materia", meaning: "Materia — the orbs that grant magic", category: "Noun" },
      { term: "召喚獣", reading: "しょうかんじゅう / shōkanjū", meaning: "summon (summoned beast)", category: "Noun" },
      { term: "リミット技", reading: "リミットわざ / rimitto waza", meaning: "Limit Break", category: "Noun" },
      { term: "神羅", reading: "しんら / Shinra", meaning: "Shinra — the electric-power company", category: "Noun" },
      { term: "会社", reading: "かいしゃ / kaisha", meaning: "company; corporation", category: "Noun" },
      { term: "電力", reading: "でんりょく / denryoku", meaning: "electric power", category: "Noun" },
      { term: "反乱軍", reading: "はんらんぐん / hanrangun", meaning: "rebel army; insurgents", category: "Noun" },
      { term: "爆破", reading: "ばくは / bakuha", meaning: "blowing up; demolition", category: "Noun" },
      { term: "傭兵", reading: "ようへい / yōhei", meaning: "mercenary", category: "Noun" },
      { term: "兵士", reading: "へいし / heishi", meaning: "soldier", category: "Noun" },
      { term: "実験", reading: "じっけん / jikken", meaning: "experiment", category: "Noun" },
      { term: "記憶", reading: "きおく / kioku", meaning: "memory; recollection", category: "Noun" },
      { term: "正体", reading: "しょうたい / shōtai", meaning: "true identity", category: "Noun" },
      { term: "英雄", reading: "えいゆう / eiyū", meaning: "hero", category: "Noun" },
      { term: "復讐", reading: "ふくしゅう / fukushū", meaning: "revenge", category: "Noun" },
      { term: "罪", reading: "つみ / tsumi", meaning: "sin; guilt", category: "Noun" },
      { term: "故郷", reading: "ふるさと / furusato", meaning: "hometown; where one is from", category: "Noun" },
      { term: "星", reading: "ほし / hoshi", meaning: "the Planet; star", category: "Noun" },
      { term: "生命", reading: "せいめい / seimei", meaning: "life (as a force)", category: "Noun" },
      { term: "環境", reading: "かんきょう / kankyō", meaning: "the environment", category: "Noun" },
    ],
  },
  {
    slug: "anime-essentials-japanese",
    name: "Anime essentials",
    language: "Japanese",
    theme: "anime",
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
    theme: "games",
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
    theme: "everyday",
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
