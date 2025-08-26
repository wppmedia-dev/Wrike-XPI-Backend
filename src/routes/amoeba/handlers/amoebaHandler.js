import { getDatahubDataById } from "../../../utils/wrike";
import { GetResponse } from "../../../utils/node-fetch";

export const AmoebaHandler = (wrikeToken, req, fastify) => {
  return new Promise(async (resolve, reject) => {
    try {
      if (!wrikeToken) {
        return reject({
          statusCode: 403,
          message:
            "Failed authorization! User is not authorized to access the service.",
        });
      }

      if (!process.env.DATAHUB_AMOEBA_MODULE_ID) {
        return reject({
          statusCode: 400,
          message:
            "Feature under construction! We're cooking up something amazing - check back soon!",
        });
      }

      const { moduleSlug, serviceSlug } = req?.params;

      if (serviceSlug && !process.env.DATAHUB_AMOEBA_SERVICE_ID) {
        return reject({
          statusCode: 400,
          message:
            "Feature under construction! We're cooking up something amazing - check back soon!",
        });
      }

      if (!moduleSlug) {
        return reject({
          statusCode: 400,
          message:
            "Missing parameter! Required parameter 'moduleSlug' is missing.",
        });
      }

      // Get mapping configuration

      let filter = [
        {
          fieldName: "module slug",
          value: moduleSlug,
        },
      ];

      if (serviceSlug)
        filter.push({
          fieldName: "service slug",
          value: serviceSlug,
        });

      const datahubRecords = await getDatahubDataById(
        wrikeToken,
        serviceSlug
          ? process.env.DATAHUB_AMOEBA_SERVICE_ID
          : process.env.DATAHUB_AMOEBA_MODULE_ID,
        filter,
        false
      );

      if (!datahubRecords || (datahubRecords?.length ?? 0) == 0) {
        return reject({
          statusCode: 404,
          message: `Custom field mapping not found for moduleSlug: ${moduleSlug}`,
        });
      }

      if (datahubRecords?.length > 1)
        return reject({
          statusCode: 409,
          message: `Multiple amoeba module mappings found for moduleSlug: ${moduleSlug}`,
        });

      const targetUrl = serviceSlug
        ? datahubRecords[0]["target service url"]
        : datahubRecords[0]["target base url"];

      if (!targetUrl)
        return reject({
          statusCode: 404,
          message: `Target URL not found for ${
            serviceSlug ? "serviceSlug" : "moduleSlug"
          }: ${serviceSlug || moduleSlug}`,
        });

      // Extract request details for the target API call
      const method = req.method.toUpperCase();
      const originalUrl = req.url;

      // Extract path after moduleSlug/serviceSlug
      let targetPath = "";
      if (serviceSlug) {
        // Pattern: /amoeba/moduleSlug/serviceSlug/remaining/path
        const pathPattern = `/amoeba/${moduleSlug}/${serviceSlug}`;
        const pathIndex = originalUrl.indexOf(pathPattern);
        if (pathIndex !== -1) {
          const afterServiceSlug = originalUrl.substring(
            pathIndex + pathPattern.length
          );
          targetPath = afterServiceSlug;
        }
      } else {
        // Pattern: /amoeba/moduleSlug/remaining/path
        const pathPattern = `/amoeba/${moduleSlug}`;
        const pathIndex = originalUrl.indexOf(pathPattern);
        if (pathIndex !== -1) {
          const afterModuleSlug = originalUrl.substring(
            pathIndex + pathPattern.length
          );
          targetPath = afterModuleSlug;
        }
      }

      // Construct the full target URL
      const fullTargetUrl = targetUrl.endsWith("/")
        ? targetUrl.slice(0, -1) + targetPath
        : targetUrl + targetPath;

      // Extract body for POST/PUT/PATCH requests
      let requestBody = null;
      if (["POST", "PUT", "PATCH"].includes(method) && req.body) {
        requestBody = req.body;
      }

      if (requestBody) {
        console.log("Request body:", requestBody);
      }

      // Make the API call to the target URL
      const targetResponse = await GetResponse(
        fullTargetUrl,
        method,
        req.headers,
        req.body
      );

      // Return the response from the target API
      resolve({
        data: targetResponse,
        metadata: {
          targetUrl: fullTargetUrl,
          method: method,
          originalPath: targetPath,
        },
      });
    } catch (err) {
      reject({
        message:
          err?.message ||
          err?.errorDescription ||
          "Fatal error: Unexpected error occurred and service is unable to complete the request.",
      });
    }
  });
};
