# Features — current capability map

> **What this is**: the living list of what Classroom can do TODAY — for
> humans who forget and sessions that plan. Current state only, not a
> changelog (git history has the story).
>
> **Maintenance rule**: any feature-visible change updates this file in
> the SAME commit. Add the row, update the row, or move it to "Cut" when
> a decision kills it.

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

## Self-study — vocabulary (`/vocab`)

- **Books-first dictionary** — shelf landing (All words + books with counts); per-book pin / inline-rename / delete (words survive); "New book" allows empty
- **Compact Attio-style table** — ONE layout on every viewport; learner-customizable columns (localStorage); **quiz mode** (tap-to-reveal meanings); sort + language/category filters; add/edit via dialog (IME-safe Enter/Escape)
- **Drag-to-reorder book rows** — dnd-kit grip handle, optimistic order (2026-08-12)
- **Pinned books in the sidebar** — one-tap open + quick-add dialog (adopts existing words)
- **Tutor vocab CRUD from chat** — add/update/delete/list words + create/manage lists as chat tool calls (offline mock speaks the same executor)
- **Chat→vocab bulk extraction** — "Save words from this chat" on ANY chat: whole-conversation extraction → checkbox review (each candidate labeled with its own language) → per-language deduped bulk save (2026-08-14)
- **SRS review (`/vocab/review`)** — SM-2-lite flashcards; status DERIVED from review evidence, never asserted; **Tinder-style deck**: full-bleed language-tinted cover cards (coverHue keyed by language), fixed layout with in-place answer reveal (white sheet over the cover), whole-card swipe to grade before or after reveal (→ Good ← Forgot ↑ Easy ↓ Hard) with drag-follow + badge + fly-off + seamless keyed-stack promotion, circular grade buttons ordered by swipe axis; **practice-again cram rounds** (shuffled ≤50 words, schedule-neutral per Anki convention) from the completion/nothing-due screen (2026-08-14)
- **Categories + personal lists** — word-class categories, ordered lists, save-current-view-as-list
- **Curated packs (`/packs`)** — product-shipped collections (Persona 5 / Anime / Gaming JA, Café FR); per-word add or import-all → personal list
- **Anki-ready CSV export** — learner-scoped `/vocab/export.csv` (UTF-8 BOM, CRLF)

## Self-study — reading library (`/library`, `/notes`)

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

- **ChatGPT-shaped URLs** — chat at `/chat`, everything else at root (`/vocab`, `/library`, `/notes`, `/packs`, `/account`, `/project/[id]`); old `/study/*` links redirect (2026-08-12)
- **Unified sidebar** — New chat + bare study tabs, Library/Notes under a "More" expander, Pinned/Projects/Chats tree, pinned books; Plan & usage lives in the footer account menu
- **One PageHeader convention** — every top-level page (teacher, student, study) renders its title through `components/ui/page-header.tsx` (1.625rem title, subtitle, optional icon/actions) — no hand-rolled page h1s (2026-08-14)
- **Mobile chrome** — ChatGPT-style animated drawer (slide + backdrop fade, navbar-aligned header), hamburger + quick new-chat topbar with a portal slot for the chat ⋯ menu (2026-08-12)
- **PWA** — installable, manifest start_url `/chat`
- **Auth** — own WorkOS project (email+password, Google, Apple); learner role auto-provisioned on first visit; per-app cookie name
- **Ops** — Neon Postgres (sin1), migrate-on-deploy; CI/CD: main → classroom.jurisimus.com, develop → dev-classroom.jurisimus.com; two e2e tiers (mocked 51/51 + real-auth incl. anonymous-401 sweeps); seeds: `db:seed`, `db:seed:study`, `db:seed:packs`

## Residuals / known gaps

- Real-auth login-flow specs need a healthy network (WorkOS connect timeouts on 2026-08-12); founder phone run + 2–3-week eval pending; rotate pasted keys (OpenAI, WorkOS sk_test, VERCEL_TOKEN) + OpenAI budget cap; Stripe test-checkout loop unexercised
- Teacher queue (build on demand): at-risk signals, recurring weekly slots, teacher-AI prep briefing, evidence-phrased progress reports

## Cut / rejected on purpose (don't re-propose)

- **Tutor bookkeeping/billing** (packages, payment ledger, credits, earnings) — cut 2026-07-13; Study Pro is the ONE billed surface
- **File storage** — organize MEANING, not files; no uploads until AI extracts from them
- **Marketplace / discovery** — Phase D, only after teacher density; never market "leave Preply"
- **AI-asserted level jumps** — progress stays evidence-phrased (trust doctrine)
