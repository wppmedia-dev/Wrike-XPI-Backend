import { GetResponse } from "../../../utils/node-fetch";
import * as customFieldIdMeta from "../utils/customFieldsIds";

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

      const { fields: formFields, requetFormId = "IEAC7PRTLIAA552O" } = params;

      if (!requetFormId)
        return reject({
          statusCode: 403,
          message:
            "Missing parameter! Required parameter requestForm field is missing for the requested operation.",
        });

      const customFieldIds = customFieldIdMeta["live"];

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

      formFields.map((field) => {
        requestFormPages?.map((page) => {
          const formFieldData = page?.fields.find(
            (f) => f.title?.toLowerCase() === field.title?.toLowerCase()
          );

          if (!formFieldData)
            return reject({
              message: `Field with title "${field.title}" does not exist in the request form. Please use a valid title.`,
            });

          let valuesArray = [];
          if (formFieldData?.items) {
            field.values?.map((value) => {
              const { id = null } = formFieldData?.items.find(
                (item) => item.title?.toLowerCase() === value?.toLowerCase()
              );

              valuesArray.push(id);
            });

            if (valuesArray?.length == 0)
              return reject({
                message: `Value "${field.values}" does not exist in the request form field "${field.title}". Please use a valid value.`,
              });
          } else {
            valuesArray = field?.values;
          }

          submitRequestFieldsPayload.push({
            fieldId: formFieldData?.id,
            values: valuesArray,
          });
        });
      });

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
          customfieldlist: outputData?.data[0]?.customFields,
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
