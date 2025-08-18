// Handlers
import { GetCustomField } from "./handlers/getCustomField";

// Schema
import { GetCustomFieldSchema } from "./schema/getCustomField";

export const masterRoute = (fastify, opts, done) => {
  // Custom Field endpoint - supports both single value and list
  fastify.get(
    "/:customfield/:shortcode",
    GetCustomFieldSchema,
    async (req, reply) => {
      try {
        const result = await GetCustomField(
          req?.wrikeToken,
          { ...req.params },
          fastify
        );

        reply.code(result.statusCode || 200).send({
          "@odata.context": `${process.env.API_URL}/${req.params.customfield}/${req.params.shortcode}`,
          // message: result.message,
          value: result?.data,
        });
      } catch (err) {
        reply.code(err?.statusCode || 500).send({
          // success: false,
          "@odata.context": `${process.env.API_URL}/${req.params.customfield}/${req.params.shortcode}`,
          // details: err?.details || null,
          message:
            err?.message ||
            "Fatal error: Unexpected error occurred and service is unable to complete the request.",
        });
      }
    }
  );

  fastify.get("/:customfield", GetCustomFieldSchema, async (req, reply) => {
    try {
      const result = await GetCustomField(
        req?.wrikeToken,
        { ...req.params },
        fastify
      );

      reply.code(result.statusCode || 200).send({
        "@odata.context": `${process.env.API_URL}/${req.params.customfield}`,
        // message: result.message,
        value: result?.data,
      });
    } catch (err) {
      reply.code(err?.statusCode || 500).send({
        // success: false,
        "@odata.context": `${process.env.API_URL}/${req.params.customfield}`,
        // details: err?.details || null,
        message:
          err?.message ||
          "Fatal error: Unexpected error occurred and service is unable to complete the request.",
      });
    }
  });

  done();
};

export default masterRoute;
