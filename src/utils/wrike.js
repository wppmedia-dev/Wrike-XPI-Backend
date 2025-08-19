import { getSecrets } from "./azure_vault";
import { GetResponse } from "./node-fetch";
require("dotenv").config();

const { WRIKE_LOGIN_ENDPOINT, WRIKE_REDIRECT_URL } = process.env;

export const getWrikeTokens = async ({ code, refresh_token }) => {
  return new Promise(async (resolve, reject) => {
    try {
      if (!code && !refresh_token)
        return reject({
          message:
            "Missing parameter! Either code or refresh_token must not be empty",
        });

      const secretValues = await getSecrets([
        "XPI-API-ClientId",
        "XPI-API-ClientSecret",
      ]);

      const WRIKE_CLIENT_ID = secretValues["XPI-API-ClientId"];
      const WRIKE_CLIENT_SECRET = secretValues["XPI-API-ClientSecret"];

      if (!WRIKE_LOGIN_ENDPOINT || !WRIKE_CLIENT_ID || !WRIKE_CLIENT_SECRET) {
        return reject({
          message: "Unable to fetch token! Please try after sometimes",
        });
      }

      const url = `${WRIKE_LOGIN_ENDPOINT}/token`;

      let payload = {
        client_id: WRIKE_CLIENT_ID,
        client_secret: WRIKE_CLIENT_SECRET,
        grant_type: code ? "authorization_code" : "refresh_token",
        redirect_uri: WRIKE_REDIRECT_URL,
      };

      if (code) payload.code = code;

      if (refresh_token) payload.refresh_token = refresh_token;

      const result = await GetResponse(
        url,
        "POST",
        {
          "content-type": "application/x-www-form-urlencoded",
        },
        payload
      );

      if (result?.error)
        return reject({ message: result["error_description"] });

      resolve(result);
    } catch (err) {
      console.log("Error while getting access token: ", err?.message ?? err);
      reject(err);
    }
  });
};

