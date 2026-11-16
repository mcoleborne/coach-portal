import Link from "next/link";
import type { PortalContext } from "@/lib/context";
import { tierForMonth } from "@/lib/hours";
import { sydneyMonthKey } from "@/lib/time/sydney";

export function AppHeader({ ctx, back }: { ctx: PortalContext; back?: { href: string; label: string } }) {
  const tier = tierForMonth(ctx.engagement.tier_by_month, sydneyMonthKey(new Date()));
  const title = ctx.engagement.client_name ?? ctx.engagement.name;
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 md:px-10 md:py-5">
        {back ? (
          <Link href={back.href} className="link-target text-sm">
            {back.label}
          </Link>
        ) : (
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-lg font-bold md:text-xl">{title} · Coach portal</span>
            <span className="text-xs text-muted md:text-sm">
              {ctx.ownerName} and {ctx.coachName}
              {tier ? ` · ${tier.name} tier` : ""}
            </span>
          </div>
        )}
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-muted sm:inline">
            Signed in as {ctx.displayName}
            {ctx.role === "coach" ? " (guest)" : ""}
          </span>
          <form action="/auth/signout" method="post">
            <button type="submit" className="btn-quiet px-3 text-xs">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
