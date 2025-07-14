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

export const getDatahubRecords = async (wrikeToken, databaseId) => {
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

export const getTask = async (wrikeToken, taskId) => {
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
