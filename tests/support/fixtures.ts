import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Test fixtures against a local Supabase stack. Each call makes fresh people
 * and engagements with unique emails, so runs never collide.
 */

export function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set. Start the local stack and write .env.local.`);
  return v;
}

export function adminClient(): SupabaseClient {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function anonClient(): SupabaseClient {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function uniqueEmail(label: string): string {
  return `${label}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@example.test`;
}

export async function createPerson(email: string): Promise<string> {
  const admin = adminClient();
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  return data.user.id;
}

/** A client signed in as that person, through a one-time token hash (no email sent). */
export async function signedInClient(email: string): Promise<SupabaseClient> {
  const admin = adminClient();
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data.properties?.hashed_token) throw new Error(`generateLink failed: ${error?.message}`);
  const client = anonClient();
  const { error: vErr } = await client.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: "email" });
  if (vErr) throw new Error(`verifyOtp failed: ${vErr.message}`);
  return client;
}

export type Seeded = {
  engagementId: string;
  ownerEmail: string;
  ownerId: string;
  coachEmail: string;
  coachId: string;
  cardIds: string[];
  sessionIds: { last: string; next: string };
  coachActionId: string;
  ownerActionId: string;
};

const SAMPLE_DOC = `# Cart requirements v1.0 (sample)

## 1. Purpose of the carts
Sample content only. The carts serve the Terraza on busy days.

## 2. Cart one: coffee
| Item | Power | Water |
|---|---|---|
| Espresso machine | 15 amp | Plumbed |

## 3. Cart two: drinks
Sample paragraph for the drinks cart.

## 4. Cart three: grill
Electric, because of the site rules. End of sample document.`;

export async function seedEngagement(opts: {
  label: string;
  coachName?: string;
  ownerName?: string;
  withCards?: boolean;
  now?: Date;
}): Promise<Seeded> {
  const admin = adminClient();
  const now = opts.now ?? new Date();
  const ownerEmail = uniqueEmail(`${opts.label}-owner`);
  const coachEmail = uniqueEmail(`${opts.label}-coach`);
  const ownerId = await createPerson(ownerEmail);
  const coachId = await createPerson(coachEmail);

  const monthKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit" })
    .format(now)
    .slice(0, 7);

  const { data: eng, error } = await admin
    .from("engagements")
    .insert({
      name: `${opts.label} coaching (test)`,
      client_name: "Club de Vela",
      owner_user_id: ownerId,
      coach_user_id: coachId,
      tier_by_month: { [monthKey]: "owners_coach" },
    })
    .select("id")
    .single();
  if (error || !eng) throw new Error(`engagement insert failed: ${error?.message}`);
  const engagementId = eng.id as string;

  const { error: mErr } = await admin.from("members").insert([
    { engagement_id: engagementId, user_id: ownerId, role: "owner", display_name: opts.ownerName ?? "Matt" },
    { engagement_id: engagementId, user_id: coachId, role: "coach", display_name: opts.coachName ?? "Test guest" },
  ]);
  if (mErr) throw new Error(`members insert failed: ${mErr.message}`);

  const day = 24 * 60 * 60 * 1000;
  const cardIds: string[] = [];
  if (opts.withCards !== false) {
    const options = [
      { key: "A", label: "Three carts as specified: coffee, drinks, grill." },
      { key: "B", label: "Add a fourth cart for cold and raw plates from day one." },
      { key: "C", label: "Three carts now, with power and space left for a fourth." },
    ];
    const { data: cards, error: cErr } = await admin
      .from("cards")
      .insert([
        {
          engagement_id: engagementId,
          title: "Cart requirements v1.0 (sample)",
          question: "Do three carts cover a packed summer Saturday, or do we need a fourth from day one?",
          context_md: "Sample context. What the carts are for and what needs deciding before ordering.",
          document_md: SAMPLE_DOC,
          options,
          recommendation_md: "Sample recommendation: C, so the fourth cart can follow without rework.",
          size: "standard",
          due_at: new Date(now.getTime() + 2 * day).toISOString(),
        },
        {
          engagement_id: engagementId,
          title: "Launch menu v1 (sample)",
          question: "What to cut for opening?",
          context_md: "Sample context for the launch menu.",
          document_md: "# Launch menu v1 (sample)\n\nSample items only.",
          options: [
            { key: "A", label: "Keep all items." },
            { key: "B", label: "Cut to the top twenty." },
          ],
          recommendation_md: "Sample recommendation: B.",
          size: "large",
          due_at: new Date(now.getTime() + 3 * day).toISOString(),
        },
        {
          engagement_id: engagementId,
          title: "Licensee duties checklist (sample)",
          question: "Anything missing from a good licensee's week?",
          context_md: "Sample context for the licensee checklist.",
          document_md: "# Licensee duties (sample)\n\n- Sample duty one\n- Sample duty two",
          options: [
            { key: "A", label: "Complete as is." },
            { key: "B", label: "Needs additions." },
          ],
          recommendation_md: "Sample recommendation: A.",
          size: "standard",
          due_at: new Date(now.getTime() + 4 * day).toISOString(),
        },
      ])
      .select("id, title");
    if (cErr || !cards) throw new Error(`cards insert failed: ${cErr?.message}`);
    const order = ["Cart", "Launch", "Licensee"];
    for (const prefix of order) cardIds.push(cards.find((c) => c.title.startsWith(prefix))!.id);
  }

  const { data: sessions, error: sErr } = await admin
    .from("sessions")
    .insert([
      {
        engagement_id: engagementId,
        number: 2,
        starts_at: new Date(now.getTime() - 6 * day).toISOString(),
        status: "held",
        summary_md: "Sample summary of session 2.",
        call_url: "https://example.test/call",
      },
      {
        engagement_id: engagementId,
        number: 3,
        starts_at: new Date(now.getTime() + 2 * day).toISOString(),
        status: "scheduled",
        agenda_md: "1. Wins and numbers since last session (5 min)\n2. Cart requirements sign-off (20 min)",
        call_url: "https://example.test/call",
      },
    ])
    .select("id, number");
  if (sErr || !sessions) throw new Error(`sessions insert failed: ${sErr?.message}`);
  const last = sessions.find((s) => s.number === 2)!.id as string;
  const next = sessions.find((s) => s.number === 3)!.id as string;

  const { data: actions, error: aErr } = await admin
    .from("actions")
    .insert([
      { session_id: last, owner_role: "owner", text: "Send three roaster samples (sample)" },
      { session_id: last, owner_role: "coach", text: "Mark up cart workflow sketch (sample)" },
    ])
    .select("id, owner_role");
  if (aErr || !actions) throw new Error(`actions insert failed: ${aErr?.message}`);

  await admin.from("decisions").insert({
    engagement_id: engagementId,
    session_id: last,
    question: "Which roasters to sample? (sample)",
    coach_view: "Three, local first",
    decision: "Shortlist of three",
    decided_at: new Date(now.getTime() - 6 * day).toISOString(),
  });

  return {
    engagementId,
    ownerEmail,
    ownerId,
    coachEmail,
    coachId,
    cardIds,
    sessionIds: { last, next },
    coachActionId: actions.find((a) => a.owner_role === "coach")!.id,
    ownerActionId: actions.find((a) => a.owner_role === "owner")!.id,
  };
}
