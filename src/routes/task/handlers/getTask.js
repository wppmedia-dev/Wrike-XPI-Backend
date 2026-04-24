import { getDatahubCustomFields, getTask } from "../../../utils/wrike";

export const GetTask = (wrikeToken, params, environmentName) => {
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

      const datahubCustomFieldsData = await getDatahubCustomFields(
        wrikeToken,
        null,
        false,
        true,
        null,
        environmentName,
      );

      if (!datahubCustomFieldsData["workitemlevel"]["cfId"])
        return reject({
          statusCode: 400,
          message:
            "Missing required datahub customfield mapping field: workitemlevel",
        });

      const wrikeTaskData = await getTask(wrikeToken, taskId);

      // Sending folder update error response
      if (wrikeTaskData?.errorDescription) {
        return reject({ message: wrikeTaskData?.errorDescription });
      }

      if (wrikeTaskData?.data[0]?.scope == "RbTask") {
        return reject({
          success: false,
          message: "Invalid Task ID",
        });
      }

      const taskCustomFieldValues = {};

      for (const [key, value] of Object.entries(datahubCustomFieldsData)) {
        if (!value.isReadable || !value.isTaskField) continue;

        let cfValue;
        switch (value.xpiFieldType) {
          case "Wrike API Built-in Field":
            cfValue = wrikeTaskData?.data[0][value?.cfId];
            break;
          case "Wrike API Metadata Field":
            cfValue =
              wrikeTaskData?.data[0]?.metadata?.find(
                (field) => field.key === value?.cfId,
              )?.value ?? "";
            break;
          case "Wrike Custom Field":
            cfValue =
              wrikeTaskData?.data[0]?.customFields?.find(
                (field) => field.id === value.cfId,
              )?.value ?? "";
            break;
          default:
            fieldValue = "";
        }

        // if (value.isReadable && value.isTaskField)
        taskCustomFieldValues[key] = cfValue;
      }

      if (taskCustomFieldValues["workitemlevel"] != "Task")
        return reject({
          success: false,
          message: "Invalid Task ID",
        });

      // Sending final response
      resolve({
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
