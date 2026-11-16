import { NextResponse, type NextRequest } from "next/server";
import { handleClaudeApi, tokenMatches } from "@/lib/claude-api";
import { createAdminClient, hasAdminKey } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  if (!tokenMatches(req.headers.get("authorization"), process.env.CLAUDE_SERVICE_TOKEN)) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }
  if (!hasAdminKey()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const { path } = await ctx.params;
  let body: unknown = null;
  if (req.method === "POST" || req.method === "PATCH") {
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
    }
  }
  try {
    const res = await handleClaudeApi(createAdminClient(), req.method, path, body, req.nextUrl.searchParams);
    return NextResponse.json(res.body, { status: res.status });
  } catch {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export { handle as GET, handle as POST, handle as PATCH };
