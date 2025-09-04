import { encryptWithRandomKey } from "../../../utils/crypto";
import { Tokens, Users } from "../../../controllers";
import { getWrikeTokens, getUserData } from "../../../utils/wrike";
import models from "../../../../models";

export const WrikeXPICallback = ({ code }, fastify) => {
  return new Promise(async (resolve, reject) => {
    // Start database transaction for data consistency
    const transaction = await models.sequelize.transaction();

    try {
      if (!code) return reject({ message: "Access Token must not be empty" });

      const { access_token, refresh_token } = await getWrikeTokens({ code });

      const encAccessToken = await encryptWithRandomKey(access_token);
      const encRefreshToken = await encryptWithRandomKey(refresh_token);

      // Getting the user data from the wrike(/contacts?me) api
      const wrikeUserData = await getUserData(access_token);

      const {
        id: wrikeUserId,
        firstName,
        lastName,
        primaryEmail,
        profiles,
      } = wrikeUserData?.data[0];

      if (!wrikeUserId) {
        await transaction.rollback();
        return reject({ message: "Invalid Wrike User!" });
      }

      const accountId = profiles?.[0]?.accountId;

      // All database operations within transaction
      const userData = await Users.GetByWrikeId(wrikeUserId);
      let userId = userData?.id;

      if (!userData?.id) {
        const newUserData = await Users.Insert(
          {
            full_name: firstName + " " + lastName,
            email: primaryEmail,
            wrike_user_id: wrikeUserId,
            is_active: true,
          },
          { transaction }
        );

        userId = newUserData?.id;
      }

      const userTokenData = await Tokens.GetByUserAndAccountId(
        userId,
        accountId
      );

      let userTokenId = userTokenData?.id;

      if (userTokenId) {
        await Tokens.Update(
          userId,
          userTokenId,
          {
            encrypted_access_token: encAccessToken?.encryptedData,
            encrypted_refresh_token: encRefreshToken?.encryptedData,
          },
          { transaction }
        );
      } else {
        const newUserTokenData = await Tokens.Insert(
          userId,
          {
            account_id: accountId,
            encrypted_access_token: encAccessToken?.encryptedData,
            encrypted_refresh_token: encRefreshToken?.encryptedData,
            is_active: true,
          },
          { transaction }
        );

        userTokenId = newUserTokenData?.id;
      }

      // Commit transaction only after all operations succeed
      await transaction.commit();

      const token = fastify.jwt.sign(
        {
          encAccessTokenKey: encAccessToken?.key,
          encRefreshTokenKey: encRefreshToken?.key,
          tid: userTokenId,
        },
        { expiresIn: "365d" }
      );

      // Sending final response
      resolve(token);
    } catch (err) {
      // Rollback transaction on any error
      await transaction.rollback();
      console.log(
        "Database transaction rolled back due to error:",
        err?.message || err
      );
      reject(err);
    }
  });
};
