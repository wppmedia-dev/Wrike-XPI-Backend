// Handlers
import { AmoebaHandler } from "./handlers/amoebaHandler";

// Schema
import { AmoebaSchema } from "./schema/amoebaSchema";

export const amoebaRoute = (fastify, opts, done) => {
  // Custom Field endpoint - supports both single value and list
  fastify.all("/:moduleSlug/:serviceSlug", AmoebaSchema, async (req, reply) => {
    try {
      const result = await AmoebaHandler(req?.wrikeToken, req, fastify);

      reply.code(result.statusCode || 200).send({
        "@odata.context": `${process.env.API_URL}/wrikexpi/v1.0/${req.params.moduleSlug}/${req.params.serviceSlug}`,
        // message: result.message,
        value: result?.data,
      });
    } catch (err) {
      reply.code(err?.statusCode || 500).send({
        // success: false,
        "@odata.context": `${process.env.API_URL}/wrikexpi/v1.0/${req.params.moduleSlug}/${req.params.serviceSlug}`,
        // details: err?.details || null,
        message:
          err?.message ||
          "Fatal error: Unexpected error occurred and service is unable to complete the request.",
      });
    }
  });

  fastify.all("/:moduleSlug", AmoebaSchema, async (req, reply) => {
    try {
      const result = await AmoebaHandler(req?.wrikeToken, req, fastify);

      reply.code(result.statusCode || 200).send({
        "@odata.context": `${process.env.API_URL}/wrikexpi/v1.0/${req.params.moduleSlug}`,
        nextPageToken: result?.nextPageToken,
        // message: result.message,
        value: result?.data,
      });
    } catch (err) {
      reply.code(err?.statusCode || 500).send({
        // success: false,
        "@odata.context": `${process.env.API_URL}/wrikexpi/v1.0/${req.params.moduleSlug}`,
        // details: err?.details || null,
        message:
          err?.message ||
          "Fatal error: Unexpected error occurred and service is unable to complete the request.",
      });
    }
  });

  done();
};

export default amoebaRoute;
