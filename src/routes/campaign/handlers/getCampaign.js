import {
  getFolder,
  getDatahubCustomFields,
  getCustomFields,
} from "../../../utils/wrike";
import { translateDatahubRecordId } from "../utils/datahubRecordTranslator";

export const GetCampaign = (wrikeToken, params) => {
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

      const datahubCustomFieldsData = await getDatahubCustomFields(
        wrikeToken,
        process.env.DATAHUB_CUSTOM_FIELDS_ID,
      );

      const wrikeFolderData = await getFolder(wrikeToken, folderId);

      // Sending folder update error response
      if (wrikeFolderData?.errorDescription) {
        return reject({ message: wrikeFolderData?.errorDescription });
      }

      if (wrikeFolderData?.data[0]?.scope == "RbFolder") {
        return reject({
          success: false,
          message: "Invalid Campaign ID",
        });
      }

      const folderCustomFieldValues = {};

      const customFieldsMaster = await getCustomFields(wrikeToken);

      if (customFieldsMaster?.errorDescription) {
        throw { message: customFieldsMaster.errorDescription };
      }

      // map of custom fields for quick lookup
      const cfMap = new Map(
        (customFieldsMaster?.data || []).map((cf) => [cf.id, cf]),
      );

      for (const [key, value] of Object.entries(datahubCustomFieldsData)) {
        if (!value.isReadable || !value.isCampaignField) continue;

        let cfValue, cfData;
        switch (value.xpiFieldType) {
          case "Wrike API Built-in Field":
            cfValue = wrikeFolderData?.data[0][value?.cfId];
            break;
          case "Wrike API Metadata Field":
            cfValue =
              wrikeFolderData?.data[0]?.metadata?.find(
                (field) => field.key === value?.cfId,
              )?.value ?? "";
            break;
          case "Wrike Custom Field":
            cfData =
              wrikeFolderData?.data[0]?.customFields?.find(
                (field) => field.id === value.cfId,
              ) ?? "";
            cfValue = cfData?.value ?? "";
            break;
          default:
            cfValue = "";
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

        // if (value.isReadable && value.isCampaignField)
        folderCustomFieldValues[key] = cfValue;
      }

      if (folderCustomFieldValues["workitemlevel"] != "Campaign")
        return reject({
          success: false,
          message: "Invalid Campaign ID",
        });

      // Sending final response
      resolve({
        data: {
          type: "Campaign",
          ...folderCustomFieldValues,
          // customfieldlist: wrikeFolderData?.data[0]?.customFields,
          // noofcrs: folderCustomFieldValues["noofcrs"],
          // agency: folderCustomFieldValues["agency"],
          // mediabuyingtype: folderCustomFieldValues["mediabuyingtype"],
          // brand: folderCustomFieldValues["brand"],
          // briefeddate: folderCustomFieldValues["briefeddate"],
          // campaignbudget: folderCustomFieldValues["campaignbudget"],
          // campaignenddate: folderCustomFieldValues["campaignenddate"],
          // campaignid: folderCustomFieldValues["campaignid"],
          // campaignname: folderCustomFieldValues["campaignname"],
          // campaignobjective: folderCustomFieldValues["campaignobjective"],
          // campaignstartdate: folderCustomFieldValues["campaignstartdate"],
          // campaignfeedbackstatus:
          //   folderCustomFieldValues["campaignfeedbackstatus"],
          // ccuid: folderCustomFieldValues["ccuid"],
          // mediachannelpractice: folderCustomFieldValues["mediachannelpractice"],
          // client: folderCustomFieldValues["client"],
          // comments: folderCustomFieldValues["comments"],
          // cssid: folderCustomFieldValues["cssid"],
          // currency: folderCustomFieldValues["currency"],
          // customerponumber: folderCustomFieldValues["customerponumber"],
          // debtor: folderCustomFieldValues["debtor"],
          // kpiobjective: folderCustomFieldValues["kpiobjective"],
          // originalagency: folderCustomFieldValues["originalagency"],
          // readyforarchive: folderCustomFieldValues["readyforarchive"],
          // region: folderCustomFieldValues["region"],
          // requestedstartdate: folderCustomFieldValues["requestedstartdate"],
          // requestormarket: folderCustomFieldValues["requestormarket"],
          // spacename: folderCustomFieldValues["spacename"],
          // workitemlevel: folderCustomFieldValues["workitemlevel"],
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
