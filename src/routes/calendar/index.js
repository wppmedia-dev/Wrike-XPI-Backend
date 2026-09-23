/**
 * The calendar surface: what a Calendar Sync integration calls.
 *
 * Two endpoints. The first is deliberately the smallest useful one, a
 * validator: an integration that holds its own credential needs exactly one
 * question answered on a schedule, "is this still good?", because the
 * alternative is discovering it the moment somebody's week fails to appear.
 * The second is a forwarder, for the integrations that write back as well as
 * read (see below).
 *
 * The validator's answer is a permission answer, and it is given by the same
 * function the request gate uses (denialFor), read off the same loaded matrix.
 * That is the point of this endpoint: it reports what this token may actually
 * do, per the calendar module, rather than inferring it from the fact that a
 * request arrived. Only the calendar module is consulted — that is the single
 * question a calendar integration is asking.
 *
 * There is still no Wrike call in that handler. A handler that asked Wrike
 * something could only add a way for a healthy token to be reported unhealthy
 * because Wrike was slow.
 *
 * The path is governed like every other module path: /wrikexpi/calendar maps
 * to the calendar_sync module (src/utils/tokenPermissionMap.js), so a token
 * without that grant is refused by the gate before it ever gets here. The
 * check in the validator is what makes its 200 an answer about the calendar
 * grant rather than a side effect of the route being reachable.
 */

import { denialFor } from "../../utils/tokenPermissionMap";
import { CALENDAR_SYNC_MODULE } from "../../utils/tokenPurpose";
import { PUBLIC_DENIAL_MESSAGE } from "../../utils/environmentAccess";
import { AmoebaHandler } from "../amoeba/handlers/amoebaHandler";
import {
  CalendarAmoebaSchema,
  CalendarAmoebaWildcardSchema,
} from "./schema/amoeba";

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

  /**
   * The amoeba forwarder:
   * /wrikexpi/calendar/amoeba/<master slug>/<service slug>.
   *
   * A calendar integration that pushes changes back needs the amoeba services.
   * It cannot use /wrikexpi/amoeba for them: that path resolves to the amoeba
   * row of the matrix, which a calendar token does not hold, so the plain path
   * is refused for exactly the token that would call it. This is the same
   * forwarder under the calendar module, so an administrator grants a calendar
   * token Read, Create, Update or Delete on ONE row and that is the whole
   * decision.
   *
   * A forwarder does nothing of its own: the same handler the amoeba route
   * calls, the same response envelope, and the method decides the action
   * through the same table (src/utils/tokenPermissionMap.js). Whatever the
   * amoeba module grows, this one can reach without being taught about it.
   *
   * The URL speaks the mapping's vocabulary, where a row is keyed by "module
   * slug" and "service slug" and the entity is a master slug, while the
   * handler reads moduleSlug and serviceSlug. The two are mapped below rather
   * than renaming either: the URL is what a caller is told to use, and the
   * handler is shared with the amoeba route.
   */
  const forwardAmoeba = async (req, reply) => {
    req.params.moduleSlug = req.params.master_slug;
    req.params.serviceSlug = req.params.service_slug;

    try {
      const result = await AmoebaHandler(
        req?.wrikeToken,
        req,
        req?.environmentName,
      );

      reply.code(result.statusCode || 200).send({ success: true, ...result });
    } catch (err) {
      reply.code(err?.statusCode || 400).send({
        success: false,
        details: err?.data,
        message:
          err?.message ||
          err?.errorDescription ||
          err?.data?.error?.message ||
          "Fatal error: Unexpected error occurred and service is unable to complete the request.",
      });
    }
  };

  fastify.all(
    "/amoeba/:master_slug/:service_slug",
    CalendarAmoebaSchema,
    forwardAmoeba,
  );

  // Same forwarder, for calls that carry a remaining path after the service
  // slug (e.g. /amoeba/wrikeapi/folders/{id}/tasks) — mirrors the plain
  // amoeba route's "/:moduleSlug/*" variant (src/routes/amoeba/index.js).
  // Without this, Fastify 404s before the request ever reaches the handler.
  fastify.all(
    "/amoeba/:master_slug/:service_slug/*",
    CalendarAmoebaWildcardSchema,
    forwardAmoeba,
  );

  done();
};

export default calendarRoute;
