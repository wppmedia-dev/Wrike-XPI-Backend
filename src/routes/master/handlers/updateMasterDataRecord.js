import {
  getCustomFields,
  getDatahubCustomFields,
  deleteDatahubRecord,
  updateDatahubRecord,
} from "../../../utils/wrike";

export const UpdateMasterDataRecord = (wrikeToken, params, environmentName) => {
  return new Promise(async (resolve, reject) => {
    try {
      if (!wrikeToken) {
        return reject({
          statusCode: 403,
          message:
            "Failed authorization! User is not authorized to access the service.",
        });
      }

      const { masterSlug, recordId, reqBody } = params;

      if (!masterSlug || masterSlug.trim().includes(":")) {
        return reject({
          statusCode: 400,
          message:
            "Missing parameter! Required parameter 'masterSlug' is missing.",
        });
      }

      if (!recordId || recordId.trim().includes(":")) {
        return reject({
          statusCode: 400,
          message:
            "Missing parameter! Required parameter 'recordId' is missing.",
        });
      }

      // Get mapping configuration for this customfield
      const datahubCustomFieldsData = await getDatahubCustomFields(
        wrikeToken,
        null,
        true,
        true,
        0,
        environmentName,
      );

      if (!datahubCustomFieldsData) {
        return reject({
          statusCode: 404,
          message: `Custom field mapping not found for masterSlug: ${masterSlug}`,
        });
      }

      if (!datahubCustomFieldsData[masterSlug]) {
        return reject({
          statusCode: 404,
          message: `Master slug mapping not found for masterSlug: ${masterSlug}`,
        });
      }

      if (!datahubCustomFieldsData[masterSlug]?.canUpdateMasterData) {
        return reject({
          statusCode: 403,
          message: `Delete operation not allowed for masterSlug: ${masterSlug}`,
        });
      }

      const customFieldData = await getCustomFields(
        wrikeToken,
        datahubCustomFieldsData[masterSlug]["cfId"],
      );

      if (!customFieldData?.data || customFieldData?.data.length === 0)
        return reject({
          statusCode: 404,
          message: "Custom field data not found",
        });

      const dataHubDatabaseId =
        customFieldData?.data[0]?.settings?.linkToDatabaseInfo
          ?.dataHubDatabaseId;

      if (
        datahubCustomFieldsData[masterSlug]["cfType"] != "LinkToDatabase" ||
        !dataHubDatabaseId
      )
        return reject({
          statusCode: 400,
          message:
            "Error, the master data you've requested does not support record style API request.",
        });

      const datahubRecord = await updateDatahubRecord(
        wrikeToken,
        dataHubDatabaseId,
        recordId,
        reqBody,
      );

      if (!datahubRecord?.id)
        return reject({
          statusCode: 400,
          message:
            datahubRecord?.detail ??
            "Unable to update the datahub record. Please try again",
        });

      resolve({
        message: "Datahub record has been updated successfully",
      });
    } catch (err) {
      console.error("Error in GetCustomField:", err);
      reject({
        statusCode: err?.statusCode || 400,
        message:
          err?.message ||
          err?.errorDescription ||
          "Fatal error: Unexpected error occurred and service is unable to complete the request.",
      });
    }
  });
};
