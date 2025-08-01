import plugin from "fastify-plugin";
import multipart from "@fastify/multipart";

export default plugin(async function (fastify, opts) {
  await fastify.register(multipart, {
    // Set file size limit (default is 1MB)
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB
    },
  });
});
