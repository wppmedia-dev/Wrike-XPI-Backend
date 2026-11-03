import { adminFetch } from "./authApi";

/* ── Manual syncs ─────────────────────────────────────────────────────────
   Mirrors /api/v1/admin/sync (src/routes/admin/sync/index.js). The list of
   sources comes from the server, so a new source shows up here with no
   frontend change. */

export type SyncStatus = "success" | "partial" | "failed";

export interface SyncRun {
  source: string;
  status: SyncStatus;
  triggered_by: string | null;
  ip: string | null;
  user_agent: string | null;
  duration_ms: number | null;
  items_requested: number | null;
  items_synced: number | null;
  /** Names of what was synced, never values. */
  detail: { names?: string[] } | null;
  error: string | null;
  created_at: string;
}

export interface SyncSource {
  key: string;
  label: string;
  /** FontAwesome icon name, e.g. "fa-cloud". */
  icon: string;
  description: string;
  hint: string;
  last_run: SyncRun | null;
}

async function parseJson(res: Response): Promise<any> {
  return res.json().catch(() => null);
}

export const listSyncSources = async (): Promise<SyncSource[]> => {
  const res = await adminFetch("/api/v1/admin/sync");
  const json = await parseJson(res);
  if (!res.ok || !json?.success) {
    throw new Error(json?.message || "Failed to load sync sources");
  }
  return json.data?.sources || [];
};

/** Resolves with the recorded run, including when the sync itself failed. */
export const runSync = async (source: string): Promise<SyncRun> => {
  const res = await adminFetch(`/api/v1/admin/sync/${encodeURIComponent(source)}/run`, {
    method: "POST",
  });
  const json = await parseJson(res);
  const run: SyncRun | undefined = json?.data?.run;
  if (run) return run;
  throw new Error(json?.message || "Sync could not be started");
};
