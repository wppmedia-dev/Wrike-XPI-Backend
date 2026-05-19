import { getDatahubCustomFields, updateTask } from "../../../utils/wrike";

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

      Object.keys(formFields).forEach((field) => {
        // for (const field in formFields) {
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
              taskCFUpdateData.push({
                id: datahubCustomFieldsData[field?.trim()?.toLowerCase()]?.cfId,
                value: formFields[field],
              });
              break;
          }
        }
      });

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

        let cfValue;
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
            cfValue =
              updatedTaskData?.data[0]?.customFields?.find(
                (field) => field.id === value.cfId,
              )?.value ?? "";
            break;
          default:
            fieldValue = "";
        }

        // if (value.isReadable && value.isTaskField)
        taskCustomFieldValues[key] = cfValue;
      }

      // Sending final response
      resolve({
        data: {
          type: "Task",
          ...taskCustomFieldValues,
          // // customfieldlist: outputData?.data[0]?.customFields,
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
          // taskfeedbackstatus: taskCustomFieldValues["taskfeedbackstatus"],
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
