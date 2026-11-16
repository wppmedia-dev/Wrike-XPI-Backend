import { getPortalToken, portalFetch } from "./portalAuthApi";
import type { SyncApi, SyncRun, SyncSource } from "./syncApi";

/* ── Sync, portal side ────────────────────────────────────────────────────
   Mirrors /api/v1/portal/sync (src/routes/portal/sync): the admin console's
   Sync API with a portal sign-in. The token is read when a call is made, not
   captured, so a re-login is picked up. */

const BASE = "/api/v1/portal/sync";

async function parseJson(res: Response): Promise<any> {
  return res.json().catch(() => null);
}

export const portalSyncApi: SyncApi = {
  list: async (): Promise<SyncSource[]> => {
    const res = await portalFetch(BASE, getPortalToken() || "");
    const json = await parseJson(res);
    if (!res.ok || !json?.success) {
      throw new Error(json?.message || "Failed to load sync sources");
    }
    return json.data?.sources || [];
  },

  /** Resolves with the recorded run, including when the sync itself failed. */
  run: async (source: string): Promise<SyncRun> => {
    const res = await portalFetch(
      `${BASE}/${encodeURIComponent(source)}/run`,
      getPortalToken() || "",
      { method: "POST" },
    );
    const json = await parseJson(res);
    const run: SyncRun | undefined = json?.data?.run;
    if (run) return run;
    throw new Error(json?.message || "Sync could not be started");
  },
};
