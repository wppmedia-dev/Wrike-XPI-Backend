// src/odata/server.js
import { ODataServer } from "odata-v4-server";
import { CampaignController } from "./controllers/CampaignController.js";

export class WrikeODataServer extends ODataServer {
  static processKey(key) {
    if (key.startsWith("'") && key.endsWith("'")) {
      return key.slice(1, -1);
    }
    return key;
  }
}

WrikeODataServer.addController(CampaignController, "campaigns");
