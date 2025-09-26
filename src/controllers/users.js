import models from "../../models";

export const Insert = async (data, options = {}) => {
  try {
    const userData = await models.Users.create(data, options);
    return userData;
  } catch (err) {
    throw err;
  }
};

export const GetByWrikeId = async (id) => {
  try {
    const userData = await models.Users.findOne({
      attributes: ["id"],
      where: { wrike_user_id: id },
    });
    return userData;
  } catch (err) {
    throw err;
  }
};

export const GetById = async (id) => {
  try {
    const userData = await models.Users.findOne({
      attributes: ["id"],
      where: { id },
    });
    return userData;
  } catch (err) {
    throw err;
  }
};
