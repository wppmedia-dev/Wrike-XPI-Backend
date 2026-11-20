import { RedirectRules } from "../controllers";
import { RULES_TTL, cached, redirectRulesKey } from "./environmentAccessCache";
import { redirectAllowed } from "./redirectMatch";

/**
 * The request-path check for a sign-in's `redirectUri`.
 *
 * The address a sign-in returns to used to be whatever the query string said,
 * and the token callback appended the OAuth authorization code to it. Anyone
 * who could get a person to open a link could therefore send the code to a
 * server of their own. Now a redirectUri is only honoured when it matches an
 * ENABLED entry on that environment's list (managed in the admin console and,
 * with the Redirect URLs grant, the portal).
 *
 * Fail closed: an environment with no entries refuses every redirectUri, and a
 * failure to read the list refuses too rather than waving the request through.
 *
 * Cached like the API allow list (L1 in-process, L2 Redis, then Postgres), and
 * dropped by the controller on every write, so an entry removed in the console
 * stops working on the next request.
 */

const loadRules = async (envId) => {
  const rules = await RedirectRules.GetRulesByEnv(envId);
  return rules.filter((r) => r.is_enabled).map((r) => r.value);
};

/** The environment's enabled entries, as strings. */
export const getRedirectRules = (envId) =>
  cached(redirectRulesKey(envId), RULES_TTL, () => loadRules(envId));

/** A 400 that says only that the address was refused, never why or what is listed. */
export const redirectNotAllowed = () =>
  Object.assign(
    new Error("The redirectUri is not allowed for this environment."),
    { statusCode: 400 },
  );

/**
 * @param {string} envId     the environment the sign-in is for
 * @param {string} redirectUri the address the caller asked to be returned to
 * @returns {Promise<boolean>}
 */
export const isRedirectUriAllowed = async (envId, redirectUri) => {
  if (!envId || !redirectUri) return false;

  try {
    return redirectAllowed(await getRedirectRules(envId), redirectUri);
  } catch (err) {
    console.error(new Date().toISOString(), "[redirect-allowlist]", err);
    return false;
  }
};

/** Throws a 400 unless the redirectUri is on the environment's list. */
export const assertRedirectUriAllowed = async (envId, redirectUri) => {
  if (!(await isRedirectUriAllowed(envId, redirectUri))) {
    throw redirectNotAllowed();
  }
};
