import {
  saveWrikeCredentials,
  syncWrikeCredentialsFromDB,
} from "../../../utils/wrikeCredentials";
import { WrikeCredentials } from "../../../../models";

/**
 * Save or update Wrike credentials
 * Expects body: { environmentName, apiClientId, apiClientSecret, automationClientId?, automationClientSecret? }
 */
export const SaveWrikeCredentials = (body, fastify) => {
  return new Promise(async (resolve, reject) => {
    try {
      const {
        environmentName,
        apiClientId,
        apiClientSecret,
        automationClientId,
        automationClientSecret,
      } = body;

      if (!apiClientId || !apiClientSecret) {
        return reject({
          statusCode: 400,
          message: "apiClientId and apiClientSecret are required",
        });
      }

      const result = await saveWrikeCredentials(environmentName, {
        apiClientId,
        apiClientSecret,
        automationClientId,
        automationClientSecret,
      });

      // Sync credentials after saving
      await syncWrikeCredentialsFromDB();

      return resolve({
        statusCode: 200,
        message: `${environmentName} credentials saved successfully`,
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
 * Get Wrike credentials for a specific environment
 * Expects query: { environmentName: <environment name> }
 */
export const GetWrikeCredentials = (query, fastify) => {
  return new Promise(async (resolve, reject) => {
    try {
      const { environmentName } = query;

      const cred = await WrikeCredentials.findOne({
        where: {
          environment_name: environmentName,
          deleted_at: null,
        },
      });

      if (!cred) {
        return reject({
          statusCode: 404,
          message: `Credentials not found for environment: ${environmentName}`,
        });
      }

      return resolve({
        statusCode: 200,
        message: "Credentials retrieved successfully",
        data: {
          id: cred.id,
          environment_name: cred.environment_name,
          api_client_id: cred.api_client_id
            ? decryptField(cred.api_client_id)
            : null,
          api_client_secret: cred.api_client_secret || null,
          automation_client_id: cred.automation_client_id
            ? decryptField(cred.automation_client_id)
            : null,
          automation_client_secret: cred.automation_client_secret || null,
          is_active: cred.is_active,
          created_at: cred.created_at,
          updated_at: cred.updated_at,
        },
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
