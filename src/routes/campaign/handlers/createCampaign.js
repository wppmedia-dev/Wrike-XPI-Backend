import { param } from "@odata/parser";
import {
  getDatahubFields,
  getDatahubRecords,
  getRequestForm,
  submitRequestForm,
  getRequestFormStatus,
  getTask,
  getFolder,
} from "../../../utils/wrike";

const requiredDatahubRequestFormIds = [
  "XPI Entity",
  "Space",
  "RF v4Id",
  "Variant Id",
];

export const CreateCampaign = (wrikeToken, params, fastify) => {
  return new Promise(async (resolve, reject) => {
    try {
      if (!wrikeToken)
        return reject({
          statusCode: 403,
          message:
            "Failed authorization! User is not authorized to access the service.",
        });

      // Variable Declaration

      const { space, entity, varientId, fields: formFields } = params;

      // if (Object.keys(datahubSpaceData).length == 0) {
      const datahubSpaceData = await getSpaceDatahub(wrikeToken);
      // }

      // if (Object.keys(datahubEntityData).length == 0) {
      const datahubEntityData = await getEntityDatahub(wrikeToken);
      // }

      // Find Request Form ID
      const requetForm = await findRequestFormId(
        wrikeToken,
        space,
        entity,
        varientId,
        datahubSpaceData,
        datahubEntityData
      );
      // Sending submit request form error response
      if (requetForm?.errorDescription) {
        return reject({ message: requetForm?.errorDescription });
      }

      const requetFormId = requetForm?.requiredFormId;

      if (!requetFormId)
        return reject({
          statusCode: 403,
          message:
            "Missing parameter! Required parameter requestForm field is missing for the requested operation.",
        });

      // if (Object.keys(datahubCustomFieldsData).length === 0) {
      const datahubCustomFieldsData = await getCustomFieldsDatahub(wrikeToken);
      // }

      // if (Object.keys(datahubRequestFormFieldsData).length === 0) {
      const datahubRequestFormFieldsData = await getRequestFormFieldDatahub(
        wrikeToken,
        space,
        varientId,
        datahubCustomFieldsData,
        datahubSpaceData
      );
      // }

      // Submit Request Form
      const requestFormData = await getRequestForm(wrikeToken);

      // Sending get request form error response
      if (requestFormData?.errorDescription) {
        return reject({ message: requestFormData?.errorDescription });
      }

      const { pages: requestFormPages = null } = requestFormData?.data?.find(
        (form) => form.id === requetFormId
      );

      if (!requestFormPages)
        return reject({
          message: `Request form with ID "${requetFormId}" does not exist. Please use a valid request form ID.`,
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
                (f) => f.selectedByDefault
              );

              if (!defaultValue?.id) continue;

              requestFormDefaultFields[formField?.id] = defaultValue?.id;
            }

            defaultFieldPagesCompleted.push(page?.id);
          }

          matchedField = page?.fields.find(
            (f) => f.id === datahubRequestFormFieldsData[field]?.fieldId
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
            ])
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
                formFields[field?.trim()]?.trim()?.toLowerCase()
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
          (param) => param.fieldId === defaultFieldId
        );

        if (isDefaultExist) continue;

        submitRequestFieldsPayload.push({
          fieldId: defaultFieldId,
          values: [requestFormDefaultFields[defaultFieldId]],
        });
      }

      // Submit Request Form
      const submittedRequestFormData = await submitRequestForm(
        wrikeToken,
        requetFormId,
        submitRequestFieldsPayload
      );

      // Sending submit request form error response
      if (submittedRequestFormData?.errorDescription) {
        return reject({ message: submittedRequestFormData?.errorDescription });
      }

      const asynJobData = await getRequestFormStatus(
        wrikeToken,
        submittedRequestFormData?.data[0]?.id
      );

      // Sending folder update error response
      if (asynJobData?.errorMessage) {
        return reject({ message: asynJobData?.errorMessage });
      }

      let outputData = {};
      if (asynJobData?.result?.projectId)
        outputData = await getFolder(
          wrikeToken,
          asynJobData?.result?.projectId
        );
      else outputData = await getTask(wrikeToken, asynJobData?.result?.taskId);

      // Sending folder update error response
      if (outputData?.errorDescription) {
        return reject({ message: outputData?.errorDescription });
      }

      const folderCustomFieldValues = {};

      for (const [key, value] of Object.entries(datahubCustomFieldsData)) {
        const cfValue =
          outputData?.data[0]?.customFields?.find(
            (field) => field.id === value.cfId
          )?.value ?? "";

        folderCustomFieldValues[key] = cfValue;
      }

      // Sending final response
      resolve({
        data: {
          type: "Campaign",
          // customfieldlist: outputData?.data[0]?.customFields,
          folderId: outputData?.data[0]?.id,
          noofcrs: folderCustomFieldValues["noofcrs"],
          agency: folderCustomFieldValues["agency"],
          mediabuyingtype: folderCustomFieldValues["mediabuyingtype"],
          brand: folderCustomFieldValues["brand"],
          briefeddate: folderCustomFieldValues["briefeddate"],
          campaignbudget: folderCustomFieldValues["campaignbudget"],
          campaignenddate: folderCustomFieldValues["campaignenddate"],
          campaignid: folderCustomFieldValues["campaignid"],
          campaignname: folderCustomFieldValues["campaignname"],
          campaignobjective: folderCustomFieldValues["campaignobjective"],
          campaignstartdate: folderCustomFieldValues["campaignstartdate"],
          campaignfeedbackstatus:
            folderCustomFieldValues["campaignfeedbackstatus"],
          ccuid: folderCustomFieldValues["ccuid"],
          mediachannelpractice: folderCustomFieldValues["mediachannelpractice"],
          client: folderCustomFieldValues["client"],
          comments: folderCustomFieldValues["comments"],
          cssid: folderCustomFieldValues["cssid"],
          currency: folderCustomFieldValues["currency"],
          customerponumber: folderCustomFieldValues["customerponumber"],
          debtor: folderCustomFieldValues["debtor"],
          kpiobjective: folderCustomFieldValues["kpiobjective"],
          originalagency: folderCustomFieldValues["originalagency"],
          readyforarchive: folderCustomFieldValues["readyforarchive"],
          region: folderCustomFieldValues["region"],
          requestedstartdate: folderCustomFieldValues["requestedstartdate"],
          requestormarket: folderCustomFieldValues["requestormarket"],
          spacename: folderCustomFieldValues["spacename"],
          workitemlevel: folderCustomFieldValues["workitemlevel"],
        },
      });
    } catch (err) {
      console.log(err?.message || err);
      reject({
        message:
          "Fatal error Unexpected error occurred and service is unable complete the request.",
      });
    }
  });
};

