import Link from "next/link";
import { formatSydneyShortDate } from "@/lib/time/sydney";
import type { Decision, Session } from "@/lib/types";

function source(d: Decision, sessions: Session[]) {
  if (d.card_id) return { href: `/cards/${d.card_id}`, label: "Review card" };
  const s = sessions.find((x) => x.id === d.session_id);
  if (s) return { href: null, label: s.number ? `Session ${s.number}` : "Session" };
  return { href: null, label: "" };
}

export function RecentDecisions({ decisions, sessions }: { decisions: Decision[]; sessions: Session[] }) {
  return (
    <section className="panel flex flex-col gap-3" aria-labelledby="decisions-title">
      <h2 id="decisions-title" className="panel-title">
        Recent decisions
      </h2>
      {decisions.length === 0 ? <p className="muted m-0">None yet. Claude adds each call here as it is made.</p> : null}
      {decisions.slice(0, 3).map((d) => {
        const src = source(d, sessions);
        return (
          <div key={d.id} className="flex flex-col gap-0.5 text-sm">
            <span className="font-semibold">{d.decision}</span>
            <span className="text-muted">
              {formatSydneyShortDate(new Date(d.decided_at))}
              {src.label ? ` · ${src.label}` : ""}
            </span>
          </div>
        );
      })}
      <Link href="/log" className="link-target text-sm">
        Full decision log
      </Link>
    </section>
  );
}

export function DecisionLog({
  decisions,
  sessions,
  coachName,
  ownerName,
}: {
  decisions: Decision[];
  sessions: Session[];
  coachName: string;
  ownerName: string;
}) {
  if (decisions.length === 0) return <p className="muted m-0">No decisions yet.</p>;
  return (
    <>
      <table className="hidden w-full border-collapse text-sm md:table" data-testid="decision-table">
        <thead>
          <tr className="border-b border-line text-left text-muted">
            <th className="px-2 py-2.5 font-normal">Date</th>
            <th className="px-2 py-2.5 font-normal">Question</th>
            <th className="px-2 py-2.5 font-normal">{coachName}&apos;s view</th>
            <th className="px-2 py-2.5 font-normal">{ownerName} decided</th>
            <th className="px-2 py-2.5 font-normal">Source</th>
          </tr>
        </thead>
        <tbody>
          {decisions.map((d) => {
            const src = source(d, sessions);
            return (
              <tr key={d.id} className="border-b border-line-soft align-top">
                <td className="px-2 py-2.5 whitespace-nowrap">{formatSydneyShortDate(new Date(d.decided_at))}</td>
                <td className="px-2 py-2.5">{d.question}</td>
                <td className="px-2 py-2.5">{d.coach_view ?? ""}</td>
                <td className="px-2 py-2.5">{d.decision}</td>
                <td className="px-2 py-2.5">{src.href ? <Link href={src.href}>{src.label}</Link> : src.label}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <ul className="m-0 flex list-none flex-col gap-3 p-0 md:hidden" aria-label="Decisions">
        {decisions.map((d) => {
          const src = source(d, sessions);
          return (
            <li key={d.id} className="flex flex-col gap-1 rounded-md border border-line-soft p-3 text-sm">
              <span className="text-xs text-muted">
                {formatSydneyShortDate(new Date(d.decided_at))}
                {src.label ? " · " : ""}
                {src.href ? <Link href={src.href}>{src.label}</Link> : src.label}
              </span>
              <span className="font-semibold">{d.question}</span>
              {d.coach_view ? (
                <span>
                  {coachName}: {d.coach_view}
                </span>
              ) : null}
              <span>
                {ownerName} decided: {d.decision}
              </span>
            </li>
          );
        })}
      </ul>
    </>
  );
}
