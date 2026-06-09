import { PortalAuth } from "../../../../controllers";

export const ToggleUser = (adminUser, params, body) => {
  return new Promise(async (resolve, reject) => {
    try {
      const { id } = params;
      const { is_active } = body;

      if (!id)
        return reject({ statusCode: 400, message: "User ID is required" });

      if (typeof is_active !== "boolean")
        return reject({
          statusCode: 400,
          message: "is_active must be a boolean",
        });

      const user = await PortalAuth.GetById(id);
      if (!user?.id)
        return reject({ statusCode: 404, message: "User not found" });

      await PortalAuth.Update(adminUser.id, id, { is_active });

      return resolve({
        statusCode: 200,
        message: `User ${is_active ? "enabled" : "disabled"} successfully`,
      });
    } catch (err) {
      console.log(err?.message || err);
      reject(err);
    }
  });
};
