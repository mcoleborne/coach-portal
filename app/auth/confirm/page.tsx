import { Suspense } from "react";
import { ConfirmClient } from "./confirm-client";

export const metadata = { title: "Signing in · Coach portal" };

export default function ConfirmPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-6">
      <Suspense fallback={<p className="muted">Signing you in...</p>}>
        <ConfirmClient />
      </Suspense>
    </main>
  );
}
