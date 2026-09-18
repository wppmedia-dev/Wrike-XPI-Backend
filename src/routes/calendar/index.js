/**
 * The calendar surface: what a Calendar Sync integration calls.
 *
 * One endpoint so far, and deliberately the smallest useful one — a validator.
 * An integration that holds its own credential needs exactly one question
 * answered on a schedule, "is this still good?", because the alternative is
 * discovering it the moment somebody's week fails to appear.
 *
 * The answer is a permission answer, and it is given by the same function the
 * request gate uses (denialFor), read off the same loaded matrix. That is the
 * point of this endpoint: it reports what this token may actually do, per the
 * calendar module, rather than inferring it from the fact that a request
 * arrived. Only the calendar module is consulted — that is the single question
 * a calendar integration is asking.
 *
 * There is still no Wrike call in the handler. A handler that asked Wrike
 * something could only add a way for a healthy token to be reported unhealthy
 * because Wrike was slow.
 *
 * The path is governed like every other module path: /wrikexpi/calendar maps
 * to the calendar_sync module (src/utils/tokenPermissionMap.js), so a token
 * without that grant is refused by the gate before it ever gets here. The
 * check below is what makes the 200 an answer about the calendar grant rather
 * than a side effect of the route being reachable.
 */

import { denialFor } from "../../utils/tokenPermissionMap";
import { CALENDAR_SYNC_MODULE } from "../../utils/tokenPurpose";
import { PUBLIC_DENIAL_MESSAGE } from "../../utils/environmentAccess";

/** The one thing a calendar caller is asking about, in gate terms. */
const CALENDAR_READ = { module: CALENDAR_SYNC_MODULE, action: "read" };

/**
 * The denial code for this request, or null when the calendar grant is there.
 *
 * A matrix that was never loaded is a refused check, not a grant: the same
 * "refuse rather than allow" rule the gate follows for a lookup it could not
 * complete. When the gate did run, it always leaves a matrix behind, so this
 * branch only fires if this route is ever mounted outside the guarded scope —
 * which is exactly when guessing would be worst.
 */
const calendarDenial = (req) => {
  if (!req.tokenMatrix) return "PERMISSION_CHECK_FAILED";
  return denialFor(req.tokenMatrix, CALENDAR_READ);
};

export const calendarRoute = (fastify, opts, done) => {
  fastify.get("/validate", async (req, reply) => {
    const denial = calendarDenial(req);

    if (denial) {
      // Recorded the way the gate records its own refusals (req.tokenPermission
      // is read by the activity-log hook in src/routes/index.js), so a denied
      // calendar call is logged as denied instead of as a plain 403.
      req.tokenPermission = { ...CALENDAR_READ, code: denial };

      return reply.code(403).send({
        success: false,
        message: PUBLIC_DENIAL_MESSAGE,
        error: {
          code: denial,
          module: CALENDAR_READ.module,
          action: CALENDAR_READ.action,
        },
      });
    }

    // Who the caller turned out to be, and where. Enough for an integration's
    // log line and for support to find the row in the console, and nothing
    // about the credential itself.
    reply.code(200).send({
      success: true,
      message: "Token is valid.",
      data: {
        valid: true,
        calendar_access: true,
        token_id: req.tokenId || null,
        environment: req.environmentName || null,
        environment_id: req.envId || null,
        checked_at: new Date().toISOString(),
      },
    });
  });

  done();
};

export default calendarRoute;
