import {
  getRequestForm,
  submitRequestForm,
  getRequestFormStatus,
  getTask,
  getFolder,
  getDatahubCustomFields,
  findRequestFormId,
  getRequestFormFieldDatahub,
  getSpaceDatahub,
  getEntityDatahub,
  getCustomFields,
  submitRequestPreFillForm,
} from "../../../utils/wrike";
import { translateDatahubRecordId } from "../utils/datahubRecordTranslator";

export const CreateCampaign = (
  wrikeToken,
  params,
  fastify,
  environmentName,
) => {
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
        space,
        entity,
        variantId,
        fields: formFields,
        isCreatedByURL = false,
      } = params;

      // if (Object.keys(datahubSpaceData).length == 0) {
      const { datahubSpaceData, datahubSpaceMetaData } = await getSpaceDatahub(
        wrikeToken,
        true,
        null,
        environmentName,
      );
      if (datahubSpaceData?.errorDescription) {
        return reject({ message: datahubSpaceData?.errorDescription });
      }
      // }

      // if (Object.keys(datahubEntityData).length == 0) {
      const datahubEntityData = await getEntityDatahub(
        wrikeToken,
        true,
        null,
        environmentName,
      );
      if (datahubEntityData?.errorDescription) {
        return reject({ message: datahubEntityData?.errorDescription });
      }
      // }

      // Find Request Form ID
      const requestForm = await findRequestFormId(
        wrikeToken,
        space,
        entity,
        variantId,
        datahubSpaceData,
        datahubEntityData,
        true,
        null,
        environmentName,
      );

      // Sending submit request form error response
      if (requestForm?.errorDescription) {
        return reject({ message: requestForm?.errorDescription });
      }

      const requestFormId = requestForm?.requiredFormId;

      if (!requestFormId)
        return reject({
          statusCode: 403,
          message:
            "Missing parameter! Required parameter requestForm field is missing for the requested operation.",
        });

      // if (Object.keys(datahubCustomFieldsData).length === 0) {
      const datahubCustomFieldsData = await getDatahubCustomFields(
        wrikeToken,
        null,
        false,
        true,
        null,
        environmentName,
      );

      if (datahubCustomFieldsData?.errorDescription) {
        return reject({ message: datahubCustomFieldsData?.errorDescription });
      }
      // }

      // if (Object.keys(datahubRequestFormFieldsData).length === 0) {
      const datahubRequestFormFieldsData = await getRequestFormFieldDatahub(
        wrikeToken,
        space,
        variantId,
        datahubCustomFieldsData,
        datahubSpaceData,
        true,
        null,
        environmentName,
      );
      if (datahubRequestFormFieldsData?.errorDescription) {
        return reject({
          message: datahubRequestFormFieldsData?.errorDescription,
        });
      }
      // }

      // Submit Request Form
      const requestFormData = await getRequestForm(
        wrikeToken,
        datahubSpaceMetaData[space?.toLowerCase()?.trim()]?.cfId,
      );

      // Sending get request form error response
      if (requestFormData?.errorDescription) {
        return reject({ message: requestFormData?.errorDescription });
      }

      const form = requestFormData?.data?.find(
        (form) => form.id === requestFormId,
      );

      const requestFormPages = form?.pages ?? null;

      if (!requestFormPages)
        return reject({
          message: `Request form with ID "${requestFormId}" does not exist. Please use a valid request form ID.`,
        });

      let submitRequestFieldsPayload = [];
      let requestFormDefaultFields = {};
      let defaultFieldPagesCompleted = [];

      // Object.keys(formFields).forEach((field) => {
      for (const field in formFields) {
        let matchedField = null;

        // Try to find the matching field in any page
        for (const page of requestFormPages || []) {
          // To find the default field values (Runs one tme per page)
          if (!defaultFieldPagesCompleted.includes(page?.id)) {
            for (const formField of page.fields || []) {
              if (!formField?.items) continue;

              const defaultValue = formField?.items.find(
                (f) => f.selectedByDefault,
              );

              if (!defaultValue?.id) continue;

              requestFormDefaultFields[formField?.id] = defaultValue?.id;
            }

            defaultFieldPagesCompleted.push(page?.id);
          }

          matchedField = page?.fields.find(
            (f) => f.id === datahubRequestFormFieldsData[field]?.fieldId,
          );
          if (matchedField) break; // Exit once found
        }

        if (!matchedField) continue;

        // if (!matchedField) {
        //   return reject({
        //     message: `Field with title "${field}" does not exist in the request form. Please use a valid title.`,
        //   });
        // }

        let valuesArray = [];

        if (matchedField?.items) {
          const lowerItemMap = new Map(
            matchedField.items.map((item) => [
              item.title?.trim()?.toLowerCase(),
              item.id,
            ]),
          );

          if (Array.isArray(formFields[field])) {
            for (const value of formFields[field]) {
              const matchedFieldItemId =
                lowerItemMap.get(value?.trim()?.toLowerCase()) || null;

              if (!matchedFieldItemId) {
                return reject({
                  message: `Value "${value}" does not exist in the request form field "${field}". Please use a valid value.`,
                });
              }

              valuesArray.push(matchedFieldItemId);
            }
          } else if (typeof formFields[field?.trim()] == "string") {
            const matchedFieldItemId =
              lowerItemMap.get(
                formFields[field?.trim()]?.trim()?.toLowerCase(),
              ) || null;

            if (!matchedFieldItemId) {
              return reject({
                message: `Value "${formFields[field]}" does not exist in the request form field "${field}". Please use a valid value.`,
              });
            }

            valuesArray.push(matchedFieldItemId);
          }
        } else {
          valuesArray = [formFields[field]];
        }

        submitRequestFieldsPayload.push({
          fieldId: matchedField.id,
          values: valuesArray,
        });
      }

      // Appending default fields to the requst form submit api payload
      for (const defaultFieldId in requestFormDefaultFields || []) {
        const isDefaultExist = submitRequestFieldsPayload.some(
          (param) => param.fieldId === defaultFieldId,
        );

        if (isDefaultExist) continue;

        submitRequestFieldsPayload.push({
          fieldId: defaultFieldId,
          values: [requestFormDefaultFields[defaultFieldId]],
        });
      }

      if (isCreatedByURL) {
        const submittedRequestFormData = await submitRequestPreFillForm(
          wrikeToken,
          requestFormId,
          submitRequestFieldsPayload,
        );

        // Sending submit request form error response
        if (submittedRequestFormData?.errorDescription) {
          return reject({
            message: submittedRequestFormData?.errorDescription,
          });
        }

        return resolve({
          data: {
            type: "Campaign",
            url: submittedRequestFormData?.data[0]?.url,
          },
        });
      }

      // Submit Request Form
      const submittedRequestFormData = await submitRequestForm(
        wrikeToken,
        requestFormId,
        submitRequestFieldsPayload,
      );

      // Sending submit request form error response
      if (submittedRequestFormData?.errorDescription) {
        return reject({ message: submittedRequestFormData?.errorDescription });
      }

      const asynJobData = await getRequestFormStatus(
        wrikeToken,
        submittedRequestFormData?.data[0]?.id,
      );

      // Sending folder update error response
      if (asynJobData?.errorMessage) {
        return reject({ message: asynJobData?.errorMessage });
      }

      let outputData = {};
      if (asynJobData?.result?.projectId)
        outputData = await getFolder(
          wrikeToken,
          asynJobData?.result?.projectId,
        );
      else outputData = await getTask(wrikeToken, asynJobData?.result?.taskId);

      // Sending folder update error response
      if (outputData?.errorDescription) {
        return reject({ message: outputData?.errorDescription });
      }

      const folderCustomFieldValues = {};

      const customFieldsMaster = await getCustomFields(wrikeToken);

      if (customFieldsMaster?.errorDescription) {
        throw { message: customFieldsMaster.errorDescription };
      }

      // map of custom fields for quick lookup
      const cfMap = new Map(
        (customFieldsMaster?.data || []).map((cf) => [cf.id, cf]),
      );

      for (const [key, value] of Object.entries(datahubCustomFieldsData)) {
        if (!value.isReadable || !value.isCampaignField) continue;

        let cfValue, cfData;
        switch (value.xpiFieldType) {
          case "Wrike API Built-in Field":
            cfValue = outputData?.data[0][value?.cfId];
            break;
          case "Wrike API Metadata Field":
            cfValue =
              outputData?.data[0]?.metadata?.find(
                (field) => field.key === value?.cfId,
              )?.value ?? "";
            break;
          case "Wrike Custom Field":
            cfData =
              outputData?.data[0]?.customFields?.find(
                (field) => field.id === value.cfId,
              ) ?? "";
            cfValue = cfData?.value ?? "";
            break;
          default:
            cfValue = "";
        }

        if (cfValue && cfValue?.startsWith("[") && cfValue?.endsWith("]")) {
          const cfMetaData = cfMap.get(cfData?.id);

          const databaseId =
            cfMetaData?.settings?.linkToDatabaseInfo?.dataHubDatabaseId;

          if (databaseId && cfValue)
            cfValue = await translateDatahubRecordId(
              wrikeToken,
              databaseId,
              cfValue,
            );
        }

        // if (value.isReadable && value.isCampaignField)
        folderCustomFieldValues[key] = cfValue;
      }

      // Sending final response
      resolve({
        data: {
          type: "Campaign",
          ...folderCustomFieldValues,
        },
      });
    } catch (err) {
      console.log(err?.message || err);
      reject({
        message:
          "Fatal error Unexpected error occurred and service is unable complete the request.",
        details: err,
      });
    }
  });
};
