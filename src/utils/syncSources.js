import { syncSecrets } from "./azure_vault";
import { SyncRuns } from "../controllers";

/**
 * Everything the admin console can refresh by hand, in one registry.
 *
 * To add a source: append an entry here. Its `run()` resolves to
 * `{ requested, synced, names }` (names only, never values) and throws if it
 * could not run at all. The console and the routes key off
 * `key`, so nothing else needs to change.
 */

/** The Key Vault secrets loaded at startup (src/index.js) and on every sync. */
export const AZURE_SECRET_NAMES = [
  "XPI-API-ClientId",
  "XPI-API-ClientSecret",
  "XPI-API-Token",
];

export const SYNC_SOURCES = [
  {
    key: "azure_secrets",
    label: "Azure Key Vault secrets",
    icon: "fa-cloud",
    description:
      "Reloads the XPI API client id, client secret and token from Azure Key Vault into memory.",
    hint: "Use after rotating a secret in the vault, so the service picks it up without a restart.",
    run: async () => {
      const values = await syncSecrets(AZURE_SECRET_NAMES);
      return {
        requested: AZURE_SECRET_NAMES.length,
        synced: Object.keys(values).length,
        names: Object.keys(values),
      };
    },
  },
];

export const SYNC_SOURCE_KEYS = SYNC_SOURCES.map((s) => s.key);

export const getSyncSource = (key) => SYNC_SOURCES.find((s) => s.key === key);

/** What the console is allowed to see about a source (no `run`). */
export const describeSource = ({ key, label, icon, description, hint }) => ({
  key,
  label,
  icon,
  description,
  hint,
});

const statusFor = ({ requested, synced }) => {
  if (requested > 0 && synced === 0) return "failed";
  if (synced < requested) return "partial";
  return "success";
};

/**
 * Run one source and record who ran it, replacing its previous record. The run is recorded whether it works
 * or not; a failure is returned as a row with status "failed", not thrown, so
 * the caller always has something to show.
 */
export const runSyncSource = async (key, { admin, ip, userAgent } = {}) => {
  const source = getSyncSource(key);
  if (!source) {
    throw { statusCode: 404, message: `Unknown sync source: ${key}` };
  }

  const startedAt = Date.now();
  let outcome = {};
  try {
    const result = await source.run();
    outcome = {
      status: statusFor(result),
      items_requested: result.requested,
      items_synced: result.synced,
      detail: { names: result.names },
      error:
        result.synced < result.requested
          ? `${result.requested - result.synced} of ${result.requested} item(s) could not be loaded. Check the server log.`
          : null,
    };
  } catch (err) {
    outcome = { status: "failed", error: String(err?.message || err) };
  }

  return SyncRuns.Save({
    source: key,
    created_at: new Date().toISOString(),
    triggered_by: admin?.username || null,
    ip: ip || null,
    user_agent: userAgent ? String(userAgent).slice(0, 512) : null,
    duration_ms: Date.now() - startedAt,
    ...outcome,
  });
};
