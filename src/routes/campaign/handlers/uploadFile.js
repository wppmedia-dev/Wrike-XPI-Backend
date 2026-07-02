import { uploadAttachment } from "../../../utils/wrike";

export const UploadFile = (wrikeToken, fileData, fastify) => {
  return new Promise(async (resolve, reject) => {
    try {
      if (!wrikeToken)
        return reject({
          statusCode: 403,
          message:
            "Failed authorization! User is not authorized to access the service.",
        });

      if (!fileData || !fileData.buffer || !fileData.filename) {
        return reject({
          statusCode: 400,
          message: "Invalid file data! File buffer and filename are required.",
        });
      }

      fastify.log.info(
        `[Upload File] Uploading file: ${fileData.filename}, size: ${fileData.buffer.length} bytes`,
      );

      // Upload file to Wrike
      const result = await uploadAttachment(
        wrikeToken,
        fileData.buffer,
        fileData.filename,
      );

      if (result?.error) {
        fastify.log.error(
          `[Upload File] Wrike API error: ${JSON.stringify(result)}`,
        );
        return reject({
          statusCode: result?.statusCode || 400,
          message: result?.error || "Failed to upload file to Wrike.",
          details: result,
        });
      }

      fastify.log.info(
        `[Upload File] File uploaded successfully: ${fileData.filename}`,
      );

      resolve({
        statusCode: 200,
        message: "File uploaded successfully.",
        data: result,
      });
    } catch (err) {
      fastify.log.error(
        `[Upload File] Error occurred while uploading file: ${err.message}`,
      );

      reject({
        statusCode: err?.statusCode || 400,
        message:
          err?.message ||
          "Fatal error: Unexpected error occurred and service is unable to complete the request.",
        details: err?.details || null,
      });
    }
  });
};
