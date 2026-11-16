import Link from "next/link";
import { AddMaterial } from "@/components/add-material";
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
      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 pb-28 md:px-10 md:py-8 md:pb-8 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
          <ReviewQueue
            cards={cards}
            filter={filter}
            coachName={ctx.coachName}
            ownerName={ctx.ownerName}
            viewerIsCoach={ctx.role === "coach"}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <section className="panel flex flex-col gap-4" aria-labelledby="material-title">
            <h2 id="material-title" className="panel-title">
              Add material
            </h2>
            <AddMaterial engagementId={ctx.engagement.id} />
            <span className="muted">Menus you like, supplier lists, walkthroughs and voice notes.</span>
          </section>
        </div>
      </main>
      <nav
        aria-label="Quick actions"
        className="fixed inset-x-0 bottom-0 flex gap-3 border-t border-line bg-surface px-5 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:hidden"
      >
        <AddMaterial engagementId={ctx.engagement.id} variant="bar" />
        <Link href="/log" className="btn min-h-12 text-base">
          Log
        </Link>
      </nav>
    </>
  );
}
