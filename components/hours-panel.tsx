import type { HoursMeter } from "@/lib/hours";

function Meter({ label, used, allowed }: { label: string; used: number; allowed: number | null }) {
  const pct = allowed ? Math.min(100, Math.round((used / allowed) * 100)) : 0;
  const over = allowed !== null && used > allowed;
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <div className="flex justify-between">
        <span>{label}</span>
        <span data-testid={`hours-${label.toLowerCase()}`}>{allowed === null ? `${used} used` : `${used} of ${allowed}`}</span>
      </div>
      <div
        role="meter"
        aria-label={`${label} used this month`}
        aria-valuemin={0}
        aria-valuemax={allowed ?? used}
        aria-valuenow={used}
        className="h-2 rounded bg-line-soft"
      >
        <div className={`h-2 rounded ${over ? "bg-warn-ink" : "bg-muted"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function HoursPanel({ hours }: { hours: HoursMeter }) {
  const month = MONTHS[Number(hours.monthKey.slice(5, 7)) - 1];
  return (
    <section className="panel flex flex-col gap-4" aria-labelledby="hours-title">
      <div className="flex flex-col gap-0.5">
        <h2 id="hours-title" className="panel-title">
          Hours this month
        </h2>
        <span className="text-sm text-muted">
          {month}
          {hours.tier ? ` · ${hours.tier.name}` : " · no tier set yet"}
          {hours.tier?.midWeekCheckIns ? " · mid-week check-ins included" : ""}
        </span>
      </div>
      <Meter label="Sessions" used={hours.sessionsUsed} allowed={hours.sessionsAllowed} />
      <Meter label="Reviews" used={hours.reviewsUsed} allowed={hours.reviewsAllowed} />
      <span className="text-sm text-muted">Large reviews count as two. Resets on the 1st, Sydney time.</span>
    </section>
  );
}
