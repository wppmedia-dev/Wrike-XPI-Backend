import models from "../../models";

export const GetById = async (id) => {
  try {
    if (!id) throw { statusCode: 400, message: "Id must not be empty" };

    const user = await models.PortalUsers.findOne({
      attributes: [
        "id",
        "username",
        "role",
        "must_change_password",
        "is_active",
      ],
      where: { id, is_active: true, deleted_at: null },
    });

    return {
      id: user?.id,
      username: user?.username,
      role: user?.role,
      must_change_password: user?.must_change_password,
      is_active: user?.is_active,
    };
  } catch (err) {
    throw err;
  }
};
