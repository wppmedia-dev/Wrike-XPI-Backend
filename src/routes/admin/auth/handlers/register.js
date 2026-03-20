import * as CryptoUtils from "../../../../utils/crypto";
import { AdminAuth } from "../../../../controllers";

export const Register = (body) => {
  return new Promise(async (resolve, reject) => {
    try {
      const { username, password, setup_key } = body;

      if (!username || !password)
        return reject({
          statusCode: 400,
          message: "Username and password are required",
        });

      const adminCount = await AdminAuth.Count();

      if (adminCount > 0) {
        const setupKey = process.env.ADMIN_SETUP_KEY;
        if (!setupKey || setup_key !== setupKey)
          return reject({
            statusCode: 403,
            message: "Admin registration requires a valid setup key",
          });
      }

      const existingAdmin = await AdminAuth.GetByUsername(username);
      if (existingAdmin?.id)
        return reject({ statusCode: 400, message: "Username already exists" });

      const passwordHash = await CryptoUtils.hashPassword(password);
      const admin = await AdminAuth.Insert(username, passwordHash);

      return resolve({
        statusCode: 201,
        message: "Admin registered successfully",
        data: admin,
      });
    } catch (err) {
      console.log(err?.message || err);
      reject(err);
    }
  });
};
