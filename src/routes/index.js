"use strict";

import { tokenRoute } from "./tokens";
import { campaignRoute } from "./campaign";
import { channelRoute } from "./channel";
import { taskRoute } from "./task";
import { masterRoute } from "./master";

// Auth Middleware
import { ValidateToken } from "../middlewares/authentication";

// Channel Handlers and Schemas for OData routes
import { GetAllChannels } from "./channel/handlers/getAllChannels";
import { GetAllChannelsSchema } from "./channel/schema/getAllChannels";

// Task Handlers and Schemas for OData routes
import { GetAllTasks } from "./task/handlers/getAllTasks";
import { GetAllTasksSchema } from "./task/schema/getAllTasks";

//Public Routes
export const PublicRouters = (fastify, opts, done) => {
  fastify.register(tokenRoute, { prefix: "/wrikexpi/token" });

  done();
};

//Protected Routes
export const PrivateRouters = (fastify, opts, done) => {
  // Validating Token
  fastify.addHook("onRequest", (req, reply) =>
    ValidateToken(req, reply, fastify)
  );

  fastify.register(campaignRoute, { prefix: "/wrikexpi/campaign" });
  fastify.register(channelRoute, { prefix: "/wrikexpi/channel" });
  fastify.register(taskRoute, { prefix: "/wrikexpi/task" });
  fastify.register(masterRoute, { prefix: "/wrikexpi/v1.0" });

  // Traditional REST route
  fastify.get(
    "/wrikexpi/campaign/:campaignId/channel",
    GetAllChannelsSchema,
    async (req, reply) => {
      try {
        const result = await GetAllChannels(
          req?.wrikeToken,
          { ...req.params, ...req.query },
          fastify
        );

        reply.code(result.statusCode || 200).send({
          success: true,
          message: result.message,
          nextPageToken: result.nextPageToken,
          data: result?.data,
        });
      } catch (err) {
        reply.code(err?.statusCode || 500).send({
          success: false,
          details: err?.details || null,
          message:
            err?.message ||
            "Fatal error Unexpected error occurred and service is unable complete the request.",
        });
      }
    }
  );

  // Task REST route
  fastify.get(
    "/wrikexpi/channel/:channelId/task",
    GetAllTasksSchema,
    async (req, reply) => {
      try {
        const result = await GetAllTasks(
          req?.wrikeToken,
          { ...req.params, ...req.query },
          fastify
        );

        reply.code(result.statusCode || 200).send({
          success: true,
          message: result.message,
          nextPageToken: result.nextPageToken,
          data: result?.data,
        });
      } catch (err) {
        reply.code(err?.statusCode || 500).send({
          success: false,
          details: err?.details || null,
          message:
            err?.message ||
            "Fatal error Unexpected error occurred and service is unable complete the request.",
        });
      }
    }
  );

  done();
};
