import {
  saveWrikeCredentials,
  getWrikeCredentials,
  syncWrikeCredentialsFromDB,
} from "../../../utils/wrikeCredentials";

/**
 * Save or update Wrike credentials
 * Expects body: { credentialType: "API" | "AUTOMATION", clientId, clientSecret, token? }
 */
export const SaveWrikeCredentials = (body, fastify) => {
  return new Promise(async (resolve, reject) => {
    try {
      const { credentialType, clientId, clientSecret, token } = body;

      if (!clientId || !clientSecret) {
        return reject({
          statusCode: 400,
          message: "clientId and clientSecret are required",
        });
      }

      const result = await saveWrikeCredentials(credentialType, {
        clientId,
        clientSecret,
        token,
      });

      // Sync credentials after saving
      await syncWrikeCredentialsFromDB();

      return resolve({
        statusCode: 200,
        message: `${credentialType} credentials saved successfully`,
        data: result,
      });
    } catch (err) {
      console.error("Error saving Wrike credentials:", err);
      return reject({
        statusCode: err?.statusCode || 500,
        message: err?.message || err,
      });
    }
  });
};

/**
 * Get Wrike credentials for a specific type
 * Expects query: { credentialType: "API" | "AUTOMATION" }
 */
export const GetWrikeCredentials = (query, fastify) => {
  return new Promise(async (resolve, reject) => {
    try {
      const { credentialType } = query;

      const credentials = await getWrikeCredentials(credentialType);

      if (!credentials) {
        return reject({
          statusCode: 404,
          message: `Credentials not found for type: ${credentialType}`,
        });
      }

      return resolve({
        statusCode: 200,
        message: "Credentials retrieved successfully",
        data: credentials,
      });
    } catch (err) {
      console.error("Error retrieving Wrike credentials:", err);
      return reject({
        statusCode: err?.statusCode || 500,
        message: err?.message || err,
      });
    }
  });
};

/**
 * Sync Wrike credentials from database
 */
export const SyncWrikeCredentials = (query, fastify) => {
  return new Promise(async (resolve, reject) => {
    try {
      const result = await syncWrikeCredentialsFromDB();

      return resolve({
        statusCode: 200,
        message: "Credentials synced successfully",
        data: result,
      });
    } catch (err) {
      console.error("Error syncing Wrike credentials:", err);
      return reject({
        statusCode: err?.statusCode || 500,
        message: err?.message || err,
      });
    }
  });
};
