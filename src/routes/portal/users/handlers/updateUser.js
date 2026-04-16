import { Users } from "../../../../controllers";

export const UpdateUser = (adminUser, params, body) => {
  return new Promise(async (resolve, reject) => {
    try {
      const { id } = params;
      const { username, full_name, email, role } = body;

      if (!id)
        return reject({ statusCode: 400, message: "User ID is required" });

      const user = await Users.GetById(id);
      if (!user?.id)
        return reject({ statusCode: 404, message: "User not found" });

      const updateData = {};
      if (username !== undefined) {
        const normalizedUsername = username.trim().toLowerCase();
        if (!normalizedUsername)
          return reject({
            statusCode: 400,
            message: "Username must not be empty",
          });

        if (normalizedUsername !== user.username) {
          const existing = await Users.GetByUsername(normalizedUsername);
          if (existing && existing.id !== id)
            return reject({
              statusCode: 409,
              message: "Username is already taken",
            });
        }

        updateData.username = normalizedUsername;
      }
      if (full_name !== undefined) updateData.full_name = full_name || null;
      if (email !== undefined)
        updateData.email = email ? email.toLowerCase() : null;
      if (role !== undefined) {
        if (!["admin", "user"].includes(role))
          return reject({
            statusCode: 400,
            message: "Role must be admin or user",
          });
        updateData.role = role;
      }

      await Users.Update(adminUser.id, id, updateData);

      return resolve({
        statusCode: 200,
        message: "User updated successfully",
      });
    } catch (err) {
      console.log(err?.message || err);
      reject(err);
    }
  });
};
