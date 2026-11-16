import { AppHeader } from "@/components/app-header";
import { requireContext } from "@/lib/context";

export default async function HomePage() {
  const ctx = await requireContext();
  return (
    <>
      <AppHeader ctx={ctx} />
      <main className="mx-auto max-w-6xl px-4 py-6 md:px-10">
        <section className="panel">
          <h1 className="panel-title">Home</h1>
          <p className="muted">Signed in to {ctx.engagement.name}.</p>
        </section>
      </main>
    </>
  );
}
