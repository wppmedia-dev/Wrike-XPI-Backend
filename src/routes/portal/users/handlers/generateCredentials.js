import * as CryptoUtils from "../../../../utils/crypto";

export const GenerateCredentials = () => {
  return new Promise(async (resolve, reject) => {
    try {
      const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
      const usernameLength = 10;
      const usernameBytes = CryptoUtils.generateSalt
        ? Buffer.from(require("crypto").randomBytes(usernameLength))
        : null;

      // Use crypto.randomBytes for secure generation
      const { randomBytes } = require("crypto");
      const rawUser = randomBytes(8).toString("hex");
      const username = "user_" + rawUser;
      const password = CryptoUtils.generateSecurePassword();

      return resolve({
        statusCode: 200,
        message: "Credentials generated",
        data: { username, password },
      });
    } catch (err) {
      console.log(err?.message || err);
      reject(err);
    }
  });
};
