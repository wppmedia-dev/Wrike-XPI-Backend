import { WrikeCredentials } from "../controllers";

/**
 * The environments a portal user may act on.
 *
 * An admin-role portal user sees every environment; everyone else sees only
 * the ones mapped to them (portal_user_environments, read through
 * WrikeCredentials.GetByOwnerId).
 *
 * This lives outside the environments route because more than one feature now
 * depends on the same rule. A token list that disagreed with the environment
 * list about which environments a user can see would not be a cosmetic bug:
 * the API Tokens page would be showing that user credentials and account ids
 * for environments they were never given. One function, both callers.
 */
export const scopedEnvironmentsFor = async (portalUser) => {
  if (portalUser?.role === "admin") {
    return (await WrikeCredentials.GetAllForPortal()) || [];
  }

  return (await WrikeCredentials.GetByOwnerId(portalUser?.id)) || [];
};

/** The same scope, as ids, for queries that filter by environment. */
export const scopedEnvironmentIdsFor = async (portalUser) =>
  (await scopedEnvironmentsFor(portalUser)).map((env) => env.id);

/**
 * Whether a token is inside a user's scope. An absent or unknown environment
 * is never in scope: a token whose env_id is null predates the column being
 * set, and there is no environment to check it against.
 */
export const isEnvironmentInScope = (envIds, envId) =>
  !!envId && envIds.includes(envId);
