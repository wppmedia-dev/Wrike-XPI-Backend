/**
 * The token list's filters, as the server applies them.
 *
 * The console used to filter the rows it had already downloaded, which is fine
 * only for as long as the whole table fits in one response. It does not: the
 * list is now filtered here, so the client receives the rows that match and
 * nothing else, and a filter keeps working when the response is a page rather
 * than the table. `search` rides the same query for the same reason — a search
 * box that filters what happens to be loaded would silently miss the rest.
 *
 * Pure, like src/utils/tokenPermissionMap.js and for the same reason: the
 * meaning of "expiring soon" or "restricted" is a decision, and a decision
 * should be readable and testable without a database. The routes parse, the
 * controller filters, this file decides.
 *
 * Two of these predicates have a twin in the console, because the badge a row
 * shows and the filter that selects it have to agree: `accessStateOf` mirrors
 * frontend/src/lib/tokenDisplay.ts, and EXPIRY_WARNING_DAYS mirrors the same
 * file. A change to one without the other turns into a filter that hides rows
 * whose badge matches what was asked for.
 */

/**
 * The nil UUID means "tokens with no environment", the way it means "matches
 * nothing" in the activity log's token filter. A real environment id is a v4
 * UUID, so the two can never be confused, and it keeps `env_id` a plain uuid
 * in the schema instead of inventing a second way to say it.
 */
export const NO_ENVIRONMENT = "00000000-0000-0000-0000-000000000000";

/** Days before expiry at which a token is worth flagging. Mirrors
    EXPIRY_WARNING_DAYS in frontend/src/lib/tokenDisplay.ts. */
export const EXPIRY_WARNING_DAYS = 14;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** The relative windows the "Last updated" filter offers. */
const UPDATED_RANGES = {
  "24h": MS_PER_DAY,
  "7d": 7 * MS_PER_DAY,
  "30d": 30 * MS_PER_DAY,
};

const text = (value) => (typeof value === "string" ? value.trim() : "");

/** The filter fields, in one list so the two entry points below cannot drift. */
const FILTER_FIELDS = [
  "envId",
  "tokenId",
  "client",
  "accountId",
  "creator",
  "access",
  "validity",
  "updated",
  "status",
  "search",
];

/**
 * Every field present, each one a trimmed string.
 *
 * This is what makes a partial object safe: `matchesTokenFilters(row, { status:
 * "active" })` is a reasonable thing to write, and it used to throw on the
 * first missing key. A missing field and a blank one also have to mean the same
 * thing here, because an absent control and a cleared control are the same
 * request from the console's point of view.
 */
const normalise = (filters = {}) =>
  Object.fromEntries(FILTER_FIELDS.map((key) => [key, text(filters[key])]));

/**
 * Query parameters → filter values, one name per filter.
 *
 * Kept in one place so a route cannot read `req.query.env_id` and mean
 * something subtly different from the portal route reading the same key, and
 * so the parameter names are documented next to the keys they fill.
 */
export const parseTokenFilters = (query = {}) =>
  normalise({
    envId: query.env_id,
    tokenId: query.token_id,
    client: query.client,
    accountId: query.account_id,
    creator: query.creator,
    access: query.access,
    validity: query.validity,
    updated: query.updated,
    status: query.status,
    search: query.search,
  });

/** Case-insensitive substring over any of the given fields. Normalised input
    means the needle is always a string and blank always means "no filter", so
    an absent control never hides a row. */
const matchesText = (needle, ...fields) => {
  const term = needle.toLowerCase();
  if (!term) return true;
  return fields.some((field) => (field || "").toLowerCase().includes(term));
};

/**
 * The three states the Access badge can be in, from the summary the list
 * already carries (src/utils/tokenPermissionSummary.js). Mirrors
 * accessStateOf in frontend/src/lib/tokenDisplay.ts.
 */
const accessStateOf = (permissions) => {
  const granted = permissions?.granted ?? 0;
  const total = permissions?.total ?? 0;
  if (granted === total) return "unrestricted";
  if (granted === 0) return "none";
  return "restricted";
};

