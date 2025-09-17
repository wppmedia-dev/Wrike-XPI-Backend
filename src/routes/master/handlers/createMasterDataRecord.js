import {
  getCustomFields,
  getDatahubFields,
  getDatahubCustomFields,
  createDatahubRecord,
} from "../../../utils/wrike";

export const CreateMasterDataRecord = (wrikeToken, params, fastify) => {
  return new Promise(async (resolve, reject) => {
    try {
      if (!wrikeToken) {
        return reject({
          statusCode: 403,
          message:
            "Failed authorization! User is not authorized to access the service.",
        });
      }

      const { masterSlug, reqBody } = params;

      if (!masterSlug) {
        return reject({
          statusCode: 400,
          message:
            "Missing parameter! Required parameter 'masterSlug' is missing.",
        });
      }

      // Get mapping configuration for this customfield
      const datahubCustomFieldsData = await getDatahubCustomFields(
        wrikeToken,
        process.env.DATAHUB_CUSTOM_FIELDS_ID,
        true
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

      if (!datahubCustomFieldsData[masterSlug]?.canCreateMasterData) {
        return reject({
          statusCode: 403,
          message: `Create operation not allowed for masterSlug: ${masterSlug}`,
        });
      }

      const customFieldData = await getCustomFields(
        wrikeToken,
        datahubCustomFieldsData[masterSlug]["cfId"]
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

      const mirrorFieldIds =
        customFieldData?.data[0]?.settings?.linkToDatabaseInfo?.mirrorFields?.map(
          (field) => field.dataHubFieldId
        );

      mirrorFieldIds.push("FIname");

      const datahubRecord = await createDatahubRecord(
        wrikeToken,
        dataHubDatabaseId,
        reqBody
      );

      if (!datahubRecord?.data || datahubRecord.data.length === 0)
        return reject({
          statusCode: 400,
          message: `Failed to create the record. Please try again`,
        });

      resolve({
        data: { id: datahubRecord?.data[0]?.id, ...reqBody },
      });
    } catch (err) {
      console.error("Error in GetCustomField:", err);
      reject({
        message:
          err?.message ||
          err?.errorDescription ||
          "Fatal error: Unexpected error occurred and service is unable to complete the request.",
      });
    }
  });
};
