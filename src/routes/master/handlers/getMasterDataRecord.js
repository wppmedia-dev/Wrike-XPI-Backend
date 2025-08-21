import {
  getCustomFields,
  getDatahubFields,
  getDatahubGroupedDataById,
  getDatahubRecords,
} from "../../../utils/wrike";

export const GetMasterDataRecord = (wrikeToken, params, fastify) => {
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
      const dataHubDatabaseId =
        customFieldData?.data[0]?.settings?.linkToDatabaseInfo
          ?.dataHubDatabaseId;

      if (
        datahubCustomFieldsData[masterSlug]["cfType"] != "LinkToDatabase" ||
        !customFieldData?.data[0]?.settings?.linkToDatabaseInfo
          ?.dataHubDatabaseId
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

      const datahubRecords = await getDatahubRecords(
        wrikeToken,
        dataHubDatabaseId,
        {
          isRecursive: false,
          fieldIds: mirrorFieldIds,
          filter:
            recordId && recordId?.length > 0 && recordId.trim()[0] != ":"
              ? '{"op": "equals","fld": "FIid","val": "' + recordId + '"}'
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

      // Get Datahub Fields
      const datahubFields = await getDatahubFields(
        wrikeToken,
        dataHubDatabaseId
      );

      if (!datahubFields?.data || datahubFields.data.length === 0)
        return reject({
          statusCode: 404,
          message: "Datahub fields not found",
        });

      let formFieldsIds = {};
      datahubFields?.data?.forEach((field) => {
        formFieldsIds[field.id] = field.title?.trim()?.toLowerCase();
      });

      if (recordId && recordId?.length > 0 && recordId.trim()[0] != ":") {
        outputValues = {};

        const record = datahubRecords?.data[0];
        outputValues = { id: record?.id || record.fieldValues?.FIid };
        for (const field in record.fieldValues) {
          outputValues[field == "FIname" ? "value" : formFieldsIds[field]] =
            record.fieldValues[field];
        }

        if (!outputValues) {
          return reject({
            statusCode: 404,
            message: `recordId not found: ${recordId}`,
          });
        }
      } else {
        outputValues = [];
        datahubRecords?.data?.forEach((record) => {
          let fields = { id: record?.id || record.fieldValues?.FIid };
          for (const field in record.fieldValues) {
            fields[field == "FIname" ? "value" : formFieldsIds[field]] =
              record.fieldValues[field];
          }

          outputValues.push(fields);
        });
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
