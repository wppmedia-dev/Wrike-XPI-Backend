"use strict";

import { odataCampaignRoute } from "./campaign";
import fs from "fs";
import path from "path";

// Auth Middleware
import { ValidateToken } from "../../middlewares/authentication";
import { getDatahubCustomFields } from "../../utils/wrike.js";

//Public Routes
export const OdataRouters = (fastify, opts, done) => {
  fastify.get("/wrikexpi", async (req, reply) => {
    const baseUrl = getBaseUrl(req);

    reply
      .header("Content-Type", "application/json")
      .header("OData-Version", "4.0")
      .send({
        "@odata.context": `${baseUrl}/api/v2/wrikexpi/$metadata`,
        value: [
          {
            name: "Campaigns",
            kind: "EntitySet",
            url: "Campaigns",
          },
        ],
      });
  });

  fastify.get("/wrikexpi/", async (req, reply) => {
    const baseUrl = getBaseUrl(req);

    reply
      .header("Content-Type", "application/json")
      .header("OData-Version", "4.0")
      .send({
        "@odata.context": `${baseUrl}/api/v2/wrikexpi/$metadata`,
        value: [
          {
            name: "Campaigns",
            kind: "EntitySet",
            url: "Campaigns",
          },
        ],
      });
  });

  fastify.get("/wrikexpi/$metadata", async (req, reply) => {
    reply.header("Content-Type", "application/xml");
    // Load the metadata module fresh so any dynamic updates are reflected
    try {
      const metaPath = path.join(__dirname, "../metadata/campaignMetadata.js");
      delete require.cache[require.resolve(metaPath)];
      const metadata = require(metaPath);
      return metadata;
    } catch (err) {
      // Fallback: return static XML header if metadata file is missing or invalid
      reply.code(500);
      return `<?xml version="1.0" encoding="utf-8"?><edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx"><edmx:DataServices/></edmx:Edmx>`;
    }
  });

  // Validating Token
  fastify.addHook("onRequest", (req, reply) =>
    ValidateToken(req, reply, fastify)
  );

  fastify.register(odataCampaignRoute, { prefix: "/wrikexpi/Campaigns" });

  if (process.env.AutoCamapaignMetadataGenerate === "true")
    syncCampaignMetaData().catch(console.log);

  done();
};

function getBaseUrl(req) {
  const port = req.socket.localPort;
  const isDefaultPort = port === 80 || port === 443;

  return `${req.protocol}://${req.hostname}${isDefaultPort ? "" : ":" + port}`;
}

const syncCampaignMetaData = async () => {
  const datahubCustomFieldsData = await getDatahubCustomFields(
    null,
    process.env.DATAHUB_CUSTOM_FIELDS_ID
  );

  const folderCustomFieldValues = Object.entries(datahubCustomFieldsData)
    .filter(([_, value]) => value.isCampaignField === true)
    .map(([key, value]) => ({
      key: key,
      type: value.cfType,
    }));

  // now construct the campaignMetadata.js file content dynamically based on the folderCustomFieldValues
  try {
    const typeMap = {
      Text: "Edm.String",
      DropDown: "Edm.String",
      Multiple: "Edm.String",
      Numeric: "Edm.String",
      Date: "Edm.String",
    };

    // Build props array: always put id first, but only add it manually if not in folderCustomFieldValues
    const mappedFields = folderCustomFieldValues.map((f) => ({
      name: f.key,
      type: typeMap[f.type] || "Edm.String",
    }));

    const hasId = mappedFields.some((p) => p.name === "id");
    let props;
    if (hasId) {
      // id already exists; move it to the front and remove from mappedFields
      const idProp = mappedFields.find((p) => p.name === "id");
      const otherProps = mappedFields.filter((p) => p.name !== "id");
      props = [idProp].concat(otherProps);
    } else {
      // id doesn't exist; prepend it manually
      props = [{ name: "id", type: "Edm.String" }].concat(mappedFields);
    }

    const propertiesXml = props
      .map((p) => {
        return `      <Property Name="${p.name}" Type="${p.type}"/>`;
      })
      .join("\n");

    const xml = `<?xml version="1.0" encoding="utf-8"?>\n<edmx:Edmx Version="4.0"\n xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx">\n <edmx:DataServices>\n  <Schema Namespace="UntypedNS"\n   xmlns="http://docs.oasis-open.org/odata/ns/edm">\n\n    <!-- Allow dynamic properties -->\n    <EntityType Name="Campaign">\n      <Key><PropertyRef Name="id"/></Key>\n${propertiesXml}\n    </EntityType>\n\n    <EntityContainer Name="Container">\n      <EntitySet Name="Campaigns" EntityType="UntypedNS.Campaign"/>\n    </EntityContainer>\n\n  </Schema>\n </edmx:DataServices>\n</edmx:Edmx>`;

    const outPath = path.join(__dirname, "../metadata/campaignMetadata.js");
    const fileContent = `module.exports = \`${xml}\`;\n`;

    // To avoid triggering file-watchers (e.g. nodemon) repeatedly,
    // only overwrite the metadata file when its content actually changed.

    const existing = await fs.promises.readFile(outPath, "utf8");

    if (existing === fileContent) {
      console.log("Campaign metadata unchanged; skipping write.");
    } else {
      await fs.promises.writeFile(outPath, fileContent, "utf8");
      console.log(
        "Campaign Metadata has been synced successfully (file updated)."
      );
    }
  } catch (err) {
    console.log("Failed to sync campaign metadata", err.message || err);
  }

  console.log("Campaign Metadata has been synced successfully.");
};
