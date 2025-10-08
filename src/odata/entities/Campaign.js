// src/odata/entities/Campaign.js
import { Edm } from "odata-v4-server";

export class Campaign {
  @Edm.Key
  @Edm.String
  id;

  @Edm.String
  title;

  @Edm.String
  status;

  // Dynamic fields (won't appear in Excel)
  dynamicFields;

  constructor(data = {}) {
    this.id = data.id || data.campaignId || null;
    this.title = data.title || "";
    this.status = data.status || "";
    this.dynamicFields = data.dynamicFields || {};
  }
}
