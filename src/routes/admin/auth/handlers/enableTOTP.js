import { verifyTOTP } from "../../../../utils/totp";
import { AdminAuth } from "../../../../controllers";

export const EnableTOTP = (body, adminUser) => {
  return new Promise(async (resolve, reject) => {
    try {
      const { totp_secret, totp_code } = body;

      if (!totp_secret || !totp_code)
        return reject({
          statusCode: 400,
          message: "TOTP secret and code are required",
        });

      const isValid = verifyTOTP(totp_secret, totp_code);
      if (!isValid)
        return reject({ statusCode: 400, message: "Invalid TOTP code" });

      await AdminAuth.EnableTOTP(adminUser.id, totp_secret);

      return resolve({ statusCode: 200, message: "TOTP enabled successfully" });
    } catch (err) {
      console.log(err?.message || err);
      reject(err);
    }
  });
};
