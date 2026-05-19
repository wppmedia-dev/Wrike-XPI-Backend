import {
  getCustomFields,
  getDatahubCustomFields,
  updateFolder,
} from "../../../utils/wrike";
import { translateDatahubRecordId } from "../utils/datahubRecordTranslator";

export const UpdateCampaign = (wrikeToken, params, environmentName) => {
  return new Promise(async (resolve, reject) => {
    try {
      if (!wrikeToken)
        return reject({
          statusCode: 403,
          message:
            "Failed authorization! User is not authorized to access the service.",
        });

      // Variable Declaration

      const { campaignId: folderId, formFields } = params;

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

      let folderFieldsUpdateData = {};
      let folderMetadataUpdateData = [];
      let folderCFUpdateData = [];

      Object.keys(formFields).forEach((field) => {
        // for (const field in formFields) {
        if (
          datahubCustomFieldsData[field?.trim()?.toLowerCase()] &&
          datahubCustomFieldsData[field?.trim()?.toLowerCase()]
            ?.isCampaignField === true &&
          datahubCustomFieldsData[field?.trim()?.toLowerCase()]?.isWritable ===
            true
        ) {
          const xpiFieldType =
            datahubCustomFieldsData[field?.trim()?.toLowerCase()]?.xpiFieldType;

          switch (xpiFieldType) {
            case "Wrike API Built-in Field":
              folderFieldsUpdateData[
                datahubCustomFieldsData[field?.trim()?.toLowerCase()]?.cfId
              ] = formFields[field];
              break;
            case "Wrike API Metadata Field":
              folderMetadataUpdateData.push({
                key: datahubCustomFieldsData[field?.trim()?.toLowerCase()]
                  ?.cfId,
                value: formFields[field],
              });
              break;
            case "Wrike Custom Field":
              folderCFUpdateData.push({
                id: datahubCustomFieldsData[field?.trim()?.toLowerCase()]?.cfId,
                value: formFields[field],
              });
              break;
          }
        }
      });

      // Submit Request Form
      const updatedFolderData = await updateFolder(
        wrikeToken,
        folderId,
        folderFieldsUpdateData,
        folderMetadataUpdateData,
        folderCFUpdateData,
      );

      // Sending submit request form error response
      if (updatedFolderData?.errorDescription) {
        return reject({ message: updatedFolderData?.errorDescription });
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
            cfValue = updatedFolderData?.data[0][value?.cfId];
            break;
          case "Wrike API Metadata Field":
            cfValue =
              updatedFolderData?.data[0]?.metadata?.find(
                (field) => field.key === value?.cfId,
              )?.value ?? "";
            break;
          case "Wrike Custom Field":
            cfData =
              updatedFolderData?.data[0]?.customFields?.find(
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

      // Sending final response
      resolve({
        data: {
          type: "Campaign",
          ...folderCustomFieldValues,
          // // customfieldlist: outputData?.data[0]?.customFields,
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
        details: err,
      });
    }
  });
};
