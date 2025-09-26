import crypto from "crypto";
import { getKeyVaultClient } from "./azure_vault";

// Generate a random DEK (Data Encryption Key)
export function generateDEK() {
  return crypto.randomBytes(32); // 256 bits for AES-256-GCM
}

// Encrypt data with AES-256-GCM using a DEK
export function encryptWithDEK(plainText, dek) {
  if (!plainText) {
    throw new Error("Encryption failed: Invalid plain text.");
  }

  const iv = crypto.randomBytes(12); // 12 bytes recommended for GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", dek, iv);
  const encrypted = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  // Join iv:ciphertext:tag as a single string
  return [
    iv.toString("hex"),
    encrypted.toString("hex"),
    tag.toString("hex"),
  ].join(":");
}

// Wrap a DEK using Azure Key Vault's KEK
export async function wrapDEK(dek, keyId) {
  const keyVaultClient = await getKeyVaultClient(keyId);
  const algorithm = "RSA-OAEP-256"; // Using RSA-OAEP with SHA-256
  const result = await keyVaultClient.wrapKey(algorithm, dek);
  return result.result.toString("base64");
}

// Legacy function for backward compatibility
export function encryptWithRandomKey(plainText, keyHex) {
  if (!plainText) {
    throw new Error("Encryption failed: Invalid plain text.");
  }
  // Use given key or generate a random one
  const key = keyHex ? Buffer.from(keyHex, "hex") : crypto.randomBytes(32);
  const encrypted = encryptWithDEK(plainText, key);
  return {
    encryptedData: encrypted,
    key: key.toString("hex"),
  };
}

// Decrypt data with AES-256-GCM using a DEK
export function decryptWithDEK(encryptedData, dek) {
  if (!encryptedData) {
    throw new Error("Decryption failed: Invalid encrypted data.");
  }

  const [ivHex, encryptedHex, tagHex] = encryptedData.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const encrypted = Buffer.from(encryptedHex, "hex");
  const tag = Buffer.from(tagHex, "hex");

  const decipher = crypto.createDecipheriv("aes-256-gcm", dek, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    "utf8"
  );
}

// Unwrap a DEK using Azure Key Vault's KEK
export async function unwrapDEK(wrappedDek, keyId) {
  const keyVaultClient = await getKeyVaultClient(keyId);
  const wrappedDekBuffer = Buffer.from(wrappedDek, "base64");
  const algorithm = "RSA-OAEP-256"; // Using RSA-OAEP with SHA-256
  const result = await keyVaultClient.unwrapKey(algorithm, wrappedDekBuffer);
  return result.result;
}

// Legacy function for backward compatibility
export function decryptWithKey(encryptedData, keyHex) {
  if (!encryptedData || !keyHex) {
    throw new Error("Decryption failed: Invalid input.");
  }

  const key = Buffer.from(keyHex, "hex");
  return decryptWithDEK(encryptedData, key);
}
