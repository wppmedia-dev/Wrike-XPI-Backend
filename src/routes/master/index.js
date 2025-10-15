// Handlers
import { GetMasterDataRecord } from "./handlers/getMasterDataRecord";
import { GetMasterDataValue } from "./handlers/getMasterDataValue";
import { CreateMasterDataRecord } from "./handlers/createMasterDataRecord";
import { DeleteMasterDataRecord } from "./handlers/deleteMasterDataRecord";
import { UpdateMasterDataRecord } from "./handlers/updateMasterDataRecord";

// Schema
import { GetMasterDataValueSchema } from "./schema/getMasterDataValue";
import { GetMasterDataRecordSchema } from "./schema/getMasterDataRecord";
import { CreateMasterDataRecordSchema } from "./schema/createMasterDataRecord";
import { DeleteMasterDataRecordSchema } from "./schema/deleteMasterDataRecord";
import { UpdateMasterDataRecordSchema } from "./schema/updateMasterDataRecord";

export const masterRoute = (fastify, opts, done) => {
  // Create Dominus API
  fastify.post(
    "/record/:masterSlug",
    CreateMasterDataRecordSchema,
    async (req, reply) => {
      try {
        const result = await CreateMasterDataRecord(
          req?.wrikeToken,
          { masterSlug: req.params?.masterSlug, reqBody: req.body },
          fastify
        );

        reply.code(result.statusCode || 200).send({
          "@odata.context": `${process.env.API_URL}/v1.0/record/${req.params.masterSlug}`,
          // message: result.message,
          value: result?.data,
        });
      } catch (err) {
        reply.code(err?.statusCode || 500).send({
          // success: false,
          "@odata.context": `${process.env.API_URL}/v1.0/record/${req.params.masterSlug}`,
          // details: err?.details || null,
          message:
            err?.message ||
            "Fatal error: Unexpected error occurred and service is unable to complete the request.",
        });
      }
    }
  );

  // Update Dominus API
  fastify.put(
    "/record/:masterSlug/:recordId",
    UpdateMasterDataRecordSchema,
    async (req, reply) => {
      try {
        const result = await UpdateMasterDataRecord(
          req?.wrikeToken,
          { ...req.params, reqBody: req.body },
          fastify
        );

        reply.code(result.statusCode || 200).send({
          "@odata.context": `${process.env.API_URL}/v1.0/record/${req.params.masterSlug}/${req.params?.recordId}`,
          message: result.message,
          // value: result?.data,
        });
      } catch (err) {
        reply.code(err?.statusCode || 500).send({
          // success: false,
          "@odata.context": `${process.env.API_URL}/v1.0/record/${req.params.masterSlug}/${req.params?.recordId}`,
          // details: err?.details || null,
          message:
            err?.message ||
            "Fatal error: Unexpected error occurred and service is unable to complete the request.",
        });
      }
    }
  );

  // Delete Dominus API
  fastify.delete(
    "/record/:masterSlug/:recordId",
    DeleteMasterDataRecordSchema,
    async (req, reply) => {
      try {
        const result = await DeleteMasterDataRecord(
          req?.wrikeToken,
          { ...req.params, reqBody: req.body },
          fastify
        );

        reply.code(result.statusCode || 200).send({
          "@odata.context": `${process.env.API_URL}/v1.0/record/${req.params.masterSlug}/${req.params?.recordId}`,
          message: result.message,
          // value: result?.data,
        });
      } catch (err) {
        reply.code(err?.statusCode || 500).send({
          // success: false,
          "@odata.context": `${process.env.API_URL}/v1.0/record/${req.params.masterSlug}/${req.params?.recordId}`,
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
          "@odata.context": `${process.env.API_URL}/v1.0/record/${req.params.masterSlug}/${req.params.recordId}`,
          // message: result.message,
          value: result?.data,
        });
      } catch (err) {
        reply.code(err?.statusCode || 500).send({
          // success: false,
          "@odata.context": `${process.env.API_URL}/v1.0/record/${req.params.masterSlug}/${req.params.recordId}`,
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
          "@odata.context": `${process.env.API_URL}/v1.0/record/${req.params.masterSlug}`,
          // message: result.message,
          nextPageToken: result?.nextPageToken,
          value: result?.data,
        });
      } catch (err) {
        reply.code(err?.statusCode || 500).send({
          // success: false,
          "@odata.context": `${process.env.API_URL}/v1.0/record/${req.params.masterSlug}`,
          // details: err?.details || null,
          message:
            err?.message ||
            "Fatal error: Unexpected error occurred and service is unable to complete the request.",
        });
      }
    }
  );

  // Fetch Values
  fastify.get(
    "/value/:masterSlug/:recordId",
    GetMasterDataValueSchema,
    async (req, reply) => {
      try {
        const result = await GetMasterDataValue(
          req?.wrikeToken,
          { ...req.params, ...req.query },
          fastify
        );

        reply.code(result.statusCode || 200).send({
          "@odata.context": `${process.env.API_URL}/v1.0/value/${req.params.masterSlug}/${req.params.recordId}`,
          // message: result.message,
          value: result?.data,
        });
      } catch (err) {
        reply.code(err?.statusCode || 500).send({
          // success: false,
          "@odata.context": `${process.env.API_URL}/v1.0/value/${req.params.masterSlug}/${req.params.recordId}`,
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
          "@odata.context": `${process.env.API_URL}/v1.0/value/${req.params.masterSlug}`,
          nextPageToken: result?.nextPageToken,
          // message: result.message,
          value: result?.data,
        });
      } catch (err) {
        reply.code(err?.statusCode || 500).send({
          // success: false,
          "@odata.context": `${process.env.API_URL}/v1.0/value/${req.params.masterSlug}`,
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
