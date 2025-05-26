import { GetResponse } from "../../../utils/node-fetch";
import { defaultParser } from "@odata/parser";
import customFieldIdMeta from "../utils/customFieldsIds";

// Operator mapping from OData to your custom operators
const odataToCustomOp = {
  EqualsExpression: "EqualTo",
  NotEqualsExpression: "NotInRange",
  LessThanExpression: "LessThan",
  LessOrEqualExpression: "LessOrEqualTo",
  GreaterThanExpression: "GreaterThan",
  GreaterOrEqualExpression: "GreaterOrEqualTo",
  HasExpression: "Contains",
  StartsWithExpression: "StartsWith",
  EndsWithExpression: "EndsWith",
};

export const GetAllCampaigns = (wrikeToken, params, fastify) => {
  return new Promise(async (resolve, reject) => {
    try {
      if (!wrikeToken)
        return reject({
          statusCode: 403,
          message:
            "Failed authorization! User is not authorized to access the service.",
        });

      // Variable Declaration
      const { filter: filterParams, pageSize = 20 } = params;

      let filters;
      let customFieldsParam = undefined;
      const customFieldIds = customFieldIdMeta["live"];

      if (filterParams) {
        filters = defaultParser.filter(filterParams);

        if (!filters)
          return reject({
            statusCode: 400,
            message: "Request is not supported!",
          });

        customFieldsParam = extractFilters(filters, customFieldIds);
      }

      let wrikeUrl = `${process.env.WRIKE_ENDPOINT}/spaces/${process.env.CAMPAIGN_SPACE_ID}/folders?project=false&fields=[customFields]&pageSize=${pageSize}&nextPageToken=`;
      if (customFieldsParam && customFieldsParam.length > 0) {
        wrikeUrl += `&customFields=${JSON.stringify(customFieldsParam)}`;
      }

      // Get folder data
      const wrikeFolderData = await GetResponse(wrikeUrl, "GET", {
        "content-type": "application/json",
        Authorization: `Bearer ${wrikeToken}`,
      });

      // Sending folder update error response
      if (wrikeFolderData?.errorDescription)
        return reject({ message: wrikeFolderData?.errorDescription });

      // Optimize the for loop by using map instead of manual for...of and push
      const campaigns = wrikeFolderData?.data.map((folder) => {
        const folderCustomFieldValues = Object.entries(customFieldIds).reduce(
          (acc, [key, value]) => {
            acc[key] =
              folder?.customFields?.find((field) => field.id === value.id)
                ?.value ?? "";
            return acc;
          },
          {}
        );

        return {
          customfieldlist: folder?.customFields,
          noofcrs: folderCustomFieldValues["# CRs"],
          agency: folderCustomFieldValues["Agency*"],
          mediabuyingtype: folderCustomFieldValues["Biddable/Non-Biddable*"],
          brand: folderCustomFieldValues["Brand*"],
          briefeddate: folderCustomFieldValues["Briefed Date*"],
          campaignbudget: folderCustomFieldValues["Campaign Budget*"],
          campaignenddate: folderCustomFieldValues["Campaign End Date*"],
          campaignid: folderCustomFieldValues["Campaign ID*"],
          campaignname: folderCustomFieldValues["Campaign Name*"],
          campaignobjective: folderCustomFieldValues["Campaign Objective*"],
          campaignstartdate: folderCustomFieldValues["Campaign Start Date*"],
          campaignfeedbackstatus:
            folderCustomFieldValues["CampaignFeedbackStatus*"],
          ccuid: folderCustomFieldValues["CCUID*"],
          mediachannelpractice: folderCustomFieldValues["Channel/Practice*"],
          client: folderCustomFieldValues["Client*"],
          comments: folderCustomFieldValues["Comments*"],
          cssid: folderCustomFieldValues["CSSID*"],
          currency: folderCustomFieldValues["Currency"],
          customerponumber: folderCustomFieldValues["PO Number"],
          debtor: folderCustomFieldValues["Debtor*"],
          kpiobjective: folderCustomFieldValues["KPI Objective*"],
          originalagency: folderCustomFieldValues["Original Agency*"],
          readyforarchive: folderCustomFieldValues["ReadyForArchive*"],
          region: folderCustomFieldValues["Region*"],
          requestedstartdate: folderCustomFieldValues["Requested Start Date*"],
          requestormarket: folderCustomFieldValues["Requestor's Market*"],
          spacename: folderCustomFieldValues["Space Name*"],
          workitemlevel: folderCustomFieldValues["Work Item Level"],
        };
      });

      // Sending final response
      resolve({
        type: "Campaign",
        data: campaigns,
      });
    } catch (err) {
      console.log(err?.message || err);
      reject({
        message:
          "Fatal error Unexpected error occurred and service is unable complete the request.",
        details: err?.message,
      });
    }
  });
};

function getFieldName(node, customFieldIds) {
  if (!node) return { name: null, id: null };
  if (node.name) {
    // Try to match by shortcode, key, or normalized key
    const name = node.name;
    let entry = Object.entries(customFieldIds).find(
      ([key, val]) =>
        val.shortcode === name ||
        key === name ||
        key.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() === name
    );
    if (!entry) {
      // If entry is null, throw an error for invalid filters
      throw {
        statusCode: 400,
        message: `Invalid filters: Field '${name}' is missing or incorrect.`,
      };
    }
    return { name, id: entry[1].id };
  }
  if (node.value) return getFieldName(node.value, customFieldIds);
  return { name: null, id: null };
}

function extractFilters(node, customFieldIds, result = []) {
  if (!node) return result;
  if (node.type === "BoolParenExpression") {
    return extractFilters(node.value, customFieldIds, result);
  }

  if (node.type === "OrExpression") {
    throw {
      statusCode: 400,
      message: "Invalid filters: OR expressions are not supported.",
    };
  }

  if (node.type === "AndExpression" || node.type === "OrExpression") {
    extractFilters(node.value.left, customFieldIds, result);
    extractFilters(node.value.right, customFieldIds, result);
  } else if (odataToCustomOp[node.type]) {
    // Comparison node
    const { id } = getFieldName(node.value.left, customFieldIds);

    const comparator = odataToCustomOp[node.type];
    let value = node.value.right.value;
    if (typeof value === "string" && value.startsWith("Edm.")) {
      value = node.value.right.raw.replace(/^'|'$/g, "");
    } else if (typeof value === "string") {
      value = value.replace(/^'|'$/g, "");
    }
    const filterObj = { id, comparator };
    if (
      [
        "EqualTo",
        "LessThan",
        "LessOrEqualTo",
        "GreaterThan",
        "GreaterOrEqualTo",
        "Contains",
        "StartsWith",
        "EndsWith",
      ].includes(comparator)
    ) {
      filterObj.value = value;
    } else if (comparator === "InRange" || comparator === "NotInRange") {
      if (Array.isArray(value)) {
        if (value.length > 0) filterObj.minValue = value[0];
        if (value.length > 1) filterObj.maxValue = value[1];
      } else {
        filterObj.minValue = value;
        filterObj.maxValue = value;
      }
    } else if (comparator === "ContainsAll" || comparator === "ContainsAny") {
      filterObj.values = Array.isArray(value) ? value : [value];
    } else {
      throw {
        statusCode: 400,
        message: `Invalid filters: Unsupported operator '${comparator}' for field '${id}'.`,
      };
    }
    result.push(filterObj);
  }
  return result;
}
