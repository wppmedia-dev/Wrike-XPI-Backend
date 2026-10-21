import { GetResponse } from "../../../utils/node-fetch";
import { parseODataFilters } from "../../../utils/odataFilter";
import {
  getCustomFields,
  getDatahubCustomFields,
  getFoldersByFolderId,
  getTasksByFolderId,
} from "../../../utils/wrike";
import {
  translateDatahubRecordId,
  translateDatahubValue,
} from "../../campaign/utils/datahubRecordTranslator";

export const GetAllChannels = (wrikeToken, params, environmentName) => {
  return new Promise(async (resolve, reject) => {
    try {
      if (!wrikeToken)
        return reject({
          statusCode: 403,
          message:
            "Failed authorization! User is not authorized to access the service.",
        });

      // Variable Declaration
      const {
        filter: filterParams,
        pageSize,
        campaignId,
        nextPageToken,
      } = params;

      if (
        !campaignId ||
        campaignId.includes("campaign_id") ||
        campaignId.includes("campaignId")
      )
        return reject({
          statusCode: 400,
          message: "Missing required parameter: campaignId",
        });

      let customFieldsParam = [];

      const datahubCustomFieldsData = await getDatahubCustomFields(
        wrikeToken,
        null,
        false,
        true,
        null,
        environmentName,
      );

      if (Object.keys(datahubCustomFieldsData).length === 0) {
        return reject({
          statusCode: 400,
          message:
            "Failed to retrieve datahub custom fields mapping configuration.",
        });
      }

      if (filterParams) {
        customFieldsParam = parseODataFilters(
          filterParams,
          datahubCustomFieldsData,
        );
      }

      if (!datahubCustomFieldsData?.workitemlevel?.cfId)
        return reject({
          statusCode: 400,
          message:
            "Missing required datahub customfield mapping field: workitemlevel",
        });

      const customFieldsMaster = await getCustomFields(wrikeToken);

      if (customFieldsMaster?.errorDescription) {
        throw { message: customFieldsMaster.errorDescription };
      }

      // map of custom fields for quick lookup
      const cfMap = new Map(
        (customFieldsMaster?.data || []).map((cf) => [cf.id, cf]),
      );

      for (const cf of customFieldsParam) {
        const cfMetaData = cfMap.get(cf?.id);

        const databaseId =
          cfMetaData?.settings?.linkToDatabaseInfo?.dataHubDatabaseId;

        if (!databaseId) continue;

        const cfValue = cf?.value;
        if (databaseId && cfValue) {
          const recordId = await translateDatahubValue(
            wrikeToken,
            databaseId,
            cfValue,
          );

          if (!recordId)
            throw {
              statusCode: 400,
              message:
                "The selected filters are invalid. Please review your filter values and try again.",
            };

          delete cf.value;
          cf.values = [recordId];
        }
      }

      customFieldsParam.push({
        id: datahubCustomFieldsData["workitemlevel"]["cfId"],
        comparator: "EqualTo",
        value: "Channel/Media Type",
      });

      // Get folder data
      const channelData = await getTasksByFolderId(
        wrikeToken,
        campaignId,
        pageSize,
        nextPageToken,
        true,
        true,
        null,
        customFieldsParam,
      );

      // Sending folder update error response
      if (channelData?.errorDescription)
        return reject({ message: channelData?.errorDescription });

      // Optimize the for loop by using map instead of manual for...of and push
      const channels = await Promise.all(
        channelData?.data.map(async (folder) => {
          if (folder?.scope == "RbFolder") return;

          const entries = await Promise.all(
            Object.entries(datahubCustomFieldsData).map(
              async ([key, value]) => {
                if (!value.isReadable || !value.isChannelField)
                  return [key, undefined];

                let fieldValue, cfData;
                switch (value.xpiFieldType) {
                  case "Wrike API Built-in Field":
                    fieldValue = folder[value?.cfId];
                    break;
                  case "Wrike API Metadata Field":
                    fieldValue =
                      folder?.metadata?.find(
                        (field) => field.key === value?.cfId,
                      )?.value ?? "";
                    break;
                  case "Wrike Custom Field":
                    cfData =
                      folder?.customFields?.find(
                        (field) => field.id === value?.cfId,
                      ) ?? "";
                    fieldValue = cfData?.value ?? "";
                    break;
                  default:
                    fieldValue = "";
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

                return [key, fieldValue];
              },
            ),
          );
          return Object.fromEntries(entries);
        }),
      );

      // Sending final response
      resolve({
        type: "Channel",
        nextPageToken: channelData.nextPageToken,
        data: !channels[0] ? [] : channels,
      });
    } catch (err) {
      console.log(err?.message || err);
      // Deliberate errors (e.g. invalid OData filters) carry a statusCode and a
      // user-facing message; pass them through instead of masking as fatal.
      if (err?.statusCode) return reject(err);
      reject({
        message:
          "Fatal error Unexpected error occurred and service is unable complete the request.",
        details: err,
      });
    }
  });
};
