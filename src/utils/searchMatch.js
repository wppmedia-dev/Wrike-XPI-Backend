/**
 * How a search box decides that a row matches, in one place.
 *
 * There are two different questions here and deliberately not one:
 *
 *   - An IDENTIFIER (a token id, an environment id) is either the one that was
 *     asked for or it is not. Matching a uuid by substring is how a search for
 *     "1" returns the whole table, and how a uuid pasted out of a support
 *     ticket comes back with rows that merely share a fragment of it. So an
 *     identifier compares WHOLE. Case-insensitively, because a uuid is written
 *     in either case depending on who copied it, and trimmed, because a value
 *     pasted out of a ticket usually arrives with a space on the end.
 *
 *   - TEXT (a name, an email, a client name) is matched by substring, because
 *     nobody types an environment name in full to find it, and a search box
 *     that demanded the whole value would be a worse filter than the eye.
 *
 * Both live here so that the two callers (src/utils/tokenFilters.js for the
 * token list, src/utils/environmentFilters.js for the environments list)
 * cannot drift into two spellings of the same word. Pure, so the rule can be
 * read and tested without a database.
 */

/** Trimmed and lower-cased: what a pasted value looks like on both sides of
    the comparison. Anything absent is the empty string rather than the text
    "null", so a missing field can never match a search for "null". */
const normalise = (value) =>
  value === null || value === undefined
    ? ""
    : String(value).trim().toLowerCase();

/** True when any of these values IS the term. A blank term matches
    everything, which is what "no search" has to mean at every call site. */
export const matchesIdentifier = (term, ...values) => {
  const needle = normalise(term);
  if (!needle) return true;

  return values.some((value) => normalise(value) === needle);
};

/** True when any of these fields CONTAINS the term. Blank matches everything,
    for the same reason. */
export const matchesText = (term, ...fields) => {
  const needle = normalise(term);
  if (!needle) return true;

  return fields.some((field) => normalise(field).includes(needle));
};
