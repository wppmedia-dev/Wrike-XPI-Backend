import {
  getCustomFields,
  getDatahubCustomFields,
  updateTask,
} from "../../../utils/wrike";
import {
  translateDatahubRecordId,
  translateDatahubValue,
} from "../../campaign/utils/datahubRecordTranslator";

export const UpdateTask = (wrikeToken, params, environmentName) => {
  return new Promise(async (resolve, reject) => {
    try {
      if (!wrikeToken)
        return reject({
          statusCode: 403,
          message:
            "Failed authorization! User is not authorized to access the service.",
        });

      // Variable Declaration

      const { taskId, formFields } = params;

      // Getting cutom fields data from Datahub
      // if (Object.keys(datahubCustomFieldsData).length === 0) {
      const datahubCustomFieldsData = await getDatahubCustomFields(
        wrikeToken,
        null,
        false,
        true,
        null,
        environmentName,
      );
      // }

      let taskFieldsUpdateData = {};
      let taskMetadataUpdateData = [];
      let taskCFUpdateData = [];

      const customFieldsMaster = await getCustomFields(wrikeToken);

      if (customFieldsMaster?.errorDescription) {
        throw { message: customFieldsMaster.errorDescription };
      }

      // map of custom fields for quick lookup
      const cfMap = new Map(
        (customFieldsMaster?.data || []).map((cf) => [cf.id, cf]),
      );

      // Object.keys(formFields).forEach(async (field) => {
      for (const field of Object.keys(formFields)) {
        if (
          datahubCustomFieldsData[field?.trim()?.toLowerCase()] &&
          datahubCustomFieldsData[field?.trim()?.toLowerCase()]?.isTaskField ===
            true &&
          datahubCustomFieldsData[field?.trim()?.toLowerCase()]?.isWritable ===
            true
        ) {
          const xpiFieldType =
            datahubCustomFieldsData[field?.trim()?.toLowerCase()]?.xpiFieldType;

          switch (xpiFieldType) {
            case "Wrike API Built-in Field":
              taskFieldsUpdateData[
                datahubCustomFieldsData[field?.trim()?.toLowerCase()]?.cfId
              ] = formFields[field];
              break;
            case "Wrike API Metadata Field":
              taskMetadataUpdateData.push({
                key: datahubCustomFieldsData[field?.trim()?.toLowerCase()]
                  ?.cfId,
                value: formFields[field],
              });
              break;
            case "Wrike Custom Field":
              const cfId =
                datahubCustomFieldsData[field?.trim()?.toLowerCase()]?.cfId;
              const cfMetaData = cfMap.get(cfId);

              const databaseId =
                cfMetaData?.settings?.linkToDatabaseInfo?.dataHubDatabaseId;

              let cfValue = formFields[field];
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

                cfValue = JSON.stringify([recordId]);
              }

              taskCFUpdateData.push({
                id: cfId,
                value: cfValue,
              });
              break;
          }
        }
      }

      // Submit Request Form
      const updatedTaskData = await updateTask(
        wrikeToken,
        taskId,
        taskFieldsUpdateData,
        taskMetadataUpdateData,
        taskCFUpdateData,
      );

      // Sending submit request form error response
      if (updatedTaskData?.errorDescription) {
        return reject({ message: updatedTaskData?.errorDescription });
      }

      const taskCustomFieldValues = {};

      for (const [key, value] of Object.entries(datahubCustomFieldsData)) {
        if (!value.isReadable || !value.isTaskField) continue;

        let cfValue, cfData;
        switch (value.xpiFieldType) {
          case "Wrike API Built-in Field":
            cfValue = updatedTaskData?.data[0][value?.cfId];
            break;
          case "Wrike API Metadata Field":
            cfValue =
              updatedTaskData?.data[0]?.metadata?.find(
                (field) => field.key === value?.cfId,
              )?.value ?? "";
            break;
          case "Wrike Custom Field":
            cfData =
              updatedTaskData?.data[0]?.customFields?.find(
                (field) => field.id === value.cfId,
              ) ?? "";
            cfValue = cfData?.value ?? "";
            break;
          default:
            fieldValue = "";
        }

        if (cfValue && cfValue?.startsWith("[") && cfValue?.endsWith("]")) {
          const cfMetaData = cfMap.get(cfData?.id);

          const databaseId =
            cfMetaData?.settings?.linkToDatabaseInfo?.dataHubDatabaseId;

          if (databaseId && cfValue)
            cfValue = await translateDatahubRecordId(
              wrikeToken,
              databaseId,
              cfValue,
            );
        }

        // if (value.isReadable && value.isTaskField)
        taskCustomFieldValues[key] = cfValue;
      }

      // Sending final response
      resolve({
        data: {
          type: "Task",
          ...taskCustomFieldValues,
        },
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
