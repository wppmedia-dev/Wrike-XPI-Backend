import { matchesIdentifier, matchesText } from "./searchMatch";

/**
 * The environments list's search, as the server applies it.
 *
 * The Environments page used to search in the browser, over the rows it had
 * already downloaded, which meant the environment id — the one value an admin
 * arrives with, pasted out of a ticket or off a token row — was not in any
 * column's accessor and so could not be found at all. The search is now a
 * query parameter and the filtering happens here, so it covers the whole table
 * rather than the page the browser happens to hold.
 *
 * The id compares whole (src/utils/searchMatch.js): a search for an
 * environment id either names that environment or matches nothing. The name
 * and the two Wrike values stay substring matches, because those are things
 * people half-remember rather than paste. `client_id` is matched on the
 * DECRYPTED value, which is why this runs in the route handler and not in SQL:
 * the column is ciphertext at rest.
 *
 * Pure: the route parses, the handler maps and decrypts, this file decides.
 */

/** The value the search box compares whole. */
const SEARCH_IDENTIFIERS = (env) => [env.id];

/** The fields it matches by substring. */
const SEARCH_TEXT = (env) => [
  env.environment_name,
  env.client_id,
  env.account_id,
];

export const matchesEnvironmentSearch = (env, search) =>
  matchesIdentifier(search, ...SEARCH_IDENTIFIERS(env)) ||
  matchesText(search, ...SEARCH_TEXT(env));

/** The rows that match. No search (or a blank one) keeps every row, so an
    untouched search box can never hide an environment. */
export const applyEnvironmentFilters = (rows, { search } = {}) =>
  rows.filter((row) => matchesEnvironmentSearch(row, search));
