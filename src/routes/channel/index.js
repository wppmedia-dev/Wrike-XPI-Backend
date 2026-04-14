// Handlers
import { GetChannel } from "./handlers/getChannel";
import { UpdateChannel } from "./handlers/updateChannel";
import { DeleteChannel } from "./handlers/deleteChannel";

// Schema
import { GetChannelSchema } from "./schema/getChannel";
import { UpdateChannelSchema } from "./schema/updateChannel";
import { DeleteChannelSchema } from "./schema/deleteChannel";

export const channelRoute = (fastify, opts, done) => {
  fastify.get("/:channelId", GetChannelSchema, async (req, reply) => {
    try {
      const result = await GetChannel(
        req?.wrikeToken,
        { ...req.params, ...req.query },
        req?.environmentName,
      );

      reply.code(result.statusCode || 200).send({
        success: true,
        message: result.message,
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
  });

  // // This has been moved to index.js to handle all channels under campaign
  // fastify.get("/", GetAllChannelsSchema, async (req, reply) => {
  //   try {
  //     const result = await GetAllChannels(
  //       req?.wrikeToken,
  //       { ...req.params, ...req.query },
  //       fastify
  //     );

  //     reply.code(result.statusCode || 200).send({
  //       success: true,
  //       message: result.message,
  //       data: result?.data,
  //     });
  //   } catch (err) {
  //     reply.code(err?.statusCode || 500).send({
  //       success: false,
  //       details: err?.details || null,
  //       message:
  //         err?.message ||
  //         "Fatal error Unexpected error occurred and service is unable complete the request.",
  //     });
  //   }
  // });

  fastify.patch("/:channelId", UpdateChannelSchema, async (req, reply) => {
    try {
      const result = await UpdateChannel(
        req?.wrikeToken,
        { formFields: req.body, ...req.params },
        req?.environmentName,
      );

      reply.code(result.statusCode || 200).send({
        success: true,
        message: result.message,
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
  });

  fastify.delete("/:channelId", DeleteChannelSchema, async (req, reply) => {
    try {
      const result = await DeleteChannel(
        req?.wrikeToken,
        { ...req.params },
        req?.environmentName,
      );

      reply.code(result.statusCode || 200).send({
        success: true,
        message: result.message,
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
  });

  done();
};

export default channelRoute;
