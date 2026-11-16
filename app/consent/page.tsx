import { redirect } from "next/navigation";
import { requireContext } from "@/lib/context";
import { recordConsent } from "@/app/actions";

export const metadata = { title: "Before you start · Coach portal" };

export default async function ConsentPage() {
  const ctx = await requireContext({ allowConsentPending: true });
  if (ctx.consentAnswered || ctx.role !== "coach") redirect("/");
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 py-8">
      <div className="flex flex-col gap-1.5">
        <span className="muted">{ctx.engagement.client_name ?? ctx.engagement.name}</span>
        <h1 className="m-0 text-2xl font-bold">Welcome, {ctx.displayName}</h1>
      </div>
      <form action={recordConsent} className="panel flex flex-col gap-3.5">
        <input type="hidden" name="engagement_id" value={ctx.engagement.id} />
        <span className="font-semibold">One question, asked once</span>
        <p className="m-0 text-sm leading-relaxed text-muted">
          {ctx.ownerName} would like to record the weekly calls to keep notes. You can say no and nothing else
          changes.
        </p>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" name="consent" value="yes" className="size-5" />
          I&apos;m comfortable with calls being recorded
        </label>
        <button type="submit" className="btn-primary">
          Continue
        </button>
      </form>
    </main>
  );
}
