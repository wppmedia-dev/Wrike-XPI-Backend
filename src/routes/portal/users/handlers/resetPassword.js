import * as CryptoUtils from "../../../../utils/crypto";
import { PortalAuth } from "../../../../controllers";

export const ResetPassword = (adminUser, params, body) => {
  return new Promise(async (resolve, reject) => {
    try {
      const { id } = params;
      const { new_password } = body;

      if (!id)
        return reject({ statusCode: 400, message: "User ID is required" });

      if (!new_password || new_password.length < 8)
        return reject({
          statusCode: 400,
          message: "New password must be at least 8 characters",
        });

      const user = await PortalAuth.GetById(id);
      if (!user?.id)
        return reject({ statusCode: 404, message: "User not found" });

      const password_hash = await CryptoUtils.hashPassword(new_password);

      await PortalAuth.Update(adminUser.id, id, {
        password_hash,
        must_change_password: true,
      });

      return resolve({
        statusCode: 200,
        message: "Password reset successfully",
      });
    } catch (err) {
      console.log(err?.message || err);
      reject(err);
    }
  });
};
