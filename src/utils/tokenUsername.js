/**
 * How a token's Basic-auth username is built.
 *
 * Kept here, away from the mint, because the format answers to a database
 * constraint rather than to taste: user_tokens_username_unique_active_idx makes
 * usernames unique among active rows, so any two tokens that could be active at
 * once have to name themselves differently.
 *
 * The account and environment used to be enough to identify a token's owner,
 * and the username was just those two plus the email. That worked only because
 * a second sign-in reused the first token's row. Tokens no longer share rows
 * (see src/routes/tokens/handlers/wrikeTokenExchange.js), so a user can hold
 * several tokens in the same environment and the name has to say which one.
 *
 * The readable prefix is deliberate and stays at the front: these usernames get
 * pasted into third-party clients by hand, and "1234-PROD-ada@example.com-9f3c1a7b"
 * still tells a person which account, environment and user it belongs to.
 *
 * The suffix is the first 8 hex characters of the row's own UUID, so the name
 * cannot collide without the ids colliding first. 32 bits of it means a
 * collision needs roughly 77,000 tokens in one account and environment before
 * it is even likely, and rows that do collide fail loudly on the unique index
 * rather than quietly overwriting each other.
 */

/** Hex characters of the row id appended to the username. */
export const USERNAME_SUFFIX_LENGTH = 8;

export const usernameFor = ({ accountId, environmentId, email, tokenId }) => {
  if (!tokenId) throw new Error("A token id is required to name a token");

  const suffix = tokenId.replace(/-/g, "").slice(0, USERNAME_SUFFIX_LENGTH);

  return `${accountId}-${environmentId}-${email}-${suffix}`;
};
