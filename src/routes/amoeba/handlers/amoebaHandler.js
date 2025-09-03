import { getDatahubDataById } from "../../../utils/wrike";
import { GetResponseWithStatusCode } from "../../../utils/node-fetch";
import redisClient from "../../../utils/redis";

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

      let isServiceSlugExist = serviceSlug && !serviceSlug.includes(":");

      if (isServiceSlugExist && !process.env.DATAHUB_AMOEBA_SERVICE_ID) {
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

      if (isServiceSlugExist)
        filter.push({
          fieldName: "service slug",
          value: serviceSlug,
        });

      // Set default TTL if not provided (null = unlimited, otherwise use provided value or env default)
      const ttl = parseInt(process.env.REDIS_DEFAULT_TTL) || 3600;

      const datahubId = isServiceSlugExist
        ? process.env.DATAHUB_AMOEBA_SERVICE_ID
        : process.env.DATAHUB_AMOEBA_MODULE_ID;

      if (!datahubId)
        return reject({
          message: "Missing datahubId",
        });

      // Generate cache key
      const cacheKey = redisClient.generateKey(
        "amoeba_data",
        datahubId,
        req.url?.replace("/api/v1/wrikexpi/amoeba", "")
      );

      // Try to get from cache first

      try {
        const cachedData = await redisClient.get(cacheKey);
        if (cachedData) {
          // console.log(`Cache hit for datahub ${datahubId}`);
          return resolve(cachedData);
        }
        // console.log(`Cache miss for datahub ${datahubId}`);
      } catch (cacheError) {
        console.warn("Cache read error, proceeding without cache:", cacheError);
      }

      let datahubRecords = await getDatahubDataById(
        wrikeToken,
        datahubId,
        filter,
        false
      );

      if (!datahubRecords || (datahubRecords?.length ?? 0) == 0) {
        if (!isServiceSlugExist)
          return reject({
            statusCode: 404,
            message: `Custom field mapping not found for moduleSlug: ${moduleSlug}`,
          });

        datahubRecords = await getDatahubDataById(
          wrikeToken,
          process.env.DATAHUB_AMOEBA_MODULE_ID,
          [filter[0]],
          false
        );

        if (!datahubRecords || (datahubRecords?.length ?? 0) == 0) {
          return reject({
            statusCode: 404,
            message: `Custom field mapping not found for moduleSlug: ${moduleSlug}`,
          });
        } else {
          isServiceSlugExist = false;
        }
      }

      if (datahubRecords?.length > 1)
        return reject({
          statusCode: 409,
          message: `Multiple amoeba module mappings found for moduleSlug: ${moduleSlug}`,
        });

      // Flag variables from datahub values
      const isEnabled = datahubRecords[0]["enabled"];
      const isWrikeToken =
        datahubRecords[0]["module features"]?.includes("XPI Token Exchange");
      const targetUrl = isServiceSlugExist
        ? datahubRecords[0]["target service url"]
        : datahubRecords[0]["target base url"];
      const isAuthFree =
        datahubRecords[0]["service features"]?.includes(
          "No Authentication Token"
        ) ?? false;
      const isCacheable =
        datahubRecords[0]["service features"]?.includes("Cache Response") ??
        false;

      // Condition Validations
      if (isServiceSlugExist && isEnabled === false)
        return reject({ message: "The service slug is disabled" });

      if (!targetUrl)
        return reject({
          statusCode: 404,
          message: `Target URL not found for ${
            isServiceSlugExist ? "serviceSlug" : "moduleSlug"
          }: ${serviceSlug || moduleSlug}`,
        });

      let authToken = req.headers.authorization;

      if (!isServiceSlugExist && isWrikeToken)
        authToken = `Bearer ${wrikeToken}`;

      // Extract request details for the target API call
      const method = req.method.toUpperCase();
      const originalUrl = req.url;

      // Extract path after moduleSlug/serviceSlug
      let targetPath = "";
      if (isServiceSlugExist) {
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

          // Remove route parameter placeholders like /:service_slug or /:anything
          targetPath = afterModuleSlug.replace(/\/:[^\/]+/g, "");

          // Clean up any double slashes that might result from the removal
          targetPath = targetPath.replace(/\/+/g, "/");

          // Remove leading slash if it's just a single slash
          if (targetPath === "/") {
            targetPath = "";
          }
        }
      }

      // Construct the full target URL with proper HTML entity decoding
      let fullTargetUrl = decodeHtmlEntities(targetUrl);

      if (targetPath) {
        // Only append path for regular APIs, not Logic App webhooks
        // Handle query parameter merging properly
        const hasQueryInTarget = fullTargetUrl.includes("?");
        const hasQueryInPath = targetPath.includes("?");

        if (hasQueryInTarget && hasQueryInPath) {
          // Both target URL and path have query params - merge them with &
          const [pathPart, queryPart] = targetPath.split("?", 2);
          fullTargetUrl = fullTargetUrl.endsWith("/")
            ? fullTargetUrl.slice(0, -1) + pathPart + "&" + queryPart
            : fullTargetUrl + pathPart + "&" + queryPart;
        } else {
          // Normal case - just append the path
          fullTargetUrl = fullTargetUrl.endsWith("/")
            ? fullTargetUrl.slice(0, -1) + targetPath
            : fullTargetUrl + targetPath;
        }
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

      // Prepare headers for the target API
      const targetHeaders = {
        // ...req.headers,
        "Content-Type": req.headers["content-type"] || "application/json",
        Accept: "application/json",
      };

      // Add authentication headers based on isAuthFree flag
      if (!isAuthFree && authToken) targetHeaders.Authorization = authToken;

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

      // Cache the result if caching is enabled
      if (isCacheable && targetResponse?.data) {
        try {
          const isSaved = await redisClient.set(
            cacheKey,
            targetResponse?.data,
            ttl
          );
          if (isSaved)
            console.log(
              `Data cached for datahub data by id ${datahubId} with TTL ${
                ttl === 0 ? "unlimited" : ttl + "s"
              }`
            );
        } catch (cacheError) {
          console.warn("Cache write error:", cacheError);
        }
      }

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