const getSpaceDatahub = async (wrikeToken) => {
  try {
    const datahubRecords = await getDatahubRecords(
      wrikeToken,
      process.env.DATAHUB_SPACE_ID
    );

    if (datahubRecords?.errorDescription) {
      return Promise.reject({
        errorDescription: datahubRecords?.errorDescription,
      });
    }

    let datahubSpaceData = {};
    datahubRecords?.data?.forEach((record) => {
      datahubSpaceData[record.title?.trim()?.toLowerCase()] = record.id;
    });

    return Promise.resolve(datahubSpaceData);
  } catch (err) {
    return Promise.reject(err);
  }
};

const getEntityDatahub = async (wrikeToken) => {
  try {
    const datahubRecords = await getDatahubRecords(
      wrikeToken,
      process.env.DATAHUB_ENTITY_ID
    );

    if (datahubRecords?.errorDescription) {
      return Promise.reject({
        errorDescription: datahubRecords?.errorDescription,
      });
    }

    let datahubEntityData = {};
    datahubRecords?.data?.forEach((record) => {
      datahubEntityData[record.title?.trim()?.toLowerCase()] = record.id;
    });

    return Promise.resolve(datahubEntityData);
  } catch (err) {
    return Promise.reject(err);
  }
};

const getCustomFieldsDatahub = async (wrikeToken) => {
  try {
    const datahubFields = await getDatahubFields(
      wrikeToken,
      process.env.DATAHUB_CUSTOM_FIELDS_ID
    );

    if (datahubFields?.errorDescription) {
      return Promise.reject({
        errorDescription: datahubFields?.errorDescription,
      });
    }

    let formFieldsIds = {};
    datahubFields?.data?.forEach((field) => {
      formFieldsIds[field.title?.trim()?.toLowerCase()] = field.id;
    });

    const datahubRecords = await getDatahubRecords(
      wrikeToken,
      process.env.DATAHUB_CUSTOM_FIELDS_ID
    );

    if (datahubRecords?.errorDescription) {
      return Promise.reject({
        errorDescription: datahubRecords?.errorDescription,
      });
    }

    let datahubCustomFieldsData = {};
    datahubRecords?.data?.forEach((record) => {
      if (record.fieldValues[formFieldsIds["short code"]]?.trim())
        datahubCustomFieldsData[
          record.fieldValues[formFieldsIds["short code"]]?.trim()?.toLowerCase()
        ] = {
          id: record.id,
          ["cfId"]: record.fieldValues[formFieldsIds["cf id"]],
        };
    });

    return Promise.resolve(datahubCustomFieldsData);
  } catch (err) {
    return Promise.reject(err);
  }
};

