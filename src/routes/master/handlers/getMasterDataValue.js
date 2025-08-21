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

      const { masterSlug, shortcode, nextPageToken } = params;

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
          message: `Custom field mapping not found for shortcode: ${shortcode}`,
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
          message: `Read operation not allowed for shortcode: ${shortcode}`,
        });
      }

      const customFieldData = await getCustomFields(
        wrikeToken,
        datahubCustomFieldsData[masterSlug]["cfId"]
      );

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
              shortcode && shortcode?.length > 0 && shortcode.trim()[0] != ":"
                ? '{"op": "equals","fld": "FIname","val": "' + shortcode + '"}'
                : "",
            pageToken: nextPageToken ?? null,
            useCache: false,
          }
        );

        if (datahubRecords?.errorDescription)
          return reject({
            message:
              datahubRecords?.errorDescription ??
              `Something went wrong! Please try again after sometime`,
          });

        newNextPageToken = datahubRecords?.nextPageToken;

        if (shortcode && shortcode?.length > 0 && shortcode.trim()[0] != ":") {
          outputValues = "";
          outputValues = datahubRecords.data[0]?.title;

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
