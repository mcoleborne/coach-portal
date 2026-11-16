import { AddMaterial } from "@/components/add-material";
import { AppHeader } from "@/components/app-header";
import { DecisionLog } from "@/components/decisions";
import { loadWeek } from "@/lib/week";
import { UploadGrid } from "@/components/upload-grid";
import { requireContext } from "@/lib/context";
import { memberNames } from "@/lib/queries";
import { signPaths } from "@/lib/storage/signed";
import { createClient } from "@/lib/supabase/server";
import type { Upload } from "@/lib/types";

export const metadata = { title: "Decision log and uploads · Coach portal" };

export default async function LogPage() {
  const ctx = await requireContext();
  const supabase = await createClient();
  const [names, week, { data }] = await Promise.all([
    memberNames(supabase, ctx.engagement.id),
    loadWeek(supabase, ctx.engagement.id),
    supabase.from("uploads").select("*").eq("engagement_id", ctx.engagement.id).order("created_at", { ascending: false }).limit(200),
  ]);
  const uploads = (data ?? []) as Upload[];
  const urls = await signPaths(supabase, uploads.map((u) => u.storage_path));

  return (
    <>
      <AppHeader ctx={ctx} back={{ href: "/", label: "Back to home" }} />
      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 md:px-10 md:py-8">
        <section className="panel flex flex-col gap-3" aria-labelledby="log-title">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
            <h1 id="log-title" className="panel-title">
              Decision log
            </h1>
            <span className="muted">Every call {ctx.coachName} weighed in on. Becomes the venue playbook.</span>
          </div>
          <DecisionLog
            decisions={week.decisions}
            sessions={week.sessions}
            coachName={ctx.coachName}
            ownerName={ctx.ownerName}
          />
          <span className="muted">Claude writes each row and files the same decision to the Club de Vela wiki and the Helm Ledger.</span>
        </section>
        <section className="panel flex flex-col gap-3" aria-labelledby="uploads-title">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <h2 id="uploads-title" className="panel-title">
                Uploads
              </h2>
              <span className="muted">Linked to a card, or general. Links open for an hour.</span>
            </div>
            <AddMaterial engagementId={ctx.engagement.id} variant="button" />
          </div>
          <UploadGrid uploads={uploads} urls={urls} names={names} columns="sm:grid-cols-3 lg:grid-cols-5" />
        </section>
      </main>
    </>
  );
}
