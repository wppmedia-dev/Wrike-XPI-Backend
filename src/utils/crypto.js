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
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&";
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

/* ── Master-key field encryption (with key versioning) ─────────────────────
 *
 * Fields such as the Wrike client id/secret are encrypted with a master key
 * from the environment. To make that key rotatable, every value written now
 * names the key that encrypted it:
 *
 *   v1:<keyId>:<base64(IV || AuthTag || Ciphertext)>
 *
 * Values written before versioning are bare base64 (no prefix; base64 never
 * contains ':' so the two are unambiguous) and are still read.
 *
 * Keyring, all from the environment:
 *   ENCRYPTION_MASTER_KEY        current key, 64 hex chars. Encrypts all new
 *                                writes.
 *   ENCRYPTION_MASTER_KEY_ID     id of the current key (default "k1").
 *   ENCRYPTION_MASTER_KEYS_PREVIOUS
 *                                retired keys still needed for reading, as
 *                                "id:hex,id:hex". Decrypt-only.
 *
 * If the key is ever changed: move the current key into
 * ENCRYPTION_MASTER_KEYS_PREVIOUS as "<oldId>:<oldHex>" and set
 * ENCRYPTION_MASTER_KEY/_ID to the new key. Existing values keep decrypting
 * and new writes use the new key. Values are not re-encrypted automatically
 * (there is no migration script); they move to the new key when a credential
 * is next saved, so keep the old key in ENCRYPTION_MASTER_KEYS_PREVIOUS until
 * every credential has been re-saved.
 */
const FIELD_VERSION = "v1";
const KEY_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

const parseKey = (hex, label) => {
  const key = Buffer.from(String(hex || "").trim(), "hex");
  if (key.length !== 32) {
    throw new Error(`${label} must be 64 hex characters (32 bytes)`);
  }
  return key;
};

export const currentKeyId = () => {
  const id = (process.env.ENCRYPTION_MASTER_KEY_ID || "k1").trim();
  if (!KEY_ID_PATTERN.test(id)) {
    throw new Error("ENCRYPTION_MASTER_KEY_ID must match [A-Za-z0-9_-]{1,32}");
  }
  return id;
};

const currentKey = () => {
  if (!process.env.ENCRYPTION_MASTER_KEY) {
    throw new Error("ENCRYPTION_MASTER_KEY not set in environment");
  }
  return parseKey(process.env.ENCRYPTION_MASTER_KEY, "ENCRYPTION_MASTER_KEY");
};

/** id -> key Buffer for every key that may decrypt (current first). */
const keyring = () => {
  const ring = new Map([[currentKeyId(), currentKey()]]);
  const previous = (process.env.ENCRYPTION_MASTER_KEYS_PREVIOUS || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  for (const entry of previous) {
    const sep = entry.indexOf(":");
    const id = sep > 0 ? entry.slice(0, sep).trim() : "";
    if (!KEY_ID_PATTERN.test(id)) {
      throw new Error(
        'ENCRYPTION_MASTER_KEYS_PREVIOUS entries must look like "keyId:64hex"',
      );
    }
    if (!ring.has(id)) {
      ring.set(id, parseKey(entry.slice(sep + 1), `ENCRYPTION_MASTER_KEYS_PREVIOUS[${id}]`));
    }
  }
  return ring;
};

const gcmEncrypt = (plaintext, key) => {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  // Format: IV || Auth Tag || Ciphertext
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
};

const gcmDecrypt = (base64, key) => {
  const buffer = Buffer.from(base64, "base64");
  const iv = buffer.slice(0, IV_LENGTH);
  const authTag = buffer.slice(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = buffer.slice(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
    "utf8",
  );
};

/** Split a stored value into { keyId, payload }; keyId null = legacy. */
export const parseFieldEnvelope = (value) => {
  const str = String(value);
  if (str.startsWith(`${FIELD_VERSION}:`)) {
    const rest = str.slice(FIELD_VERSION.length + 1);
    const sep = rest.indexOf(":");
    if (sep > 0) return { keyId: rest.slice(0, sep), payload: rest.slice(sep + 1) };
  }
  return { keyId: null, payload: str };
};

/**
 * Encrypt a string using AES-256-GCM with the current master key.
 * @param {string} plaintext The data to encrypt
 * @returns {string} "v1:<keyId>:<base64(IV || Auth Tag || Ciphertext)>"
 */
export const encryptField = (plaintext) => {
  const key = currentKey();
  return `${FIELD_VERSION}:${currentKeyId()}:${gcmEncrypt(plaintext, key)}`;
};

/**
 * Decrypt a value written by encryptField, in either the versioned or the
 * legacy (bare base64) format.
 * @param {string} encryptedData Stored value
 * @returns {string} Decrypted plaintext
 */
export const decryptField = (encryptedData) => {
  const ring = keyring();
  const { keyId, payload } = parseFieldEnvelope(encryptedData);

  if (keyId) {
    const key = ring.get(keyId);
    if (!key) {
      throw new Error(
        `Encryption key "${keyId}" is not configured (ENCRYPTION_MASTER_KEY / ENCRYPTION_MASTER_KEYS_PREVIOUS)`,
      );
    }
    return gcmDecrypt(payload, key);
  }

  // Legacy value: it does not say which key wrote it. Try the current key
  // first (the only key before rotation existed), then the retired ones.
  let lastError;
  for (const key of ring.values()) {
    try {
      return gcmDecrypt(payload, key);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
};

/** True when a stored value is not encrypted with the current key. */
export const needsReencryption = (encryptedData) => {
  if (!encryptedData) return false;
  return parseFieldEnvelope(encryptedData).keyId !== currentKeyId();
};
