import { GetResponse } from "../../../utils/node-fetch";
import { defaultParser } from "@odata/parser";
import { getDatahubDataById } from "../../../utils/wrike";

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

export const GetAllTasks = (wrikeToken, params, fastify) => {
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
        channelId,
        nextPageToken,
      } = params;

      if (
        !channelId ||
        channelId.includes("channel_id") ||
        channelId.includes("channelId")
      )
        return reject({
          statusCode: 400,
          message: "Missing required parameter: channelId",
        });

      let filters;
      let customFieldsParam;

      if (filterParams) {
        filters = defaultParser.filter(filterParams);

        if (!filters)
          return reject({
            statusCode: 400,
            message: "Request is not supported!",
          });

        // if (Object.keys(datahubCustomFieldsData).length === 0)
        datahubCustomFieldsData = await getDatahubDataById(
          wrikeToken,
          process.env.DATAHUB_CUSTOM_FIELDS_ID
        );

        customFieldsParam = extractFilters(filters);
      }

      if (!datahubCustomFieldsData["workitemlevel"]["cfId"])
        return reject({
          statusCode: 400,
          message:
            "Missing required datahub customfield mapping field: workitemlevel",
        });

      let wrikeUrl = `${process.env.WRIKE_ENDPOINT}/folders/${channelId}/tasks?fields=[customFields]&nextPageToken=${nextPageToken || ""}`;

      if (pageSize && pageSize > 0) wrikeUrl += `&pageSize=${pageSize}`;

      customFieldsParam.push({
        id: datahubCustomFieldsData["workitemlevel"]["cfId"],
        comparator: "EqualTo",
        value: "Task",
      });

      if (customFieldsParam && customFieldsParam.length > 0) {
        wrikeUrl += `&customFields=${JSON.stringify(customFieldsParam)}`;
      }

      // Get task data
      const wrikeTaskData = await GetResponse(wrikeUrl, "GET", {
        "content-type": "application/json",
        Authorization: `Bearer ${wrikeToken}`,
      });

      // Sending task update error response
      if (wrikeTaskData?.errorDescription)
        return reject({ message: wrikeTaskData?.errorDescription });

      const tasks = wrikeTaskData?.data.map((task) => {
        if (task?.scope == "RbTask") return;

        const taskCustomFieldValues = Object.entries(
          datahubCustomFieldsData
        ).reduce((acc, [key, value]) => {
          if (!value.isReadable || !value.isTaskField) return acc;

          const fieldValue =
            task?.customFields?.find((field) => field.id === value.cfId)
              ?.value ?? "";

          // if (fieldValue) {
          acc[key] = fieldValue;
          // }

          return acc;
        }, {});

        return {
          ...taskCustomFieldValues,
          taskId: task.id,
          // // customfieldlist: task?.customFields,
          // noofcrs: taskCustomFieldValues["noofcrs"],
          // agency: taskCustomFieldValues["agency"],
          // mediabuyingtype: taskCustomFieldValues["mediabuyingtype"],
          // brand: taskCustomFieldValues["brand"],
          // briefeddate: taskCustomFieldValues["briefeddate"],
          // taskbudget: taskCustomFieldValues["taskbudget"],
          // taskenddate: taskCustomFieldValues["taskenddate"],
          // taskid: taskCustomFieldValues["taskid"],
          // taskname: taskCustomFieldValues["taskname"],
          // taskobjective: taskCustomFieldValues["taskobjective"],
          // taskstartdate: taskCustomFieldValues["taskstartdate"],
          // taskfeedbackstatus:
          //   taskCustomFieldValues["taskfeedbackstatus"],
          // ccuid: taskCustomFieldValues["ccuid"],
          // mediachannelpractice: taskCustomFieldValues["mediachannelpractice"],
          // client: taskCustomFieldValues["client"],
          // comments: taskCustomFieldValues["comments"],
          // cssid: taskCustomFieldValues["cssid"],
          // currency: taskCustomFieldValues["currency"],
          // customerponumber: taskCustomFieldValues["customerponumber"],
          // debtor: taskCustomFieldValues["debtor"],
          // kpiobjective: taskCustomFieldValues["kpiobjective"],
          // originalagency: taskCustomFieldValues["originalagency"],
          // readyforarchive: taskCustomFieldValues["readyforarchive"],
          // region: taskCustomFieldValues["region"],
          // requestedstartdate: taskCustomFieldValues["requestedstartdate"],
          // requestormarket: taskCustomFieldValues["requestormarket"],
          // spacename: taskCustomFieldValues["spacename"],
          // workitemlevel: taskCustomFieldValues["workitemlevel"],
        };
      });

      // Sending final response
      resolve({
        type: "Task",
        nextPageToken: wrikeTaskData.nextPageToken,
        data: tasks,
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
