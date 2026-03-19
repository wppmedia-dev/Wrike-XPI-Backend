import * as CryptoUtils from "./crypto";
import { WrikeCredentials } from "../controllers";
require("dotenv").config();

const ENCRYPTION_KEY = process.env.WRIKE_CREDENTIALS_ENCRYPTION_KEY;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

if (!ENCRYPTION_KEY) {
  console.warn(
    "WARNING: WRIKE_CREDENTIALS_ENCRYPTION_KEY not set in environment. Using default - change this in production!",
  );
}

/**
 * Get the encryption key from environment or use default
 * @returns {Buffer} The encryption key
 */
const getEncryptionKey = () => {
  if (!ENCRYPTION_KEY) {
    // Default key for development - MUST be changed in production
    return Buffer.alloc(32, "default-key-change-in-production");
  }
  // Convert hex string to buffer if needed
  if (typeof ENCRYPTION_KEY === "string" && ENCRYPTION_KEY.length === 64) {
    return Buffer.from(ENCRYPTION_KEY, "hex");
  }
  return Buffer.from(ENCRYPTION_KEY.padEnd(32, " ").substring(0, 32));
};

/**
 * Encrypt a single credential value
 * @param {string} value - The value to encrypt
 * @param {Buffer} dek - The Data Encryption Key
 * @returns {string} Base64 encoded encrypted value
 */
const encryptValue = (value, dek) => {
  try {
    const encrypted = CryptoUtils.encrypt(value, dek);
    return encrypted.toString("base64");
  } catch (err) {
    throw new Error(`Failed to encrypt value: ${err.message}`);
  }
};

/**
 * Decrypt a single credential value
 * @param {string} encryptedBase64 - Base64 encoded encrypted value
 * @param {Buffer} dek - The Data Encryption Key
 * @returns {string} Decrypted value
 */
const decryptValue = (encryptedBase64, dek) => {
  try {
    const encryptedBuffer = Buffer.from(encryptedBase64, "base64");
    const decrypted = CryptoUtils.decrypt(encryptedBuffer, dek);
    return decrypted.toString("utf-8");
  } catch (err) {
    throw new Error(`Failed to decrypt value: ${err.message}`);
  }
};

/**
 * Save Wrike credentials with encryption
 * @param {string} credentialType - "API" or "AUTOMATION"
 * @param {object} credentials - { clientId, clientSecret, token }
 * @returns {Promise<object>} Saved credential record
 */
export const saveWrikeCredentials = async (
  credentialType,
  { clientId, clientSecret, token },
) => {
  try {
    if (!clientId || !clientSecret) {
      throw new Error("clientId and clientSecret are required");
    }

    // Generate salt and derive KEK
    const salt = CryptoUtils.generateSalt();
    const kek = await CryptoUtils.deriveKEK(ENCRYPTION_KEY || "default", salt);

    // Generate DEK and wrap it
    const dek = CryptoUtils.generateDEK();
    const wrappedDEK = CryptoUtils.wrapDEK(dek, kek);

    // Encrypt credential values
    const encryptedClientId = encryptValue(clientId, dek);
    const encryptedClientSecret = encryptValue(clientSecret, dek);
    const encryptedToken = token ? encryptValue(token, dek) : null;

    // Save to database
    const credentialData = {
      encrypted_client_id: encryptedClientId,
      encrypted_client_secret: encryptedClientSecret,
      encrypted_token: encryptedToken,
      salt: salt.toString("hex"),
      wrapped_dek: wrappedDEK.toString("hex"),
      is_active: true,
    };

    const result = await WrikeCredentials.Upsert(
      credentialType,
      credentialData,
    );

    return result;
  } catch (err) {
    throw err;
  }
};

/**
 * Fetch and decrypt Wrike credentials
 * @param {string} credentialType - "API" or "AUTOMATION"
 * @returns {Promise<object|null>} Decrypted credentials or null if not found
 */
export const getWrikeCredentials = async (credentialType) => {
  try {
    // Fetch from database
    const credential = await WrikeCredentials.GetByType(credentialType);

    if (!credential) {
      return null;
    }

    // Reconstruct DEK
    const salt = Buffer.from(credential.salt, "hex");
    const wrappedDEKBuffer = Buffer.from(credential.wrapped_dek, "hex");
    const kek = await CryptoUtils.deriveKEK(ENCRYPTION_KEY || "default", salt);
    const dek = CryptoUtils.unwrapDEK(wrappedDEKBuffer, kek);

    // Decrypt credential values
    const clientId = decryptValue(credential.encrypted_client_id, dek);
    const clientSecret = decryptValue(credential.encrypted_client_secret, dek);
    const token = credential.encrypted_token
      ? decryptValue(credential.encrypted_token, dek)
      : null;

    return {
      credentialType: credential.credential_type,
      clientId,
      clientSecret,
      token,
    };
  } catch (err) {
    throw err;
  }
};

/**
 * Fetch all credentials (both API and AUTOMATION)
 * @returns {Promise<object>} Object with API and AUTOMATION credentials
 */
export const getAllWrikeCredentials = async () => {
  try {
    const credentials = await WrikeCredentials.GetAll();
    const result = {};

    for (const credential of credentials) {
      const decrypted = await getWrikeCredentials(credential.credential_type);
      if (decrypted) {
        result[credential.credential_type] = decrypted;
      }
    }

    return result;
  } catch (err) {
    throw err;
  }
};

/**
 * Sync credentials from database (fetch and cache in variables for use)
 * This should be called at startup and periodically
 * @returns {Promise<object>} Synced credentials
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
 * @param {string} credentialType - Optional, if not provided returns all cached credentials
 * @returns {object} Cached credentials
 */
export const getCachedWrikeCredentials = (credentialType = null) => {
  if (credentialType) {
    return cachedCredentials[credentialType] || null;
  }
  return cachedCredentials;
};

/**
 * Clear cached credentials
 */
export const clearCachedWrikeCredentials = () => {
  cachedCredentials = {};
};
