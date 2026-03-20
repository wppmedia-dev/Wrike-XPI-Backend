import { encryptField, decryptField } from "./crypto";
import { WrikeCredentials } from "../controllers";
require("dotenv").config();

/**
 * Fetch and decrypt Wrike credentials for an environment
 * @param {string} environmentName - environment name
 * @returns {Promise<object|null>} Decrypted credentials or null if not found
 */
export const getWrikeCredentials = async (environmentName) => {
  try {
    const credential = await WrikeCredentials.GetByType(environmentName);

    if (!credential) return null;

    return {
      id: credential?.id,
      environmentName: credential.environment_name,
      apiClientId: credential.api_client_id
        ? decryptField(credential.api_client_id)
        : null,
      apiClientSecret: credential.api_client_secret
        ? decryptField(credential.api_client_secret)
        : null,
      automationClientId: credential.automation_client_id
        ? decryptField(credential.automation_client_id)
        : null,
      automationClientSecret: credential.automation_client_secret
        ? decryptField(credential.automation_client_secret)
        : null,
    };
  } catch (err) {
    throw err;
  }
};

/**
 * Fetch all credentials (all environments)
 * @returns {Promise<object>} Object keyed by environment name
 */
export const getAllWrikeCredentials = async () => {
  try {
    const credentials = await WrikeCredentials.GetAll();
    const result = {};

    for (const credential of credentials) {
      const decrypted = await getWrikeCredentials(credential.environment_name);
      if (decrypted) {
        result[credential.environment_name] = decrypted;
      }
    }

    return result;
  } catch (err) {
    throw err;
  }
};

/**
 * Sync credentials from database into in-memory cache.
 * Call at startup and after any credential change.
 * @returns {Promise<object>} Synced credentials keyed by environment name
 */
let cachedCredentials = {};

export const syncWrikeCredentialsFromDB = async () => {
  try {
    const allCredentials = await getAllWrikeCredentials();
    cachedCredentials = allCredentials;

    console.log("Wrike credentials synced from database successfully");
    return allCredentials;
  } catch (err) {
    console.error("Error syncing Wrike credentials:", err.message);
    throw err;
  }
};

/**
 * Get cached credentials
 * @param {string} environmentName - Environment name; returns all cached credentials if omitted
 * @returns {object|null} Cached credentials for the environment, or all cached credentials
 */
export const getCachedWrikeCredentials = (environmentName = null) => {
  if (environmentName) {
    return cachedCredentials[environmentName] || null;
  }
  return cachedCredentials;
};

/**
 * Clear cached credentials
 */
export const clearCachedWrikeCredentials = () => {
  cachedCredentials = {};
};
