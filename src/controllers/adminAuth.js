import models from "../../models";

export const Insert = async (username, passwordHash) => {
  try {
    const admin = await models.AdminUsers.create({
      username,
      password_hash: passwordHash,
      totp_enabled: false,
    });

    return {
      id: admin.id,
      username: admin.username,
    };
  } catch (err) {
    throw err;
  }
};

export const GetByUsername = async (username) => {
  try {
    if (!username) {
      throw {
        statusCode: 420,
        message: "Username must not be empty!",
      };
    }

    const admin = await models.AdminUsers.findOne({
      attributes: [
        "id",
        "username",
        "password_hash",
        "totp_enabled",
        "totp_secret",
      ],
      where: { username, is_active: true },
    });

    return {
      id: admin?.id,
      username: admin?.username,
      password_hash: admin?.password_hash,
      totp_enabled: admin?.totp_enabled,
      totp_secret: admin?.totp_secret,
    };
  } catch (err) {
    throw err;
  }
};

export const GetById = async (id) => {
  try {
    if (!id) {
      throw {
        statusCode: 420,
        message: "Id must not be empty!",
      };
    }

    const admin = await models.AdminUsers.findOne({
      attributes: ["id", "username", "totp_enabled"],
      where: { id, is_active: true },
    });

    return {
      id: admin?.id,
      username: admin?.username,
      totp_enabled: admin?.totp_enabled,
    };
  } catch (err) {
    throw err;
  }
};

export const Count = async () => {
  try {
    return await models.AdminUsers.count();
  } catch (err) {
    throw err;
  }
};

export const EnableTOTP = async (id, totpSecret) => {
  try {
    await models.AdminUsers.update(
      { totp_secret: totpSecret, totp_enabled: true },
      { where: { id } },
    );
  } catch (err) {
    throw err;
  }
};

export const DisableTOTP = async (id) => {
  try {
    await models.AdminUsers.update(
      { totp_secret: null, totp_enabled: false },
      { where: { id } },
    );
  } catch (err) {
    throw err;
  }
};

export const UpdateLastLogin = async (id) => {
  try {
    await models.AdminUsers.update(
      { last_login_at: new Date() },
      { where: { id } },
    );
  } catch (err) {
    throw err;
  }
};

export const CreateSession = async (
  adminId,
  ipAddress = null,
  userAgent = null,
) => {
  try {
    const sessionToken = require("crypto").randomBytes(32).toString("hex");
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

export const GetSession = async (sessionToken) => {
  try {
    if (!sessionToken) {
      throw {
        statusCode: 401,
        message: "Session token must not be empty!",
      };
    }

    const session = await models.AdminSessions.findOne({
      where: { session_token: sessionToken },
      include: [{ as: "admin", model: models.AdminUsers }],
    });

    return {
      id: session?.id,
      admin_id: session?.admin_id,
      totp_verified: session?.totp_verified,
      expires_at: session?.expires_at,
      totp_secret: session?.admin?.totp_secret,
      admin_username: session?.admin?.username,
    };
  } catch (err) {
    throw err;
  }
};

export const GetSessionById = async (sessionId) => {
  try {
    if (!sessionId) {
      throw {
        statusCode: 420,
        message: "Session id must not be empty!",
      };
    }

    const session = await models.AdminSessions.findByPk(sessionId);

    return {
      id: session?.id,
      admin_id: session?.admin_id,
      expires_at: session?.expires_at,
    };
  } catch (err) {
    throw err;
  }
};

export const VerifySession = async (sessionId) => {
  try {
    return await models.AdminSessions.findByPk(sessionId);
  } catch (err) {
    throw err;
  }
};

export const MarkSessionTOTPVerified = async (sessionId) => {
  try {
    await models.AdminSessions.update(
      { totp_verified: true },
      { where: { id: sessionId } },
    );
  } catch (err) {
    throw err;
  }
};

export const RevokeSession = async (sessionId) => {
  try {
    await models.AdminSessions.destroy({ where: { id: sessionId } });
  } catch (err) {
    throw err;
  }
};
