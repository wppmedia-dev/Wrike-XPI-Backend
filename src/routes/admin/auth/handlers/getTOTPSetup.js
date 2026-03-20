import { generateTOTPSecret } from "../../../../utils/totp";

export const GetTOTPSetup = (adminUser) => {
  return new Promise(async (resolve, reject) => {
    try {
      const { secret, qr_code_url } = generateTOTPSecret(adminUser.username);

      return resolve({
        statusCode: 200,
        message: "TOTP secret generated. Scan with Google Authenticator",
        data: { secret, qr_code_url },
      });
    } catch (err) {
      console.log(err?.message || err);
      reject(err);
    }
  });
};
