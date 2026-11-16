/**
 * The only Fibery writes this app makes:
 *   1. append one dated line to the Club de Vela wiki page set in config
 *   2. create one Helm/Horizons card on the configured Voyage, owned by Matt
 * Nothing else. The token is read from the environment on the server and never
 * appears in an error, a log line or a stored row.
 */

export type HorizonInput = { name: string; descriptionMd: string; source: string };
export type HorizonRef = { id: string; publicId: string | null; url: string | null };

export interface FiberyWriter {
  appendWikiLine(line: string): Promise<void>;
  createHorizon(input: HorizonInput): Promise<HorizonRef>;
}

export type FiberyConfig = {
  token: string;
  workspace: string; // e.g. "coleborne-co"
  baseUrl?: string; // override for tests, defaults to https://<workspace>.fibery.io
  wikiPageId: string;
  voyageId: string;
  ownerUserId: string;
  workstreamId?: string;
};

export function fiberyConfigFromEnv(env: NodeJS.ProcessEnv = process.env): FiberyConfig | null {
  const token = env.FIBERY_TOKEN;
  const workspace = env.FIBERY_WORKSPACE;
  const wikiPageId = env.FIBERY_WIKI_PAGE_ID;
  const voyageId = env.FIBERY_VOYAGE_ID;
  const ownerUserId = env.FIBERY_OWNER_USER_ID;
  if (!token || !workspace || !wikiPageId || !voyageId || !ownerUserId) return null;
  return {
    token,
    workspace,
    baseUrl: env.FIBERY_BASE_URL || undefined,
    wikiPageId,
    voyageId,
    ownerUserId,
    workstreamId: env.FIBERY_WORKSTREAM_ID || undefined,
  };
}

/** Names of the settings that are missing, for a not-configured response. Never values. */
export function missingFiberyConfig(env: NodeJS.ProcessEnv = process.env): string[] {
  return ["FIBERY_TOKEN", "FIBERY_WORKSPACE", "FIBERY_WIKI_PAGE_ID", "FIBERY_VOYAGE_ID", "FIBERY_OWNER_USER_ID"].filter(
    (k) => !env[k],
  );
}

export class FiberyError extends Error {
  constructor(step: string, status: number) {
    super(`Fibery ${step} failed with HTTP ${status}`);
  }
}

export function createFiberyWriter(cfg: FiberyConfig, fetchImpl: typeof fetch = fetch): FiberyWriter {
  const base = (cfg.baseUrl ?? `https://${cfg.workspace}.fibery.io`).replace(/\/$/, "");
  const headers = { Authorization: `Token ${cfg.token}`, "Content-Type": "application/json" };

  async function commands<T = unknown>(step: string, body: unknown[]): Promise<T[]> {
    const res = await fetchImpl(`${base}/api/commands`, { method: "POST", headers, body: JSON.stringify(body) });
    if (!res.ok) throw new FiberyError(step, res.status);
    const json = (await res.json()) as { success: boolean; result: T }[];
    if (!Array.isArray(json) || json.some((r) => !r.success)) throw new FiberyError(step, 200);
    return json.map((r) => r.result);
  }

  async function documentSecret(type: string, field: string, id: string): Promise<string> {
    const [rows] = await commands<{ secret: string }[]>(`${type} document lookup`, [
      {
        command: "fibery.entity/query",
        args: {
          query: {
            "q/from": type,
            "q/select": { secret: [field, "Collaboration~Documents/secret"] },
            "q/where": ["=", ["fibery/id"], "$id"],
            "q/limit": 1,
          },
          params: { $id: id },
        },
      },
    ]);
    const secret = rows?.[0]?.secret;
    if (!secret) throw new FiberyError(`${type} document lookup`, 404);
    return secret;
  }

  async function readDoc(secret: string): Promise<string> {
    const res = await fetchImpl(`${base}/api/documents/${secret}?format=md`, { headers });
    if (!res.ok) throw new FiberyError("document read", res.status);
    const json = (await res.json()) as { content?: string };
    return json.content ?? "";
  }

  async function writeDoc(secret: string, content: string): Promise<void> {
    const res = await fetchImpl(`${base}/api/documents/${secret}?format=md`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ content }),
    });
    if (!res.ok) throw new FiberyError("document write", res.status);
  }

  return {
    async appendWikiLine(line) {
      const secret = await documentSecret("Club de Vela/Wiki Page", "Club de Vela/Description", cfg.wikiPageId);
      const current = await readDoc(secret);
      const sep = current.trim() === "" ? "" : current.endsWith("\n") ? "\n" : "\n\n";
      await writeDoc(secret, `${current}${sep}${line}\n`);
    },

    async createHorizon(input) {
      const id = crypto.randomUUID();
      const entity: Record<string, unknown> = {
        "fibery/id": id,
        "Helm/Name": input.name,
        "Helm/Voyage": { "fibery/id": cfg.voyageId },
        "Helm/Source": input.source,
      };
      if (cfg.workstreamId) entity["Helm/Workstream"] = { "fibery/id": cfg.workstreamId };
      await commands("horizon create", [{ command: "fibery.entity/create", args: { type: "Helm/Horizons", entity } }]);
      await commands("horizon owner", [
        {
          command: "fibery.entity/add-collection-items",
          args: {
            type: "Helm/Horizons",
            field: "Helm/Owner",
            entity: { "fibery/id": id },
            items: [{ "fibery/id": cfg.ownerUserId }],
          },
        },
      ]);
      const secret = await documentSecret("Helm/Horizons", "Helm/Description", id);
      await writeDoc(secret, input.descriptionMd);
      const [rows] = await commands<{ publicId: string }[]>("horizon read", [
        {
          command: "fibery.entity/query",
          args: {
            query: {
              "q/from": "Helm/Horizons",
              "q/select": { publicId: "fibery/public-id" },
              "q/where": ["=", ["fibery/id"], "$id"],
              "q/limit": 1,
            },
            params: { $id: id },
          },
        },
      ]);
      const publicId = rows?.[0]?.publicId ?? null;
      return { id, publicId, url: publicId ? `https://${cfg.workspace}.fibery.io/Helm/Horizons/${publicId}` : null };
    },
  };
}
