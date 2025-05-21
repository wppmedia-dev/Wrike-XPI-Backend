const crypto = require("crypto");

export const encryptWithRandomKey = (plainText, old_key) => {
  return new Promise((resolve, reject) => {
    if (!plainText) {
      return reject("Encryption failed: Invalid plain text.");
    }

    try {
      const key =
        (typeof old_key === "string" ? Buffer.from(old_key, "hex") : old_key) ||
        crypto.randomBytes(32);
      const iv = crypto.randomBytes(16);

      const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
      let encrypted = cipher.update(plainText, "utf8");
      encrypted = Buffer.concat([encrypted, cipher.final()]);

      resolve({
        encryptedData: iv.toString("hex") + ":" + encrypted.toString("hex"),
        key: key.toString("hex"), // return key to user
      });
    } catch (error) {
      reject({ message: error.message });
    }
  });
};

export const decryptWithKey = async (encryptedData, keyHex) => {
  return new Promise((resolve, reject) => {
    if (!encryptedData || !keyHex) {
      return reject("Decryption failed: Invalid encrypted data or key.");
    }

    try {
      const [ivHex, dataHex] = encryptedData.split(":");
      const iv = Buffer.from(ivHex, "hex");
      const encrypted = Buffer.from(dataHex, "hex");
      const key = Buffer.from(keyHex, "hex");

      const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
      let decrypted = decipher.update(encrypted);
      decrypted = Buffer.concat([decrypted, decipher.final()]);

      resolve(decrypted.toString("utf8"));
    } catch (error) {
      reject({ message: error.message });
    }
  });
};
