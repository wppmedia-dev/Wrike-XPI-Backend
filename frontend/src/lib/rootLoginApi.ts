export interface RootLoginInit {
  environments: string[];
  selectedEnvironment: string;
}

const DEFAULT_INIT: RootLoginInit = { environments: [], selectedEnvironment: "" };

/**
 * GET /environments — the environment list + which one is pre-selected,
 * fetched client-side instead of being server-injected into the HTML.
 * Forwards the same query params findRedirectionURL already reads
 * (environmentId/environment) so a deep link still pre-selects correctly.
 */
export const fetchEnvironments = async (): Promise<RootLoginInit> => {
  try {
    const res = await fetch(`/environments${window.location.search}`);
    const data = await res.json().catch(() => null);
    if (!data?.success) return DEFAULT_INIT;
    return {
      environments: Array.isArray(data.environments) ? data.environments : [],
      selectedEnvironment: data.selectedEnvironment || "",
    };
  } catch {
    return DEFAULT_INIT;
  }
};

/**
 * GET /get-redirect-url — same endpoint the original inline script already
 * calls whenever the environment dropdown changes.
 *
 * `purpose` is what the signed state carries to the callback so the mint knows
 * which of the two sign-ins this is (src/utils/tokenPurpose.js). It is part of
 * the request rather than the URL the person clicks for exactly that reason:
 * the server signs it, so the choice cannot be changed by editing the address
 * bar on the way back.
 */
export const fetchRedirectUrl = async (params: {
  environment?: string;
  redirectUri?: string;
  accountId?: string;
  purpose?: string;
}): Promise<string | null> => {
  const query = new URLSearchParams();
  if (params.environment) query.append("environment", params.environment);
  if (params.redirectUri) query.append("redirectUri", params.redirectUri);
  if (params.accountId) query.append("accountId", params.accountId);
  if (params.purpose) query.append("purpose", params.purpose);

  try {
    const res = await fetch(`/get-redirect-url?${query.toString()}`);
    const data = await res.json();
    return data.success && data.redirectUrl ? data.redirectUrl : null;
  } catch {
    return null;
  }
};
