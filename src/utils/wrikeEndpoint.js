import { AsyncLocalStorage } from "async_hooks";
import { getCachedWrikeCredentials } from "./wrikeCredentials";

// Paths appended to a per-environment host. Same values the deployment-wide
// WRIKE_ENDPOINT / WRIKE_DATAHUB_ENDPOINT env vars carry for app-eu.
const API_PATH = "/api/v4";
const DATAHUB_PATH = "/app/wrike_v2_web/public/api/v1";

// Holds the name of the environment the current request is acting for, so
// src/utils/wrike.js can pick the right host without every caller passing it.
const environmentContext = new AsyncLocalStorage();

/**
 * Run `fn` with `environmentName` as the current environment. Everything
 * `fn` awaits sees it. Callable as `run(name, done)` from a Fastify hook.
 */
export const runWithWrikeEnvironment = (environmentName, fn) =>
  environmentContext.run(environmentName || null, fn);

export const currentWrikeEnvironment = () =>
  environmentContext.getStore() || null;

/**
 * Validate and normalise an admin-supplied host. Returns an origin such as
 * https://app-us.wrike.com, or null for blank input. The Wrike bearer token
 * is sent to this host, so anything that is not https on a wrike.com host is
 * refused.
 */
export const normalizeWrikeApiHost = (value) => {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw { statusCode: 400, message: "wrike_api_host is not a valid URL" };
  }

  const host = url.hostname.toLowerCase();
  const isWrikeHost = host === "wrike.com" || host.endsWith(".wrike.com");

  if (url.protocol !== "https:" || !isWrikeHost || url.port || url.username) {
    throw {
      statusCode: 400,
      message: "wrike_api_host must be an https URL on a wrike.com host",
    };
  }

  return url.origin;
};

/**
 * Wrike REST and Datahub base URLs for an environment (defaults to the
 * environment of the current request). Falls back to the env vars when the
 * environment has no host of its own.
 */
export const getWrikeEndpoints = (environmentName = currentWrikeEnvironment()) => {
  const host = environmentName
    ? getCachedWrikeCredentials(environmentName)?.wrikeApiHost
    : null;

  if (host) {
    return { api: `${host}${API_PATH}`, datahub: `${host}${DATAHUB_PATH}` };
  }

  return {
    api: process.env.WRIKE_ENDPOINT,
    datahub: process.env.WRIKE_DATAHUB_ENDPOINT,
  };
};
