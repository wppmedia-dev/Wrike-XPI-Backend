import * as CryptoUtils from "../../../../utils/crypto";
import { Users } from "../../../../controllers";

export const ChangePassword = (portalUser, body) => {
  return new Promise(async (resolve, reject) => {
    try {
      const { current_password, new_password } = body;

      if (!current_password || !new_password)
        return reject({
          statusCode: 400,
          message: "Current password and new password are required",
        });

      if (new_password.length < 8)
        return reject({
          statusCode: 400,
          message: "New password must be at least 8 characters",
        });

      if (current_password === new_password)
        return reject({
          statusCode: 400,
          message: "New password must differ from current password",
        });

      const user = await Users.GetByUsername(portalUser.username);
      if (!user?.id)
        return reject({ statusCode: 404, message: "User not found" });

      const isValid = await CryptoUtils.verifyPassword(
        user.password_hash,
        current_password,
      );
      if (!isValid)
        return reject({
          statusCode: 401,
          message: "Current password is incorrect",
        });

      const newHash = await CryptoUtils.hashPassword(new_password);

      await Users.Update(null, user.id, {
        password_hash: newHash,
        must_change_password: false,
      });

      return resolve({
        statusCode: 200,
        message: "Password updated successfully",
      });
    } catch (err) {
      console.log(err?.message || err);
      reject(err);
    }
  });
};
