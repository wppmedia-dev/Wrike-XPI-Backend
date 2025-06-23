import { GetResponse } from "../../../utils/node-fetch";
import * as customFieldIdMeta from "../utils/customFieldsIds";

const requiredDatahubRequestFormIds = [
  "XPI Entity",
  "Space",
  "RF v4Id",
  "Variant Id",
];
let datahubSpaceData = {};
let datahubEntityData = {};
let datahubCustomFieldsData = {};
let datahubRequestFormFieldsData = {};

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

      const customFieldIds = customFieldIdMeta["live"];

      // Find Request Form ID
      const requetForm = await findRequestFormId(
        wrikeToken,
        space,
        entity,
        varientId
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

      if (Object.keys(datahubCustomFieldsData).length === 0) {
        await getCustomFieldsDatahub(wrikeToken);
      }

      if (Object.keys(datahubRequestFormFieldsData).length === 0) {
        await getRequestFormFieldDatahub(wrikeToken, space, varientId);
      }

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

      // Object.keys(formFields).forEach((field) => {
      for (const field in datahubRequestFormFieldsData) {
        let matchedField = null;

        // Try to find the matching field in any page
        for (const page of requestFormPages || []) {
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
              item.title?.toLowerCase(),
              item.id,
            ])
          );

          const id = lowerItemMap.get(formFields[field]?.toLowerCase()) || null;

          if (!id) {
            return reject({
              message: `Value "${formFields[field]}" does not exist in the request form field "${field}". Please use a valid value.`,
            });
          }

          valuesArray.push(id);
        } else {
          valuesArray = [formFields[field]];
        }

        submitRequestFieldsPayload.push({
          fieldId: matchedField.id,
          values: valuesArray,
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
        outputData = await getProject(
          wrikeToken,
          asynJobData?.result?.projectId
        );
      else outputData = await getTask(wrikeToken, asynJobData?.result?.taskId);

      // Sending folder update error response
      if (outputData?.errorDescription) {
        return reject({ message: outputData?.errorDescription });
      }

      const folderCustomFieldValues = {};

      for (const [key, value] of Object.entries(customFieldIds)) {
        const cfValue =
          outputData?.data[0]?.customFields?.find(
            (field) => field.id === value.id
          )?.value ?? "";

        folderCustomFieldValues[key] = cfValue;
      }

      // Sending final response
      resolve({
        data: {
          type: "Campaign",
          // customfieldlist: outputData?.data[0]?.customFields,
          noofcrs: folderCustomFieldValues["# CRs"],
          agency: folderCustomFieldValues["Agency*"],
          mediabuyingtype: folderCustomFieldValues["Biddable/Non-Biddable*"],
          brand: folderCustomFieldValues["Brand*"],
          briefeddate: folderCustomFieldValues["Briefed Date*"],
          campaignbudget: folderCustomFieldValues["Campaign Budget*"],
          campaignenddate: folderCustomFieldValues["Campaign End Date*"],
          campaignid: folderCustomFieldValues["Campaign ID*"],
          campaignname: folderCustomFieldValues["Campaign Name*"],
          campaignobjective: folderCustomFieldValues["Campaign Objective*"],
          campaignstartdate: folderCustomFieldValues["Campaign Start Date*"],
          campaignfeedbackstatus:
            folderCustomFieldValues["CampaignFeedbackStatus*"],
          ccuid: folderCustomFieldValues["CCUID*"],
          mediachannelpractice: folderCustomFieldValues["Channel/Practice*"],
          client: folderCustomFieldValues["Client*"],
          comments: folderCustomFieldValues["Comments*"],
          cssid: folderCustomFieldValues["CSSID*"],
          currency: folderCustomFieldValues["Currency"],
          customerponumber: folderCustomFieldValues["PO Number"],
          debtor: folderCustomFieldValues["Debtor*"],
          kpiobjective: folderCustomFieldValues["KPI Objective*"],
          originalagency: folderCustomFieldValues["Original Agency*"],
          readyforarchive: folderCustomFieldValues["ReadyForArchive*"],
          region: folderCustomFieldValues["Region*"],
          requestedstartdate: folderCustomFieldValues["Requested Start Date*"],
          requestormarket: folderCustomFieldValues["Requestor's Market*"],
          spacename: folderCustomFieldValues["Space Name*"],
          workitemlevel: folderCustomFieldValues["Work Item Level"],
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

    datahubRecords?.data?.forEach((record) => {
      datahubSpaceData[record.title?.toLowerCase()] = record.id;
    });
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

    datahubRecords?.data?.forEach((record) => {
      datahubEntityData[record.title?.toLowerCase()] = record.id;
    });
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
      formFieldsIds[field.title?.toLowerCase()] = field.id;
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

    datahubRecords?.data?.forEach((record) => {
      datahubCustomFieldsData[record.title?.toLowerCase()] = {
        id: record.id,
        ["cfId"]: record.fieldValues[formFieldsIds["cf id"]],
        ["code"]: record.fieldValues[formFieldsIds["code"]],
      };
    });
  } catch (err) {
    return Promise.reject(err);
  }
};

const getRequestFormFieldDatahub = async (wrikeToken, space, varientId) => {
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
      formFieldsIds[field.title?.toLowerCase()] = field.id;
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

    datahubRecords?.data?.forEach((record) => {
      if (
        record.fieldValues[formFieldsIds["space"]]?.[0] ===
          datahubSpaceData[space?.toLowerCase()] &&
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
      }
    });
  } catch (err) {
    return Promise.reject(err);
  }
};

const findRequestFormId = async (wrikeToken, space, entity, varientId) => {
  try {
    if (Object.keys(datahubSpaceData).length == 0) {
      await getSpaceDatahub(wrikeToken);
    }

    if (Object.keys(datahubEntityData).length == 0) {
      await getEntityDatahub(wrikeToken);
    }

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
          datahubSpaceData[space?.toLowerCase()] &&
        record.fieldValues[formFieldsIds["XPI Entity"]]?.[0] ===
          datahubEntityData[entity?.toLowerCase()] &&
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

// Datahub Util Functions
const getDatahubFields = async (wrikeToken, databaseId) => {
  try {
    // Get folder data
    const datahubFields = await GetResponse(
      `${process.env.WRIKE_DATAHUB_ENDPOINT}/databases/${databaseId}/fields`,
      "GET",
      {
        "content-type": "application/json",
        Authorization: `Bearer ${wrikeToken}`,
      }
    );

    return datahubFields;
  } catch (err) {
    return err;
  }
};

const getDatahubRecords = async (wrikeToken, databaseId) => {
  try {
    // Get folder data
    const datahubRecords = await GetResponse(
      `${process.env.WRIKE_DATAHUB_ENDPOINT}/databases/${databaseId}/records`,
      "GET",
      {
        "content-type": "application/json",
        Authorization: `Bearer ${wrikeToken}`,
      }
    );

    return datahubRecords;
  } catch (err) {
    return err;
  }
};

const getRequestForm = async (wrikeToken) => {
  try {
    // Get folder data
    const wrikeRequestFormData = await GetResponse(
      `${process.env.WRIKE_ENDPOINT}/spaces/${process.env.REQUEST_FORM_SPACE_ID}/request_forms`,
      "GET",
      {
        "content-type": "application/json",
        Authorization: `Bearer ${wrikeToken}`,
      }
    );

    return wrikeRequestFormData;
  } catch (err) {
    return err;
  }
};

const submitRequestForm = async (wrikeToken, requetFormId, formFields) => {
  try {
    // Get folder data
    const wrikeRequestFormData = await GetResponse(
      `${process.env.WRIKE_ENDPOINT}/request_forms/${requetFormId}/submit`,
      "POST",
      {
        "content-type": "application/json",
        Authorization: `Bearer ${wrikeToken}`,
      },
      {
        formFields,
      }
    );

    return wrikeRequestFormData;
  } catch (err) {
    return err;
  }
};

const getRequestFormStatus = async (wrikeToken, asyncJobId, retryCount = 0) => {
  try {
    // Get async job status (should be GET, not POST)
    const wrikeRequestFormData = await GetResponse(
      `${process.env.WRIKE_ENDPOINT}/async_job/${asyncJobId}`,
      "GET",
      {
        "content-type": "application/json",
        Authorization: `Bearer ${wrikeToken}`,
      }
    );

    const jobStatus = wrikeRequestFormData?.data?.[0]?.status;

    if (jobStatus === "InProgress") {
      if (retryCount >= 10)
        return { errorMessage: "Async job polling timed out." };

      // Wait 2 seconds before retrying
      await new Promise((resolve) => setTimeout(resolve, 2000));
      return getRequestFormStatus(wrikeToken, asyncJobId, retryCount + 1);
    } else if (jobStatus === "Completed" || jobStatus === "Failed") {
      return wrikeRequestFormData?.data[0];
    } else return { errorMessage: `Unknown job status: ${jobStatus}` };
  } catch (error) {
    return error;
  }
};

const getTask = async (wrikeToken, taskId) => {
  try {
    // Get folder data
    const wrikeRequestFormData = await GetResponse(
      `${process.env.WRIKE_ENDPOINT}/tasks/${taskId}`,
      "GET",
      {
        "content-type": "application/json",
        Authorization: `Bearer ${wrikeToken}`,
      }
    );

    return wrikeRequestFormData;
  } catch (err) {
    return err;
  }
};

const getProject = async (wrikeToken, projectId) => {
  try {
    // Get folder data
    const wrikeRequestFormData = await GetResponse(
      `${process.env.WRIKE_ENDPOINT}/folders/${projectId}`,
      "GET",
      {
        "content-type": "application/json",
        Authorization: `Bearer ${wrikeToken}`,
      }
    );

    return wrikeRequestFormData;
  } catch (err) {
    return err;
  }
};
