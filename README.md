# Coach portal

A small hosted app where an owner and a coach run a coaching engagement. Claude fills it (cards, agendas, summaries, decisions) and files what comes out of it to Fibery. The coach signs in with an emailed link and needs no Claude account.

First engagement: Club de Vela, Matt (owner) and Frank (coach).

## Stack

Next.js (App Router, TypeScript) on Vercel. Supabase Postgres, Auth (email link) and Storage (private bucket). Tailwind. Vitest for unit and integration tests, Playwright for end-to-end tests. GitHub Actions runs every check against a local Supabase stack.

## Run it locally

```bash
npm ci
npx supabase start -x studio,edge-runtime,logflare,vector,imgproxy,supavisor,postgres-meta,realtime
node scripts/local-env.mjs
npm run dev
```

`scripts/local-env.mjs` writes `.env.local` from the local stack and prints nothing. Sign-in emails land in the local mail catcher at http://127.0.0.1:54324.

## Tests

| Command | What it proves |
|---|---|
| `npm test` | Unit: Sydney date helper (pinned clocks either side of midnight in AEDT and AEST, both DST changes), hours meter, digest rule |
| `npm run test:integration` | Against the local stack: row-level security on every table and on storage, one intake row per coach act, filing with a stubbed Fibery (success, failure and retry, concurrent filers, routine debounce), the Fibery request shapes, Claude's write path |
| `npm run test:e2e` | Playwright on desktop (1280) and phone (390): sign-in by emailed link, cards and answers, comments and uploads, and the full intake path (act, database webhook, filing route, stub Fibery, routine fire) |
| `npm run check:dashes` | No em dash in any tracked file |

Tests refuse to run unless `NEXT_PUBLIC_SUPABASE_URL` points at 127.0.0.1, so they can never touch a real project.

## Environment

