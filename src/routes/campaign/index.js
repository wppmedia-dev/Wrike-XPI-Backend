// Handlers
import { GetAllCampaigns } from "./handlers/getAllCampaigns";
import { GetCampaign } from "./handlers/getCampaign";
import { CreateCampaign } from "./handlers/createCampaign";
import { UpdateCampaign } from "./handlers/updateCampaign";
import { DeleteCampaign } from "./handlers/deleteCampaign";
import { UploadFile } from "./handlers/uploadFile";

// Schema
import { GetCampaignSchema } from "./schema/getCampaign";
import { GetAllCampaignsSchema } from "./schema/getAllCampaigns";
import { CreateCampaignSchema } from "./schema/createCampaign";
import { UpdateCampaignSchema } from "./schema/updateCampaign";
import { DeleteCampaignSchema } from "./schema/deleteCampaign";

export const campaignRoute = (fastify, opts, done) => {
  fastify.post("/", CreateCampaignSchema, async (req, reply) => {
    try {
      const result = await CreateCampaign(req?.wrikeToken, req.body, fastify);

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

  fastify.get("/:campaignId", GetCampaignSchema, async (req, reply) => {
    try {
      const result = await GetCampaign(
        req?.wrikeToken,
        { ...req.params, ...req.query },
        fastify
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

  fastify.get("/", GetAllCampaignsSchema, async (req, reply) => {
    try {
      const result = await GetAllCampaigns(
        req?.wrikeToken,
        { ...req.params, ...req.query },
        fastify
      );

      reply.code(result.statusCode || 200).send({
        success: true,
        message: result.message,
        nextPageToken: result.nextPageToken,
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

  fastify.put("/:campaignId", UpdateCampaignSchema, async (req, reply) => {
    try {
      const result = await UpdateCampaign(
        req?.wrikeToken,
        { formFields: req.body, ...req.params },
        fastify
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

  fastify.delete("/:campaignId", DeleteCampaignSchema, async (req, reply) => {
    try {
      const result = await DeleteCampaign(
        req?.wrikeToken,
        { ...req.params },
        fastify
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

  fastify.post("/upload", async (req, reply) => {
    try {
      const data = await req.file();

      if (!data) {
        return reply.code(400).send({
          success: false,
          message: "No file uploaded.",
        });
      }

      // Convert the file stream to buffer
      const chunks = [];
      for await (const chunk of data.file) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);

      const fileData = {
        buffer: buffer,
        filename: data.filename,
        mimetype: data.mimetype,
      };

      const result = await UploadFile(req?.wrikeToken, fileData, fastify);

      reply.code(result.statusCode || 200).send({
        success: true,
        message: result.message,
        data: { attachmentId: result?.data?.data[0]?.id ?? result?.data },
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

export default campaignRoute;