const matchesValidity = (expiresAt, kind) => {
  const days = expiresAt
    ? (new Date(expiresAt).getTime() - Date.now()) / MS_PER_DAY
    : null;

  if (kind === "unknown") return days === null;
  if (days === null) return false;
  if (kind === "expired") return days < 0;
  if (kind === "soon") return days >= 0 && days <= EXPIRY_WARNING_DAYS;
  if (kind === "valid") return days > EXPIRY_WARNING_DAYS;
  return true;
};

const matchesUpdated = (token, kind) => {
  if (kind === "never") return !token.updated_at;

  // Falls back to creation time: a token that has never been used still has an
  // age, and "last updated" is the only recency signal this list has.
  const stamp = token.updated_at || token.created_at;
  if (!stamp) return false;

  const window = UPDATED_RANGES[kind];
  if (!window) return true;

  return Date.now() - new Date(stamp).getTime() <= window;
};

/**
 * The fields the search box covers.
 *
 * A superset of the table's searchable columns (frontend/src/components/
 * TokensTable.tsx), because the search is over the row rather than over what a
 * narrow window happened to render: username is not a column any more and is
 * still the value a caller authenticates with, so "find the token with this
 * username" has to work.
 */
const SEARCHABLE = (token) => [
  token.id,
  token.username,
  token.account_id,
  token.env_id,
  token.environment_name,
  token.client_name,
  token.creator_email,
  token.creator_name,
];

/**
 * Is this row in the filtered set?
 *
 * Every filter is optional and an empty one matches everything, so the caller
 * never has to build the set of "which filters were sent this time" — a partial
 * object is normalised here rather than tripping over its missing keys.
 */
export const matchesTokenFilters = (token, filters = {}) => {
  const f = normalise(filters);

  if (f.envId) {
    // Exact match, including the "no environment" case. This is a picker, so
    // there is no typing to be lenient about.
    if (f.envId === NO_ENVIRONMENT) {
      if (token.env_id) return false;
    } else if (token.env_id !== f.envId) {
      return false;
    }
  }

  if (!matchesText(f.tokenId, token.id)) return false;
  if (!matchesText(f.client, token.client_name)) return false;
  if (!matchesText(f.accountId, token.account_id)) return false;
  if (!matchesText(f.creator, token.creator_email, token.creator_name))
    return false;

  if (f.access && accessStateOf(token.permissions) !== f.access) {
    return false;
  }

  if (f.validity && !matchesValidity(token.token_expires_at, f.validity)) {
    return false;
  }

  if (f.updated && !matchesUpdated(token, f.updated)) return false;

  if (f.status === "active" && !token.is_active) return false;
  if (f.status === "inactive" && token.is_active) return false;

  if (f.search && !matchesText(f.search, ...SEARCHABLE(token))) {
    return false;
  }

  return true;
};

/** The rows that match, in the order they arrived (the caller's ordering is
    deliberate: newest first, from the database). */
export const applyTokenFilters = (rows, filters = {}) =>
  rows.filter((row) => matchesTokenFilters(row, filters));

/**
 * The environment picker's options, taken from the rows rather than from the
 * environments table: an environment holding no tokens in this scope could
 * only ever produce an empty list, so offering it would be a filter that lies.
 *
 * Built from the UNFILTERED rows on purpose. Deriving it from the filtered set
 * would make the picker lose every environment the current filter excludes,
 * which is exactly the moment somebody wants to switch to one of them.
 */
export const environmentChoices = (rows) => {
  const byId = new Map();

  for (const row of rows) {
    if (!row.env_id || byId.has(row.env_id)) continue;
    byId.set(row.env_id, row.environment_name || row.env_id);
  }

  return [...byId.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
};

/** Tokens with no environment at all exist, so the picker has to be able to
    say so. Reported separately rather than as a fake row in `environments`. */
export const hasUnassignedTokens = (rows) => rows.some((row) => !row.env_id);
