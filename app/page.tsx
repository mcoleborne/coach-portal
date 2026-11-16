import { AppHeader } from "@/components/app-header";
import { ReviewQueue } from "@/components/review-queue";
import { requireContext } from "@/lib/context";
import { listCards } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import type { CardStatus } from "@/lib/types";

const STATUSES: CardStatus[] = ["awaiting_coach", "question_back", "answered", "actioned"];

export default async function HomePage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const ctx = await requireContext();
  const { status } = await searchParams;
  const filter = STATUSES.includes(status as CardStatus) ? (status as CardStatus) : "awaiting_coach";
  const supabase = await createClient();
  const cards = await listCards(supabase, ctx.engagement.id);

  return (
    <>
      <AppHeader ctx={ctx} />
      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 md:px-10 md:py-8">
        <ReviewQueue
          cards={cards}
          filter={filter}
          coachName={ctx.coachName}
          ownerName={ctx.ownerName}
          viewerIsCoach={ctx.role === "coach"}
        />
      </main>
    </>
  );
}
