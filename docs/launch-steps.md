# Coach portal v1: steps to finish the launch

The build is done. All six slices are merged to `main` and deployed to production at https://coach-portal-coleborneco.vercel.app. Done When limbs (1) to (6) of H#3278 are proven by tests on the head commit.

Limb (7), the live acceptance check, is the one thing left. It cannot run until a person places a few settings and secrets in three dashboards. This page lists them in order, says why each one matters, and ends with the step that hands back to Claude.

**Credential rule for every step.** No secret value is ever read aloud, typed into a chat, screenshotted or written anywhere except the field it belongs in. Copy it from its source to its destination inside the browser.

## Step 1. Supabase: let sign-in links land on the app

Project `coach-portal` (ref `ljseflgfzyjzjbnldern`).

**Authentication > URL Configuration**
- Site URL: `https://coach-portal-coleborneco.vercel.app`
- Redirect URLs, add: `https://coach-portal-coleborneco.vercel.app/auth/confirm`

Why: the emailed sign-in link sends the person back to the app. Supabase only redirects to addresses on this list, and otherwise falls back to its default site address, so until this is set a sign-in link probably lands somewhere other than the app.

**Authentication > Sign In / Providers**
- Turn off "Allow new users to sign up".

Why: people join an engagement because Matt adds them, never by signing themselves up. The app already asks for links with sign-up off. This closes the same door on the server.

**Later, before Frank is invited: Authentication > Emails > SMTP settings.** Supabase's built-in email is rate limited and may only deliver to members of the Supabase organisation. Point it at the same email provider as the digest.

## Step 2. Vercel: give the app its secrets

Team `coleborneco`, project `coach-portal`, Settings > Environment Variables. Add each for **Production**, type **Sensitive**.

| Name | Where the value comes from | What it unlocks |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase > Project Settings > API keys, the secret (service role) key | The intake filing route, the digest and Claude's write path. Without it they answer `503 not_configured`. |
| `FIBERY_TOKEN` | Fibery > Settings > API keys. Create one named "coach-portal intake". | Filing each coach act to the Club de Vela wiki page and opening Horizons for questions back and reschedule requests. |
| `CLAUDE_SERVICE_TOKEN` | Generate a long random string. Keep a copy wherever Meridian Claude calls the portal from. | Claude's write path (`/api/claude/...`): publishing cards, agendas, summaries and decisions. |
| `RESEND_API_KEY` and `DIGEST_FROM` | Resend, once a sending domain is verified there. `DIGEST_FROM` looks like `Coach portal <portal@your-verified-domain>`. | The daily digest email. Optional for the live check. |

Then **Deployments > latest production > Redeploy**, so the new values load.

Already set, leave alone: `APP_URL`, `FIBERY_WORKSPACE`, `FIBERY_WIKI_PAGE_ID`, `FIBERY_VOYAGE_ID`, `FIBERY_OWNER_USER_ID`, `FIBERY_WORKSTREAM_ID`, `DIGEST_REPLY_TO`, `DIGEST_ALLOWED_RECIPIENTS`.

**How to tell it worked:** a `POST` to `https://coach-portal-coleborneco.vercel.app/api/intake/process` returns `{"ok":true,...}` instead of `503 not_configured`.

## Step 3. GitHub: make the repository private and arm the live check

Repository `mcoleborne/coach-portal`, Settings.

- **General > Danger Zone > Change visibility > Private.** No credential or email address is committed, but the code belongs to Growth Gurus and should not be public.
- **Secrets and variables > Actions > Secrets**, add:
  - `SUPABASE_SERVICE_ROLE_KEY`, the same value as in Vercel.
  - `LIVE_GUEST_EMAIL`, the test guest's address: the one in Vercel's `DIGEST_ALLOWED_RECIPIENTS`.
- **Secrets and variables > Actions > Variables**, add:
  - `SUPABASE_PUBLISHABLE_KEY`, the public publishable key. It is the same value as Vercel's `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

Why: the Live check workflow signs in as the test guest by minting a one-time link with the service key, so it needs no inbox, and nobody ever reads a sign-in link.

## Step 4. claude.ai: create AG-095 (optional for the live check)

Follow [`ag-095-routine.md`](ag-095-routine.md): create the scheduled task, add an API trigger and generate its token. Then put `AG095_FIRE_URL` (plain) and `AG095_FIRE_TOKEN` (sensitive) in Vercel and redeploy.

Without it, intake still files to Fibery. Only AG-095's judgement work (transcription, Ledger rows, summaries) waits for the task to exist.

## Step 5. Hand back to Claude for the live check (Done When limb 7)

Start a Claude Code session on this repository and say the secrets are placed. That session:

1. Runs the **Live check** workflow (Actions tab, `live-check.yml`).
2. Watches it and fixes anything it finds.
3. Reports each coach act with how long it took to reach Fibery. The limit is two minutes.

The check writes sample rows to the test engagement, a few dated lines to Club de Vela wiki page 61, and one test Horizon on V#126 for the question back.

## Do not

- Invite Frank or send him a sign-in link. That waits until the live check passes and Matt says go.
- Change `DIGEST_ALLOWED_RECIPIENTS` until Matt says go for Frank. It is what stops a digest reaching anyone but the test guest.
