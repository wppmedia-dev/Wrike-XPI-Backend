import {
  VerifyAdminPassword,
  CreateAdminSession,
  VerifyAdminSession,
  GenerateTOTPSecret,
  VerifyAndEnableTOTP,
  VerifyTOTPForSession,
  RevokeAdminSession,
  CreateAdmin,
} from "../../../controllers/adminAuth";
import models from "../../../../models";

/**
 * Handle admin login
 */
export const AdminLogin = (body, fastify) => {
  return new Promise(async (resolve, reject) => {
    try {
      const { username, password } = body;

      if (!username || !password) {
        return reject({
          statusCode: 400,
          message: "Username and password are required",
        });
      }

      // Verify credentials
      const admin = await VerifyAdminPassword(username, password);

      // Create session
      const session = await CreateAdminSession(admin.id);

      return resolve({
        statusCode: 200,
        message: "Login successful",
        data: {
          session_token: session.session_token,
          admin_id: admin.id,
          username: admin.username,
          totp_required: admin.totp_enabled,
        },
      });
    } catch (err) {
      console.error("Error during admin login:", err);
      return reject({
        statusCode: err?.statusCode || 500,
        message: err?.message || err,
      });
    }
  });
};

/**
 * Generate TOTP setup secret
 */
export const GenerateTOTPSetup = (query, fastify) => {
  return new Promise(async (resolve, reject) => {
    try {
      const { session_token } = query;

      if (!session_token) {
        return reject({
          statusCode: 400,
          message: "Session token required",
        });
      }

      // Verify session
      const sessionData = await VerifyAdminSession(session_token);

      // Generate TOTP secret
      const totpSecret = await GenerateTOTPSecret(
        sessionData.admin_id,
        sessionData.admin_username,
      );

      return resolve({
        statusCode: 200,
        message: "TOTP secret generated",
        data: totpSecret,
      });
    } catch (err) {
      console.error("Error generating TOTP secret:", err);
      return reject({
        statusCode: err?.statusCode || 500,
        message: err?.message || err,
      });
    }
  });
};

/**
 * Verify TOTP setup and enable
 */
export const SetupTOTP = (body, fastify) => {
  return new Promise(async (resolve, reject) => {
    try {
      const { session_token, totp_secret, totp_code } = body;

      if (!session_token || !totp_secret || !totp_code) {
        return reject({
          statusCode: 400,
          message: "Session token, TOTP secret, and code are required",
        });
      }

      // Verify session
      const sessionData = await VerifyAdminSession(session_token);

      // Verify and enable TOTP
      const result = await VerifyAndEnableTOTP(
        sessionData.admin_id,
        totp_secret,
        totp_code,
      );

      return resolve({
        statusCode: 200,
        message: result.message,
        data: result,
      });
    } catch (err) {
      console.error("Error setting up TOTP:", err);
      return reject({
        statusCode: err?.statusCode || 500,
        message: err?.message || err,
      });
    }
  });
};

/**
 * Verify TOTP code for session
 */
export const VerifyTOTP = (body, fastify) => {
  return new Promise(async (resolve, reject) => {
    try {
      const { session_token, totp_code } = body;

      if (!session_token || !totp_code) {
        return reject({
          statusCode: 400,
          message: "Session token and TOTP code are required",
        });
      }

      // Verify TOTP
      const result = await VerifyTOTPForSession(session_token, totp_code);

      return resolve({
        statusCode: 200,
        message: result.message,
        data: result,
      });
    } catch (err) {
      console.error("Error verifying TOTP:", err);
      return reject({
        statusCode: err?.statusCode || 500,
        message: err?.message || err,
      });
    }
  });
};

/**
 * Logout (revoke session)
 */
export const AdminLogout = (body, fastify) => {
  return new Promise(async (resolve, reject) => {
    try {
      const { session_token } = body;

      if (!session_token) {
        return reject({
          statusCode: 400,
          message: "Session token required",
        });
      }

      await RevokeAdminSession(session_token);

      return resolve({
        statusCode: 200,
        message: "Logged out successfully",
      });
    } catch (err) {
      console.error("Error during logout:", err);
      return reject({
        statusCode: err?.statusCode || 500,
        message: err?.message || err,
      });
    }
  });
};

/**
 * Register admin user
 * Allows registration only if no admins exist (first-come-first-served)
 * If admins exist, requires ADMIN_SETUP_KEY environment variable
 */
export const AdminRegister = (body, fastify) => {
  return new Promise(async (resolve, reject) => {
    try {
      const { username, password, setup_key } = body;

      // Check if any admins already exist
      const adminCount = await models.AdminUsers.count();

      if (adminCount > 0) {
        // If admins exist, require a setup key from environment
        const setupKey = process.env.ADMIN_SETUP_KEY;

        if (!setupKey || setup_key !== setupKey) {
          return reject({
            statusCode: 403,
            message:
              "Admin registration requires setup key. Set ADMIN_SETUP_KEY env variable to enable.",
          });
        }
      }

      if (!username || !password) {
        return reject({
          statusCode: 400,
          message: "Username and password are required",
        });
      }

      // Create admin
      const admin = await CreateAdmin(username, password);

      return resolve({
        statusCode: 201,
        message: admin.message,
        data: {
          id: admin.id,
          username: admin.username,
        },
      });
    } catch (err) {
      console.error("Error during admin registration:", err);
      return reject({
        statusCode: err?.statusCode || 500,
        message: err?.message || err,
      });
    }
  });
};
