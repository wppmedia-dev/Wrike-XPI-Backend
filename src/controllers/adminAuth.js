import models from "../../models";
import * as CryptoUtils from "../utils/crypto";
import { generateTOTPSecret, verifyTOTP } from "../utils/totp";
import crypto from "crypto";
require("dotenv").config();

/**
 * Create admin user
 */
export const CreateAdmin = async (username, password) => {
  try {
    if (!username || !password) {
      throw {
        statusCode: 400,
        message: "Username and password are required",
      };
    }

    // Check if user exists
    const existingAdmin = await models.AdminUsers.findOne({
      where: { username },
    });

    if (existingAdmin) {
      throw {
        statusCode: 400,
        message: "Username already exists",
      };
    }

    // Hash password using argon2
    const passwordHash = await CryptoUtils.hashPassword(password);

    // Create admin user
    const admin = await models.AdminUsers.create({
      username,
      password_hash: passwordHash,
      totp_enabled: false,
    });

    return {
      id: admin.id,
      username: admin.username,
      message: "Admin user created successfully",
    };
  } catch (err) {
    throw err;
  }
};

/**
 * Verify admin password
 */
export const VerifyAdminPassword = async (username, password) => {
  try {
    if (!username || !password) {
      throw {
        statusCode: 400,
        message: "Username and password are required",
      };
    }

    const admin = await models.AdminUsers.findOne({
      where: { username, is_active: true },
    });

    if (!admin) {
      throw {
        statusCode: 401,
        message: "Invalid credentials",
      };
    }

    // Verify password
    const isValid = await CryptoUtils.verifyPassword(
      admin.password_hash,
      password,
    );

    if (!isValid) {
      throw {
        statusCode: 401,
        message: "Invalid credentials",
      };
    }

    return {
      id: admin.id,
      username: admin.username,
      totp_enabled: admin.totp_enabled,
    };
  } catch (err) {
    throw err;
  }
};

/**
 * Create admin session
 */
export const CreateAdminSession = async (
  adminId,
  ipAddress = null,
  userAgent = null,
) => {
  try {
    // Generate session token
    const sessionToken = crypto.randomBytes(32).toString("hex");

    // Session expires in 24 hours
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const session = await models.AdminSessions.create({
      admin_id: adminId,
      session_token: sessionToken,
      totp_verified: false,
      ip_address: ipAddress,
      user_agent: userAgent,
      expires_at: expiresAt,
    });

    return {
      session_id: session.id,
      session_token: sessionToken,
      expires_at: expiresAt,
    };
  } catch (err) {
    throw err;
  }
};

/**
 * Verify admin session token
 */
export const VerifyAdminSession = async (sessionToken) => {
  try {
    if (!sessionToken) {
      throw {
        statusCode: 401,
        message: "Session token required",
      };
    }

    const session = await models.AdminSessions.findOne({
      where: { session_token: sessionToken },
      include: [{ as: "admin", model: models.AdminUsers }],
    });

    if (!session) {
      throw {
        statusCode: 401,
        message: "Invalid session token",
      };
    }

    // Check expiration
    if (new Date(session.expires_at) < new Date()) {
      throw {
        statusCode: 401,
        message: "Session expired",
      };
    }

    return {
      session_id: session.id,
      admin_id: session.admin_id,
      admin_username: session.admin?.username,
      totp_verified: session.totp_verified,
      totp_required: session.admin?.totp_enabled && !session.totp_verified,
    };
  } catch (err) {
    throw err;
  }
};

/**
 * Generate TOTP secret for admin
 */
export const GenerateTOTPSecret = async (adminId, username) => {
  try {
    const admin = await models.AdminUsers.findByPk(adminId);

    if (!admin) {
      throw {
        statusCode: 404,
        message: "Admin user not found",
      };
    }

    // Generate new TOTP secret
    const { secret, qr_code_url } = generateTOTPSecret(username);

    return {
      secret,
      qr_code_url,
      message: "TOTP secret generated. Scan with Google Authenticator",
    };
  } catch (err) {
    throw err;
  }
};

/**
 * Verify and enable TOTP for admin
 */
export const VerifyAndEnableTOTP = async (adminId, totpSecret, totpCode) => {
  try {
    if (!totpSecret || !totpCode) {
      throw {
        statusCode: 400,
        message: "TOTP secret and code are required",
      };
    }

    // Verify the code with the secret
    const isValid = verifyTOTP(totpSecret, totpCode);

    if (!isValid) {
      throw {
        statusCode: 400,
        message: "Invalid TOTP code",
      };
    }

    // Save secret and enable TOTP
    await models.AdminUsers.update(
      {
        totp_secret: totpSecret,
        totp_enabled: true,
      },
      {
        where: { id: adminId },
      },
    );

    return {
      message: "TOTP enabled successfully",
    };
  } catch (err) {
    throw err;
  }
};

/**
 * Verify TOTP code for current session
 */
export const VerifyTOTPForSession = async (sessionToken, totpCode) => {
  try {
    if (!sessionToken || !totpCode) {
      throw {
        statusCode: 400,
        message: "Session token and TOTP code are required",
      };
    }

    const session = await models.AdminSessions.findOne({
      where: { session_token: sessionToken },
      include: [{ as: "admin", model: models.AdminUsers }],
    });

    if (!session) {
      throw {
        statusCode: 401,
        message: "Invalid session token",
      };
    }

    // Verify TOTP code
    const isValid = verifyTOTP(session.admin.totp_secret, totpCode);

    if (!isValid) {
      throw {
        statusCode: 400,
        message: "Invalid TOTP code",
      };
    }

    // Mark TOTP as verified for this session
    await session.update({ totp_verified: true });

    // Update last login
    await session.admin.update({ last_login_at: new Date() });

    return {
      message: "TOTP verified successfully",
      session_verified: true,
    };
  } catch (err) {
    throw err;
  }
};

/**
 * Revoke admin session
 */
export const RevokeAdminSession = async (sessionToken) => {
  try {
    if (!sessionToken) {
      throw {
        statusCode: 400,
        message: "Session token required",
      };
    }

    await models.AdminSessions.destroy({
      where: { session_token: sessionToken },
    });

    return {
      message: "Session revoked successfully",
    };
  } catch (err) {
    throw err;
  }
};

/**
 * Disable TOTP for admin
 */
export const DisableTOTP = async (adminId) => {
  try {
    await models.AdminUsers.update(
      {
        totp_secret: null,
        totp_enabled: false,
      },
      {
        where: { id: adminId },
      },
    );

    return {
      message: "TOTP disabled successfully",
    };
  } catch (err) {
    throw err;
  }
};
