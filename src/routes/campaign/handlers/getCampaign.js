import {
  getDatahubFields,
  getDatahubRecords,
  getFolder,
} from "../../../utils/wrike";

let datahubCustomFieldsData = {};

export const GetCampaign = (wrikeToken, params, fastify) => {
  return new Promise(async (resolve, reject) => {
    try {
      if (!wrikeToken)
        return reject({
          statusCode: 403,
          message:
            "Failed authorization! User is not authorized to access the service.",
        });

      // Variable Declaration
      const { campaignId: folderId } = params;

      if (!folderId)
        return reject({
          statusCode: 400,
          message:
            "Missing parameter! Required parameter is missing for the requested operation.",
        });

      if (Object.keys(datahubCustomFieldsData).length === 0)
        await getCustomFieldsDatahub(wrikeToken);

      const wrikeFolderData = await getFolder(wrikeToken, folderId);

      // Sending folder update error response
      if (wrikeFolderData?.errorDescription) {
        return reject({ message: wrikeFolderData?.errorDescription });
      }

      const folderCustomFieldValues = {};

      for (const [key, value] of Object.entries(datahubCustomFieldsData)) {
        const cfValue =
          wrikeFolderData?.data[0]?.customFields?.find(
            (field) => field.id === value.cfId
          )?.value ?? "";

        folderCustomFieldValues[key] = cfValue;
      }

      // Sending final response
      resolve({
        data: {
          type: "Campaign",
          // customfieldlist: wrikeFolderData?.data[0]?.customFields,
          noofcrs: folderCustomFieldValues["noofcrs"],
          agency: folderCustomFieldValues["agency"],
          mediabuyingtype: folderCustomFieldValues["mediabuyingtype"],
          brand: folderCustomFieldValues["brand"],
          briefeddate: folderCustomFieldValues["briefeddate"],
          campaignbudget: folderCustomFieldValues["campaignbudget"],
          campaignenddate: folderCustomFieldValues["campaignenddate"],
          campaignid: folderCustomFieldValues["campaignid"],
          campaignname: folderCustomFieldValues["campaignname"],
          campaignobjective: folderCustomFieldValues["campaignobjective"],
          campaignstartdate: folderCustomFieldValues["campaignstartdate"],
          campaignfeedbackstatus:
            folderCustomFieldValues["campaignfeedbackstatus"],
          ccuid: folderCustomFieldValues["ccuid"],
          mediachannelpractice: folderCustomFieldValues["mediachannelpractice"],
          client: folderCustomFieldValues["client"],
          comments: folderCustomFieldValues["comments"],
          cssid: folderCustomFieldValues["cssid"],
          currency: folderCustomFieldValues["currency"],
          customerponumber: folderCustomFieldValues["customerponumber"],
          debtor: folderCustomFieldValues["debtor"],
          kpiobjective: folderCustomFieldValues["kpiobjective"],
          originalagency: folderCustomFieldValues["originalagency"],
          readyforarchive: folderCustomFieldValues["readyforarchive"],
          region: folderCustomFieldValues["region"],
          requestedstartdate: folderCustomFieldValues["requestedstartdate"],
          requestormarket: folderCustomFieldValues["requestormarket"],
          spacename: folderCustomFieldValues["spacename"],
          workitemlevel: folderCustomFieldValues["workitemlevel"],
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

const getCustomFieldsDatahub = async (wrikeToken) => {
  try {
    const datahubFields = await getDatahubFields(
      wrikeToken,
      process.env.DATAHUB_CUSTOM_FIELDS_ID
    );

    if (datahubFields?.errorDescription) {
      return Promise.reject({
        errorDescription: datahubFields?.errorDescription,
      });
    }

    let formFieldsIds = {};
    datahubFields?.data?.forEach((field) => {
      formFieldsIds[field.title?.trim()?.toLowerCase()] = field.id;
    });

    const datahubRecords = await getDatahubRecords(
      wrikeToken,
      process.env.DATAHUB_CUSTOM_FIELDS_ID
    );

    if (datahubRecords?.errorDescription) {
      return Promise.reject({
        errorDescription: datahubRecords?.errorDescription,
      });
    }

    datahubRecords?.data?.forEach((record) => {
      if (record.fieldValues[formFieldsIds["short code"]]?.trim())
        datahubCustomFieldsData[
          record.fieldValues[formFieldsIds["short code"]]?.trim()?.toLowerCase()
        ] = {
          id: record.id,
          ["cfId"]: record.fieldValues[formFieldsIds["cf id"]],
        };
    });
  } catch (err) {
    return Promise.reject(err);
  }
};
