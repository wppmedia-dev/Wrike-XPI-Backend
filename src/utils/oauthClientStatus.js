/**
 * What the admin console shows as an OAuth client's status. Pure: no I/O, so
 * the rules can be tested without a database. src/controllers/oauthClients.js
 * supplies the session counts.
 *
 * Two different things can be asked about a client:
 *
 *   its REGISTRATION   did it register, and has that been revoked or expired?
 *   its CONNECTION     does it still hold a live sign-in (an unrevoked refresh
 *                      token family with an unexpired refresh token)?
 *
 * The console used to show only the first, so a client that had signed out, or
 * whose sign-ins were all revoked or had lapsed, still read "Active". Status
 * now answers the question an admin is actually asking:
 *
 *   revoked        an admin revoked the registration
 *   expired        the registration's own lifetime has passed
 *   connected      at least one live sign-in
 *   disconnected   it has signed in before, but has no live sign-in now
 *   registered     it registered and has never signed in (or its sign-ins
 *                  predate connection tracking, so none can be attributed)
 */

export const CLIENT_STATUS = {
  REVOKED: "revoked",
  EXPIRED: "expired",
  CONNECTED: "connected",
  DISCONNECTED: "disconnected",
  REGISTERED: "registered",
};

/** { totalSessions, liveSessions } in, "connected" | "disconnected" | "registered" out. */
export const connectionState = ({ totalSessions = 0, liveSessions = 0 } = {}) => {
  if (liveSessions > 0) return CLIENT_STATUS.CONNECTED;
  if (totalSessions > 0) return CLIENT_STATUS.DISCONNECTED;
  return CLIENT_STATUS.REGISTERED;
};

/**
 * The single status to display. `connection` is the state from
 * connectionState(), or null when it could not be determined (then an
 * unrevoked, unexpired client is shown as "registered", the old behaviour).
 */
export const clientStatus = (client, connection, now = Date.now()) => {
  if (client?.revoked_at) return CLIENT_STATUS.REVOKED;
  if (client?.expires_at && new Date(client.expires_at).getTime() <= now) {
    return CLIENT_STATUS.EXPIRED;
  }
  return connection || CLIENT_STATUS.REGISTERED;
};
