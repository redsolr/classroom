# Class-room

**The private memory and lesson workflow of an independent language teacher.**

> Remember every student. Finish every lesson properly. Know what to teach next.

Class-room is a teacher-facing student and lesson management system for
independent language tutors. Teachers paste rough notes or a transcript after
each lesson; Class-room extracts structured corrections, vocabulary, homework,
topics, and long-term insights for review, keeps a living learning record per
student, and produces a clean student-facing recap — while private notes stay
private.

> **[FEATURES.md](./FEATURES.md)** is the current capability map — what the
> product can do today, residuals, and deliberate cuts. Any feature-visible
> change updates it in the SAME commit.

## Self-study space (`/chat`)

Any signed-in account also gets a personal study space (2026-08-09 arc):
streaming AI tutor chat per language (threads, like ChatGPT), a personal
vocabulary table (sortable columns, language filter, edit-in-place) with
SM-2 flashcard review and an Anki-ready CSV export
(`/vocab/export.csv`), and a Stripe **Study Pro** subscription. Free tier = `STUDY_FREE_DAILY_CAP` tutor messages per rolling
day (default 10); Pro raises it to an abuse brake (default 500). Vocabulary
and review are always free. The tutor runs on OpenAI — the composer has a
per-message model picker over the `STUDY_AI_MODELS` roster (default
`gpt-5.6-terra,gpt-5.6-sol,gpt-5.6-luna`; requests are roster-validated
server-side, `STUDY_AI_MODEL` preselects the default) — and falls back to
a deterministic offline mock without `OPENAI_API_KEY`. The learner role is
orthogonal to teacher/student — a `learners` row is created on first visit
to `/chat`, and the roster surfaces are untouched.

Stripe setup (test mode): create a recurring price, set `STRIPE_SECRET_KEY`,
`STRIPE_STUDY_PRICE_ID`, and `STRIPE_WEBHOOK_SECRET` (from
`stripe listen --forward-to localhost:3020/api/stripe/webhook`). With any of
the three missing, the account page says billing is not configured and the
free tier applies — checkout never silently no-ops.

## Stack

Self-contained Next.js full-stack app — deploys to Vercel as-is.

| Layer | Technology |
| --- | --- |
| Framework | Next.js 16 (App Router, server actions) + React 19 |
| Database | PostgreSQL + Drizzle ORM (local Docker; Neon in prod) |
| Auth | WorkOS custom flow ported from Jurisimus web-app — own /login + /signup (B2C, visible), direct Google/Apple OAuth, email-verification step, forgot-password; `MOCK_AUTH` dev mode |
| AI | Anthropic `claude-opus-4-8` structured extraction (`messages.parse` + zod schema); OpenAI (`gpt-5.6-terra`/`-sol`) streaming self-study tutor; deterministic mocks when no API keys |
| Styling | Tailwind CSS v4 + Radix primitives, Linear/Attio-inspired design tokens |

## Local development

Prerequisites: Node 20+, Docker Desktop.

```bash
npm install
cp .env.example .env.local       # defaults work as-is for mock-auth dev
npm run docker:up                # Postgres on localhost:5439
npm run db:migrate
npm run db:seed                  # demo teacher + 3 students + lessons
npm run dev:mock                 # http://localhost:3020 — no WorkOS keys needed
```

`dev:mock` sets `MOCK_AUTH=true`: the auth proxy passes through and every
request resolves to the seeded demo teacher. For real auth, fill the
`WORKOS_*` variables in `.env.local` and run `npm run dev`.

The app is pinned to **port 3020** (web-app owns 3000, internal-console owns
3001; Postgres is on 5439 because 5432/5433 are taken by the platform
container and a native Windows PostgreSQL service).

Both dev scripts raise Node's HTTP header cap
(`NODE_OPTIONS=--max-http-header-size=65536`) — **don't remove it.** Cookies
are port-blind, so every app on `localhost` (web-app :3000, crm :3100, this
app :3020, rift :3030, platform :8080) sends its WorkOS session cookie on
every request to every other one. Each sealed session is a multi-KB JWE, so
four signed-in apps overflow Node's 16 KB default and the dev server answers
`431 Request Header Fields Too Large` before any route runs — which looks
exactly like the page being broken. The per-app `WORKOS_COOKIE_NAME` stops
the apps overwriting each other's sessions; it does not stop them being
*sent*. Clearing `localhost` cookies also works, but logs you out of the
whole fleet and the pile-up just returns.

Without `ANTHROPIC_API_KEY`, "Process with AI" uses a deterministic mock
extractor (free, offline) that understands simple note conventions:

```
she go -> she goes          # a correction
vocab: stakeholder          # a vocabulary item
hw: write 5 sentences       # homework
topic: job interviews       # a topic
```

Set `ANTHROPIC_API_KEY` to switch to real Claude extraction (model
overridable via `CLASSROOM_AI_MODEL`).

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` / `dev:mock` | Dev server (real / mock auth) |
| `npm run build` | Production build (includes typecheck) |
| `npm run lint` / `tsc:check` | ESLint / TypeScript |
| `npm run test:e2e` | Playwright e2e, mocked tier (boots dev:mock itself; needs Docker Postgres + migrations) |
| `npm run test:e2e:real-auth` | Adversarial tier: REAL WorkOS auth, no mocks — anonymous rejection + captured-mutation replay (needs `npm run e2e:user` once) |
| `npm run e2e:user` | Provision/reset the synthetic WorkOS teacher the real-auth tier signs in as (appends `E2E_TEACHER_*` to `.env.local` on first run) |
| `npm run verify` | lint + tsc + `check:actions` (the server-action auth ratchet) — CI runs this on every push |
| `npm run db:generate` | Generate a Drizzle migration from `src/db/schema.ts` |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Seed demo data (idempotent — re-wipes the demo teacher) |
| `npm run docker:up` / `docker:down` | Local Postgres |

## Architecture notes

- **Tenancy** — every table carries `teacher_id`; every query and mutation is
  scoped through `requireTeacher()` + ownership guards (`src/lib/guards.ts`).
  A teacher can only ever see their own students and records.
- **AI never writes directly** — extraction produces a draft stored on
  `lessons.ai_draft`. The teacher reviews, edits, and excludes items in the
  draft-review UI; only approved items become permanent records
  (`applyLessonDraft`).
- **Recap privacy** — the public page `/r/[token]` renders only the
  teacher-approved student-visible summary plus this lesson's corrections,
  vocabulary, and homework. Private notes, insights, and raw input are never
  queried by that page.
- **Lesson lifecycle** — `draft → processed (AI draft pending) → reviewed →
  shared (recap link live)`.

### Deploying to Vercel

Set `DATABASE_URL` (Neon — pooled URL for runtime; use the direct/unpooled
URL for migrations), the four `WORKOS_*` vars (redirect URI
`https://<domain>/callback`), `NEXT_PUBLIC_APP_URL`, and optionally
`ANTHROPIC_API_KEY`. Run migrations against the production database with
`DATABASE_URL=<prod> npm run db:migrate` — never `db:push`.
