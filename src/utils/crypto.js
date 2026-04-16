import crypto from "crypto";
import argon2 from "argon2";

const SALT_LENGTH = 16;
const DEK_LENGTH = 32; // 256 bits
const AUTH_TAG_LENGTH = 16;
const IV_LENGTH = 12;

/**
 * Generate a cryptographically secure random password
 * @returns {string} A random password with 48 chars including special characters
 */
export const generateSecurePassword = () => {
  const charset =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+[]{}|;,.<>?";
  const length = 10 + (crypto.randomBytes(1)[0] % 7); // 10–16
  const password = Array.from(crypto.randomBytes(length))
    .map((byte) => charset[byte % charset.length])
    .join("");
  return password;
};

/**
 * Generate a random salt for Argon2id
 * @returns {Buffer} Random salt
 */
export const generateSalt = () => crypto.randomBytes(SALT_LENGTH);

/**
 * Generate a random Data Encryption Key (DEK)
 * @returns {Buffer} Random DEK
 */
export const generateDEK = () => crypto.randomBytes(DEK_LENGTH);

/**
 * Derive a Key Encryption Key (KEK) using Argon2id
 * @param {string} password The user's password
 * @param {Buffer} salt Random salt
 * @returns {Promise<Buffer>} Derived KEK
 */
export const deriveKEK = async (password, salt) => {
  const options = {
    type: argon2.argon2id,
    memoryCost: 65536, // 64 MB
    timeCost: 3,
    parallelism: 4,
    hashLength: DEK_LENGTH,
    salt,
    raw: true, // Get the raw hash bytes instead of encoded string
  };
  return argon2.hash(password, options);
};

/**
 * Hash password for storage/verification using Argon2id
 * @param {string} password The password to hash
 * @returns {Promise<string>} Hashed password
 */
export const hashPassword = async (password) => {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });
};

/**
 * Verify a password against its hash
 * @param {string} hash The stored password hash
 * @param {string} password The password to verify
 * @returns {Promise<boolean>} Whether the password matches
 */
export const verifyPassword = async (hash, password) => {
  return argon2.verify(hash, password);
};

/**
 * Wrap (encrypt) a DEK using a KEK
 * @param {Buffer} dek The Data Encryption Key to wrap
 * @param {Buffer} kek The Key Encryption Key
 * @returns {Buffer} Wrapped DEK
 */
export const wrapDEK = (dek, kek) => {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-gcm", kek, iv);

  const wrapped = Buffer.concat([cipher.update(dek), cipher.final()]);

  const authTag = cipher.getAuthTag();

  // Format: IV || Auth Tag || Wrapped DEK
  return Buffer.concat([iv, authTag, wrapped]);
};

/**
 * Unwrap (decrypt) a DEK using a KEK
 * @param {Buffer} wrappedDEK The wrapped DEK (IV || Auth Tag || Wrapped DEK)
 * @param {Buffer} kek The Key Encryption Key
 * @returns {Buffer} Unwrapped DEK
 */
export const unwrapDEK = (wrappedDEK, kek) => {
  const iv = wrappedDEK.slice(0, IV_LENGTH);
  const authTag = wrappedDEK.slice(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const wrapped = wrappedDEK.slice(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv("aes-256-gcm", kek, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(wrapped), decipher.final()]);
};

/**
 * Encrypt data using AES-256-GCM
 * @param {string|Buffer} data Data to encrypt
 * @param {Buffer} dek The Data Encryption Key
 * @returns {Buffer} Encrypted data (IV || Auth Tag || Ciphertext)
 */
export const encrypt = (data, dek) => {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-gcm", dek, iv);

  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);

  const authTag = cipher.getAuthTag();

  // Format: IV || Auth Tag || Ciphertext
  return Buffer.concat([iv, authTag, encrypted]);
};

/**
 * Decrypt data using AES-256-GCM
 * @param {Buffer} encryptedData Encrypted data (IV || Auth Tag || Ciphertext)
 * @param {Buffer} dek The Data Encryption Key
 * @returns {Buffer} Decrypted data
 */
export const decrypt = (encryptedData, dek) => {
  const iv = encryptedData.slice(0, IV_LENGTH);
  const authTag = encryptedData.slice(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = encryptedData.slice(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv("aes-256-gcm", dek, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
};

/**
 * Encrypt a string using AES-256-GCM with master key from env
 * @param {string} plaintext The data to encrypt
 * @returns {string} Encrypted data as base64 (IV || Auth Tag || Ciphertext)
 */
export const encryptField = (plaintext) => {
  const masterKey = process.env.ENCRYPTION_MASTER_KEY;
  if (!masterKey) {
    throw new Error("ENCRYPTION_MASTER_KEY not set in environment");
  }

  // Convert master key from hex string to buffer (should be 32 bytes for AES-256)
  const key = Buffer.from(masterKey, "hex");
  if (key.length !== 32) {
    throw new Error(
      "ENCRYPTION_MASTER_KEY must be 64 hex characters (32 bytes)",
    );
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  // Format: IV || Auth Tag || Ciphertext, encoded as base64
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
};

/**
 * Decrypt a string using AES-256-GCM with master key from env
 * @param {string} encryptedData Encrypted data as base64 (IV || Auth Tag || Ciphertext)
 * @returns {string} Decrypted plaintext
 */
export const decryptField = (encryptedData) => {
  const masterKey = process.env.ENCRYPTION_MASTER_KEY;
  if (!masterKey) {
    throw new Error("ENCRYPTION_MASTER_KEY not set in environment");
  }

  // Convert master key from hex string to buffer
  const key = Buffer.from(masterKey, "hex");
  if (key.length !== 32) {
    throw new Error(
      "ENCRYPTION_MASTER_KEY must be 64 hex characters (32 bytes)",
    );
  }

  const buffer = Buffer.from(encryptedData, "base64");
  const iv = buffer.slice(0, IV_LENGTH);
  const authTag = buffer.slice(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = buffer.slice(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
};
