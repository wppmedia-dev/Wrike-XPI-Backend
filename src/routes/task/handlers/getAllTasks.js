import { GetResponse } from "../../../utils/node-fetch";
import { parseODataFilters } from "../../../utils/odataFilter";
import {
  getCustomFields,
  getDatahubCustomFields,
  getFolder,
  getTask,
  getTasksByFolderId,
} from "../../../utils/wrike";
import {
  translateDatahubRecordId,
  translateDatahubValue,
} from "../../campaign/utils/datahubRecordTranslator";

export const GetAllTasks = (wrikeToken, params, taskType) => {
  return new Promise(async (resolve, reject) => {
    try {
      if (!wrikeToken)
        return reject({
          statusCode: 403,
          message:
            "Failed authorization! User is not authorized to access the service.",
        });

      if (!taskType)
        return reject({
          statusCode: 400,
          message: "Invalid Task type",
        });
      // Variable Declaration
      const { filter: filterParams, pageSize, nextPageToken } = params;

      let channelId = params?.channelId || params?.campaignId;

      if (
        !channelId ||
        channelId.includes("channel_id") ||
        channelId.includes("channelId")
      )
        return reject({
          statusCode: 400,
          message: "Missing required parameter: channelId",
        });

      let customFieldsParam = [];

      const datahubCustomFieldsData = await getDatahubCustomFields(
        wrikeToken,
        null,
        false,
        true,
        null,
        null,
      );

      if (Object.keys(datahubCustomFieldsData).length === 0) {
        return reject({
          statusCode: 400,
          message:
            "Failed to retrieve datahub custom fields mapping configuration.",
        });
      }

      if (filterParams) {
        customFieldsParam = parseODataFilters(
          filterParams,
          datahubCustomFieldsData,
        );
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
        value: "Task",
      });

      let getChannelTaskData, subTaskId;

      if (taskType == "channel") {
        try {
          getChannelTaskData = await getTask(wrikeToken, channelId);
        } catch (err) {
          if (err?.errorDescription == "Invalid Task ID") {
            getChannelTaskData = await getFolder(wrikeToken, channelId);
          }
        }

        const channelCFValue = getChannelTaskData?.data[0]?.customFields.find(
          (cf) => cf.id == datahubCustomFieldsData["workitemlevel"]["cfId"],
        )?.value;

        if (channelCFValue != "Channel/Media Type")
          throw { message: "Invalid channel ID" };

        if (getChannelTaskData?.errorDescription) throw err;
        // console.log(
        //   "Error while retriving chennel task",
        //   getChannelTaskData?.errorDescription,
        // );

        subTaskId = getChannelTaskData?.data[0]?.subTaskIds;
      }

      // Get task data
      let wrikeTaskData;

      if (taskType == "channel" && subTaskId)
        // Channel id may change in the previous if condition
        wrikeTaskData = await getTask(wrikeToken, subTaskId);
      else
        wrikeTaskData = await getTasksByFolderId(
          wrikeToken,
          channelId,
          pageSize,
          nextPageToken,
          true,
          false,
          null,
          customFieldsParam,
        );

      // Sending task update error response
      if (wrikeTaskData?.errorDescription)
        return reject({ message: wrikeTaskData?.errorDescription });

      const tasks = await Promise.all(
        wrikeTaskData?.data.map(async (task) => {
          if (task?.scope == "RbTask") return;

          const entries = await Promise.all(
            Object.entries(datahubCustomFieldsData).map(
              async ([key, value]) => {
                if (!value.isReadable || !value.isTaskField)
                  return [key, undefined];

                let fieldValue, cfData;
                switch (value.xpiFieldType) {
                  case "Wrike API Built-in Field":
                    fieldValue = task[value?.cfId];
                    break;
                  case "Wrike API Metadata Field":
                    fieldValue =
                      task?.metadata?.find((field) => field.key === value?.cfId)
                        ?.value ?? "";
                    break;
                  case "Wrike Custom Field":
                    cfData =
                      task?.customFields?.find(
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
        type: "Task",
        nextPageToken: wrikeTaskData.nextPageToken,
        data: !tasks[0] ? [] : tasks,
      });
    } catch (err) {
      console.log(err?.message || err);
      reject({
        message:
          "Fatal error Unexpected error occurred and service is unable complete the request.",
        details: err,
      });
    }
  });
};
