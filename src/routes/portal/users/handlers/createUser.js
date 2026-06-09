import * as CryptoUtils from "../../../../utils/crypto";
import { PortalAuth } from "../../../../controllers";

export const CreateUser = (adminUser, body) => {
  return new Promise(async (resolve, reject) => {
    try {
      const { username, password, role, full_name, email } = body;

      if (!username || !password || !role)
        return reject({
          statusCode: 400,
          message: "Username, password, and role are required",
        });

      if (!["admin", "user"].includes(role))
        return reject({
          statusCode: 400,
          message: "Role must be admin or user",
        });

      if (password.length < 8)
        return reject({
          statusCode: 400,
          message: "Password must be at least 8 characters",
        });

      const existing = await PortalAuth.GetByUsername(username);
      if (existing?.id)
        return reject({ statusCode: 409, message: "Username already exists" });

      const password_hash = await CryptoUtils.hashPassword(password);

      const user = await PortalAuth.Insert(
        {
          username: username.toLowerCase(),
          password_hash,
          role,
          full_name: full_name || null,
          email: email ? email.toLowerCase() : null,
          is_active: true,
          must_change_password: true,
        },
        { profile_id: adminUser.id },
      );

      return resolve({
        statusCode: 201,
        message: "User created successfully",
        data: {
          id: user.id,
          username: user.username,
          role: user.role,
          full_name: user.full_name,
          email: user.email,
        },
      });
    } catch (err) {
      console.log(err?.message || err);
      reject(err);
    }
  });
};
