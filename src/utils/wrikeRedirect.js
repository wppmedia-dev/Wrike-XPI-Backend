import { getCachedWrikeCredentials } from "./wrikeCredentials";
import { TOKEN_PURPOSE, normalisePurpose } from "./tokenPurpose";

/**
 * Where a sign-in may hand the person back to once it has finished, by name.
 *
 * Callers name a destination instead of supplying a URL, so the address the
 * callback redirects to can only ever be one of these paths. The name travels
 * inside the SIGNED state, and the callback looks the path up here rather than
 * trusting anything from the query string, which is what keeps "come back to
 * the page that sent you" from becoming an open redirect.
 *
 * Only the Calendar Sync flow uses this today: the documentation asks the
 * person to sign in and then shows them the address that sign-in produced, so
 * it needs them returned to the page they started from rather than dropped on
 * the generic token screen.
 */
export const RETURN_TARGETS = {
  "calendar-docs": "/docs/calendar#/calendar/setup",
};

/** Look up a named return target, or null for anything unrecognised. */
export const resolveReturnTarget = (name) =>
  RETURN_TARGETS[String(name ?? "")] || null;

export const findRedirectionURL = (
  {
    accountId,
    redirectUri,
    environment,
    environmentId,
    environment_id,
    extra,
    purpose,
    returnTo,
  },
  fastify,
) => {
  try {
    const { WRIKE_LOGIN_ENDPOINT, WRIKE_REDIRECT_URL } = process.env;

    if (!WRIKE_LOGIN_ENDPOINT) {
      throw new Error(
        "Missing WRIKE_LOGIN_ENDPOINT! Please contact your admin",
      );
    }

    // Get credentials from cached DB values (API type)
    const allCreds = getCachedWrikeCredentials();

    // Resolve environment: prioritize environmentId parameter, then environment
    // parameter. environment_id is accepted as an alias for environmentId —
    // links generated elsewhere in this app use both conventions (e.g.
    // src/routes/oauth/wellKnown.js builds `environment_id`, while
    // src/routes/tokens/index.js builds `environmentId`), so either must
    // auto-select correctly here.
    environmentId = environmentId || environment_id;
    let selectedEnvironment = "";
    if (environmentId) {
      // Find environment by ID
      for (const [envName, envData] of Object.entries(allCreds || {})) {
        if (envData?.id == environmentId) {
          selectedEnvironment = envName;
          break;
        }
      }
    } else if (environment) {
      selectedEnvironment = environment;
    }

    // getCachedWrikeCredentials() is ordered most-recently-created-first
    // (see WrikeCredentials.GetAll's `order: [["created_at", "DESC"]]`), so
    // the first key here is the most recently added environment — used both
    // to resolve the credential AND (below) reported back as
    // `selectedEnvironment` when the caller didn't request a specific one,
    // so a dropdown built from this can show the right thing pre-selected.
    const defaultEnvKey = Object.keys(allCreds)[0];
    if (!selectedEnvironment) selectedEnvironment = defaultEnvKey || "";

    const selectedCred = selectedEnvironment
      ? allCreds?.[selectedEnvironment]
      : allCreds[defaultEnvKey];
    const WRIKE_CLIENT_ID = selectedCred?.clientId;

    if (!WRIKE_CLIENT_ID) {
      throw Object.assign(
        new Error("Missing WRIKE_CLIENT_ID. Please contact your admin"),
        { statusCode: 400 },
      );
    }

    let state = "";

    // Which kind of token the sign-in is for. It rides in the SIGNED state
    // rather than in the redirect URL, so it is the callback that decides what
    // gets minted and a caller cannot arrive at that decision by editing the
    // address bar. Only the one recognised value is written: a normal sign-in
    // carries nothing, which is also what the MCP OAuth flow (which builds its
    // own state) leaves behind, and matching that keeps one meaning for
    // "absent" rather than two.
    const purposeClaim =
      normalisePurpose(purpose) === TOKEN_PURPOSE.CALENDAR_SYNC
        ? { purpose: TOKEN_PURPOSE.CALENDAR_SYNC }
        : {};

    // Where to hand the person back to when this is done. Only a Calendar Sync
    // sign-in may carry it: the flag exists for the documentation page, and a
    // plain sign-in asking for it would come back holding a 180-day token.
    // Unrecognised names are dropped rather than signed, so the callback only
    // ever sees one of the paths listed above.
    const returnTarget = resolveReturnTarget(returnTo);
    const returnClaim =
      purposeClaim.purpose && returnTarget ? { returnTo: returnTo } : {};

    if (redirectUri) {
      state = fastify.jwt.sign({
        redirectUri,
        environmentId: selectedCred ? selectedCred?.id : "",
        ...(extra || {}),
        ...purposeClaim,
        ...returnClaim,
      });
    } else {
      state = fastify.jwt.sign({
        environmentId: selectedCred ? selectedCred?.id : "",
        ...(extra || {}),
        ...purposeClaim,
        ...returnClaim,
      });
    }

    let redirectUrl = `${WRIKE_LOGIN_ENDPOINT}/authorize/v4?client_id=${WRIKE_CLIENT_ID}&response_type=code&state=${state}&redirect_uri=${WRIKE_REDIRECT_URL}`;

    const accountIdToUse = selectedCred?.accountId || accountId;
    if (accountIdToUse) redirectUrl += `&accountId=${accountIdToUse}`;

    return { redirectUrl, selectedEnvironment };
  } catch (err) {
    throw err;
  }
};

export default findRedirectionURL;
