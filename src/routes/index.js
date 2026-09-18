"use strict";

import { tokenRoute } from "./tokens";
import { campaignRoute } from "./campaign";
import { channelRoute } from "./channel";
import { taskRoute } from "./task";
import { masterRoute } from "./master";
import { amoebaRoute } from "./amoeba";
import { calendarRoute } from "./calendar";
import { adminApiRoute } from "./admin";
import { portalApiRoute } from "./portal";
// Auth Middleware
import { ValidateToken } from "../middlewares/authentication";
import { requireModulePermissions } from "../middlewares/modulePermissions";
import { log as logActivity } from "../utils/activityLog";
import {
  captureRequest,
  buildResponseSnapshot,
  categoryForUrl,
} from "../utils/capture";
// GET/HEAD read; everything else is a write, matching the read/create/update/
// delete vocabulary the console and the per-token permission matrix use. The
// activity log labels each request with it, and the module gate decides from
// it, so it lives with that gate rather than here — a log that disagreed with
// the gate about what "update" means would be worse than either being wrong.
import { actionForMethod } from "../utils/tokenPermissionMap";

// MCP Plugin
import mcpPlugin from "../plugins/mcp";

// Channel Handlers and Schemas for OData routes
import { GetAllChannels } from "./channel/handlers/getAllChannels";
import { GetAllChannelsSchema } from "./channel/schema/getAllChannels";

// Task Handlers and Schemas for OData routes
import { GetAllTasks } from "./task/handlers/getAllTasks";
import {
  GetAllChannelTasksSchema,
  GetAllTasksSchema,
} from "./task/schema/getAllChannelTasks";
import { GetAllCampaignTasksSchema } from "./task/schema/getAllCampaignTasks";
import { getDatahubCustomFields } from "../utils/wrike";
import { getBuildInfo } from "../utils/version";

//Public Routes
export const PublicRouters = (fastify, opts, done) => {
  fastify.register(tokenRoute, { prefix: "/wrikexpi/token" });
  fastify.register(adminApiRoute, { prefix: "/admin" });
  fastify.register(portalApiRoute, { prefix: "/portal" });
  fastify.register(mcpPlugin, { prefix: "/wrikexpi" });

  // Non-secret app config the admin dashboard / portal home pages need on
  // load (frontend/src/pages/AdminDashboard.tsx, PortalHome.tsx) — fetched
  // client-side instead of being server-injected into their HTML, same
  // plain-sendFile pattern as every other migrated page. `environment` is
  // also read on every page by frontend/src/lib/envTheme.ts to tint the UI
  // accent per environment, and the `version`/`commit`/... fields feed the
  // build tag in the sidebar footer / login pages (one Vite build ships
  // everywhere, so these can only come from the server at runtime).
  fastify.get("/app-config", async (req, reply) => {
    const build = getBuildInfo();
    reply.send({
      success: true,
      data: {
        appUrl: process.env.APP_URL || "",
        wrikeRedirectUrl: process.env.WRIKE_REDIRECT_URL || "",
        environment: process.env.NODE_ENV || "",
        version: build.version,
        commit: build.commit,
        branch: build.branch,
        buildTime: build.buildTime,
      },
    });
  });

  fastify.get("/datahub/customfield", async (req, reply) => {
    try {
      const result = await getDatahubCustomFields();

      const cfTypes = [
        ...new Set(Object.keys(result).map((cf) => result[cf].cfType)),
      ];

      reply.code(result.statusCode || 200).send({
        success: true,
        data: result,
        cfTypes,
      });
    } catch (err) {
      reply.code(err?.statusCode || 400).send({
        success: false,
        details: err?.details || null,
        message:
          err?.message ||
          "Fatal error Unexpected error occurred and service is unable complete the request.",
      });
    }
  });

  done();
};

