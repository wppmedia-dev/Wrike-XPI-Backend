"use strict";

const fp = require("fastify-plugin");

module.exports = fp(async function (fastify, opts) {
  fastify.register(require("@fastify/multipart"), {
    // Set file size limit (default is 1MB)
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB
    },
  });
});
