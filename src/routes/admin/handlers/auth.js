import jwt from "jsonwebtoken";
import * as CryptoUtils from "../../../utils/crypto";
import { generateTOTPSecret, verifyTOTP } from "../../../utils/totp";
import { AdminAuth } from "../../../controllers";

export const Register = (body) => {
  return new Promise(async (resolve, reject) => {
    try {
      const { username, password, setup_key } = body;

      if (!username || !password)
        return reject({ statusCode: 400, message: "Username and password are required" });

      const adminCount = await AdminAuth.Count();

      if (adminCount > 0) {
        const setupKey = process.env.ADMIN_SETUP_KEY;
        if (!setupKey || setup_key !== setupKey)
          return reject({ statusCode: 403, message: "Admin registration requires a valid setup key" });
      }

      const existingAdmin = await AdminAuth.GetByUsername(username);
      if (existingAdmin?.id)
        return reject({ statusCode: 400, message: "Username already exists" });

      const passwordHash = await CryptoUtils.hashPassword(password);
      const admin = await AdminAuth.Insert(username, passwordHash);

      return resolve({ statusCode: 201, message: "Admin registered successfully", data: admin });
    } catch (err) {
      console.log(err?.message || err);
      reject(err);
    }
  });
};

export const Login = (body) => {
  return new Promise(async (resolve, reject) => {
    try {
      const { username, password } = body;

      if (!username || !password)
        return reject({ statusCode: 400, message: "Username and password are required" });

      const admin = await AdminAuth.GetByUsername(username);

      if (!admin?.id)
        return reject({ statusCode: 401, message: "Invalid credentials" });

      const isValid = await CryptoUtils.verifyPassword(admin.password_hash, password);
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
        { sub: admin.id, username: admin.username, session_id: session.session_id },
        process.env.JWT_SECRET,
        { expiresIn: "24h" }
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

export const VerifyTOTP = (body) => {
  return new Promise(async (resolve, reject) => {
    try {
      const { session_token, totp_code } = body;

      if (!session_token || !totp_code)
        return reject({ statusCode: 400, message: "Session token and TOTP code are required" });

      const session = await AdminAuth.GetSession(session_token);

      if (!session?.id)
        return reject({ statusCode: 401, message: "Invalid session token" });

      if (new Date(session.expires_at) < new Date())
        return reject({ statusCode: 401, message: "Session expired" });

      const isValid = verifyTOTP(session.totp_secret, totp_code);
      if (!isValid)
        return reject({ statusCode: 400, message: "Invalid TOTP code" });

      await AdminAuth.MarkSessionTOTPVerified(session.id);
      await AdminAuth.UpdateLastLogin(session.admin_id);

      const accessToken = jwt.sign(
        { sub: session.admin_id, username: session.admin_username, session_id: session.id },
        process.env.JWT_SECRET,
        { expiresIn: "24h" }
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

export const GenerateTOTPSetup = (adminUser) => {
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

export const EnableTOTP = (body, adminUser) => {
  return new Promise(async (resolve, reject) => {
    try {
      const { totp_secret, totp_code } = body;

      if (!totp_secret || !totp_code)
        return reject({ statusCode: 400, message: "TOTP secret and code are required" });

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

export const Logout = (adminUser) => {
  return new Promise(async (resolve, reject) => {
    try {
      await AdminAuth.RevokeSession(adminUser.session_id);

      return resolve({ statusCode: 200, message: "Logged out successfully" });
    } catch (err) {
      console.log(err?.message || err);
      reject(err);
    }
  });
};