const getRequestFormFieldDatahub = async (
  wrikeToken,
  space,
  varientId,
  datahubCustomFieldsData,
  datahubSpaceData
) => {
  try {
    const datahubFields = await getDatahubFields(
      wrikeToken,
      process.env.DATAHUB_REQUEST_FORM_FIELDS_ID
    );

    if (datahubFields?.errorDescription) {
      return Promise.reject({
        errorDescription: datahubFields?.errorDescription,
      });
    }

    let formFieldsIds = {};
    datahubFields?.data?.forEach((field) => {
      formFieldsIds[field.title?.trim()?.toLowerCase()] = field.id;
    });

    const datahubRecords = await getDatahubRecords(
      wrikeToken,
      process.env.DATAHUB_REQUEST_FORM_FIELDS_ID
    );

    if (datahubRecords?.errorDescription) {
      return Promise.reject({
        errorDescription: datahubRecords?.errorDescription,
      });
    }

    let datahubRequestFormFieldsData = {};
    datahubRecords?.data?.forEach((record) => {
      if (
        record.fieldValues[formFieldsIds["space"]]?.[0] ===
          datahubSpaceData[space?.trim()?.toLowerCase()] &&
        record.fieldValues[formFieldsIds["variant id"]] === varientId
      ) {
        let customFieldCode = "";
        for (const cf in datahubCustomFieldsData) {
          if (
            datahubCustomFieldsData[cf].id ===
            record.fieldValues[formFieldsIds["xpi shortcode"]][0]
          ) {
            customFieldCode = cf;
            // return;
          }
        }

        if (customFieldCode)
          datahubRequestFormFieldsData[customFieldCode] = {
            id: record.id,
            ["fieldId"]: record.fieldValues[formFieldsIds["field v4id"]],
          };
        else if (record.fieldValues[formFieldsIds["xpi custom shortcode"]])
          datahubRequestFormFieldsData[
            record.fieldValues[formFieldsIds["xpi custom shortcode"]]
          ] = {
            id: record.id,
            ["fieldId"]: record.fieldValues[formFieldsIds["field v4id"]],
          };
      }
    });

    return Promise.resolve(datahubRequestFormFieldsData);
  } catch (err) {
    return Promise.reject(err);
  }
};

const findRequestFormId = async (
  wrikeToken,
  space,
  entity,
  varientId,
  datahubSpaceData,
  datahubEntityData
) => {
  try {
    const formFields = await getDatahubFields(
      wrikeToken,
      process.env.DATAHUB_REQUEST_FORM_ID
    );

    if (formFields?.errorDescription) {
      return {
        errorDescription: formFields?.errorDescription,
      };
    }

    let formFieldsIds = {};
    formFields?.data?.forEach((field) => {
      if (requiredDatahubRequestFormIds.includes(field.title)) {
        formFieldsIds[field.title] = field.id;
      }
    });

    const datahubRecords = await getDatahubRecords(
      wrikeToken,
      process.env.DATAHUB_REQUEST_FORM_ID
    );

    const datahubMatchedRecord = datahubRecords?.data?.find(
      (record) =>
        record.fieldValues[formFieldsIds["Space"]]?.[0] ===
          datahubSpaceData[space?.trim()?.toLowerCase()] &&
        record.fieldValues[formFieldsIds["XPI Entity"]]?.[0] ===
          datahubEntityData[entity?.trim()?.toLowerCase()] &&
        record.fieldValues[formFieldsIds["Variant Id"]] === varientId
    );

    return {
      requiredFormId:
        datahubMatchedRecord.fieldValues[formFieldsIds["RF v4Id"]] || null,
    };
  } catch (err) {
    return err;
  }
};
