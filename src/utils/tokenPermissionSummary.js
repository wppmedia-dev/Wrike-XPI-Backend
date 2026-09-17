import { MODULES } from "./tokenPermissionCatalog";

/**
 * The summary a token list shows next to a token, instead of making the
 * frontend count the catalogue itself: how many of the available grants a
 * token holds, and whether anyone has ever restricted it.
 *
 * Shared by the admin console's API Tokens list and the portal's, because they
 * answer the same question and their Access badges have to mean one thing. Two
 * copies of this arithmetic would eventually disagree, and the disagreement
 * would look like a permissions bug.
 */

/** Every module × action a token can be granted, e.g. 22 today. */
export const TOTAL_GRANTS = MODULES.reduce(
  (total, mod) => total + mod.actions.length,
  0,
);

export const summarisePermissions = (entry) => {
  if (!entry?.configured) {
    // Unrestricted is not "0 granted". A token nobody has restricted can do
    // all of it, and a list has to say so, otherwise a freshly issued token
    // reads as powerless, which is the opposite of the truth.
    return { configured: false, granted: TOTAL_GRANTS, total: TOTAL_GRANTS };
  }

  let granted = 0;
  for (const mod of MODULES) {
    for (const action of mod.actions) {
      if (entry.matrix?.[mod.key]?.[action]) granted += 1;
    }
  }

  return { configured: true, granted, total: TOTAL_GRANTS };
};
