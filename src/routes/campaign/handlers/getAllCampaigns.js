import { GetResponse } from "../../../utils/node-fetch";
import { defaultParser } from "@odata/parser";
import { getCustomFieldsDatahub } from "../utils/getDHCustomFields";

// Operator mapping from OData to your custom operators
const odataToCustomOp = {
  EqualsExpression: "EqualTo",
  NotEqualsExpression: "NotInRange",
  LesserThanExpression: "LessThan",
  LesserOrEqualsExpression: "LessOrEqualTo",
  GreaterThanExpression: "GreaterThan",
  GreaterOrEqualsExpression: "GreaterOrEqualTo",
  HasExpression: "Contains",
  startswith: "StartsWith",
  endswith: "EndsWith",
};

let datahubCustomFieldsData = {};

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
      const { filter: filterParams, pageSize } = params;

      let filters;
      let customFieldsParam = undefined;

      if (filterParams) {
        filters = defaultParser.filter(filterParams);

        if (!filters)
          return reject({
            statusCode: 400,
            message: "Request is not supported!",
          });

        // if (Object.keys(datahubCustomFieldsData).length === 0)
        datahubCustomFieldsData = await getCustomFieldsDatahub(wrikeToken);

        customFieldsParam = extractFilters(filters);
      }

      let wrikeUrl = `${process.env.WRIKE_ENDPOINT}/spaces/${process.env.CAMPAIGN_SPACE_ID}/folders?deleted=false&fields=[customFields]&nextPageToken=`;

      if (pageSize && pageSize > 0) wrikeUrl += `&pageSize=${pageSize}`;

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
        const folderCustomFieldValues = Object.entries(
          datahubCustomFieldsData
        ).reduce((acc, [key, value]) => {
          if (!value.isReadable || !value.isCampaignField) return acc;

          const fieldValue =
            folder?.customFields?.find((field) => field.id === value.cfId)
              ?.value ?? "";

          // if (fieldValue) {
          acc[key] = fieldValue;
          // }

          return acc;
        }, {});

        return {
          ...folderCustomFieldValues,
          // // customfieldlist: folder?.customFields,
          folderId: folder.id,
          // noofcrs: folderCustomFieldValues["noofcrs"],
          // agency: folderCustomFieldValues["agency"],
          // mediabuyingtype: folderCustomFieldValues["mediabuyingtype"],
          // brand: folderCustomFieldValues["brand"],
          // briefeddate: folderCustomFieldValues["briefeddate"],
          // campaignbudget: folderCustomFieldValues["campaignbudget"],
          // campaignenddate: folderCustomFieldValues["campaignenddate"],
          // campaignid: folderCustomFieldValues["campaignid"],
          // campaignname: folderCustomFieldValues["campaignname"],
          // campaignobjective: folderCustomFieldValues["campaignobjective"],
          // campaignstartdate: folderCustomFieldValues["campaignstartdate"],
          // campaignfeedbackstatus:
          //   folderCustomFieldValues["campaignfeedbackstatus"],
          // ccuid: folderCustomFieldValues["ccuid"],
          // mediachannelpractice: folderCustomFieldValues["mediachannelpractice"],
          // client: folderCustomFieldValues["client"],
          // comments: folderCustomFieldValues["comments"],
          // cssid: folderCustomFieldValues["cssid"],
          // currency: folderCustomFieldValues["currency"],
          // customerponumber: folderCustomFieldValues["customerponumber"],
          // debtor: folderCustomFieldValues["debtor"],
          // kpiobjective: folderCustomFieldValues["kpiobjective"],
          // originalagency: folderCustomFieldValues["originalagency"],
          // readyforarchive: folderCustomFieldValues["readyforarchive"],
          // region: folderCustomFieldValues["region"],
          // requestedstartdate: folderCustomFieldValues["requestedstartdate"],
          // requestormarket: folderCustomFieldValues["requestormarket"],
          // spacename: folderCustomFieldValues["spacename"],
          // workitemlevel: folderCustomFieldValues["workitemlevel"],
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

function getFieldName(node) {
  if (!node) return { name: null, id: null };
  if (node.name) {
    // Try to match by shortcode, key, or normalized key
    const name = node.name;
    // let entry = Object.entries(customFieldIds).find(
    //   ([key, val]) =>
    //     val.shortcode === name ||
    //     key === name ||
    //     key.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() === name
    // );
    if (!datahubCustomFieldsData[name]) {
      // If entry is null, throw an error for invalid filters
      throw {
        statusCode: 400,
        message: `Invalid filters: Field '${name}' is missing or incorrect.`,
      };
    }
    return { name, id: datahubCustomFieldsData[name].cfId };
  }
  if (node.value) return getFieldName(node.value);
  return { name: null, id: null };
}

function getValues(type, leftValue, rightValue) {
  // Comparison node
  const { id } = getFieldName(leftValue);

  const comparator = odataToCustomOp[type];

  if (!comparator) {
    throw {
      statusCode: 400,
      message: `Invalid filters: Unsupported operator '${type}' for field '${id}'.`,
    };
  }

  let value = rightValue.value;
  if (typeof value === "string" && value.startsWith("Edm.")) {
    value = rightValue.raw.replace(/^'|'$/g, "");
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
  } else if (comparator === "InRange") {
    if (Array.isArray(value)) {
      if (value.length > 0) filterObj.minValue = value[0];
      if (value.length > 1) filterObj.maxValue = value[1];
    } else {
      filterObj.minValue = value;
      filterObj.maxValue = value;
    }
  } else if (comparator === "NotInRange") {
    filterObj.minValue = value;
    filterObj.maxValue = value;
  } else if (comparator === "ContainsAll" || comparator === "ContainsAny") {
    filterObj.values = Array.isArray(value) ? value : [value];
  }

  return filterObj;
}

function extractFilters(node, result = []) {
  if (!node) return result;
  if (node.type === "BoolParenExpression") {
    return extractFilters(node.value, result);
  }

  if (node.type === "OrExpression") {
    throw {
      statusCode: 400,
      message: "Invalid filters: OR expressions are not supported.",
    };
  }

  if (node.type === "MethodCallExpression") {
    if (Array.isArray(node.value.parameters)) {
      result.push(
        getValues(
          node?.value?.method,
          node.value.parameters[0],
          node.value.parameters[1]
        )
      );
      return result;
    } else
      throw {
        statusCode: 400,
        message: `Invalid filters: Method call expression with parameters is not supported.`,
      };
  }

  if (node.type === "AndExpression" || node.type === "OrExpression") {
    extractFilters(node.value.left, result);
    extractFilters(node.value.right, result);
  } else if (odataToCustomOp[node.type]) {
    result.push(getValues(node.type, node.value.left, node.value.right));
  } else
    throw {
      statusCode: 400,
      message: `Invalid filters: Unsupported operator '${node.type}'.`,
    };

  return result;
}
