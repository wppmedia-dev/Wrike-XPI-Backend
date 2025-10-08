import * as crypto from "../../../utils/crypto";
import { Tokens, Users } from "../../../controllers";
import { getWrikeTokens, getUserData } from "../../../utils/wrike";
import models from "../../../../models";

export const WrikeXPICallback = ({ code }, fastify) => {
  return new Promise(async (resolve, reject) => {
    // Start database transaction for data consistency
    const transaction = await models.sequelize.transaction();

    try {
      if (!code) return reject({ message: "Access Token must not be empty" });

      // Get Wrike tokens from OAuth code
      const { access_token, refresh_token } = await getWrikeTokens({ code });

      // Get user data from Wrike API
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

      // Create or get user
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

      // Generate username from email + account_id
      const username = `${accountId}-${primaryEmail}`;

      // Generate random strong password
      const password = crypto.generateSecurePassword();

      // Generate salt and derive password hash and KEK
      const salt = crypto.generateSalt();
      const passwordHash = await crypto.hashPassword(password);
      const kek = await crypto.deriveKEK(password, salt);

      // Generate and wrap DEK
      const dek = crypto.generateDEK();
      const wrappedDEK = crypto.wrapDEK(dek, kek);

      // Encrypt Wrike tokens with DEK
      const encryptedAccessToken = crypto
        .encrypt(Buffer.from(access_token), dek)
        .toString("base64");
      const encryptedRefreshToken = crypto
        .encrypt(Buffer.from(refresh_token), dek)
        .toString("base64");

      // Get existing user token if any
      const userTokenData = await Tokens.GetByUserAndAccountId(
        userId,
        accountId
      );
      let userTokenId = userTokenData?.id;

      // Update or create token record
      if (userTokenId) {
        await Tokens.Update(
          userId,
          userTokenId,
          {
            encrypted_access_token: encryptedAccessToken,
            encrypted_refresh_token: encryptedRefreshToken,
            username,
            password_hash: passwordHash,
            salt: salt.toString("base64"),
            wrapped_dek: wrappedDEK.toString("base64"),
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
            username,
            password_hash: passwordHash,
            salt: salt.toString("base64"),
            wrapped_dek: wrappedDEK.toString("base64"),
            is_active: true,
          },
          { transaction }
        );
        userTokenId = newUserTokenData?.id;
      }

      // Create JWE token containing the DEK
      const encryptedDEK = fastify.jwt.sign(
        { dek: dek.toString("base64") },
        { expiresIn: "24h" }
      );

      const jweToken = fastify.jwt.sign(
        {
          tid: userTokenId,
          enc: encryptedDEK,
        },
        { expiresIn: "24h" }
      );

      await transaction.commit();

      // Return credentials and JWE token
      resolve({
        token: jweToken,
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
