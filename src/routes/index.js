"use strict";

import { tokenRoute } from "./tokens";
import { campaignRoute } from "./campaign";

// Auth Middleware
import { ValidateToken } from "../middlewares/authentication";

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

  done();
};
