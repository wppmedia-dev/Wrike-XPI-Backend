import { deleteFolder, getDatahubCustomFields } from "../../../utils/wrike";
import { translateDatahubRecordId } from "../utils/datahubRecordTranslator";
export const DeleteCampaign = (wrikeToken, params, environmentName) => {
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
        null,
        false,
        true,
        null,
        environmentName,
      );

      // Get folder data
      const wrikeFolderData = await deleteFolder(wrikeToken, folderId);

      // Sending folder update error response
      if (wrikeFolderData?.errorDescription) {
        return reject({ message: wrikeFolderData?.errorDescription });
      }

      // // Sending final response
      // resolve({
      //   message: "Campaign deleted successfully.",
      //   data: {
      //     type: "Campaign",
      //   },
      // });

      const folderCustomFieldValues = {};

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
              )?.value ?? "";
            fieldValue = cfData?.value ?? "";
            break;
          default:
            cfValue = "";
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

        // if (value.isReadable && value.isCampaignField)
        folderCustomFieldValues[key] = cfValue;
      }

      // Sending final response
      resolve({
        message: "Campaign deleted successfully.",
        data: {
          type: "Campaign",
          ...folderCustomFieldValues,
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
