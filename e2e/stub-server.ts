import http from "node:http";

export type Recorded = { method: string; url: string; auth: string | null; headers: http.IncomingHttpHeaders; body: string };

/**
 * A stand-in for Fibery and for the routine fire endpoint, so the end-to-end
 * test runs the real path (database trigger, pg_net, filing route) without
 * touching a real workspace.
 */
export function startStub(port: number) {
  const calls: Recorded[] = [];
  const docs: Record<string, string> = { "wiki-secret": "Existing wiki page." };
  let publicId = 7000;
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      calls.push({ method: req.method ?? "", url: req.url ?? "", auth: req.headers.authorization ?? null, headers: req.headers, body });
      const send = (status: number, json: unknown) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(json));
      };
      if (req.url === "/fire") return send(200, { type: "routine_fire", claude_code_session_id: "stub" });
      if (req.url === "/api/commands") {
        const cmds = JSON.parse(body) as { command: string; args: { query?: { "q/from": string; "q/select": Record<string, unknown> } } }[];
        const out = cmds.map((c) => {
          if (c.command !== "fibery.entity/query") return { success: true, result: {} };
          const sel = c.args.query!["q/select"];
          if ("publicId" in sel) return { success: true, result: [{ publicId: String(++publicId) }] };
          const secret = c.args.query!["q/from"] === "Club de Vela/Wiki Page" ? "wiki-secret" : `h-${publicId + 1}`;
          return { success: true, result: [{ secret }] };
        });
        return send(200, out);
      }
      const m = /^\/api\/documents\/([^?]+)/.exec(req.url ?? "");
      if (m) {
        if (req.method === "PUT") {
          docs[m[1]] = (JSON.parse(body) as { content: string }).content;
          return send(200, {});
        }
        return send(200, { secret: m[1], content: docs[m[1]] ?? "" });
      }
      send(404, { error: "not found" });
    });
  });
  return {
    calls,
    docs,
    listen: () => new Promise<void>((r) => server.listen(port, "0.0.0.0", () => r())),
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}
