import { updateFolder, updateTask } from "../../../utils/wrike";
import { getCustomFieldsDatahub } from "../utils/getDHCustomFields";

export const UpdateTask = (wrikeToken, params, fastify) => {
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
      const datahubCustomFieldsData = await getCustomFieldsDatahub(wrikeToken);
      // }

      let taskCFUpdateData = [];

      Object.keys(formFields).forEach((field) => {
        // for (const field in formFields) {
        if (
          datahubCustomFieldsData[field?.trim()?.toLowerCase()] &&
          datahubCustomFieldsData[field?.trim()?.toLowerCase()]?.isTaskField ===
            true &&
          datahubCustomFieldsData[field?.trim()?.toLowerCase()]?.isWritable ===
            true
        )
          taskCFUpdateData.push({
            id: datahubCustomFieldsData[field?.trim()?.toLowerCase()]?.cfId,
            value: formFields[field],
          });
      });

      // Submit Request Form
      const updatedTaskData = await updateTask(
        wrikeToken,
        taskId,
        taskCFUpdateData
      );

      // Sending submit request form error response
      if (updatedTaskData?.errorDescription) {
        return reject({ message: updatedTaskData?.errorDescription });
      }

      const taskCustomFieldValues = {};

      for (const [key, value] of Object.entries(datahubCustomFieldsData)) {
        const cfValue =
          updatedTaskData?.data[0]?.customFields?.find(
            (field) => field.id === value.cfId
          )?.value ?? "";

        if (value.isReadable && value.isTaskField)
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
      });
    }
  });
};
