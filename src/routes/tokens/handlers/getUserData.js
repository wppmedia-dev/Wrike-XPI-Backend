import { getUserData } from "../../../utils/wrike";

export const GetUserData = (token, fastify) => {
  return new Promise(async (resolve, reject) => {
    try {
      if (!token) return reject({ message: "Access Token must not be empty" });

      const wrikeData = await getUserData(token);

      // Sending final response
      resolve(wrikeData);
    } catch (err) {
      console.log(err?.message || err);
      reject(err);
    }
  });
};
