# Features — current capability map

> **What this is**: the living list of what Classroom can do TODAY — for
> humans who forget and sessions that plan. Current state only, not a
> changelog (git history has the story).
>
> **Maintenance rule**: any feature-visible change updates this file in
> the SAME commit. Add the row, update the row, or move it to "Cut" when
> a decision kills it.

> **Vocabulary of the product itself (2026-08-29)**: **Books** are collections of words — yours, or **Official books** (ours, reachable as the "Official" tab, never a separate nav item). **Decks** are the Anki-style drill over them — word decks, and **sentence decks** (cloze cards, `/sentences`) which test the same words in context. **Reading list** is what you have read. "Dictionary" and "Curated lists" are retired; one word, one meaning.

## Self-study — AI chat (`/chat`)

- **Zero-step chat landing** — `/chat` opens straight into the composer as a DRAFT chat; the thread is created server-side on the first send, URL follows via replaceState — no "New chat" tap; the empty state centers a greeting + the composer mid-pane (Claude landing shape) and docks the composer to the bottom once the first message lands; user bubbles hug the right at fit-content (2026-08-14)
- **Streaming tutor chat** — OpenAI-backed, per-message model picker (Terra default / Sol / Luna roster, server-validated; answering model persisted + shown per reply); deterministic offline mock when no key
- **One study-partner prompt, instructions-driven** — no language "mode" anywhere (2026-08-14 refactor): what a chat is for comes from account/project instructions and the conversation; tutoring guidance (corrections, learner-vocab drilling) activates when practice happens; `VOCAB: term — meaning — Language` chip suggestions work in EVERY chat, each word carrying its own roster language
- **Projects (ChatGPT Projects shape, generic)** — name + custom instructions injected into every chat in the project (a "French tutor" project is just instructions); create via dialog, settings dialog on the project page, delete frees chats
- **Long-term memory (ChatGPT Memory shape)** — tutor saves durable facts via `remember`/`forget_memory` tools; `<learner_memory>` injected into EVERY chat; managed on /account: list, per-item delete, **Delete all**, **Pause/Resume** (pause stops saving AND using, keeps rows) (2026-08-12)
- **About-you standing instructions** — account-level custom instructions injected into every chat, alongside per-project ones (2026-08-12)
- **Chat management** — pinned chats (sidebar Pinned section), inline rename, delete with confirm, **move to project / remove from project** (sidebar row + header ⋯ submenus), **branch in new chat** (copies the conversation prefix), copy + read-aloud (speechSynthesis) per message, Stop button with partial-reply persist (move: 2026-08-13)
- **Drag-to-ask** — select any transcript text → floating "Ask tutor" pill quotes it into the composer (all StudyChat surfaces incl. the Ask dock) (2026-08-13)
- **Ask dock** — Ctrl/Cmd+J floating assistant on every study page (real loose thread, reload-on-open)
- **Free-tier cap** — rolling-24h message cap (free 10/day → Study Pro 500); 429 points at the upgrade

## Self-study — books & decks (`/vocab`, `/vocab/review`, `/packs`)

