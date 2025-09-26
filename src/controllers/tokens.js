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
        "wrapped_access_token_dek",
        "wrapped_refresh_token_dek",
        "key_id",
        "created_by",
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
      wrapped_access_token_dek: userTokens?.wrapped_access_token_dek,
      wrapped_refresh_token_dek: userTokens?.wrapped_refresh_token_dek,
      key_id: userTokens?.key_id,
      created_by: userTokens?.created_by,
    };
  } catch (err) {
    throw err;
  }
};

export const GetByUserId = async (id) => {
  try {
    if (!id) {
      throw {
        statusCode: 420,
        message: "Id must not be empty!",
      };
    }

    const userTokens = await models.UserTokens.findAll({
      attributes: [
        "id",
        "encrypted_access_token",
        "encrypted_refresh_token",
        "wrapped_access_token_dek",
        "wrapped_refresh_token_dek",
        "key_id",
        "created_by",
      ],
      where: {
        created_by: id,
        is_active: true,
      },
      order: [["created_at", "DESC"]],
      limit: 1,
    });

    return {
      id: userTokens?.id,
      encrypted_access_token: userTokens?.encrypted_access_token,
      encrypted_refresh_token: userTokens?.encrypted_refresh_token,
      wrapped_access_token_dek: userTokens?.wrapped_access_token_dek,
      wrapped_refresh_token_dek: userTokens?.wrapped_refresh_token_dek,
      key_id: userTokens?.key_id,
      created_by: userTokens?.created_by,
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
        "wrapped_access_token_dek",
        "wrapped_refresh_token_dek",
        "key_id",
        "created_by",
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
      wrapped_access_token_dek: userToken?.wrapped_access_token_dek,
      wrapped_refresh_token_dek: userToken?.wrapped_refresh_token_dek,
      key_id: userToken?.key_id,
      created_by: userToken?.created_by,
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
      attributes: ["id", "account_id", "created_at", "updated_at"],
      where: {
        created_by: id,
        is_active: true,
      },
      order: [["created_at", "DESC"]],
    });

    return userTokens;
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
      attributes: ["id", "encrypted_access_token", "encrypted_refresh_token"],
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
    };
  } catch (err) {
    throw err;
  }
};

export const GetAll = async ({ limit = 10, offset = 0 }) => {
  try {
    const userTokens = await models.UserTokensTokens.findAll({
      limit,
      offset,
    });
    return userTokens;
  } catch (err) {
    throw err;
  }
};
