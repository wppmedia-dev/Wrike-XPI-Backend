import { getCustomFields } from "../../../utils/wrike";
import { getCustomFieldsDatahub } from "../../campaign/utils/getDHCustomFields";

export const GetCustomField = (wrikeToken, params, fastify) => {
  return new Promise(async (resolve, reject) => {
    try {
      if (!wrikeToken) {
        return reject({
          statusCode: 403,
          message:
            "Failed authorization! User is not authorized to access the service.",
        });
      }

      const { customfield, shortcode } = params;

      if (!customfield) {
        return reject({
          statusCode: 400,
          message:
            "Missing parameter! Required parameter 'customfield' is missing.",
        });
      }

      // Get mapping configuration for this customfield
      const datahubCustomFieldsData = await getCustomFieldsDatahub(
        wrikeToken,
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

      if (!datahubCustomFieldsData[customfield]?.isReadable) {
        return reject({
          statusCode: 403,
          message: `Read operation not allowed for shortcode: ${shortcode}`,
        });
      }

      const customFieldData = await getCustomFields(
        wrikeToken,
        datahubCustomFieldsData[customfield]["cfId"]
      );

      let outputValues = customFieldData?.data[0]?.settings?.values;

      if (shortcode && shortcode.trim() != ":shortcode") {
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
      }

      resolve({
        data: outputValues,
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
