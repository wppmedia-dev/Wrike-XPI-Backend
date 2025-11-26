// Handlers
import { AmoebaHandler } from "./handlers/amoebaHandler";

// Schema
import { AmoebaSchema } from "./schema/amoebaSchema";

export const amoebaRoute = (fastify, opts, done) => {
  // Custom Field endpoint - supports both single value and list
  fastify.all("/:moduleSlug/*", AmoebaSchema, async (req, reply) => {
    try {
      console.log("Amoeba Request Received:", req.params, req.query, req.body);
      const result = await AmoebaHandler(req?.wrikeToken, req, fastify);

      reply.code(result.statusCode || 200).send({ success: true, ...result });
    } catch (err) {
      reply.code(err?.statusCode || 500).send({
        success: false,
        details: err?.data,
        message:
          err?.message ||
          err?.errorDescription ||
          err?.data?.error?.message ||
          "Fatal error: Unexpected error occurred and service is unable to complete the request.",
      });
    }
  });

  fastify.all("/:moduleSlug", AmoebaSchema, async (req, reply) => {
    try {
      const result = await AmoebaHandler(req?.wrikeToken, req, fastify);

      reply.code(result.statusCode || 200).send({ success: true, ...result });
    } catch (err) {
      reply.code(err?.statusCode || 500).send({
        success: false,
        details: err?.data,
        message:
          err?.message ||
          err?.errorDescription ||
          err?.data?.error?.message ||
          "Fatal error: Unexpected error occurred and service is unable to complete the request.",
      });
    }
  });

  done();
};

export default amoebaRoute;
