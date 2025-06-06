import { Tokens } from "../controllers";
import { decryptWithKey, encryptWithRandomKey } from "../utils/crypto";
import { getWrikeTokens } from "../utils/wrike";

export const ValidateToken = async (req, reply, fastify) => {
  try {
    const token = req?.headers?.authorization?.split(" ")[1];

    if (!token) {
      return reply.code(401).send({
        message: "Failed authentication! Unable to authenticate user or token.",
      });
    }

    await req.jwtVerify();

    const {
      uid = null,
      encAccessTokenKey = null,
      encRefreshTokenKey = null,
    } = req?.user;

    if (!uid || !encAccessTokenKey || !encRefreshTokenKey)
      return reply.code(403).send({
        message:
          "Failed authorization! User is not authorized to access the service.",
      });

    const {
      id: tokenId,
      encrypted_access_token: encAccessToken,
      encrypted_refresh_token: encRefreshToken,
    } = await Tokens.GetByUserId(uid);

    if (!encAccessToken)
      return reply.code(401).send({
        message:
          "Failed authorization! The token is invalid or does not exist.",
      });

    let wrikeAccessToken = await decryptWithKey(
      encAccessToken,
      encAccessTokenKey
    );

    const wrikeRefreshToken = await decryptWithKey(
      encRefreshToken,
      encRefreshTokenKey
    );

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

      const { access_token = null, refresh_token = null } = result;

      if (!access_token || !refresh_token)
        return reply.code(401).send({
          message:
            "Failed authorization! User is not authorized to access the service.",
        });

      wrikeAccessToken = access_token;

      const newEncAccessToken = await encryptWithRandomKey(
        access_token,
        encAccessTokenKey
      );
      const newEncRefreshToken = await encryptWithRandomKey(
        refresh_token,
        encRefreshTokenKey
      );

      Tokens.Update(uid, tokenId, {
        encrypted_access_token: newEncAccessToken?.encryptedData,
        encrypted_refresh_token: newEncRefreshToken?.encryptedData,
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
