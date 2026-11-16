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
| `npm run test:integration` | Against the local stack: row-level security on every table and on storage |
| `npm run test:e2e` | Playwright on desktop (1280) and phone (390): sign-in by emailed link |
| `npm run check:dashes` | No em dash in any tracked file |

Tests refuse to run unless `NEXT_PUBLIC_SUPABASE_URL` points at 127.0.0.1, so they can never touch a real project.

## Environment

| Name | Where | Secret |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel | No |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Vercel | No (public client key) |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel, server only | Yes |

## Security

- Row-level security on every table. A person reads and writes only rows of engagements they belong to. Tested in `tests/integration/rls.test.ts`.
- Writes that change existing rows (ticking an action, asking to reschedule, consent) go through `SECURITY DEFINER` functions that check membership and role.
- Files sit in a private bucket under `<engagement_id>/...` and open through signed links that expire after an hour.
- The service role key is read only on the server (`lib/supabase/admin.ts` imports `server-only`).
- Public sign-up is off. Only people added to an engagement can get a sign-in link.

## Time

Australia/Sydney is the operating timezone. `lib/time/sydney.ts` is the only place an instant becomes a calendar date, using `Intl.DateTimeFormat` with the IANA zone. Times on screen carry AEDT or AEST as it applies on the date.
