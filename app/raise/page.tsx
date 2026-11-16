import { AppHeader } from "@/components/app-header";
import { RaiseForm } from "@/components/raise-form";
import { requireContext } from "@/lib/context";

export const metadata = { title: "Raise something · Coach portal" };

export default async function RaisePage() {
  const ctx = await requireContext();
  return (
    <>
      <AppHeader ctx={ctx} back={{ href: "/", label: "Cancel" }} />
      <main className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-6 md:py-10">
        <h1 className="m-0 text-xl font-bold">Raise something</h1>
        <RaiseForm engagementId={ctx.engagement.id} ownerName={ctx.ownerName} />
      </main>
    </>
  );
}
