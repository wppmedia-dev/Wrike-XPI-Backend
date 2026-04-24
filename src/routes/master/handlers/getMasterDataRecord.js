import {
  getCustomFields,
  getDatahubCustomFields,
  getDatahubRecords,
} from "../../../utils/wrike";

export const GetMasterDataRecord = (wrikeToken, params, environmentName) => {
  return new Promise(async (resolve, reject) => {
    try {
      if (!wrikeToken) {
        return reject({
          statusCode: 403,
          message:
            "Failed authorization! User is not authorized to access the service.",
        });
      }

      const { masterSlug, recordId, limit, nextPageToken } = params;

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
        null,
        true,
        true,
        null,
        environmentName,
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

      if (!datahubCustomFieldsData[masterSlug]?.canReadMasterData) {
        return reject({
          statusCode: 403,
          message: `Read operation not allowed for recordId: ${recordId}`,
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
          (field) => field.dataHubFieldId,
        );

      const mirrorCustomfieldIds =
        customFieldData?.data[0]?.settings?.linkToDatabaseInfo?.mirrorFields?.map(
          (field) => field.customFieldId,
        );

      let mirrorCustomFieldsData = {};
      if (
        mirrorCustomfieldIds &&
        Array.isArray(mirrorCustomfieldIds) &&
        mirrorCustomfieldIds.length > 0
      ) {
        // Get mapping configuration for this customfield
        const result = await getCustomFields(
          wrikeToken,
          mirrorCustomfieldIds.join(","),
        );

        for (const cf of result?.data || []) {
          const datahubId =
            customFieldData?.data[0]?.settings?.linkToDatabaseInfo?.mirrorFields?.find(
              (field) => field.customFieldId === cf.id,
            );

          mirrorCustomFieldsData[datahubId?.dataHubFieldId] = cf.title;
        }
      }

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
          limit,
          useCache: false,
        },
      );

      if (!datahubRecords?.data || datahubRecords.data.length === 0)
        return reject({
          statusCode: 404,
          message: `Datahub records not found`,
        });

      newNextPageToken = datahubRecords?.nextPageToken;

      if (recordId && recordId?.length > 0 && recordId.trim()[0] != ":") {
        outputValues = {};

        const record = datahubRecords?.data[0];
        outputValues = { id: record?.id || record.fieldValues?.FIid };
        for (const field in record.fieldValues) {
          outputValues[
            field == "FIname" ? "value" : mirrorCustomFieldsData[field]
          ] = record.fieldValues[field];
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
            fields[
              field == "FIname" ? "value" : mirrorCustomFieldsData[field]
            ] = record.fieldValues[field];
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
