import models from "../../models";

export const Insert = async (profile_id, data, options = {}) => {
  try {
    const credentialsData = await models.user_credentials.create(data, {
      profile_id,
      ...options,
    });
    return credentialsData;
  } catch (err) {
    throw err;
  }
};

export const GetByUsername = async (username) => {
  try {
    const credentialsData = await models.user_credentials.findOne({
      where: {
        username,
        is_active: true,
      },
      include: [
        {
          model: models.UserTokens,
          as: "userToken",
          where: { is_active: true },
        },
      ],
    });
    return credentialsData;
  } catch (err) {
    throw err;
  }
};

export const GetByUserTokenId = async (userTokenId) => {
  try {
    if (!userTokenId) {
      throw {
        statusCode: 420,
        message: "User Token Id must not be empty!",
      };
    }

    const credentialsData = await models.user_credentials.findAll({
      where: {
        user_token_id: userTokenId,
        is_active: true,
      },
    });
    return credentialsData;
  } catch (err) {
    throw err;
  }
};

export const Deactivate = async (id) => {
  try {
    if (!id) {
      throw {
        statusCode: 420,
        message: "Credentials Id must not be empty!",
      };
    }

    const result = await models.user_credentials.update(
      { is_active: false },
      {
        where: { id },
        individualHooks: true,
      }
    );
    return result;
  } catch (err) {
    throw err;
  }
};
