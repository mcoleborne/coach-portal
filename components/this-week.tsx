import { tickAction } from "@/app/actions";
import { Markdown } from "@/components/markdown";
import { RescheduleRequest } from "@/components/reschedule-request";
import type { PortalContext } from "@/lib/context";
import { formatSydneyDateTime } from "@/lib/time/sydney";
import type { Week } from "@/lib/week";

function sessionLine(n: number | null, startsAt: string, minutes: number) {
  return `${n ? `Session ${n} · ` : ""}${formatSydneyDateTime(new Date(startsAt))} · ${minutes} min`;
}

export function ThisWeek({ ctx, week }: { ctx: PortalContext; week: Week }) {
  const { next, last, lastActions } = week;
  const nameFor = (role: "owner" | "coach") => (role === "owner" ? ctx.ownerName : ctx.coachName);
  const agendaItems = next?.agenda_md ? next.agenda_md.split("\n").filter((l) => /^\s*(\d+[.)]|[-*])\s+/.test(l)).length : 0;
  const openActions = lastActions.filter((a) => !a.done_at).length;

  return (
    <section className="panel flex flex-col gap-4" aria-labelledby="week-title" data-testid="this-week">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="week-title" className="panel-title">
          This week
        </h2>
        <span className="text-sm text-muted">Agenda ready the day before</span>
      </div>

      {next ? (
        <div className="flex flex-col gap-3 rounded-md bg-bg p-4 sm:flex-row sm:items-center">
          <div className="flex grow flex-col gap-1">
            <span className="font-bold" data-testid="next-session">
              {sessionLine(next.number, next.starts_at, next.duration_min)}
            </span>
            <span className="text-sm text-muted">
              {next.status === "reschedule_requested"
                ? `Reschedule requested. ${ctx.ownerName} will confirm a new time.`
                : next.call_url
                  ? "Video call link"
                  : "Call link to follow"}
              {agendaItems || openActions ? ` · ${agendaItems} agenda items · ${openActions} actions open` : ""}
            </span>
          </div>
          {next.call_url ? (
            <a href={next.call_url} target="_blank" rel="noopener noreferrer" className="btn self-start sm:self-auto">
              Join call
            </a>
          ) : null}
        </div>
      ) : (
        <p className="muted m-0">No session booked yet. {ctx.ownerName} will add the next one.</p>
      )}

      {next?.agenda_md ? (
        <div className="flex flex-col gap-1" data-testid="agenda">
          <span className="text-sm font-bold">Agenda</span>
          <Markdown>{next.agenda_md}</Markdown>
        </div>
      ) : next ? (
        <p className="muted m-0">The agenda appears here the day before.</p>
      ) : null}

      {last ? (
        <div className="flex flex-col gap-2 border-t border-line-soft pt-4">
          <span className="text-sm font-bold">Actions from last session</span>
          {last.summary_md ? (
            <details>
              <summary className="link-target cursor-pointer text-sm">Read the summary of session {last.number ?? ""}</summary>
              <Markdown>{last.summary_md}</Markdown>
            </details>
          ) : null}
          {lastActions.length ? (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-left text-muted">
                  <th className="py-1 pr-2 font-normal">Action</th>
                  <th className="py-1 pr-2 font-normal">Owner</th>
                  <th className="py-1 font-normal">Done</th>
                </tr>
              </thead>
              <tbody>
                {lastActions.map((a) => (
                  <tr key={a.id} className="border-t border-line-soft align-middle" data-testid="action-row">
                    <td className="py-1.5 pr-2">{a.text}</td>
                    <td className="py-1.5 pr-2">{nameFor(a.owner_role)}</td>
                    <td className="py-1.5">
                      {a.done_at ? (
                        "Done"
                      ) : a.owner_role === ctx.role ? (
                        <form action={tickAction}>
                          <input type="hidden" name="action_id" value={a.id} />
                          <button type="submit" className="btn-quiet px-3 text-xs">
                            Tick when done
                          </button>
                        </form>
                      ) : (
                        "Open"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted m-0">No actions from last session.</p>
          )}
        </div>
      ) : null}

      {next && next.status === "scheduled" ? <RescheduleRequest sessionId={next.id} ownerName={ctx.ownerName} /> : null}
    </section>
  );
}