// Datahub Util Functions
export const getDatahubFields = async (wrikeToken, databaseId) => {
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

export const getDatahubRecords = async (
  wrikeToken,
  databaseId,
  isRecursive = true,
  fieldIds,
  filter = "",
  pageToken = null,
  accumulatedData = []
) => {
  try {
    let url = pageToken
      ? `${process.env.WRIKE_DATAHUB_ENDPOINT}/databases/${databaseId}/records?limit=${process.env.WRIKE_DATAHUB_RECORDS_LIMIT ?? "300"}&nextPageToken=${pageToken}`
      : `${process.env.WRIKE_DATAHUB_ENDPOINT}/databases/${databaseId}/records?limit=${process.env.WRIKE_DATAHUB_RECORDS_LIMIT ?? "300"}`;

    if (filter) {
      url += `&filter=${filter}`;
    }

    if (fieldIds) {
      url += `&fieldIds=${fieldIds.join(",")}`;
    }
    const response = await GetResponse(url, "GET", {
      "content-type": "application/json",
      Authorization: `Bearer ${wrikeToken}`,
    });

    if (response?.errorDescription) {
      return response;
    }

    // Append current page data to accumulated data
    const combinedData = [...accumulatedData, ...(response?.data || [])];

    // If there's a nextPageToken, recursively fetch the next page
    if (isRecursive && response?.nextPageToken) {
      return await getDatahubRecords(
        wrikeToken,
        databaseId,
        isRecursive,
        fieldIds,
        filter,
        response.nextPageToken,
        combinedData
      );
    }

    // Return the final result with all accumulated data
    return {
      ...response,
      data: combinedData,
      nextPageToken: response?.nextPageToken,
    };
  } catch (err) {
    return err;
  }
};

export const getDatahubGroupedDataById = async (
  wrikeToken,
  datahubId,
  isMaster = false
) => {
  try {
    if (!datahubId)
      return Promise.reject({
        message: "Missing datahubId",
      });

    const datahubFields = await getDatahubFields(wrikeToken, datahubId);

    if (datahubFields?.errorDescription) {
      return Promise.reject({
        errorDescription: datahubFields?.errorDescription,
      });
    }

    let formFieldsIds = {};
    datahubFields?.data?.forEach((field) => {
      formFieldsIds[field.title?.trim()?.toLowerCase()] = field.id;
    });

    const datahubRecords = await getDatahubRecords(wrikeToken, datahubId);

    if (datahubRecords?.errorDescription) {
      return Promise.reject({
        errorDescription: datahubRecords?.errorDescription,
      });
    }

    let datahubData = {};
    datahubRecords?.data?.forEach((record) => {
      if (
        record.fieldValues[
          formFieldsIds[isMaster ? "master slug" : "short code"]
        ]?.trim()
      )
        datahubData[
          record.fieldValues[
            formFieldsIds[isMaster ? "master slug" : "short code"]
          ]
            ?.trim()
            ?.toLowerCase()
        ] = {
          id: record.id,
          ["cfId"]: record.fieldValues[formFieldsIds["cf id"]],
          isCampaignField: record.fieldValues[formFieldsIds["campaign"]],
          isChannelField: record.fieldValues[formFieldsIds["channel"]],
          isTaskField: record.fieldValues[formFieldsIds["channel task"]],
          isWritable:
            record.fieldValues[formFieldsIds["api access"]]
              ?.toLowerCase()
              ?.includes("write") ?? false,
          isReadable:
            record.fieldValues[formFieldsIds["api access"]]
              ?.toLowerCase()
              ?.includes("read") ?? false,
          isMasterDataFeatureReadable:
            record.fieldValues[formFieldsIds["master data feature"]]?.includes(
              "Read"
            ) ?? false,
          cfType: record.fieldValues[formFieldsIds["cf type"]],
        };
    });

    return Promise.resolve(datahubData);
  } catch (err) {
    return Promise.reject(err);
  }
};

export const getDatahubDataById = async (wrikeToken, datahubId) => {
  try {
    if (!datahubId)
      return Promise.reject({
        message: "Missing datahubId",
      });

    const datahubFields = await getDatahubFields(wrikeToken, datahubId);

    if (datahubFields?.errorDescription) {
      return Promise.reject({
        errorDescription: datahubFields?.errorDescription,
      });
    }

    let formFieldsIds = {};
    datahubFields?.data?.forEach((field) => {
      formFieldsIds[field.id] = field.title?.trim()?.toLowerCase();
    });

    const datahubRecords = await getDatahubRecords(wrikeToken, datahubId);

    if (datahubRecords?.errorDescription) {
      return Promise.reject({
        errorDescription: datahubRecords?.errorDescription,
      });
    }

    let datahubData = [];
    datahubRecords?.data?.forEach((record) => {
      let fields = {};
      for (const field in record.fieldValues) {
        fields[formFieldsIds[field]] = record.fieldValues[field];
      }

      datahubData.push(fields);
    });

    return Promise.resolve(datahubData);
  } catch (err) {
    return Promise.reject(err);
  }
};

export const getCustomFields = async (wrikeToken, customFieldId = null) => {
  try {
    let url = `${process.env.WRIKE_ENDPOINT}/customfields`;

    // If specific custom field ID is provided
    if (customFieldId) {
      url += `/${customFieldId}`;
    }

    const customFieldsData = await GetResponse(url, "GET", {
      "content-type": "application/json",
      Authorization: `Bearer ${wrikeToken}`,
    });

    return customFieldsData;
  } catch (err) {
    return err;
  }
};

export const getRequestForm = async (wrikeToken) => {
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

export const submitRequestForm = async (
  wrikeToken,
  requetFormId,
  formFields
) => {
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

export const getRequestFormStatus = async (
  wrikeToken,
  asyncJobId,
  retryCount = 0
) => {
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

export const getFolder = async (wrikeToken, folderId) => {
  try {
    // Get folder data
    const wrikeRequestFormData = await GetResponse(
      `${process.env.WRIKE_ENDPOINT}/folders/${folderId}`,
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

export const updateFolder = async (
  wrikeToken,
  folderId,
  folderCFUpdateData
) => {
  try {
    // Get folder data
    const wrikeRequestFormData = await GetResponse(
      `${process.env.WRIKE_ENDPOINT}/folders/${folderId}?customFields=${JSON.stringify(folderCFUpdateData)}`,
      "PUT",
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

export const deleteFolder = async (wrikeToken, folderId) => {
  try {
    // Get folder data
    const wrikeRequestFormData = await GetResponse(
      `${process.env.WRIKE_ENDPOINT}/folders/${folderId}`,
      "DELETE",
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

export const uploadAttachment = async (wrikeToken, fileBuffer, fileName) => {
  try {
    const url = `${process.env.WRIKE_ENDPOINT}/attachments`;

    const headers = {
      Authorization: `Bearer ${wrikeToken}`,
      "content-type": "application/octet-stream",
      "X-Requested-With": "XMLHttpRequest",
      "X-File-Name": fileName,
    };

    const result = await GetResponse(url, "POST", headers, fileBuffer, true);

    return result;
  } catch (err) {
    throw err;
  }
};

// Tasks API

export const getTask = async (wrikeToken, folderId) => {
  try {
    // Get folder data
    const wrikeRequestFormData = await GetResponse(
      `${process.env.WRIKE_ENDPOINT}/tasks/${folderId}`,
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

export const updateTask = async (wrikeToken, taskId, taskCFUpdateData) => {
  try {
    // Get folder data
    const wrikeRequestFormData = await GetResponse(
      `${process.env.WRIKE_ENDPOINT}/tasks/${taskId}?customFields=${JSON.stringify(taskCFUpdateData)}`,
      "PUT",
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

export const deleteTask = async (wrikeToken, taskId) => {
  try {
    // Get folder data
    const wrikeRequestFormData = await GetResponse(
      `${process.env.WRIKE_ENDPOINT}/tasks/${taskId}`,
      "DELETE",
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
