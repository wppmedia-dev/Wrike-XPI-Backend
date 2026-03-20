import { AdminAuth } from "../../../../controllers";

export const Logout = (adminUser) => {
  return new Promise(async (resolve, reject) => {
    try {
      await AdminAuth.RevokeSession(adminUser.session_id);

      return resolve({ statusCode: 200, message: "Logged out successfully" });
    } catch (err) {
      console.log(err?.message || err);
      reject(err);
    }
  });
};
