import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { MemberRole } from "@/lib/types";

export type PortalContext = {
  userId: string;
  email: string | null;
  engagement: {
    id: string;
    name: string;
    client_name: string | null;
    tier_by_month: Record<string, string>;
    recording_consent_at: string | null;
  };
  role: MemberRole;
  displayName: string;
  coachName: string;
  ownerName: string;
  consentAnswered: boolean;
};

/**
 * The signed-in person and their engagement. v1 screens show one engagement,
 * the first one the person belongs to, though every record carries its id.
 */
export const getContext = cache(async (): Promise<PortalContext | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: memberships } = await supabase
    .from("members")
    .select("engagement_id, role, display_name, consent_answered_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1);
  const me = memberships?.[0];
  if (!me) {
    return null;
  }

  const [{ data: engagement }, { data: people }] = await Promise.all([
    supabase
      .from("engagements")
      .select("id, name, client_name, tier_by_month, recording_consent_at")
      .eq("id", me.engagement_id)
      .single(),
    supabase.from("members").select("role, display_name").eq("engagement_id", me.engagement_id),
  ]);
  if (!engagement) return null;

  const coachName = people?.find((p) => p.role === "coach")?.display_name ?? "the coach";
  const ownerName = people?.find((p) => p.role === "owner")?.display_name ?? "the owner";

  return {
    userId: user.id,
    email: user.email ?? null,
    engagement: engagement as PortalContext["engagement"],
    role: me.role as MemberRole,
    displayName: me.display_name,
    coachName,
    ownerName,
    consentAnswered: me.consent_answered_at !== null,
  };
});

/** For pages: signed in, a member, and past the one-time consent question. */
export async function requireContext(opts: { allowConsentPending?: boolean } = {}): Promise<PortalContext> {
  const ctx = await getContext();
  if (!ctx) redirect("/sign-in?reason=no-access");
  if (!opts.allowConsentPending && ctx.role === "coach" && !ctx.consentAnswered) redirect("/consent");
  return ctx;
}
