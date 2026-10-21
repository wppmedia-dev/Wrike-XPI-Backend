import { GetResponse } from "../../../utils/node-fetch";
import { parseODataFilters } from "../../../utils/odataFilter";
import {
  getCustomFields,
  getDatahubCustomFields,
  getFoldersBySpace,
} from "../../../utils/wrike";
import {
  translateDatahubRecordId,
  translateDatahubValue,
} from "../utils/datahubRecordTranslator";
import { getCachedWrikeCredentials } from "../../../utils/wrikeCredentials";
import { normalizeString } from "../../../utils/json-conversion";

export const GetAllCampaigns = (wrikeToken, params, environmentName) => {
  return new Promise(async (resolve, reject) => {
    try {
      if (!wrikeToken)
        return reject({
          statusCode: 403,
          message:
            "Failed authorization! User is not authorized to access the service.",
        });

      // Variable Declaration
      const { filter: filterParams, pageSize = 10, nextPageToken } = params;

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

      // Get credential to fetch campaignSpaceId from database
      const credential = getCachedWrikeCredentials(environmentName);
      if (!credential || !credential.campaignSpaceId) {
        return reject({
          statusCode: 400,
          message: "Campaign Space ID is not configured for this environment.",
        });
      }

      // Map of custom fields for quick lookup
      const customFieldsMaster = await getCustomFields(wrikeToken);

      if (customFieldsMaster?.errorDescription) {
        throw { message: customFieldsMaster.errorDescription };
      }

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

          const finalVal = normalizeString(recordId);

          delete cf.value;
          cf.values = [recordId];
        }
      }

      customFieldsParam.push({
        id: datahubCustomFieldsData?.workitemlevel?.cfId,
        comparator: "EqualTo",
        value: "Campaign",
      });

      const wrikeFolderData = await getFoldersBySpace(
        wrikeToken,
        credential.campaignSpaceId,
        nextPageToken,
        pageSize,
        customFieldsParam,
      );

      // Sending folder update error response
      if (wrikeFolderData?.errorDescription)
        return reject({ message: wrikeFolderData?.errorDescription });

      const campaigns = await Promise.all(
        wrikeFolderData?.data.map(async (folder) => {
          if (folder?.scope === "RbFolder") return;

          const entries = await Promise.all(
            Object.entries(datahubCustomFieldsData).map(
              async ([key, value]) => {
                if (!value.isReadable || !value.isCampaignField)
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
        type: "Campaign",
        nextPageToken: wrikeFolderData.nextPageToken,
        data: !campaigns[0] ? [] : campaigns,
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
