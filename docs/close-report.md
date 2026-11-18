# Coach portal v1: close report (H#3278)

Build dispatch for H#3278 "Build coach portal v1 hosted app for Frank", Voyage V#126. Source session P#4610. Built 16 Nov 2026 AEDT.

## State

All six slices are built, tested, merged to `main` and deployed. Done When limbs (1) to (6) are met. Limb (7), the live check on production, is not yet run: it waits on settings and secrets only a person can place. They are listed in [`launch-steps.md`](launch-steps.md).

- Production: https://coach-portal-coleborneco.vercel.app
- Merged pull requests:
  - mcoleborne/coach-portal#1 sign-in, schema, row-level security
  - mcoleborne/coach-portal#2 cards and answers
  - mcoleborne/coach-portal#3 uploads and comments
  - mcoleborne/coach-portal#4 intake and Fibery filing
  - mcoleborne/coach-portal#5 sessions, actions, hours, decision log
  - mcoleborne/coach-portal#6 digest, raise something, empty state, phone pass
  - mcoleborne/coach-portal#7 live check, seed script, AG-095 setup
  - and the pull request that added this page
- Intake branch built: **the routine fired on event.** The live-state unknown resolved yes: a claude.ai scheduled task has an authenticated `/fire` endpoint (research preview). The app fires AG-095 at most once every two minutes. If `AG095_FIRE_URL` or `AG095_FIRE_TOKEN` is absent, it falls back to AG-095's hourly run.

## Done When

| Limb | Status | Proof |
|---|---|---|
| (1) Sign-in by emailed link, phone and desktop, no Claude account | Met | `e2e/sign-in.spec.ts` at 1280px and 390px. The link is read from the local mail catcher. |
| (2) Row-level security limits every table to the person's engagements | Met | `tests/integration/rls.test.ts`: a second guest reads none of the first guest's rows in 12 tables or storage, and signed-out callers reach nothing. `e2e/cards.spec.ts`: 404 on another guest's card and its PDF. |
| (3) Full document, option answer with reasoning and attachments, question back, comment thread | Met | `e2e/cards.spec.ts`, `e2e/uploads-comments.spec.ts` |
| (4) Every coach act writes one intake row and calls the trigger | Met | `tests/integration/intake.test.ts`: exactly one row for each of the 8 acts. `e2e/intake.spec.ts`: the real path, browser act to trigger to `pg_net` to filing route to stub Fibery to routine fire, in seconds. |
| (5) Hours meter derived from data, large counts as two, dates pinned in AEDT and AEST | Met | `tests/unit/hours.test.ts`, `tests/unit/sydney.test.ts`: pinned clocks either side of midnight in both halves of the year and across both DST changes. |
| (6) Digest at most once a day when new cards are published | Met | `tests/unit/digest-rule.test.ts`, `tests/integration/digest.test.ts`: same day, next day, nothing new, failure then retry, concurrent calls. |
| (7) Test guest runs the acceptance checks on the live URL, each intake event reaches Fibery within two minutes | **Not met** | `.github/workflows/live-check.yml` is built and ready. It needs launch-steps.md steps 1 to 3 first. |

## Done on production

- **Migrations:** all four applied. After each, production's functions, grants, policies, triggers and cron jobs fingerprinted identically to the migration files.
- **Hardening:** function execute rights revoked from signed-out callers, after a Supabase security advisor finding. Tested.
- **Seed:** the test engagement "Club de Vela coaching (test)": owner Matt, a test guest, three sample cards, sessions, actions and a sample decision.
- **Database to app:** a `pg_net` call from the database got `503 not_configured` back, naming only the two missing secrets.
- **Sign-in link:** production Auth accepted a link request for the test guest (HTTP 200). Arrival in the inbox is unconfirmed.
- **Vercel settings:** the non-secret production settings are placed (Fibery ids, app URL, digest settings).

## Departures from the brief

- **Schedules run in Supabase `pg_cron`, not as a Vercel cron.** A 15-minute Vercel cron fails every deploy on the Hobby plan. The behaviour is the same: retry every 15 minutes, and the digest at 7:30am Sydney in both AEDT and AEST.
- **The test guest address was chosen in the build.** The brief named none. The digest allow-list holds only that address until Matt says go for Frank.
- **Data model additions:** `engagement_id` on every child table, intake claim and judge stamps, card activity timestamps, and upload links to answers and raised items. All additive.
- **Repository visibility:** still public. No tool in the build session could change it (launch-steps.md step 3).

## Close gate: not run in the build session

The build session had no Passage of its own, and P#4610, the authoring session, is already Closed. Sealing would have meant creating a Passage in Helm/Passages. That database is outside the brief's Fibery write limits (Club de Vela/Wiki Page, Helm/Ledger and Helm/Horizons, on V#126 only), so the build session did not write it. It also wrote nothing else to Fibery.

For the session that runs the gate (the supervising Claude, or the next session on this work):

- **Decisions to file on V#126:**
  1. Intake branch (c) built as "routine fired on event", with the hourly fallback. Why: the routine docs show an authenticated `/fire` endpoint.
  2. Schedules moved from Vercel cron to Supabase `pg_cron`. Why: Hobby plan cron limits.
- **Horizons generated:** none. Limb (7) stays on H#3278.
- **Back-writes owed** (from the brief, section 4):
  - this report to H#3278
  - the "Coach portal intake event to Fibery" seam to Helm/Interfaces
  - AG-095 out of Building once its routine is live
- **Next action:** run launch-steps.md steps 1 to 3, then the Live check workflow, for H#3278 limb (7).
