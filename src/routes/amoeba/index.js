// Handlers
import { AmoebaHandler } from "./handlers/amoebaHandler";

// Schema
import { AmoebaSchema } from "./schema/amoebaSchema";

// Form bodies are a proxy concern here: the target needs the exact bytes the
// caller sent, boundary and all, so they are kept raw instead of being parsed
// and re-serialised as JSON (which would also contradict the forwarded
// content-type). Scoped to this plugin, so no other route's parsing changes.
// The raw buffer rides on the request; req.body is only a short placeholder so
// the activity log does not try to snapshot file bytes.
const FORM_TYPES = ["multipart/form-data", "application/x-www-form-urlencoded"];

export const amoebaRoute = (fastify, opts, done) => {
  FORM_TYPES.forEach((type) => {
    // @fastify/multipart registers its own multipart parser on the root
    // instance; this plugin's copy is replaced without touching the root's.
    if (fastify.hasContentTypeParser(type))
      fastify.removeContentTypeParser(type);

    fastify.addContentTypeParser(
      type,
      { parseAs: "buffer", bodyLimit: 50 * 1024 * 1024 },
      (req, body, parsed) => {
        req.rawFormBody = body;
        parsed(null, `[${type} body, ${body.length} bytes]`);
      },
    );
  });

  // Custom Field endpoint - supports both single value and list
  fastify.all("/:moduleSlug/*", AmoebaSchema, async (req, reply) => {
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
  });

  fastify.all("/:moduleSlug", AmoebaSchema, async (req, reply) => {
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
  });

  done();
};

export default amoebaRoute;
