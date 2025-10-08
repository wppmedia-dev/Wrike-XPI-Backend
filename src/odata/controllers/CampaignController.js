// src/odata/controllers/CampaignController.js
import { ODataController } from "odata-v4-server";
import { Campaign } from "../entities/Campaign.js";
import { GetAllCampaigns } from "../../routes/campaign/handlers/getAllCampaigns.js";
import { GetCampaign } from "../../routes/campaign/handlers/getCampaign.js";

export class CampaignController extends ODataController {
  async find(query, req, res) {
    const wrikeToken = req.context?.wrikeToken;
    if (!wrikeToken) throw new Error("Missing Wrike token in context");

    const params = req.query || {};
    const result = await GetAllCampaigns(wrikeToken, params, this.server);

    return result.data.map((item) => new Campaign(item));
  }

  async findOne(key, req, res) {
    const wrikeToken = req.context?.wrikeToken;
    if (!wrikeToken) throw new Error("Missing Wrike token in context");

    const params = { campaignId: key };
    const result = await GetCampaign(wrikeToken, params, this.server);
    if (!result?.data) return null;

    return new Campaign(result.data);
  }
}
