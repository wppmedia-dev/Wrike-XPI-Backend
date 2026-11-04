import { McpTokens } from "../controllers";

const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000;

const sweep = async () => {
  try {
    const purged = await McpTokens.PurgeExpired();
    if (purged > 0) {
      console.log(
        new Date().toISOString(),
        `[mcp-tokens] purged ${purged} expired refresh token(s)`,
      );
    }
  } catch (err) {
    console.error(
      new Date().toISOString(),
      "[mcp-tokens] purge failed:",
      err?.message || err,
    );
  }
};

let started = false;

/** Drops expired MCP refresh tokens now and then. Idempotent; call once at boot. */
export const startMcpTokenSweep = () => {
  if (started) return;
  started = true;

  setTimeout(sweep, 60 * 1000);
  setInterval(sweep, SWEEP_INTERVAL_MS).unref();
};
