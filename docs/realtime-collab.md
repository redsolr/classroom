# Live collaboration in classroom — the decision, and the pattern to copy

> **Status: nothing built yet.** classroom has zero realtime today — no
> WebSocket, no Durable Object, no polling. This doc exists so the next
> session doesn't design it from scratch, and doesn't wire it to the wrong
> backend. Written 2026-08-29 from a verified read of the sibling repos, not
> from memory.

## The one thing not to do

**Do not route classroom through the platform's `/collaboration` endpoint.**

It is technically available — the platform (`D:\App\Jurisimus\platform`) runs a
Hocuspocus/Yjs WebSocket server on its NestJS monolith. Using it would be a
mistake on two counts:

1. **It breaks the venture doctrine.** classroom is one-app-one-repo: own
   Postgres, own WorkOS, own Vercel deploy, **zero platform dependency**
   (verified — classroom has no reference to `api.jurisimus.com`,
   `localhost:8080`, or any platform env var). The doctrine says a backend gets
   split out only when a second consumer appears. Pointing classroom at
   `/collaboration` *creates* that second consumer for a feature that doesn't
   need it, and couples a standalone product to a monolith.
2. **It needs an always-on server.** Hocuspocus lives inside the long-running
   NestJS process on Railway. classroom is serverless on Vercel and should stay
   that way.

## The pattern that already works: `crm/realtime/`

The CRM solved exactly this problem, standalone, with a **self-hosted Cloudflare
Worker + Durable Objects**. It is the proven in-portfolio answer and the thing
to copy.

```
D:\App\crm\realtime\
  wrangler.jsonc     name: crm-realtime
  src/index.ts       CrmRoom   — presence · cursor · invalidate
  src/ydoc-room.ts   YDocRoom  — Yjs document rooms
```

Two DO classes, both SQLite-backed:

```jsonc
"durable_objects": { "bindings": [
  { "name": "ROOM", "class_name": "CrmRoom" },
  { "name": "YDOC", "class_name": "YDocRoom" }
]},
"migrations": [
  { "tag": "v1", "new_sqlite_classes": ["CrmRoom"] },
  { "tag": "v2", "new_sqlite_classes": ["YDocRoom"] }
]
```

**One room per workspace**, carrying three message families:

| family       | what it does                                                             | stored? |
| ------------ | ------------------------------------------------------------------------ | ------- |
| `presence`   | who is online and which record they're viewing; roster re-broadcast on join/leave/view change | no |
| `cursor`     | live pointer relay on record pages                                       | never   |
| `invalidate` | server→server "data changed" fan-out: write paths `POST /broadcast`, every connected client refetches | no |

**Two properties that make this the right shape for classroom:**

- **WebSocket Hibernation API.** Sockets survive DO eviction and *an idle room
  costs nothing*. Per-socket identity rides `serializeAttachment` and is
  restored after hibernation. This is why it suits a serverless app — no
  always-on process, no idle bill.
- **Self-owned auth.** Browser sockets carry a short-lived HMAC token minted by
  the app itself (`GET /api/realtime/session`); the `/broadcast` endpoint uses
  the shared secret directly for server-to-server. Same secret both ways
  (`REALTIME_SECRET`). No dependency on anyone else's identity system.

### Client side, worth copying wholesale

`crm/src/lib/realtime/use-realtime-connection.ts` — mounted **once** in the app
shell. The graceful-degradation design is the part to keep:

> Boot: `GET /api/realtime/session`. **A 204 means the worker isn't configured —
> the hook goes dormant and the app behaves exactly as before**
> (refresh-to-see-changes).

So the feature ships dark and costs nothing until the worker exists. It also
does capped exponential-backoff reconnect (fresh token each try), a 30s
keepalive ping answered by the DO's auto-responder *without waking it*, and
coalesced query invalidation.

Supporting pieces: `src/app/api/realtime/session/route.ts` (token mint),
`invalidation-coalescer.ts`, and a zustand realtime store for avatars/pills/cursors.

## The open decision — read this before building

`MEMORY.md` records classroom's queued item as **"live co-op decks (rift
polling-ledger shape)"** — i.e. Postgres polling like rift's multiplayer
(server-authoritative action ledger, 1s polling), *not* WebSockets.

That is a different answer to this one, and the deferred row has not been
revisited. Decide deliberately:

| | polling ledger (rift shape) | DO worker (crm shape) |
| --- | --- | --- |
| infra | none — just Postgres | a Cloudflare Worker to deploy + a secret |
| presence / cursors | not really | yes, that's the point |
| latency | ~1s | immediate |
| idle cost | DB queries every tick, per client | zero (hibernation) |
| fits | turn-based co-op decks | live collaborative editing |

**Rule of thumb:** if the feature is "two learners take turns on a deck",
polling is simpler and sufficient. If it's "see each other's presence and
cursors while working the same material", copy the CRM worker. Don't build both.

## Porting checklist (if the DO route is chosen)

1. Copy `crm/realtime/` → `classroom/realtime/`, rename `crm-realtime` →
   `classroom-realtime` and `CrmRoom` → a classroom-appropriate class name.
   **Start migrations at `v1` again** — they're per-worker, not shared.
2. Decide the room key. CRM uses one room per *workspace*; classroom's natural
   equivalent is probably per *project* or per *book*, not per user.
3. Add `REALTIME_SECRET` to classroom's env (both the Next app and the worker)
   and a `/api/realtime/session` route that mints the HMAC token from
   classroom's own WorkOS session.
4. Keep the **204 = dormant** contract. It's what lets this merge before the
   worker is deployed.
5. `REALTIME_URL` in `.env.example` (CRM uses `http://localhost:8788` for
   `wrangler dev`).
6. Update `FEATURES.md` in the same commit — that's the repo rule.

## Provenance

Verified 2026-08-29 by reading the repos directly:

- classroom has no realtime and no platform dependency — confirmed by grep.
- CRM is self-contained: `src/lib/api-base.ts` defaults `API_BASE` to **itself**
  (`localhost:3100`), commented "this app serves its own backend". The
  `generated/api` client is fork residue from `crm-web`, repurposed against
  CRM's own `/api` routes; the `/v1` prefix and `Jurisimus-Version` header were
  dropped 2026-07-30.
- Related memory: `project_crm_realtime_collab_arc` (the CRM arc, incl. the
  permanently-rejected tier-4 sync engine), `project_venture_shape_one_app_one_repo`.
