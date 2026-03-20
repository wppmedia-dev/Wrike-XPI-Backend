import jwt from "jsonwebtoken";
import { verifyTOTP as verifyTOTPCode } from "../../../../utils/totp";
import { AdminAuth } from "../../../../controllers";

export const VerifyTOTP = (body) => {
  return new Promise(async (resolve, reject) => {
    try {
      const { session_token, totp_code } = body;

      if (!session_token || !totp_code)
        return reject({
          statusCode: 400,
          message: "Session token and TOTP code are required",
        });

      const session = await AdminAuth.GetSession(session_token);

      if (!session?.id)
        return reject({ statusCode: 401, message: "Invalid session token" });

      if (new Date(session.expires_at) < new Date())
        return reject({ statusCode: 401, message: "Session expired" });

      const isValid = verifyTOTPCode(session.totp_secret, totp_code);
      if (!isValid)
        return reject({ statusCode: 400, message: "Invalid TOTP code" });

      await AdminAuth.MarkSessionTOTPVerified(session.id);
      await AdminAuth.UpdateLastLogin(session.admin_id);

      const accessToken = jwt.sign(
        {
          sub: session.admin_id,
          username: session.admin_username,
          session_id: session.id,
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