//Protected Routes
export const PrivateRouters = (fastify, opts, done) => {
  // Validating Token
  fastify.addHook("onRequest", (req, reply) =>
    ValidateToken(req, reply, fastify),
  );

  // Module-level scope for the token that just authenticated: the environment
  // it belongs to first, then the token itself. Both have to allow the module
  // and verb, so the environment's matrix is a ceiling over every token in it
  // (src/middlewares/modulePermissions.js). One hook covers every route
  // registered below — including the nested listings — because the module comes
  // from the path and the action from the method.
  //
  // A separate hook rather than more lines inside ValidateToken, so a 401 (this
  // is not a valid token) and a 403 (this token, or its environment, may not do
  // this) stay distinguishable in the code and in the audit trail.
  fastify.addHook("onRequest", (req, reply) =>
    requireModulePermissions(req, reply),
  );

  // Store the response body for everything EXCEPT the 200/201 success path —
  // most rows are those, so skipping them keeps the table lean while still
  // capturing the payloads that matter (gate denials, 4xx/5xx, etc.).
  fastify.addHook("onSend", (req, reply, payload, done) => {
    try {
      const code = reply.statusCode;
      const capture = !(code === 200 || code === 201);
      if (
        capture &&
        payload !== undefined &&
        payload !== null &&
        typeof payload !== "function"
      ) {
        req.activityResponsePayload = buildResponseSnapshot(code, payload);
      }
    } catch {
      req.activityResponsePayload = null;
    }
    done();
  });

  // Activity log — one row per request, written after the response is
  // already on the wire so logging never adds latency to the caller. Covers
  // every outcome: a clean 200, a gate denial (req.access set, allowed:
  // false), and a raw auth failure (bad/expired token — req.access was
  // never reached, so this falls back to the response status alone).
  fastify.addHook("onResponse", (req, reply, done) => {
    const access = req.access;
    // Set by the module gate above when — and only when — it refused the
    // request, so a denied module is recorded as denied with its own code
    // instead of inheriting the environment gate's clean bill of health.
    const denied = req.tokenPermission;
    const resource = req.routeOptions?.url || req.raw?.url || req.url;

    logActivity({
      envId: req.envId || null,
      environmentName: req.environmentName || null,
      // Which token called — set once ValidateToken has proved one, and the
      // key the console's per-token activity view filters on.
      tokenId: req.tokenId || null,
      surface: "rest",
      actorEmail: req.callerEmail || null,
      action: actionForMethod(req.method),
      resource,
      method: req.method,
      allowed: access ? !!access.allowed && !denied : reply.statusCode < 400,
      code:
        access?.code ||
        denied?.code ||
        (reply.statusCode >= 400 ? "AUTH_FAILED" : null),
      statusCode: reply.statusCode,
      ip: access?.ip || req.ip || null,
      // Set by the error-reference hook when this response was an error (a
      // 4xx/5xx carries a reference back to the caller). Null on a success,
      // where no reference was ever shown to anyone.
      referenceId: req.activityReference || null,
      category: categoryForUrl(resource),
      requestPayload: captureRequest(req),
      responsePayload: req.activityResponsePayload || null,
    });

    done();
  });

  fastify.register(campaignRoute, { prefix: "/wrikexpi/campaign" });
  fastify.register(channelRoute, { prefix: "/wrikexpi/channel" });
  fastify.register(taskRoute, { prefix: "/wrikexpi/task" });
  fastify.register(masterRoute, { prefix: "/wrikexpi/v1.0" });
  fastify.register(amoebaRoute, { prefix: "/wrikexpi/amoeba" });
  // The calendar surface. Registered like every other module prefix, so the
  // two hooks above apply to it as well and its paths resolve to the
  // calendar_sync module rather than being ungoverned.
  fastify.register(calendarRoute, { prefix: "/wrikexpi/calendar" });

  // Traditional REST route
  fastify.get(
    "/wrikexpi/campaign/:campaignId/channel",
    GetAllChannelsSchema,
    async (req, reply) => {
      try {
        const result = await GetAllChannels(
          req?.wrikeToken,
          { ...req.params, ...req.query },
          fastify,
        );

        reply.code(result.statusCode || 200).send({
          success: true,
          message: result.message,
          nextPageToken: result.nextPageToken,
          data: result?.data,
        });
      } catch (err) {
        reply.code(err?.statusCode || 400).send({
          success: false,
          details: err?.details || null,
          message:
            err?.message ||
            "Fatal error Unexpected error occurred and service is unable complete the request.",
        });
      }
    },
  );

  // Task REST route
  fastify.get(
    "/wrikexpi/channel/:channelId/task",
    GetAllChannelTasksSchema,
    async (req, reply) => {
      try {
        const result = await GetAllTasks(
          req?.wrikeToken,
          { ...req.params, ...req.query },
          "channel",
          fastify,
        );

        reply.code(result.statusCode || 200).send({
          success: true,
          message: result.message,
          nextPageToken: result.nextPageToken,
          data: result?.data,
        });
      } catch (err) {
        reply.code(err?.statusCode || 400).send({
          success: false,
          details: err?.details || null,
          message:
            err?.message ||
            "Fatal error Unexpected error occurred and service is unable complete the request.",
        });
      }
    },
  );

  fastify.get(
    "/wrikexpi/campaign/:campaignId/task",
    GetAllCampaignTasksSchema,
    async (req, reply) => {
      try {
        const result = await GetAllTasks(
          req?.wrikeToken,
          { ...req.params, ...req.query },
          "campaign",
          fastify,
        );

        reply.code(result.statusCode || 200).send({
          success: true,
          message: result.message,
          nextPageToken: result.nextPageToken,
          data: result?.data,
        });
      } catch (err) {
        reply.code(err?.statusCode || 400).send({
          success: false,
          details: err?.details || null,
          message:
            err?.message ||
            "Fatal error Unexpected error occurred and service is unable complete the request.",
        });
      }
    },
  );

  done();
};
