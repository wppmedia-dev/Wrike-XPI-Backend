import { GetResponse } from "../../../utils/node-fetch";
import { defaultParser } from "@odata/parser";
import {
  getCustomFields,
  getDatahubCustomFields,
  getFoldersByFolderId,
  getTasksByFolderId,
} from "../../../utils/wrike";
import {
  translateDatahubRecordId,
  translateDatahubValue,
} from "../../campaign/utils/datahubRecordTranslator";

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

export const GetAllChannels = (wrikeToken, params, environmentName) => {
  return new Promise(async (resolve, reject) => {
    try {
      if (!wrikeToken)
        return reject({
          statusCode: 403,
          message:
            "Failed authorization! User is not authorized to access the service.",
        });

      // Variable Declaration
      const {
        filter: filterParams,
        pageSize,
        campaignId,
        nextPageToken,
      } = params;

      if (
        !campaignId ||
        campaignId.includes("campaign_id") ||
        campaignId.includes("campaignId")
      )
        return reject({
          statusCode: 400,
          message: "Missing required parameter: campaignId",
        });

      let filters;
      let customFieldsParam = [];

      datahubCustomFieldsData = await getDatahubCustomFields(
        wrikeToken,
        null,
        false,
        true,
        null,
        environmentName,
      );

      if (Object.keys(datahubCustomFieldsData).length === 0) {
        return reject({
          statusCode: 500,
          message:
            "Failed to retrieve datahub custom fields mapping configuration.",
        });
      }

      if (filterParams) {
        filters = defaultParser.filter(filterParams);

        if (!filters)
          return reject({
            statusCode: 400,
            message: "Request is not supported!",
          });

        customFieldsParam = extractFilters(filters);
      }

      if (!datahubCustomFieldsData?.workitemlevel?.cfId)
        return reject({
          statusCode: 400,
          message:
            "Missing required datahub customfield mapping field: workitemlevel",
        });

      const customFieldsMaster = await getCustomFields(wrikeToken);

      if (customFieldsMaster?.errorDescription) {
        throw { message: customFieldsMaster.errorDescription };
      }

      // map of custom fields for quick lookup
      const cfMap = new Map(
        (customFieldsMaster?.data || []).map((cf) => [cf.id, cf]),
      );

      for (const cf of customFieldsParam) {
        const cfMetaData = cfMap.get(cf?.id);

        const databaseId =
          cfMetaData?.settings?.linkToDatabaseInfo?.dataHubDatabaseId;

        if (!databaseId) continue;

        const cfValue = cf?.value;
        if (databaseId && cfValue) {
          const recordId = await translateDatahubValue(
            wrikeToken,
            databaseId,
            cfValue,
          );

          if (!recordId)
            throw {
              message:
                "The selected filters are invalid. Please review your filter values and try again.",
            };

          delete cf.value;
          cf.values = [recordId];
        }
      }

      customFieldsParam.push({
        id: datahubCustomFieldsData["workitemlevel"]["cfId"],
        comparator: "EqualTo",
        value: "Channel/Media Type",
      });

      // Get folder data
      const channelData = await getTasksByFolderId(
        wrikeToken,
        campaignId,
        pageSize,
        nextPageToken,
        true,
        true,
        null,
        customFieldsParam,
      );

      // Sending folder update error response
      if (channelData?.errorDescription)
        return reject({ message: channelData?.errorDescription });

      // Optimize the for loop by using map instead of manual for...of and push
      const channels = await Promise.all(
        channelData?.data.map(async (folder) => {
          if (folder?.scope == "RbFolder") return;

          const entries = await Promise.all(
            Object.entries(datahubCustomFieldsData).map(
              async ([key, value]) => {
                if (!value.isReadable || !value.isChannelField)
                  return [key, undefined];

                let fieldValue, cfData;
                switch (value.xpiFieldType) {
                  case "Wrike API Built-in Field":
                    fieldValue = folder[value?.cfId];
                    break;
                  case "Wrike API Metadata Field":
                    fieldValue =
                      folder?.metadata?.find(
                        (field) => field.key === value?.cfId,
                      )?.value ?? "";
                    break;
                  case "Wrike Custom Field":
                    cfData =
                      folder?.customFields?.find(
                        (field) => field.id === value?.cfId,
                      ) ?? "";
                    fieldValue = cfData?.value ?? "";
                    break;
                  default:
                    fieldValue = "";
                }

                if (
                  fieldValue &&
                  fieldValue.startsWith("[") &&
                  fieldValue.endsWith("]")
                ) {
                  const cfMetaData = cfMap.get(cfData?.id);
                  const databaseId =
                    cfMetaData?.settings?.linkToDatabaseInfo?.dataHubDatabaseId;

                  if (databaseId) {
                    fieldValue = await translateDatahubRecordId(
                      wrikeToken,
                      databaseId,
                      fieldValue,
                    );
                  }
                }

                return [key, fieldValue];
              },
            ),
          );
          return Object.fromEntries(entries);
        }),
      );

      // Sending final response
      resolve({
        type: "Channel",
        nextPageToken: channelData.nextPageToken,
        data: !channels[0] ? [] : channels,
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
          node.value.parameters[1],
        ),
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
