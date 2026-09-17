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
    if (!id)
      throw {
        statusCode: 420,
        message: "Id must not be empty!",
      };

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

export const GetByUserAccountEnvId = async (id, accountId, environmentId) => {
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

    if (!environmentId)
      throw {
        statusCode: 420,
        message: "Env Id must not be empty!",
      };

    let where = {
      created_by: id,
      is_active: true,
    };

    if (accountId) where["account_id"] = accountId;
    if (environmentId) where["env_id"] = environmentId;

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
      where,
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

const toAdminShape = (token) => ({
  id: token.id,
  account_id: token.account_id,
  username: token.username,
  env_id: token.env_id,
  environment_name: token?.environment?.environment_name || null,
  environment_visible: token?.environment?.is_visible ?? null,
  is_active: token.is_active,
  created_at: token.created_at,
  updated_at: token.updated_at,
  creator_email: token?.creator?.email || null,
  creator_name: token?.creator?.full_name || null,
});

const ADMIN_ATTRIBUTES = [
  "id",
  "account_id",
  "username",
  "env_id",
  "is_active",
  "created_at",
  "updated_at",
];

/**
 * One token record for the admin console, without GetById's `is_active: true`
 * filter — reaching a token that is currently switched off is the whole point
 * of the status toggle and the permissions popup, and GetById would report
 * every one of those as missing.
 *
 * Null when there is no such token, so the caller can answer 404 rather than
 * writing permissions against an id nothing owns.
 */
export const GetRecord = async (id) => {
  if (!id) {
    throw { statusCode: 420, message: "Id must not be empty!" };
  }

  const token = await models.UserTokens.findOne({
    attributes: ADMIN_ATTRIBUTES,
    include: [
      {
        association: "environment",
        attributes: ["environment_name", "is_visible"],
      },
      {
        association: "creator",
        attributes: ["id", "email", "full_name"],
      },
    ],
    where: { id },
  });

  return token ? toAdminShape(token) : null;
};

/**
 * Every token record, for the admin console's API Tokens list.
 *
 * The secrets a token exists to carry — encrypted_access_token,
 * encrypted_refresh_token, salt, wrapped_dek — are deliberately not selected.
 * An admin identifies a token by its row id, which is also what its module
 * permissions are keyed on; nothing here needs the credential itself, and
 * nothing here should be able to leak it into a response body or a log.
 *
 * Soft-deleted rows are excluded by the model's paranoid scope, so a token an
 * admin deletes disappears from this list the way every other console list
 * behaves. Switched-off (`is_active: false`) tokens stay visible, because the
 * switch is what this screen is for.
 */
export const ListAll = async () => {
  const userTokens = await models.UserTokens.findAll({
    attributes: ADMIN_ATTRIBUTES,
    include: [
      {
        association: "environment",
        attributes: ["environment_name", "is_visible"],
      },
      {
        association: "creator",
        attributes: ["id", "email", "full_name"],
      },
    ],
    order: [["created_at", "DESC"]],
  });

  return userTokens.map(toAdminShape);
};

/**
 * Switch a token on or off.
 *
 * Deliberately not routed through Update above. That version exists for the
 * token-refresh path and stamps `updated_by` from `options.profile_id`, which
 * is always an `auth.users` id there — the column is a foreign key to that
 * table. An admin flipping this switch is an `admin_users` row, so the same
 * call would hand Postgres an id that table has never seen and the write
 * would fail on the constraint (verified against the live schema, not
 * assumed).
 *
 * So the status write stamps `updated_at` directly and leaves `updated_by`
 * alone: it keeps meaning "the Wrike user this token last refreshed for",
 * which is the only thing that column can honestly hold, rather than being
 * blanked or pointed at whoever last clicked a switch. What an admin changed
 * is recorded on the permission rows themselves (token_permissions
 * created_by/updated_by, which do reference admin_users).
 *
 * Returns how many rows changed; 0 means the id matched nothing.
 */
export const SetStatus = async (id, is_active) => {
  const [affected] = await models.UserTokens.update(
    { is_active, updated_at: new Date() },
    // No individualHooks: the instance beforeUpdate hook is what would stamp
    // updated_by, and skipping it is the point of this function.
    { where: { id } },
  );

  return affected;
};
