import { updateFolder } from "../../../utils/wrike";
import { getCustomFieldsDatahub } from "../utils/getDHCustomFields";

export const UpdateCampaign = (wrikeToken, params, fastify) => {
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
      const datahubCustomFieldsData = await getCustomFieldsDatahub(wrikeToken);
      // }

      let folderCFUpdateData = [];

      Object.keys(formFields).forEach((field) => {
        // for (const field in formFields) {
        if (
          datahubCustomFieldsData[field?.trim()?.toLowerCase()] &&
          datahubCustomFieldsData[field?.trim()?.toLowerCase()]
            ?.isCampaignField === true &&
          datahubCustomFieldsData[field?.trim()?.toLowerCase()]?.isWritable ===
            true
        )
          folderCFUpdateData.push({
            id: datahubCustomFieldsData[field?.trim()?.toLowerCase()]?.cfId,
            value: formFields[field],
          });
      });

      // Submit Request Form
      const updatedFolderData = await updateFolder(
        wrikeToken,
        folderId,
        folderCFUpdateData
      );

      // Sending submit request form error response
      if (updatedFolderData?.errorDescription) {
        return reject({ message: updatedFolderData?.errorDescription });
      }

      const folderCustomFieldValues = {};

      for (const [key, value] of Object.entries(datahubCustomFieldsData)) {
        const cfValue =
          updatedFolderData?.data[0]?.customFields?.find(
            (field) => field.id === value.cfId
          )?.value ?? "";

        if (value.isReadable && value.isCampaignField)
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
      });
    }
  });
};
