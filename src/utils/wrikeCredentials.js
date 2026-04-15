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
      clientId: credential.client_id
        ? decryptField(credential.client_id)
        : null,
      clientSecret: credential.client_secret
        ? decryptField(credential.client_secret)
        : null,
      accountId: credential.account_id || null,
      xpiApiModulesDatahubId: credential.xpi_api_modules_datahub_id || null,
      xpiApiServicesDatahubId: credential.xpi_api_services_datahub_id || null,
      xpiEntityDatahubId: credential.xpi_entity_datahub_id || null,
      xpiFieldMappingDatahubId: credential.xpi_field_mapping_datahub_id || null,
      xpiRequestFormFieldMappingDatahubId:
        credential.xpi_request_form_field_mapping_datahub_id || null,
      xpiRequestFormMappingDatahubId:
        credential.xpi_request_form_mapping_datahub_id || null,
      xpiSpaceNameDatahubId: credential.xpi_space_name_datahub_id || null,
      campaignSpaceId: credential.campaign_space_id || null,
      requestFormSpaceId: credential.request_form_space_id || null,
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
 * Fetch all visible credentials (visible environments only)
 * @returns {Promise<object>} Object keyed by environment name
 */
export const getAllVisibleWrikeCredentials = async () => {
  try {
    const credentials = await WrikeCredentials.GetAllVisible();
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
let cachedVisibleCredentials = {};

export const syncWrikeCredentialsFromDB = async () => {
  try {
    const allCredentials = await getAllWrikeCredentials();
    const visibleCredentials = await getAllVisibleWrikeCredentials();

    cachedCredentials = allCredentials;
    cachedVisibleCredentials = visibleCredentials;

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
 * Get cached visible credentials (for user-facing dropdowns)
 * @param {string} environmentName - Environment name; returns all visible cached credentials if omitted
 * @returns {object|null} Cached visible credentials for the environment, or all visible cached credentials
 */
export const getCachedVisibleWrikeCredentials = (environmentName = null) => {
  if (environmentName) {
    return cachedVisibleCredentials[environmentName] || null;
  }
  return cachedVisibleCredentials;
};

/**
 * Clear cached credentials
 */
export const clearCachedWrikeCredentials = () => {
  cachedCredentials = {};
};

/**
 * Get Datahub IDs for an environment
 * @param {string} environmentName - Environment name
 * @returns {object} Datahub IDs with keys matching env variable names for backward compatibility
 */
export const getDatahubIds = (environmentName) => {
  const cred = getCachedWrikeCredentials(environmentName);

  return {
    DATAHUB_REQUEST_FORM_ID:
      cred?.xpiRequestFormMappingDatahubId ||
      process.env.DATAHUB_REQUEST_FORM_ID,
    DATAHUB_SPACE_ID:
      cred?.xpiSpaceNameDatahubId || process.env.DATAHUB_SPACE_ID,
    DATAHUB_ENTITY_ID:
      cred?.xpiEntityDatahubId || process.env.DATAHUB_ENTITY_ID,
    DATAHUB_CUSTOM_FIELDS_ID:
      cred?.xpiFieldMappingDatahubId || process.env.DATAHUB_CUSTOM_FIELDS_ID,
    DATAHUB_REQUEST_FORM_FIELDS_ID:
      cred?.xpiRequestFormFieldMappingDatahubId ||
      process.env.DATAHUB_REQUEST_FORM_FIELDS_ID,
    DATAHUB_AMOEBA_MODULE_ID:
      cred?.xpiApiModulesDatahubId || process.env.DATAHUB_AMOEBA_MODULE_ID,
    DATAHUB_AMOEBA_SERVICE_ID:
      cred?.xpiApiServicesDatahubId || process.env.DATAHUB_AMOEBA_SERVICE_ID,
  };
};

/**
 * Get a specific Datahub ID for an environment by key
 * @param {string} environmentName - Environment name
 * @param {string} key - Datahub ID key (e.g., 'DATAHUB_SPACE_ID')
 * @returns {string} Datahub ID or env variable fallback
 */
export const getDatahubIdByKey = (environmentName, key) => {
  const ids = getDatahubIds(environmentName);
  return ids[key];
};
