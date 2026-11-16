import { SignInForm } from "./sign-in-form";

export const metadata = { title: "Sign in · Coach portal" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 py-8">
      <div className="flex flex-col gap-1.5">
        <span className="muted">Club de Vela</span>
        <h1 className="m-0 text-2xl font-bold">Coach portal</h1>
      </div>
      {reason === "no-access" ? (
        <p role="status" className="m-0 rounded-md border border-line bg-warn-bg p-3 text-sm text-warn-ink">
          That address has no engagement yet. Ask Matt to add you, then sign in again.
        </p>
      ) : null}
      {reason === "link-expired" ? (
        <p role="status" className="m-0 rounded-md border border-line bg-warn-bg p-3 text-sm text-warn-ink">
          That sign-in link has expired or was already used. Ask for a fresh one below.
        </p>
      ) : null}
      <SignInForm />
    </main>
  );
}