| Name | Where | Secret |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel | No |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Vercel | No (public client key) |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel, server only | Yes |
| `CLAUDE_SERVICE_TOKEN` | Vercel, and wherever Claude calls the write path from | Yes |
| `FIBERY_TOKEN` | Vercel, server only | Yes |
| `FIBERY_WORKSPACE` | Vercel (`coleborne-co`) | No |
| `FIBERY_WIKI_PAGE_ID` | Vercel. The Club de Vela wiki page (its `fibery/id`) that intake lines are appended to | No |
| `FIBERY_VOYAGE_ID` | Vercel. The Voyage new Horizons are filed on (V#126) | No |
| `FIBERY_OWNER_USER_ID` | Vercel. The Fibery user who owns new Horizons (Matt) | No |
| `FIBERY_WORKSTREAM_ID` | Vercel, optional. The Horizons Workstream option (Club de Vela) | No |
| `AG095_FIRE_URL` | Vercel. The AG-095 routine's fire URL | No |
| `AG095_FIRE_TOKEN` | Vercel, server only. The AG-095 routine's API trigger token | Yes |
| `APP_URL` | Vercel, optional. Public base URL for links in Fibery and email | No |

Database settings live in `public.app_config` (service role only):

| Key | Value |
|---|---|
| `app_url` | The production URL. pg_cron and the intake webhook call it. Unset means no calls. |
| `intake_webhook_on` | `true` to poke the filing route on every intake event |

## Security

- Row-level security on every table. A person reads and writes only rows of engagements they belong to. Tested in `tests/integration/rls.test.ts`.
- Writes that change existing rows (ticking an action, asking to reschedule, consent) go through `SECURITY DEFINER` functions that check membership and role.
- Files sit in a private bucket under `<engagement_id>/...` and open through signed links that expire after an hour.
- The service role key is read only on the server (`lib/supabase/admin.ts` imports `server-only`).
- Public sign-up is off. Only people added to an engagement can get a sign-in link.

## Time

Australia/Sydney is the operating timezone. `lib/time/sydney.ts` is the only place an instant becomes a calendar date, using `Intl.DateTimeFormat` with the IANA zone. Times on screen carry AEDT or AEST as it applies on the date.

## Intake: every coach act reaches Claude and Fibery

One shared contract, not one path per screen.

1. **Record.** Every coach act (answer, comment, upload, voice note, raised item, question back, action ticked, reschedule request) writes exactly one `intake_events` row, in the same transaction as the act. This happens in the database: one `record_intake` function, called by `AFTER` triggers on the act's table. Writes Claude makes through the service connection are not intake.
2. **Poke.** A trigger on `intake_events` calls `POST /api/intake/process` through `pg_net` straight away (a database webhook). The poke carries no secret. The route reads pending events itself with the service role, so a stray call can only file what was already waiting.
3. **File.** The route takes a short lease, so only one filer runs at a time, claims unfiled events and files each one to Fibery:
   - one dated line on the Club de Vela wiki page in `FIBERY_WIKI_PAGE_ID`
   - for a question back or a reschedule request, also a Helm/Horizons card on `FIBERY_VOYAGE_ID`, owned by `FIBERY_OWNER_USER_ID`

   On success it sets `filed_at` (and `fibery_ref` for a Horizon). On failure it increments `attempts` and records `last_error`: the step and the HTTP status only, never a token or a response body. Everything written to Fibery follows the voice rules: no em dashes, no emoji.
4. **Judge.** Once events are filed, the route fires the AG-095 routine by its API trigger (`AG095_FIRE_URL`, bearer `AG095_FIRE_TOKEN`, `anthropic-beta: experimental-cc-routine-2026-04-01`). The fire is debounced to once every two minutes, which keeps within the 30-fires-an-hour limit. AG-095 does the judgement work (transcription, Ledger rows, summaries) and marks each event judged through the write path.
5. **Retry.** `pg_cron` calls the same route every 15 minutes. That files anything left unfiled (up to 12 attempts) and fires the routine for anything filed but not yet sent to it.

**Branch built for (c): routine fired on event.** The live-state unknown resolved yes: a claude.ai scheduled task has an authenticated `/fire` endpoint (research preview). The hourly fallback is built in too: if `AG095_FIRE_URL` or `AG095_FIRE_TOKEN` is not set, the route skips the fire and AG-095 picks up events where `judged_at` is null on its hourly schedule.

**Schedules run in the database, not as Vercel crons.** `pg_cron` calls the app, so the 15-minute retry works on any Vercel plan (Hobby allows daily crons only). The jobs are `coach-portal-intake-retry`, `coach-portal-digest-aedt` and `coach-portal-digest-aest`.

## Claude's write path

`/api/claude/...` takes JSON and requires `Authorization: Bearer <CLAUDE_SERVICE_TOKEN>`. Times are ISO 8601 with an offset. Errors come back as `{ "error": "..." }`.

| Method and path | Body | Does |
|---|---|---|
| `GET /api/claude/engagements` | | Lists engagements with `tier_by_month` |
| `PATCH /api/claude/engagements/:id` | `{ tier_by_month: { "2026-12": "launch_intensive" } }` | Sets the month's tier: `owners_coach`, `launch_intensive` or `sounding_board` |
| `POST /api/claude/members` | `{ engagement_id, email, role, display_name }` | Adds a person. Sends no email: they ask for a sign-in link themselves |
| `POST /api/claude/cards` | `{ engagement_id, title, question, context_md?, document_md?, document_pdf_path?, options: [{ key, label }], recommendation_md?, size?, due_at?, fibery_ref? }` | Publishes a card (status `awaiting_coach`) |
| `PATCH /api/claude/cards/:id` | Any card field, or `{ status: "actioned" }` | Edits a card, or marks it actioned (stamps `actioned_at`) |
| `POST /api/claude/sessions` | `{ engagement_id, number?, starts_at, duration_min?, call_url?, agenda_md?, summary_md? }` | Adds a session |
| `PATCH /api/claude/sessions/:id` | `{ agenda_md?, summary_md?, status?: "held" \| "scheduled" \| "cancelled", cancelled_by_owner_at? }` | Publishes the agenda or summary, marks a session held, or records an owner cancellation. Less than 24 hours' notice becomes `cancelled_by_owner_late` and counts as used |
| `POST /api/claude/actions` | `{ session_id, owner_role: "owner" \| "coach", text }` | Adds an action from a session |
| `POST /api/claude/decisions` | `{ engagement_id, question, decision, coach_view?, card_id?, session_id?, decided_at?, fibery_ref? }` | Adds a row to the decision log |
| `POST /api/claude/comments` | `{ card_id, body_md }` | Comments on a card as "Claude for <owner>" |
| `PATCH /api/claude/uploads/:id` | `{ transcript_md }` | Writes a voice note transcript |
| `GET /api/claude/intake-events?status=unjudged\|unfiled\|all&limit=50` | | Lists intake events for AG-095 |
| `PATCH /api/claude/intake-events/:id` | `{ judged: true }` | Marks an event judged |

Claude can also read and write the portal directly through the Supabase connector, as the service role.

