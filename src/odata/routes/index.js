"use strict";

import { odataCampaignRoute } from "./campaign";
const metadata = require("../metadata/campaignMetadata.js");

// Auth Middleware
import { ValidateToken } from "../../middlewares/authentication";

//Public Routes
export const OdataRouters = (fastify, opts, done) => {
  fastify.get("/wrikexpi", async (req, reply) => {
    const baseUrl = getBaseUrl(req);

    reply
      .header("Content-Type", "application/json")
      .header("OData-Version", "4.0")
      .send({
        "@odata.context": `${baseUrl}/api/v2/wrikexpi/$metadata`,
        value: [
          {
            name: "Campaigns",
            kind: "EntitySet",
            url: "Campaigns",
          },
        ],
      });
  });

  fastify.get("/wrikexpi/", async (req, reply) => {
    const baseUrl = getBaseUrl(req);

    reply
      .header("Content-Type", "application/json")
      .header("OData-Version", "4.0")
      .send({
        "@odata.context": `${baseUrl}/api/v2/wrikexpi/$metadata`,
        value: [
          {
            name: "Campaigns",
            kind: "EntitySet",
            url: "Campaigns",
          },
        ],
      });
  });

  fastify.get("/wrikexpi/$metadata", async (req, reply) => {
    reply.header("Content-Type", "application/xml");
    return metadata;
  });

  // Validating Token
  fastify.addHook("onRequest", (req, reply) =>
    ValidateToken(req, reply, fastify)
  );

  fastify.register(odataCampaignRoute, { prefix: "/wrikexpi/Campaigns" });

  done();
};

function getBaseUrl(req) {
  const port = req.socket.localPort;
  const isDefaultPort = port === 80 || port === 443;

  return `${req.protocol}://${req.hostname}${isDefaultPort ? "" : ":" + port}`;
}
