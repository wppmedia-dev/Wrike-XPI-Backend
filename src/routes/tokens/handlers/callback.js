import { encryptWithRandomKey } from "../../../utils/crypto";
import { GetResponse } from "../../../utils/node-fetch";
import { Tokens, Users } from "../../../controllers";
import { getWrikeTokens } from "../../../utils/wrike";

export const WrikeXPICallback = ({ code }, fastify) => {
  return new Promise(async (resolve, reject) => {
    try {
      if (!code) return reject({ message: "Access Token must not be empty" });

      const { access_token, refresh_token } = await getWrikeTokens({ code });

      const encAccessToken = await encryptWithRandomKey(access_token);
      const encRefreshToken = await encryptWithRandomKey(refresh_token);

      const {
        id: wrikeUserId,
        firstName,
        lastName,
        primaryEmail,
      } = await wrikeUserData(access_token);

      if (!wrikeUserId) return reject({ message: "Invalid Wrike User!" });

      const userData = await Users.GetByWrikeId(wrikeUserId);

      let userId = userData?.id;

      if (!userId) {
        const newUserData = await Users.Insert({
          full_name: firstName + " " + lastName,
          email: primaryEmail,
          wrike_user_id: wrikeUserId,
          is_active: true,
        });

        userId = newUserData?.id;

        await Tokens.Insert(newUserData?.id, {
          encrypted_access_token: encAccessToken?.encryptedData,
          encrypted_refresh_token: encRefreshToken?.encryptedData,
          is_active: true,
        });
      } else {
        const userTokenData = await Tokens.GetByUserId(userId);

        if (userTokenData?.id) {
          await Tokens.Update(userId, userTokenData?.id, {
            encrypted_access_token: encAccessToken?.encryptedData,
            encrypted_refresh_token: encRefreshToken?.encryptedData,
          });
        } else {
          await Tokens.Insert(userId, {
            encrypted_access_token: encAccessToken?.encryptedData,
            encrypted_refresh_token: encRefreshToken?.encryptedData,
            is_active: true,
          });
        }
      }

      const token = fastify.jwt.sign(
        {
          encAccessTokenKey: encAccessToken?.key,
          encRefreshTokenKey: encRefreshToken?.key,
          uid: userId,
        },
        { expiresIn: "365d" }
      );

      // Sending final response
      resolve(token);
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
        null
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
