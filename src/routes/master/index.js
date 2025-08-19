// Handlers
import { GetMasterDataRecord } from "./handlers/getMasterDataRecord";
import { GetMasterDataValue } from "./handlers/getMasterDataValue";

// Schema
import { GetMasterDataValueSchema } from "./schema/getMasterDataValue";
import { GetMasterDataRecordSchema } from "./schema/getMasterDataRecord";

export const masterRoute = (fastify, opts, done) => {
  // Custom Field endpoint - supports both single value and list
  fastify.get(
    "/value/:masterSlug/:shortcode",
    GetMasterDataValueSchema,
    async (req, reply) => {
      try {
        const result = await GetMasterDataValue(
          req?.wrikeToken,
          { ...req.params, ...req.query },
          fastify
        );

        reply.code(result.statusCode || 200).send({
          "@odata.context": `${process.env.API_URL}/wrikexpi/v1.0/${req.params.masterSlug}/${req.params.shortcode}`,
          // message: result.message,
          value: result?.data,
        });
      } catch (err) {
        reply.code(err?.statusCode || 500).send({
          // success: false,
          "@odata.context": `${process.env.API_URL}/wrikexpi/v1.0/${req.params.masterSlug}/${req.params.shortcode}`,
          // details: err?.details || null,
          message:
            err?.message ||
            "Fatal error: Unexpected error occurred and service is unable to complete the request.",
        });
      }
    }
  );

  fastify.get(
    "/value/:masterSlug",
    GetMasterDataValueSchema,
    async (req, reply) => {
      try {
        const result = await GetMasterDataValue(
          req?.wrikeToken,
          { ...req.params },
          fastify
        );

        reply.code(result.statusCode || 200).send({
          "@odata.context": `${process.env.API_URL}/wrikexpi/v1.0/${req.params.masterSlug}`,
          nextPageToken: result?.nextPageToken,
          // message: result.message,
          value: result?.data,
        });
      } catch (err) {
        reply.code(err?.statusCode || 500).send({
          // success: false,
          "@odata.context": `${process.env.API_URL}/wrikexpi/v1.0/${req.params.masterSlug}`,
          // details: err?.details || null,
          message:
            err?.message ||
            "Fatal error: Unexpected error occurred and service is unable to complete the request.",
        });
      }
    }
  );

  // Datahub records
  fastify.get(
    "/record/:masterSlug/:recordId",
    GetMasterDataRecordSchema,
    async (req, reply) => {
      try {
        const result = await GetMasterDataRecord(
          req?.wrikeToken,
          { ...req.params },
          fastify
        );

        reply.code(result.statusCode || 200).send({
          "@odata.context": `${process.env.API_URL}/wrikexpi/v1.0/${req.params.masterSlug}/${req.params.shortcode}`,
          // message: result.message,
          value: result?.data,
        });
      } catch (err) {
        reply.code(err?.statusCode || 500).send({
          // success: false,
          "@odata.context": `${process.env.API_URL}/wrikexpi/v1.0/${req.params.masterSlug}/${req.params.shortcode}`,
          // details: err?.details || null,
          message:
            err?.message ||
            "Fatal error: Unexpected error occurred and service is unable to complete the request.",
        });
      }
    }
  );

  fastify.get(
    "/record/:masterSlug",
    GetMasterDataRecordSchema,
    async (req, reply) => {
      try {
        const result = await GetMasterDataRecord(
          req?.wrikeToken,
          { ...req.params },
          fastify
        );

        reply.code(result.statusCode || 200).send({
          "@odata.context": `${process.env.API_URL}/wrikexpi/v1.0/${req.params.masterSlug}`,
          // message: result.message,
          nextPageToken: result?.nextPageToken,
          value: result?.data,
        });
      } catch (err) {
        reply.code(err?.statusCode || 500).send({
          // success: false,
          "@odata.context": `${process.env.API_URL}/wrikexpi/v1.0/${req.params.masterSlug}`,
          // details: err?.details || null,
          message:
            err?.message ||
            "Fatal error: Unexpected error occurred and service is unable to complete the request.",
        });
      }
    }
  );

  done();
};

export default masterRoute;
