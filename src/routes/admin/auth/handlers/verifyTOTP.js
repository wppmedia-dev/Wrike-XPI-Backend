import jwt from "jsonwebtoken";
import { verifyTOTP as verifyTOTPCode } from "../../../../utils/totp";
import { AdminAuth } from "../../../../controllers";

export const VerifyTOTP = (body) => {
  return new Promise(async (resolve, reject) => {
    try {
      const { totp_token, totp_code } = body;

      if (!totp_token || !totp_code)
        return reject({
          statusCode: 400,
          message: "TOTP token and TOTP code are required",
        });

      let payload;
      try {
        payload = jwt.verify(totp_token, process.env.JWT_SECRET);
      } catch {
        return reject({
          statusCode: 401,
          message: "Invalid or expired TOTP token",
        });
      }

      const admin = await AdminAuth.GetById(payload.sub);
      if (!admin?.id || !admin?.totp_enabled || !admin?.totp_secret)
        return reject({
          statusCode: 401,
          message: "Invalid admin or TOTP not enabled",
        });

      const isValid = verifyTOTPCode(admin.totp_secret, totp_code);
      if (!isValid)
        return reject({ statusCode: 400, message: "Invalid TOTP code" });

      await AdminAuth.UpdateLastLogin(admin.id);

      const accessToken = jwt.sign(
        {
          sub: admin.id,
          username: admin.username,
        },
        process.env.JWT_SECRET,
        { expiresIn: "24h" },
      );

      return resolve({
        statusCode: 200,
        message: "TOTP verified successfully",
        data: { access_token: accessToken },
      });
    } catch (err) {
      console.log(err?.message || err);
      reject(err);
    }
  });
};
