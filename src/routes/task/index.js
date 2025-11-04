// Handlers
import { GetTask } from "./handlers/getTask";
import { UpdateTask } from "./handlers/updateTask";
import { DeleteTask } from "./handlers/deleteTask";

// Schema
import { GetTaskSchema } from "./schema/getTask";
import { UpdateTaskSchema } from "./schema/updateTask";
import { DeleteTaskSchema } from "./schema/deleteTask";

export const taskRoute = (fastify, opts, done) => {
  fastify.get("/:taskId", GetTaskSchema, async (req, reply) => {
    try {
      const result = await GetTask(
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

  // // This has been moved to index.js to handle all tasks under campaign
  // fastify.get("/", GetAllTasksSchema, async (req, reply) => {
  //   try {
  //     const result = await GetAllTasks(
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

  fastify.patch("/:taskId", UpdateTaskSchema, async (req, reply) => {
    try {
      const result = await UpdateTask(
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

  fastify.delete("/:taskId", DeleteTaskSchema, async (req, reply) => {
    try {
      const result = await DeleteTask(
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

  done();
};

export default taskRoute;
