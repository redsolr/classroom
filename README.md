# Class-room

**The private memory and lesson workflow of an independent language teacher.**

> Remember every student. Finish every lesson properly. Know what to teach next.

Class-room is a teacher-facing student and lesson management system for
independent language tutors. Teachers paste rough notes or a transcript after
each lesson; Class-room extracts structured corrections, vocabulary, homework,
topics, and long-term insights for review, keeps a living learning record per
student, and produces a clean student-facing recap — while private notes stay
private.

## Stack

Self-contained Next.js full-stack app — deploys to Vercel as-is.

| Layer | Technology |
| --- | --- |
| Framework | Next.js 16 (App Router, server actions) + React 19 |
| Database | PostgreSQL + Drizzle ORM (local Docker; Supabase in prod) |
| Auth | WorkOS AuthKit (`authkit-nextjs`), hosted sign-in + `MOCK_AUTH` dev mode |
| AI | Anthropic `claude-opus-4-8` structured extraction (`messages.parse` + zod schema); deterministic mock when no API key |
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

Set `DATABASE_URL` (Supabase), the four `WORKOS_*` vars (redirect URI
`https://<domain>/callback`), `NEXT_PUBLIC_APP_URL`, and optionally
`ANTHROPIC_API_KEY`. Run migrations against the production database with
`DATABASE_URL=<prod> npm run db:migrate` — never `db:push`.
