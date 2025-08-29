import { getDatahubDataById } from "../../../utils/wrike";
import { GetResponseWithStatusCode } from "../../../utils/node-fetch";

// HTML entity decoder function using browser-like approach
function decodeHtmlEntities(text) {
  // For Node.js, we can use a simple but comprehensive entity map
  const entityMap = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#x27;": "'",
    "&#39;": "'",
    "&apos;": "'",
    "&nbsp;": " ",
    "&copy;": "©",
    "&reg;": "®",
    "&trade;": "™",
  };

  return text.replace(/&[#\w]+;/g, (entity) => {
    return entityMap[entity] || entity;
  });
}

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

      if (serviceSlug && datahubRecords[0]["enabled"] === false)
        return reject({ message: "The service slug is disabled" });

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
      const isAuthFree = datahubRecords[0]["service features"]?.includes(
        "No Authentication Token"
      );

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

      // Construct the full target URL with proper HTML entity decoding
      let fullTargetUrl = decodeHtmlEntities(targetUrl);

      // Ensure the URL has proper protocol
      if (
        !fullTargetUrl.startsWith("http://") &&
        !fullTargetUrl.startsWith("https://")
      ) {
        fullTargetUrl = "https://" + fullTargetUrl;
      }

      // // For Azure Logic Apps, don't append additional paths if it's a webhook URL
      // const isLogicAppUrl =
      //   fullTargetUrl.includes("/workflows/") &&
      //   fullTargetUrl.includes("/triggers/");

      if (targetPath) {
        // Only append path for regular APIs, not Logic App webhooks
        fullTargetUrl = fullTargetUrl.endsWith("/")
          ? fullTargetUrl.slice(0, -1) + targetPath
          : fullTargetUrl + targetPath;
      }

      // Validate the final URL
      try {
        new URL(fullTargetUrl);
      } catch (urlError) {
        return reject({
          statusCode: 400,
          message: "Invalid target URL format after decoding",
          details: {
            originalUrl: targetUrl,
            decodedUrl: fullTargetUrl,
            error: urlError.message,
          },
        });
      }

      // // Extract body for POST/PUT/PATCH requests
      // let requestBody = null;
      // if (["POST", "PUT", "PATCH"].includes(method) && req.body) {
      //   requestBody = req.body;
      // }

      // Prepare headers for the target API
      const targetHeaders = {
        // ...req.headers,
        "Content-Type": req.headers["content-type"] || "application/json",
        Accept: "application/json",
      };

      // if (isAuthFree) delete targetHeaders.authorization;

      // Add authentication headers based on isAuthFree flag
      if (!isAuthFree && req.headers.authorization) {
        targetHeaders.Authorization = req.headers.authorization;
      }

      // Make the API call to the target URL
      const targetResponse = await GetResponseWithStatusCode(
        fullTargetUrl,
        method,
        targetHeaders,
        req.body
          ? req.body
          : ["POST", "PUT", "PATCH"].includes(method)
          ? {}
          : undefined
      );

      if (targetResponse?.status >= 400)
        return reject({ data: targetResponse?.data });

      // Return the response from the target API
      resolve(targetResponse?.data);
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
