import models from "../../models";

export const Insert = async (data, options = {}) => {
  try {
    const userData = await models.PortalUsers.create(data, options);
    return userData;
  } catch (err) {
    throw err;
  }
};

export const GetByUsername = async (username) => {
  try {
    if (!username)
      throw { statusCode: 400, message: "Username must not be empty" };

    const user = await models.PortalUsers.findOne({
      attributes: [
        "id",
        "username",
        "password_hash",
        "role",
        "must_change_password",
        "full_name",
        "email",
        "is_active",
      ],
      where: { username: username.toLowerCase(), deleted_at: null },
    });

    return user;
  } catch (err) {
    throw err;
  }
};

export const GetById = async (id) => {
  try {
    if (!id) throw { statusCode: 400, message: "Id must not be empty" };

    const user = await models.PortalUsers.findOne({
      attributes: [
        "id",
        "username",
        "role",
        "must_change_password",
        "full_name",
        "email",
        "is_active",
      ],
      where: { id, deleted_at: null },
    });

    return user;
  } catch (err) {
    throw err;
  }
};

export const GetByWrikeId = async (id) => {
  try {
    const userData = await models.PortalUsers.findOne({
      attributes: ["id"],
      where: { wrike_user_id: id },
    });
    return userData;
  } catch (err) {
    throw err;
  }
};

export const GetAll = async () => {
  try {
    const users = await models.PortalUsers.findAll({
      attributes: [
        "id",
        "username",
        "role",
        "full_name",
        "email",
        "is_active",
        "must_change_password",
        "last_login_at",
        "created_at",
        "created_by",
      ],
      where: { deleted_at: null },
      order: [["created_at", "DESC"]],
    });
    return users;
  } catch (err) {
    throw err;
  }
};

export const Update = async (profile_id, id, data, options = {}) => {
  try {
    if (!id) throw { statusCode: 400, message: "Id must not be empty" };

    await models.PortalUsers.update(data, {
      where: { id, deleted_at: null },
      individualHooks: true,
      profile_id,
      ...options,
    });
  } catch (err) {
    throw err;
  }
};

export const UpdateLastLogin = async (id) => {
  try {
    await models.PortalUsers.update(
      { last_login_at: new Date() },
      { where: { id } },
    );
  } catch (err) {
    throw err;
  }
};

export const Delete = async (profile_id, id) => {
  try {
    if (!id) throw { statusCode: 400, message: "Id must not be empty" };

    const user = await models.PortalUsers.findOne({
      where: { id, deleted_at: null },
    });
    if (!user) throw { statusCode: 404, message: "User not found" };

    await user.destroy({ profile_id });
  } catch (err) {
    throw err;
  }
};

// ─── User-Environment mappings (via wrike_credentials.owner_id) ──────────────

export const GetUserEnvironments = async (userId) => {
  try {
    const environments = await models.WrikeCredentials.findAll({
      attributes: [
        "id",
        "environment_name",
        "is_active",
        "is_visible",
        "account_id",
      ],
      where: { owner_id: userId, is_active: true, deleted_at: null },
      order: [["created_at", "DESC"]],
    });
    return environments;
  } catch (err) {
    throw err;
  }
};

export const AssignEnvironment = async (profile_id, userId, envId) => {
  try {
    const env = await models.WrikeCredentials.findOne({
      where: { id: envId, deleted_at: null },
    });
    if (!env) throw { statusCode: 404, message: "Environment not found" };

    if (env.owner_id)
      throw {
        statusCode: 409,
        message: "Environment already assigned to a user",
      };

    await models.WrikeCredentials.update(
      { owner_id: userId },
      {
        where: { id: envId },
        individualHooks: true,
        profile_id,
      },
    );
  } catch (err) {
    throw err;
  }
};

export const RevokeEnvironment = async (userId, envId) => {
  try {
    const updated = await models.WrikeCredentials.update(
      { owner_id: null },
      {
        where: { id: envId, owner_id: userId },
        individualHooks: true,
      },
    );
    if (!updated[0])
      throw { statusCode: 404, message: "Environment assignment not found" };
  } catch (err) {
    throw err;
  }
};
