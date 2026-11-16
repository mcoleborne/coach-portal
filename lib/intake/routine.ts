/**
 * Fires the AG-095 intake routine (a claude.ai scheduled task) by its API
 * trigger, so Claude does the judgement work straight away: transcription,
 * Ledger rows, summaries. Configured by AG095_FIRE_URL and AG095_FIRE_TOKEN.
 * When either is missing, AG-095 runs on its hourly schedule instead and picks
 * up events with judged_at null.
 */

export const ROUTINE_DEBOUNCE_MS = 2 * 60 * 1000; // stays within 30 fires an hour

export type RoutineConfig = { url: string; token: string };

export function routineConfigFromEnv(env: NodeJS.ProcessEnv = process.env): RoutineConfig | null {
  const url = env.AG095_FIRE_URL;
  const token = env.AG095_FIRE_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

export interface RoutineFirer {
  fire(text: string): Promise<void>;
}

export class RoutineError extends Error {
  constructor(status: number) {
    super(`AG-095 routine fire failed with HTTP ${status}`);
  }
}

export function createRoutineFirer(cfg: RoutineConfig, fetchImpl: typeof fetch = fetch): RoutineFirer {
  return {
    async fire(text) {
      const res = await fetchImpl(cfg.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfg.token}`,
          "anthropic-beta": "experimental-cc-routine-2026-04-01",
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new RoutineError(res.status);
    },
  };
}
