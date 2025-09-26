import { generateDEK, encryptWithDEK, wrapDEK } from "../../../utils/crypto";
import { Tokens, Users } from "../../../controllers";
import { getWrikeTokens, getUserData } from "../../../utils/wrike";
import models from "../../../../models";
import crypto from "crypto";
import bcrypt from "bcrypt";

export const WrikeXPICallback = ({ code }, fastify) => {
  return new Promise(async (resolve, reject) => {
    // Start database transaction for data consistency
    const transaction = await models.sequelize.transaction();

    try {
      if (!code) return reject({ message: "Access Token must not be empty" });

      const { access_token, refresh_token } = await getWrikeTokens({ code });

      // Generate two random DEKs
      const accessTokenDEK = generateDEK();
      const refreshTokenDEK = generateDEK();

      // Encrypt tokens with their respective DEKs
      const encryptedAccessToken = encryptWithDEK(access_token, accessTokenDEK);
      const encryptedRefreshToken = encryptWithDEK(
        refresh_token,
        refreshTokenDEK
      );

      // Wrap DEKs with Azure Key Vault's KEK
      const keyId = process.env.AZURE_KEY_VAULT_AUTH_KEY_ID;
      const wrappedAccessTokenDEK = await wrapDEK(accessTokenDEK, keyId);
      const wrappedRefreshTokenDEK = await wrapDEK(refreshTokenDEK, keyId);

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

      // Generate username based on email and account_id
      const username = `${accountId}-${primaryEmail}`;
      const password = generatePassword();
      const passwordHash = await bcrypt.hash(password, 10);

      if (userTokenId) {
        await Tokens.Update(
          userId,
          userTokenId,
          {
            encrypted_access_token: encryptedAccessToken,
            encrypted_refresh_token: encryptedRefreshToken,
            wrapped_access_token_dek: wrappedAccessTokenDEK,
            wrapped_refresh_token_dek: wrappedRefreshTokenDEK,
            key_id: keyId,
            username: username,
            password_hash: passwordHash,
          },
          { transaction }
        );
      } else {
        const newUserTokenData = await Tokens.Insert(
          userId,
          {
            account_id: accountId,
            encrypted_access_token: encryptedAccessToken,
            encrypted_refresh_token: encryptedRefreshToken,
            wrapped_access_token_dek: wrappedAccessTokenDEK,
            wrapped_refresh_token_dek: wrappedRefreshTokenDEK,
            key_id: keyId,
            username: username,
            password_hash: passwordHash,
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
          tid: userTokenId,
        },
        { expiresIn: "365d" }
      );

      // Sending final response with credentials if they were just generated
      resolve({
        token,
        credentials: {
          username,
          password,
          message:
            "IMPORTANT: Save these credentials. They will only be shown once.",
        },
      });
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

// Generate a random password for this account integration
const generatePassword = () => {
  const charset =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
  const length = 16;
  let password = "";
  for (let i = 0; i < length; i++) {
    const randomIndex = crypto.randomInt(0, charset.length);
    password += charset[randomIndex];
  }
  return password;
};
