import jwt from "jsonwebtoken";
import * as CryptoUtils from "../../../../utils/crypto";
import { AdminAuth } from "../../../../controllers";

export const Login = (body) => {
  return new Promise(async (resolve, reject) => {
    try {
      const { username, password } = body;

      if (!username || !password)
        return reject({
          statusCode: 400,
          message: "Username and password are required",
        });

      const admin = await AdminAuth.GetByUsername(username);

      if (!admin?.id)
        return reject({ statusCode: 401, message: "Invalid credentials" });

      const isValid = await CryptoUtils.verifyPassword(
        admin.password_hash,
        password,
      );
      if (!isValid)
        return reject({ statusCode: 401, message: "Invalid credentials" });

      const session = await AdminAuth.CreateSession(admin.id);

      if (admin.totp_enabled) {
        return resolve({
          statusCode: 200,
          message: "TOTP verification required",
          data: {
            session_token: session.session_token,
            totp_required: true,
          },
        });
      }

      const accessToken = jwt.sign(
        {
          sub: admin.id,
          username: admin.username,
          session_id: session.session_id,
        },
        process.env.JWT_SECRET,
        { expiresIn: "24h" },
      );

      return resolve({
        statusCode: 200,
        message: "Login successful",
        data: { access_token: accessToken },
      });
    } catch (err) {
      console.log(err?.message || err);
      reject(err);
    }
  });
};
