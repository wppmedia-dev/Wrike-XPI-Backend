import { Tokens } from "../controllers";
import {
  decryptWithDEK,
  unwrapDEK,
  generateDEK,
  encryptWithDEK,
  wrapDEK,
} from "../utils/crypto";
import { getWrikeTokens } from "../utils/wrike";
import { getAuthenticatedUser } from "../utils/auth";

export const ValidateToken = async (req, reply, fastify) => {
  try {
    // Authenticate user using either JWT or Basic Auth
    const {
      encrypted_access_token: encAccessToken,
      encrypted_refresh_token: encRefreshToken,
      wrapped_access_token_dek: wrappedAccessTokenDEK,
      wrapped_refresh_token_dek: wrappedRefreshTokenDEK,
      key_id: keyId,
      created_by: createdBy,
    } = await getAuthenticatedUser(req, reply, fastify);

    if (!encAccessToken || !wrappedAccessTokenDEK || !keyId)
      return reply.code(401).send({
        message:
          "Failed authorization! The token is invalid or does not exist.",
      });

    // Unwrap DEKs using Azure Key Vault
    const accessTokenDEK = await unwrapDEK(wrappedAccessTokenDEK, keyId);
    const refreshTokenDEK = await unwrapDEK(wrappedRefreshTokenDEK, keyId);

    let wrikeAccessToken = decryptWithDEK(encAccessToken, accessTokenDEK);
    const wrikeRefreshToken = decryptWithDEK(encRefreshToken, refreshTokenDEK);

    if (!wrikeAccessToken || !wrikeRefreshToken)
      return reply.code(401).send({
        message:
          "Failed authorization! User is not authorized to access the service.",
      });

    const decodedWrikeToken = await fastify.jwt.decode(wrikeAccessToken);

    // 30 minutes in milliseconds
    const THIRTY_MINUTES = 30 * 60 * 1000;
    const tokenExpiryTime = decodedWrikeToken.exp * 1000;
    const now = Date.now();

    if (tokenExpiryTime - now < THIRTY_MINUTES) {
      // Token is expired or will expire in less than 30 minutes
      const result = await getWrikeTokens({
        refresh_token: wrikeRefreshToken,
      });

      const {
        access_token = null,
        refresh_token = null,
        error = null,
        error_description = null,
      } = result;

      if (error || error_description)
        return reply.code(401).send({
          message:
            "Failed authorization! The XPI token appears to be invalid or expired. Please regenerate the token and try again.",
        });

      if (!access_token || !refresh_token)
        return reply.code(401).send({
          message:
            "Failed authorization! User is not authorized to access the service.",
        });

      wrikeAccessToken = access_token;

      // Generate new DEKs for the new tokens
      const newAccessTokenDEK = generateDEK();
      const newRefreshTokenDEK = generateDEK();

      // Encrypt tokens with new DEKs
      const encryptedAccessToken = encryptWithDEK(
        access_token,
        newAccessTokenDEK
      );
      const encryptedRefreshToken = encryptWithDEK(
        refresh_token,
        newRefreshTokenDEK
      );

      // Wrap new DEKs
      const wrappedAccessTokenDEK = await wrapDEK(newAccessTokenDEK, keyId);
      const wrappedRefreshTokenDEK = await wrapDEK(newRefreshTokenDEK, keyId);

      await Tokens.Update(createdBy, tid, {
        encrypted_access_token: encryptedAccessToken,
        encrypted_refresh_token: encryptedRefreshToken,
        wrapped_access_token_dek: wrappedAccessTokenDEK,
        wrapped_refresh_token_dek: wrappedRefreshTokenDEK,
        key_id: keyId,
      });
    }

    req.wrikeToken = wrikeAccessToken;
  } catch (err) {
    console.error(new Date().toISOString() + " : " + err?.message || err);
    reply.code(401).send({
      success: false,
      message:
        err?.message == "Authorization token expired"
          ? "Token expired! Unable to authenticate user or token."
          : "Failed authentication! Unable to authenticate user or token.",
    });
  }
};
