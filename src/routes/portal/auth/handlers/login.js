import jwt from "jsonwebtoken";
import * as CryptoUtils from "../../../../utils/crypto";
import { Users } from "../../../../controllers";

export const Login = (body) => {
  return new Promise(async (resolve, reject) => {
    try {
      const { username, password } = body;

      if (!username || !password)
        return reject({
          statusCode: 400,
          message: "Username and password are required",
        });

      const user = await Users.GetByUsername(username);

      if (!user?.id || !user?.is_active)
        return reject({ statusCode: 401, message: "Invalid credentials" });

      const isValid = await CryptoUtils.verifyPassword(
        user.password_hash,
        password,
      );
      if (!isValid)
        return reject({ statusCode: 401, message: "Invalid credentials" });

      await Users.UpdateLastLogin(user.id);

      const accessToken = jwt.sign(
        {
          sub: user.id,
          username: user.username,
          role: user.role,
        },
        process.env.JWT_SECRET,
        { expiresIn: "12h" },
      );

      return resolve({
        statusCode: 200,
        message: "Login successful",
        data: {
          access_token: accessToken,
          role: user.role,
          must_change_password: user.must_change_password,
          full_name: user.full_name,
        },
      });
    } catch (err) {
      console.log(err?.message || err);
      reject(err);
    }
  });
};
