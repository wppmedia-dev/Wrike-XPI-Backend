import { decryptWithKey } from "../../../utils/crypto";
import { GetResponse } from "../../../utils/node-fetch";
import { Tokens } from "../../../controllers";

export const GetUserData = ({ token }, fastify) => {
  return new Promise(async (resolve, reject) => {
    try {
      if (!token) return reject({ message: "Access Token must not be empty" });

      const { tid, encAccessTokenKey, encRefreshTokenKey } =
        await fastify.jwt.verify(token);

      if (!tid || !encAccessTokenKey || !encRefreshTokenKey)
        return reject({ message: "Invalid Token" });

      const {
        encrypted_access_token: encAccessToken,
        // encrypted_refresh_token: encRefreshToken,
      } = await Tokens.GetById(tid);

      if (!encAccessToken) return reject({ message: "Invalid Token!" });

      const wrikeAccessToken = await decryptWithKey(
        encAccessToken,
        encAccessTokenKey,
      );

      // const wrikeRefreshToken = await decryptWithKey(
      //   encRefreshToken,
      //   encRefreshTokenKey,
      // );

      const wrikeData = await wrikeUserData(wrikeAccessToken);

      // Sending final response
      resolve(wrikeData);
    } catch (err) {
      console.log(err?.message || err);
      reject(err);
    }
  });
};

const wrikeUserData = (access_token) => {
  return new Promise(async (resolve, reject) => {
    try {
      const result = await GetResponse(
        `${process.env.WRIKE_ENDPOINT}/contacts?me`,
        "GET",
        {
          "content-type": "application/json",
          authorization: "Bearer " + access_token,
        },
        null,
      );
      if (result?.error)
        return reject({ message: result["error_description"] });

      resolve(result?.data[0]);
    } catch (err) {
      console.log("Error while getting user details: ", err?.message ?? err);
      reject(err);
    }
  });
};