- **Books** (`/vocab`) — your own collections of words — shelf landing (All words + books with counts); per-book pin / inline-rename / delete (words survive); "New book" allows empty. **Cover art on every row** (2026-08-29): a book wears a generated square tile (`components/study/study-covers.tsx` — deterministic gradient + the title's first glyph), and **All words wears the liked tile** (fixed violet gradient + heart) because your vocabulary IS the liked layer, not a book. The landing's heading stays "Books" (one word, one meaning — it's the sidebar tab's name) with the greeting in the subtitle (`components/study/greeting.tsx`, resolved from the LEARNER's clock via useSyncExternalStore — the server snapshot is time-neutral "Welcome back", never a wrong greeting)
- **Default book** (2026-08-29) — one book per learner can be the default (`study_vocab_lists.is_default`, migration 0015, partial unique index per learner is the enforcement); a one-tap save files into it on top of joining the vocabulary. Set/cleared from the book row's ⋯; the pack heart's tooltip names it
- **Collection hero** (2026-08-29) — a book page, an official book, and the drill share one arrival shape (`components/study/collection-hero.tsx`): cover art, an eyebrow saying what kind of thing this is, an oversized title, a quiet meta line, and ONE loud round `PlayAction` in `--practice`. The wash is the collection's hue at low alpha over the page background, so one definition works in both themes
- **Compact Attio-style table** — ONE layout on every viewport; learner-customizable columns (localStorage); **quiz mode** (tap-to-reveal meanings); sort + language/category filters; add/edit via dialog (IME-safe Enter/Escape)
- **Drag-to-reorder book rows** — dnd-kit grip handle, optimistic order (2026-08-12)
- **Pinned books in the sidebar** — one-tap open + quick-add dialog (adopts existing words)
- **Tutor vocab CRUD from chat** — add/update/delete/list words + create/manage lists as chat tool calls (offline mock speaks the same executor)
- **Chat→vocab bulk extraction** — "Save words from this chat" on ANY chat: whole-conversation extraction → checkbox review (each candidate labeled with its own language) → per-language deduped bulk save (2026-08-14)
- **Decks shelf (`/vocab/review`)** (2026-08-29) — the drill surface LANDS on a shelf, not a card: **Word decks** (All words first on the liked tile, then one row per book) and **Sentence decks** as a SECOND shelf below it (amber quote tile), each row with cover art, `N due · M cards`, a due pill and a play button. Two shelves, not one mixed list: choosing what to drill starts with which QUESTION you want asked. Arriving straight on a card meant the app picked the deck for you and never showed the others. `?book=all` is that old behaviour, now a choice; `?book=<id>` and `?pack=<slug>` unchanged. Official books ride the same page as a cover shelf (drillable without saving)
- **SRS review (the drill)** — SM-2-lite flashcards; status DERIVED from review evidence, never asserted; **Tinder-style deck**: full-bleed language-tinted cover cards (coverHue keyed by language), fixed layout with in-place answer reveal (white sheet over the cover), whole-card swipe to grade before or after reveal (→ Good ← Forgot ↑ Easy ↓ Hard) with drag-follow + badge + fly-off + seamless keyed-stack promotion, circular grade buttons ordered by swipe axis; **practice-again cram rounds** (shuffled ≤50 words, schedule-neutral per Anki convention) from the completion/nothing-due screen (2026-08-14); **per-book review** — `/vocab/review?book=<id>` scopes the due deck AND its cram rounds to one book, so a book is a study unit and not just a grouping; the book page offers "Review N due" whenever it has due cards (2026-08-29)
- **Categories + personal lists** — word-class categories, ordered lists, save-current-view-as-list
- **Official books** (`/packs`) — product-shipped collections: **title packs** (Dragon Ball, Death Note, One Piece, Naruto, Persona 5, Final Fantasy VII — all JA) plus general ones (Anime essentials, Gaming JA, Café FR). **Spotify-shaped copying** (heart pass 2026-08-29): a row's **♥ toggles the word in your vocabulary** — the liked layer — and files it into the default book too when one is set; the row's `⋯` carries the **Add to book picker** (`components/study/add-to-book-menu.tsx`: every book with a ✓ on the ones holding it, selecting TOGGLES membership, "New book…", plus a find-a-book field past 6 books) and "Remove from my vocabulary"; import-all adds every missing word AND saves the pack as a book. Rows list the books holding them. The picker is FLAT, not a `▸` submenu — the menu holds two things, so a submenu would put the only content behind an extra hop (and nested Radix menus were measurably un-clickable for a beat while the popper settled). Picking a book does not close the menu — filing into three books is the common case. Un-hearting is instant when nothing is at stake and confirms only when the word carries review progress or book membership, naming what is lost. Catalog = `src/content/study-packs.ts`, synced by `npm run db:seed:packs` locally AND automatically on every deploy (`vercel-build` runs it right after migrations — shipped content travels with the deploy, no manual per-environment seed; upsert by slug, items replaced wholesale). Packs carry OUR OWN word lists and descriptions only — never source text or artwork. **Tankōbon shelf** — `/packs` renders generated manga-volume covers (`components/study/pack-cover.tsx`: signature kanji the pack actually teaches + vertical spine title + screentone + publisher band), same shelf grid and hover lift as `/library`; art is a hand-set glyph/hue-pair per slug with a deterministic glyph+hue fallback, so a new pack looks right with zero extra work (title packs + shelf: 2026-08-29) **Practice as a deck** (its own `--practice` deep-rose token — the one deliberate second brand colour, kept distinct from the danger red so an energetic action never reads as destructive) drills an official book at `/vocab/review?pack=<slug>` without saving anything — one catalog, two doors (browse-and-copy, or drill). **Discovery**: official content is deliberately NOT hidden behind the tab alone — a single "Official" row sits in the sidebar, and the Books landing carries an **official cover shelf** (`components/study/official-shelf.tsx`, sideways-scrolling tankōbon covers + "See all") in the space an early library leaves empty; the tab carries a count. A tab alone reads as a filter and gets skipped.
- **Anki-ready CSV export** — learner-scoped `/vocab/export.csv` (UTF-8 BOM, CRLF)

## Self-study — sentence cards (`/sentences`)

- **The second card type** (2026-08-29) — a word card asks what a word means; a **cloze sentence card** asks whether you can still supply it when a sentence needs it. Own table (`study_sentences`, migration 0016), own SM-2 schedule (the two decay at different rates and averaging them would hide both), own sidebar row and own shelf on Decks. `vocab_id`/`list_id` are SET NULL, never cascade — deleting a word must not destroy sentences you've been reviewing for weeks
- **Generated, not hand-written** — "Make cards" (from All words, or one book) turns words that have no card yet into cloze sentences, oldest-first, 8 at a time, one model request per language. Almost nobody writes cloze cards by hand, which is exactly why this is worth doing for them. Repeat presses EXTEND coverage instead of duplicating it (LEFT JOIN … IS NULL, not a NOT IN subquery). Deterministic offline generator when no `OPENAI_API_KEY`, so dev + e2e exercise the whole pipeline
- **The blank is placed by US, not the model** (`src/lib/cloze.ts`) — the model returns sentence and target word SEPARATELY and `markCloze` wraps it; a card whose target isn't in its own sentence is DROPPED with a warning, never patched. A cloze card with the blank in the wrong place teaches the wrong thing, which is worse than one fewer card. Storage is Anki's `{{…}}` convention in the text (survives hand-editing; can't drift out of sync the way character offsets can), and `hasSingleCloze` refuses text with zero or two blanks at the action edge
- **The drill is the same stack** — `/vocab/review?sentences=all` (or `?sentences=<bookId>`) deals the same Tinder card, the same swipes, the same grades. `StudyReview` takes a discriminated card union + a session-level `deckKind`, so the deck machinery is shared and only the FACE forks: the sentence renders with its blank drawn at the same width whether hidden or revealed, so revealing never reflows the sentence around it
- **Tutor tool `add_sentence`** — the tutor can make one card mid-conversation ("give me that in a sentence I can drill"); it passes sentence + word and the same `markCloze` guard applies, failing back to the model with why rather than storing a broken card
- **Manage at `/sentences`** — prose rows, not a table (a truncated sentence teaches nothing at a glance); the blank renders as a highlighted span so scanning the list is itself a weak review. Edit/delete per row, hand-write with the `{{…}}` hint, "Review N" when cards are due

## Self-study — reading list (`/library`, `/notes`)

- **Books shelf** — one entry per book/article read (generated covers); add via dialog or the tutor's `add_book` tool (2026-08-12)
- **Book pages** — summary + atomic notes + book discussion chats (`<book_context>` rides the chat); deleting a book frees notes and chats, never destroys
- **Atomic notes** — `save_note`/`list_notes`/`delete_note` tutor tools + standalone `/notes` tab on the same primitive
- **Recall everywhere** — the library index is injected into EVERY chat (`<library>`), so "what did that book say" works from any conversation

## Self-study — account & billing (`/account`)

- **Study Pro subscription** — Stripe checkout + billing portal + sig-verified webhook as single writer of plan state; free tier stays honest when Stripe env is absent
- **Usage meter** — rolling-24h message count vs cap
- **Memory + About-you management** — see chat section
- **Model roster card** — the picker roster with the default marked

## Teacher workspace

- **Schedule agenda (`/schedule`, PRIMARY)** — master-detail day agenda; all login redirects land here
- **Calendar (`/calendar`)** — week grid, slot-click booking (stays put, chip animates in)
- **Students roster + profiles** — per-student timeline (whole history in one stream), deterministic Progress tab, prep sheet (assembles the approved record for the next lesson), source column + filter chips (Preply/italki/referral/…), searchable student combobox
- **Lesson loop** — notes → AI draft → approve → structured records (topics, corrections, vocab, homework) → public recap link; scheduling statuses + attendance, reschedule chains
- **Homework loop** — assign → student submits in portal → teacher closes out
- **Vocabulary books per student** — book chips w/ counts, add-into-book, per-row refile, inline rename, two-step delete; portal groups by book
- **Durability / portability** — paste-import students, full-record JSON export, student Anki CSV, "we don't auto-delete" retention footer
- **Onboarding demo seed** — `db:seed` demo roster (Marie/Kenji/Ana/Somchai/David)

## Student side

- **Portal (`/p/<token>`)** — revocable token link: recap timeline, homework check-off + submit, vocabulary (grouped by book) + CSV, SRS practice
- **AI study companion (portal chat)** — grounded ONLY in the teacher-student SHARED layer, 30 msgs/day brake
- **Student accounts** — login claims the student row by email; `/student` area: schedule week grid, "My class-room", teacher relationship record

## Shell & platform

- **ChatGPT-shaped URLs** — chat at `/chat`, everything else at root (`/vocab`, `/sentences`, `/library`, `/notes`, `/packs`, `/account`, `/project/[id]`); old `/study/*` links redirect (2026-08-12)
- **Unified sidebar** — New chat + bare study tabs, Library/Notes under a "More" expander, Pinned/Projects/Chats tree, pinned books; Plan & usage lives in the footer account menu
- **One PageHeader + PageShell convention** — every top-level page (teacher, student, study) renders inside `PageShell` (one max-w-6xl geometry, so the title starts at the same x on every screen; narrower content caps itself INSIDE the shell) and titles through `PageHeader` (1.625rem, subtitle, actions; section pages carry their sidebar icon via the typed `icon` prop — greetings and entity titles don't); `BackLink` is the one ← style on detail pages — all in `components/ui/page-header.tsx`; no hand-rolled page columns, h1s, or back links (2026-08-14)
- **Mobile chrome** — ChatGPT-style animated drawer (slide + backdrop fade, navbar-aligned header), hamburger + quick new-chat topbar with a portal slot for the chat ⋯ menu (2026-08-12)
- **Mobile quick-access bar** (2026-08-29) — a fixed bottom tab bar on every study page (`components/shell/mobile-tabbar.tsx`): **Chat · Books · Decks · Sentences · Official**, longest-path match so `/vocab/review` doesn't also light up Books. The drawer keeps the long tail (chats, projects, pinned books, reading list, account) — the bar exists to remove the open-then-choose tax on the five places people actually go. Its height is PUBLISHED as `--study-tabbar-h` (globals.css, `3.5rem + safe-area`, **0px at lg**) so the chat pane's height math and the floating Ask button size around it with one expression instead of hard-coding a number each; `study.spec` measures the rects rather than trusting the classes
- **PWA** — installable, manifest start_url `/chat`
- **Auth** — own WorkOS project (email+password, Google, Apple); learner role auto-provisioned on first visit; per-app cookie name
- **Ops** — Neon Postgres (sin1), migrate-on-deploy; CI/CD: main → classroom.jurisimus.com, develop → dev-classroom.jurisimus.com; two e2e tiers (mocked 51/51 + real-auth incl. anonymous-401 sweeps); seeds: `db:seed`, `db:seed:study`, `db:seed:packs`

## Residuals / known gaps

- Real-auth login-flow specs need a healthy network (WorkOS connect timeouts on 2026-08-12); founder phone run + 2–3-week eval pending; rotate pasted keys (OpenAI, WorkOS sk_test, VERCEL_TOKEN) + OpenAI budget cap; Stripe test-checkout loop unexercised
- Teacher queue (build on demand): at-risk signals, recurring weekly slots, teacher-AI prep briefing, evidence-phrased progress reports
- **Live collaboration — nothing built** (no WebSocket, no Durable Object, no polling). Two candidate shapes, and the choice between them is still open: copy CRM's self-hosted Cloudflare DO worker (`crm/realtime/` — presence + cursors + invalidate fan-out, hibernation so idle rooms cost nothing) versus the rift polling-ledger shape the deferred row currently names. Write-up, porting checklist and the trade-off table: [`docs/realtime-collab.md`](docs/realtime-collab.md). **Do NOT wire classroom to the platform's `/collaboration`** — it needs an always-on NestJS process, and it would break one-app-one-repo by creating the second consumer that doctrine says is the only reason to split a backend out.

## Cut / rejected on purpose (don't re-propose)

- **Tutor bookkeeping/billing** (packages, payment ledger, credits, earnings) — cut 2026-07-13; Study Pro is the ONE billed surface
- **File storage** — organize MEANING, not files; no uploads until AI extracts from them
- **Marketplace / discovery** — Phase D, only after teacher density; never market "leave Preply"
- **AI-asserted level jumps** — progress stays evidence-phrased (trust doctrine)
