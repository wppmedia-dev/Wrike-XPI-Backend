// Form bodies are a proxy concern wherever a route forwards through
// AmoebaHandler: the target needs the exact bytes the caller sent, boundary and
// all, so they are kept raw instead of being parsed and re-serialised as JSON
// (which would also contradict the forwarded content-type).
//
// Call this inside the plugin that owns the forwarding routes. Fastify scopes
// content-type parsers to the plugin, so no other route's parsing changes. The
// raw buffer rides on the request; req.body is only a short placeholder so the
// activity log does not try to snapshot file bytes.
const FORM_TYPES = ["multipart/form-data", "application/x-www-form-urlencoded"];

export const registerRawFormBodyParsers = (fastify) => {
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
};
