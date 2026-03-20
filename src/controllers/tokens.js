import models from "../../models";

export const Insert = async (profile_id, data, options = {}) => {
  try {
    const userTokens = await models.UserTokens.create(data, {
      profile_id,
      ...options,
    });
    return userTokens;
  } catch (err) {
    throw err;
  }
};

export const Update = async (profile_id, id, user_token_data, options = {}) => {
  try {
    if (!profile_id) {
      return reject({
        statusCode: 420,
        message: "user Token Id must not be empty!",
      });
    }

    const userTokens = await models.UserTokens.update(user_token_data, {
      where: {
        id,
        is_active: true,
      },
      individualHooks: true,
      profile_id,
      ...options,
    });
    return userTokens;
  } catch (err) {
    throw err;
  }
};

export const GetById = async (id) => {
  try {
    if (!id) {
      return reject({
        statusCode: 420,
        message: "Id must not be empty!",
      });
    }

    const userTokens = await models.UserTokens.findOne({
      attributes: [
        "id",
        "encrypted_access_token",
        "encrypted_refresh_token",
        "salt",
        "wrapped_dek",
        "created_by",
        "env_id",
      ],
      include: [
        {
          association: "environment",
          attributes: ["environment_name"],
        },
      ],
      where: {
        id,
        is_active: true,
      },
    });

    return {
      id: userTokens?.id,
      encrypted_access_token: userTokens?.encrypted_access_token,
      encrypted_refresh_token: userTokens?.encrypted_refresh_token,
      salt: userTokens?.salt,
      wrapped_dek: userTokens?.wrapped_dek,
      created_by: userTokens?.created_by,
      env_id: userTokens?.env_id,
      environment_name: userTokens?.environment?.environment_name,
    };
  } catch (err) {
    throw err;
  }
};

export const GetTokenByUsername = async (username) => {
  try {
    if (!username) {
      throw {
        statusCode: 420,
        message: "Username must not be empty!",
      };
    }

    const userToken = await models.UserTokens.findOne({
      attributes: [
        "id",
        "password_hash",
        "encrypted_access_token",
        "encrypted_refresh_token",
        "salt",
        "wrapped_dek",
        "created_by",
        "env_id",
      ],
      include: [
        {
          association: "environment",
          attributes: ["environment_name"],
        },
      ],
      where: {
        username,
        is_active: true,
      },
    });

    return {
      id: userToken?.id,
      password_hash: userToken?.password_hash,
      encrypted_access_token: userToken?.encrypted_access_token,
      encrypted_refresh_token: userToken?.encrypted_refresh_token,
      salt: userToken?.salt,
      wrapped_dek: userToken?.wrapped_dek,
      created_by: userToken?.created_by,
      env_id: userToken?.env_id,
      environment_name: userToken?.environment?.environment_name,
    };
  } catch (err) {
    throw err;
  }
};

export const GetAllByUserId = async (id) => {
  try {
    if (!id) {
      throw {
        statusCode: 420,
        message: "Id must not be empty!",
      };
    }

    const userTokens = await models.UserTokens.findAll({
      attributes: ["id", "account_id", "created_at", "updated_at", "env_id"],
      include: [
        {
          association: "environment",
          attributes: ["environment_name"],
        },
      ],
      where: {
        created_by: id,
        is_active: true,
      },
      order: [["created_at", "DESC"]],
    });

    return userTokens.map((token) => ({
      id: token?.id,
      account_id: token?.account_id,
      created_at: token?.created_at,
      updated_at: token?.updated_at,
      env_id: token?.env_id,
      environment_name: token?.environment?.environment_name,
    }));
  } catch (err) {
    throw err;
  }
};

export const GetByUserAndAccountId = async (id, accountId) => {
  try {
    if (!id) {
      throw {
        statusCode: 420,
        message: "Id must not be empty!",
      };
    }

    if (!accountId) {
      throw {
        statusCode: 420,
        message: "Account Id must not be empty!",
      };
    }

    let where = {
      created_by: id,
      is_active: true,
    };

    if (accountId) where["account_id"] = accountId;

    const userTokens = await models.UserTokens.findOne({
      attributes: [
        "id",
        "encrypted_access_token",
        "encrypted_refresh_token",
        "env_id",
      ],
      include: [
        {
          association: "environment",
          attributes: ["environment_name"],
        },
      ],
      where: {
        created_by: id,
        account_id: accountId,
        is_active: true,
      },
      order: [["created_at", "DESC"]],
    });

    return {
      id: userTokens?.id,
      encrypted_access_token: userTokens?.encrypted_access_token,
      encrypted_refresh_token: userTokens?.encrypted_refresh_token,
      env_id: userTokens?.env_id,
      environment_name: userTokens?.environment?.environment_name,
    };
  } catch (err) {
    throw err;
  }
};

export const GetAll = async ({ limit = 10, offset = 0 }) => {
  try {
    const userTokens = await models.UserTokens.findAll({
      attributes: ["id", "account_id", "created_at", "updated_at", "env_id"],
      include: [
        {
          association: "environment",
          attributes: ["environment_name"],
        },
      ],
      limit,
      offset,
      order: [["created_at", "DESC"]],
    });
    return userTokens.map((token) => ({
      id: token?.id,
      account_id: token?.account_id,
      created_at: token?.created_at,
      updated_at: token?.updated_at,
      env_id: token?.env_id,
      environment_name: token?.environment?.environment_name,
    }));
  } catch (err) {
    throw err;
  }
};
