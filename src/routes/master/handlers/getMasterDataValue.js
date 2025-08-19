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

      const { customfield, shortcode, nextPageToken } = params;

      if (!customfield) {
        return reject({
          statusCode: 400,
          message:
            "Missing parameter! Required parameter 'customfield' is missing.",
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
          message: `Custom field mapping not found for shortcode: ${shortcode}`,
        });
      }

      if (!datahubCustomFieldsData[customfield]) {
        return reject({
          statusCode: 404,
          message: `Master slug mapping not found for customfield: ${customfield}`,
        });
      }

      if (!datahubCustomFieldsData[customfield]?.isMasterDataFeatureReadable) {
        return reject({
          statusCode: 403,
          message: `Read operation not allowed for shortcode: ${shortcode}`,
        });
      }

      const customFieldData = await getCustomFields(
        wrikeToken,
        datahubCustomFieldsData[customfield]["cfId"]
      );

      let outputValues;
      let newNextPageToken = null;

      if (
        datahubCustomFieldsData[customfield]["cfType"] == "LinkToDatabase" &&
        customFieldData?.data[0]?.settings?.linkToDatabaseInfo
          ?.dataHubDatabaseId
      ) {
        const datahubRecords = await getDatahubRecords(
          wrikeToken,
          customFieldData?.data[0]?.settings?.linkToDatabaseInfo
            ?.dataHubDatabaseId,
          nextPageToken,
          [],
          false
        );

        newNextPageToken = datahubRecords?.nextPageToken;

        if (shortcode && shortcode?.length > 0 && shortcode.trim()[0] != ":") {
          outputValues = "";
          outputValues = datahubRecords.data.find(
            (item) =>
              item?.title?.trim()?.toLowerCase() ===
              shortcode?.trim()?.toLowerCase()
          )?.["title"];

          if (!outputValues) {
            return reject({
              statusCode: 404,
              message: `Shortcode not found: ${shortcode}`,
            });
          }
        } else {
          outputValues = [];
          datahubRecords.data.forEach((record) => {
            outputValues.push({
              value: record?.title,
            });
          });
        }
      } else {
        if (shortcode && shortcode?.length > 0 && shortcode.trim()[0] != ":") {
          outputValues = "";
          outputValues = customFieldData?.data[0]?.settings?.values?.find(
            (item) =>
              item?.trim()?.toLowerCase() === shortcode?.trim()?.toLowerCase()
          );

          if (!outputValues) {
            return reject({
              statusCode: 404,
              message: `Shortcode not found: ${shortcode}`,
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
          "Fatal error: Unexpected error occurred and service is unable to complete the request.",
      });
    }
  });
};
