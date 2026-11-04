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
 * Status answers the question an admin is actually asking:
 *
 *   revoked        an admin revoked the registration
 *   expired        the registration's own lifetime has passed
 *   connected      a live sign-in that has been used recently
 *   idle           a live sign-in, but nothing has used it for longer than an
 *                  access token lives. The client may simply be unused, or the
 *                  user may have disconnected it on the client's side; the
 *                  service cannot tell those apart unless the client signs out
 *                  (POST /oauth/revoke), which not every client does.
 *   disconnected   it has signed in before, but has no live sign-in now
 *   registered     it registered and has never signed in (or its sign-ins
 *                  predate connection tracking, so none can be attributed)
 */

export const CLIENT_STATUS = {
  REVOKED: "revoked",
  EXPIRED: "expired",
  CONNECTED: "connected",
  IDLE: "idle",
  DISCONNECTED: "disconnected",
  REGISTERED: "registered",
};

/**
 * @param {object}  p
 * @param {number}  p.totalSessions     sign-ins this client has ever made
 * @param {number}  p.liveSessions      sign-ins that can still refresh
 * @param {*}       p.liveLastActiveAt  latest activity among the LIVE ones
 * @param {number} [p.idleAfterSeconds] a live sign-in with no activity for
 *                                      longer than this is idle; omit to
 *                                      never report idle
 * @param {number} [p.now]
 * @returns "connected" | "idle" | "disconnected" | "registered"
 */
export const connectionState = ({
  totalSessions = 0,
  liveSessions = 0,
  liveLastActiveAt = null,
  idleAfterSeconds = null,
  now = Date.now(),
} = {}) => {
  if (liveSessions > 0) {
    if (idleAfterSeconds && liveLastActiveAt) {
      const quietFor = (now - new Date(liveLastActiveAt).getTime()) / 1000;
      if (quietFor > idleAfterSeconds) return CLIENT_STATUS.IDLE;
    }
    return CLIENT_STATUS.CONNECTED;
  }
  if (totalSessions > 0) return CLIENT_STATUS.DISCONNECTED;
  return CLIENT_STATUS.REGISTERED;
};

/**
 * The single status to display. `connection` is the state from
 * connectionState(), or null when it could not be determined (then an
 * unrevoked, unexpired client is shown as "registered").
 */
export const clientStatus = (client, connection, now = Date.now()) => {
  if (client?.revoked_at) return CLIENT_STATUS.REVOKED;
  if (client?.expires_at && new Date(client.expires_at).getTime() <= now) {
    return CLIENT_STATUS.EXPIRED;
  }
  return connection || CLIENT_STATUS.REGISTERED;
};
