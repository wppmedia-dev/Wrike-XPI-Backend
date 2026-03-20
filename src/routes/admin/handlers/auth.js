import {
  VerifyAdminPassword,
  CreateAdminSession,
  VerifyAdminSession,
  GenerateTOTPSecret,
  VerifyAndEnableTOTP,
  VerifyTOTPForSession,
  RevokeAdminSessionById,
  CreateAdmin,
  GenerateAdminJWT,
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

      // If TOTP is required, return only the temporary session token
      // so the TOTP page can complete the second factor.
      if (admin.totp_enabled) {
        return resolve({
          statusCode: 200,
          message: "TOTP verification required",
          data: {
            session_token: session.session_token,
            admin_id: admin.id,
            username: admin.username,
            totp_required: true,
          },
        });
      }

      // No TOTP — issue JWT immediately
      const accessToken = GenerateAdminJWT(
        admin.id,
        admin.username,
        session.session_id,
      );

      return resolve({
        statusCode: 200,
        message: "Login successful",
        data: {
          access_token: accessToken,
          admin_id: admin.id,
          username: admin.username,
          totp_required: false,
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
 * Generate TOTP setup secret (requires valid JWT via middleware)
 */
export const GenerateTOTPSetup = (adminUser, fastify) => {
  return new Promise(async (resolve, reject) => {
    try {
      // Generate TOTP secret using identity from verified JWT
      const totpSecret = await GenerateTOTPSecret(
        adminUser.id,
        adminUser.username,
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
 * Verify TOTP setup and enable (requires valid JWT via middleware)
 */
export const SetupTOTP = (body, adminUser, fastify) => {
  return new Promise(async (resolve, reject) => {
    try {
      const { totp_secret, totp_code } = body;

      if (!totp_secret || !totp_code) {
        return reject({
          statusCode: 400,
          message: "TOTP secret and code are required",
        });
      }

      // Verify and enable TOTP using identity from verified JWT
      const result = await VerifyAndEnableTOTP(
        adminUser.id,
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
 * Verify TOTP code for session (temporary session_token from login step)
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

      // Verify TOTP — marks session totp_verified=true
      const result = await VerifyTOTPForSession(session_token, totp_code);

      // Issue JWT now that TOTP has passed
      const accessToken = GenerateAdminJWT(
        result.admin_id,
        result.admin_username,
        result.session_id,
      );

      return resolve({
        statusCode: 200,
        message: result.message,
        data: { access_token: accessToken },
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
 * Logout (revoke session identified by JWT — requires middleware)
 */
export const AdminLogout = (adminUser, fastify) => {
  return new Promise(async (resolve, reject) => {
    try {
      await RevokeAdminSessionById(adminUser.session_id);

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
