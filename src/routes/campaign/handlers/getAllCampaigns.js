import { GetResponse } from "../../../utils/node-fetch";
import { defaultParser } from "@odata/parser";
import { getDatahubCustomFields } from "../../../utils/wrike";

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
      let {
        filter: filterParams,
        pageSize = 10,
        nextPageToken,
        isOdata = false,
        $skiptoken,
        $top = 10,
      } = params;

      let filters;
      let customFieldsParam = [];

      if ($skiptoken) nextPageToken = $skiptoken;
      if ($top) pageSize = $top;

      datahubCustomFieldsData = await getDatahubCustomFields(
        wrikeToken,
        process.env.DATAHUB_CUSTOM_FIELDS_ID
      );

      if (filterParams) {
        filters = defaultParser.filter(filterParams);

        if (!filters)
          return reject({
            statusCode: 400,
            message: "Request is not supported!",
          });

        customFieldsParam = extractFilters(filters);
      }

      if (Object.keys(datahubCustomFieldsData).length === 0) {
        return reject({
          statusCode: 500,
          message:
            "Failed to retrieve datahub custom fields mapping configuration.",
        });
      }

      if (!datahubCustomFieldsData?.workitemlevel?.cfId)
        return reject({
          statusCode: 400,
          message:
            "Missing required datahub customfield mapping field: workitemlevel",
        });

      let wrikeUrl = `${process.env.WRIKE_ENDPOINT}/spaces/${
        process.env.CAMPAIGN_SPACE_ID
      }/folders?deleted=false&fields=[customFields]&nextPageToken=${
        nextPageToken || ""
      }`;

      if (pageSize && pageSize > 0) wrikeUrl += `&pageSize=${pageSize}`;

      customFieldsParam.push({
        id: datahubCustomFieldsData?.workitemlevel?.cfId,
        comparator: "EqualTo",
        value: "Campaign",
      });

      if (customFieldsParam && customFieldsParam.length > 0)
        wrikeUrl += `&customFields=${JSON.stringify(customFieldsParam)}`;

      // Get folder data
      const wrikeFolderData = await GetResponse(wrikeUrl, "GET", {
        "content-type": "application/json",
        Authorization: `Bearer ${wrikeToken}`,
      });

      // Sending folder update error response
      if (wrikeFolderData?.errorDescription)
        return reject({ message: wrikeFolderData?.errorDescription });

      // Build campaigns array: filter out non-campaign folders and wrap each
      // item as { id, data } where data contains the mapped fields.
      const campaigns = (wrikeFolderData?.data || [])
        .filter((folder) => folder && folder?.scope !== "RbFolder")
        .map((folder) => {
          const folderCustomFieldValues = Object.entries(
            datahubCustomFieldsData
          ).reduce((acc, [key, value]) => {
            if (!value.isReadable || !value.isCampaignField) return acc;

            let fieldValue;
            switch (value.xpiFieldType) {
              case "Wrike API Built-in Field":
                fieldValue = folder[value?.cfId];
                break;
              case "Wrike API Metadata Field":
                fieldValue =
                  folder?.metadata?.find((field) => field.key === value?.cfId)
                    ?.value ?? "";
                break;
              case "Wrike Custom Field":
                fieldValue =
                  folder?.customFields?.find(
                    (field) => field.id === value?.cfId
                  )?.value ?? "";
                break;
              default:
                fieldValue = "";
            }

            acc[key] = fieldValue;

            return acc;
          }, {});

          const { id: _removedId, ...dataObj } = folderCustomFieldValues;

          // Add the OData type marker to every returned item in the array
          // if (isOdata) dataObj["@odata.type"] = "#UntypedNS.UntypedEntity";

          /*
          // OData-specific response (commented out for now)
          if (isOdata) {
            dataObj["@odata.type"] = "#UntypedNS.UntypedEntity";
            return {
              id: folder.id,
              data: dataObj,
            };
          }
          */

          return {
            id: folder.id,
            ...dataObj,
          };
        });

      // Sending final response
      resolve({
        type: "Campaign",
        nextPageToken: wrikeFolderData.nextPageToken,
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
