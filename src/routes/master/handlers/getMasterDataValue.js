import {
  getCustomFields,
  getDatahubGroupedDataById,
  getDatahubRecords,
} from "../../../utils/wrike";

export const GetMasterDataValue = (wrikeToken, params, fastify) => {
  return new Promise(async (resolve, reject) => {
    try {
      if (!wrikeToken) {
        return reject({
          statusCode: 403,
          message:
            "Failed authorization! User is not authorized to access the service.",
        });
      }

      const { masterSlug, recordId, nextPageToken } = params;

      if (!masterSlug) {
        return reject({
          statusCode: 400,
          message:
            "Missing parameter! Required parameter 'masterSlug' is missing.",
        });
      }

      // Get mapping configuration for this customfield
      const datahubCustomFieldsData = await getDatahubGroupedDataById(
        wrikeToken,
        process.env.DATAHUB_CUSTOM_FIELDS_ID,
        true
      );

      if (!datahubCustomFieldsData) {
        return reject({
          statusCode: 404,
          message: `Custom field mapping not found for recordId: ${recordId}`,
        });
      }

      if (!datahubCustomFieldsData[masterSlug]) {
        return reject({
          statusCode: 404,
          message: `Master slug mapping not found for masterSlug: ${masterSlug}`,
        });
      }

      if (!datahubCustomFieldsData[masterSlug]?.isMasterDataFeatureReadable) {
        return reject({
          statusCode: 403,
          message: `Read operation not allowed for recordId: ${recordId}`,
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

      let outputValues;
      let newNextPageToken = null;

      if (
        datahubCustomFieldsData[masterSlug]["cfType"] == "LinkToDatabase" &&
        customFieldData?.data[0]?.settings?.linkToDatabaseInfo
          ?.dataHubDatabaseId
      ) {
        const datahubRecords = await getDatahubRecords(
          wrikeToken,
          customFieldData?.data[0]?.settings?.linkToDatabaseInfo
            ?.dataHubDatabaseId,
          {
            isRecursive: false,
            filter:
              recordId && recordId?.length > 0 && recordId.trim()[0] != ":"
                ? '{"op": "equals","fld": "FIname","val": "' + recordId + '"}'
                : "",
            pageToken: nextPageToken ?? null,
            useCache: false,
          }
        );

        if (!datahubRecords?.data || datahubRecords.data.length === 0)
          return reject({
            statusCode: 404,
            message: `Datahub records not found`,
          });

        newNextPageToken = datahubRecords?.nextPageToken;

        if (recordId && recordId?.length > 0 && recordId.trim()[0] != ":") {
          outputValues = "";
          outputValues = datahubRecords.data[0]?.title;

          if (!outputValues) {
            return reject({
              statusCode: 404,
              message: `recordId not found: ${recordId}`,
            });
          }
        } else {
          outputValues = [];
          datahubRecords?.data?.forEach((record) => {
            outputValues.push({
              value: record?.title,
            });
          });
        }
      } else {
        if (recordId && recordId?.length > 0 && recordId.trim()[0] != ":") {
          outputValues = "";
          outputValues = customFieldData?.data[0]?.settings?.values?.find(
            (item) =>
              item?.trim()?.toLowerCase() === recordId?.trim()?.toLowerCase()
          );

          if (!outputValues) {
            return reject({
              statusCode: 404,
              message: `recordId not found: ${recordId}`,
            });
          }
        } else {
          outputValues = [];
          customFieldData?.data[0]?.settings?.values?.forEach((item) => {
            outputValues.push({
              value: item,
            });
          });
        }
      }

      resolve({
        data: outputValues,
        nextPageToken: newNextPageToken,
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
