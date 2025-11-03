// Handlers
import { GetAllCampaigns } from "../../routes/campaign/handlers/getAllCampaigns";
import { GetCampaign } from "../../routes/campaign/handlers/getCampaign";

// Schema
import { GetCampaignSchema } from "../../routes/campaign/schema/getCampaign";
import { GetAllCampaignsSchema } from "../../routes/campaign/schema/getAllCampaigns";

export const odataCampaignRoute = (fastify, opts, done) => {
  fastify.get("/*", GetCampaignSchema, async (req, reply) => {
    try {
      const match = req.url.match(/Products\((\d+)\)/);
      if (!match) return; // Let other routes handle if not this pattern

      const id = Number(match[1]);

      const result = await GetCampaign(
        req?.wrikeToken,
        { ...req.params, ...req.query, id },
        fastify
      );

      const baseUrl = getBaseUrl(req);

      return {
        "@odata.context": `${baseUrl}/api/v2/wrikexpi/$metadata#Campaigns`,
        value: result,
      };
    } catch (err) {
      const baseUrl = getBaseUrl(req);
      return {
        "@odata.context": `${baseUrl}/api/v2/wrikexpi/$metadata#Campaigns`,
        value: {},
      };
    }
  });

  fastify.get("/", GetAllCampaignsSchema, async (req, reply) => {
    try {
      const result = await GetAllCampaigns(
        req?.wrikeToken,
        { ...req.params, ...req.query },
        fastify
      );

      const baseUrl = getBaseUrl(req);

      return {
        "@odata.context": `${baseUrl}/api/v2/wrikexpi/$metadata#Campaigns`,
        value: result,
      };
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
