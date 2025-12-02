// Handlers
import { GetAllCampaigns } from "../../routes/campaign/handlers/getAllCampaigns";
import { GetCampaign } from "../../routes/campaign/handlers/getCampaign";

// Schema
import { GetAllCampaignsSchema } from "../../routes/campaign/schema/getAllCampaigns";

export const odataCampaignRoute = (fastify, opts, done) => {
  fastify.get("*", async (req, reply) => {
    try {
      const path = req.params["*"]; // everything after /Campaigns/

      // Check if it's OData entity format: Something(abc)
      const match = path.match(/^\((.+)\)$/);
      if (!match) return reply.callNotFound(); // let other routes handle

      const campaignId = match[1].replace(/^'|'$/g, ""); // remove quotes

      const result = await GetCampaign(
        req?.wrikeToken,
        { ...req.query, campaignId },
        fastify
      );

      const baseUrl = getBaseUrl(req);

      return {
        "@odata.context": `${baseUrl}/api/v2/wrikexpi/$metadata#Campaigns`,
        ...result?.data,
      };
    } catch (err) {
      const baseUrl = getBaseUrl(req);
      return {
        "@odata.context": `${baseUrl}/api/v2/wrikexpi/$metadata#Campaigns`,
      };
    }
  });

  fastify.get("/", GetAllCampaignsSchema, async (req, reply) => {
    try {
      const result = await GetAllCampaigns(
        req?.wrikeToken,
        { ...req.params, ...req.query, isOdata: true },
        fastify
      );

      const baseUrl = getBaseUrl(req);

      let response = {
        "@odata.context": `${baseUrl}/api/v2/wrikexpi/$metadata#Campaigns`,
        value: result?.data || [],
      };

      if (result?.nextPageToken) {
        let nextUrl = `${baseUrl}/api/v2/wrikexpi/Campaigns?$skiptoken=${result.nextPageToken}`;

        // Append $top ONLY if user sent it
        if (req.query["$top"]) {
          nextUrl += `&$top=${req.query["$top"]}`;
        }

        response["@odata.nextLink"] = nextUrl;
      }
      return response;
    } catch (err) {
      const baseUrl = getBaseUrl(req);

      return {
        "@odata.context": `${baseUrl}/api/v2/wrikexpi/$metadata#Campaigns`,
        value: [],
      };
    }
  });

  done();
};

function getBaseUrl(req) {
  const port = req.socket.localPort;
  const isDefaultPort = port === 80 || port === 443;

  return `${req.protocol}://${req.hostname}${isDefaultPort ? "" : ":" + port}`;
}

export default odataCampaignRoute;
