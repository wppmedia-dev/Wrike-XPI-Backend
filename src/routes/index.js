"use strict";

import { tokenRoute } from "./tokens";
import { campaignRoute } from "./campaign";
import { channelRoute } from "./channel";
import { taskRoute } from "./task";
import { masterRoute } from "./master";
import { amoebaRoute } from "./amoeba";
import { adminApiRoute } from "./admin";
import { portalApiRoute } from "./portal";

// Auth Middleware
import { ValidateToken } from "../middlewares/authentication";

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

//Public Routes
export const PublicRouters = (fastify, opts, done) => {
  fastify.register(tokenRoute, { prefix: "/wrikexpi/token" });
  fastify.register(adminApiRoute, { prefix: "/admin" });
  fastify.register(portalApiRoute, { prefix: "/portal" });

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

  fastify.register(campaignRoute, { prefix: "/wrikexpi/campaign" });
  fastify.register(channelRoute, { prefix: "/wrikexpi/channel" });
  fastify.register(taskRoute, { prefix: "/wrikexpi/task" });
  fastify.register(masterRoute, { prefix: "/wrikexpi/v1.0" });
  fastify.register(amoebaRoute, { prefix: "/wrikexpi/amoeba" });

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
