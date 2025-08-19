import { deleteTask, getDatahubDataById } from "../../../utils/wrike";

export const DeleteTask = (wrikeToken, params, fastify) => {
  return new Promise(async (resolve, reject) => {
    try {
      if (!wrikeToken)
        return reject({
          statusCode: 403,
          message:
            "Failed authorization! User is not authorized to access the service.",
        });

      // Variable Declaration
      const { taskId } = params;

      if (!taskId)
        return reject({
          statusCode: 400,
          message:
            "Missing parameter! Required parameter is missing for the requested operation.",
        });

      const datahubCustomFieldsData = await getDatahubDataById(
        wrikeToken,
        process.env.DATAHUB_CUSTOM_FIELDS_ID
      );

      // Get folder data
      const wrikeTaskData = await deleteTask(wrikeToken, taskId);

      // Sending folder update error response
      if (wrikeTaskData?.errorDescription) {
        return reject({ message: wrikeTaskData?.errorDescription });
      }

      // // Sending final response
      // resolve({
      //   message: "Task deleted successfully.",
      //   data: {
      //     type: "Task",
      //   },
      // });

      const taskCustomFieldValues = {};

      for (const [key, value] of Object.entries(datahubCustomFieldsData)) {
        const cfValue =
          wrikeTaskData?.data[0]?.customFields?.find(
            (field) => field.id === value.cfId
          )?.value ?? "";

        if (value.isReadable && value.isTaskField)
          taskCustomFieldValues[key] = cfValue;
      }

      // Sending final response
      resolve({
        message: "Task deleted successfully.",
        data: {
          type: "Task",
          ...taskCustomFieldValues,
          // customfieldlist: wrikeTaskData?.data[0]?.customFields,
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
