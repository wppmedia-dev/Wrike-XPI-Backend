import * as crypto from "../../../utils/crypto";
import { Tokens, Users } from "../../../controllers";
import { getWrikeTokens, getUserData } from "../../../utils/wrike";
import models from "../../../../models";
import { GetById } from "../../../controllers/wrikeCredentials";
import {
  evaluateAccess,
  SURFACE,
  PUBLIC_DENIAL_MESSAGE,
} from "../../../utils/environmentAccess";
import { tokenExpiryFrom, TOKEN_TTL_DAYS } from "../../../utils/tokenTtl";
import { usernameFor } from "../../../utils/tokenUsername";
import { v4 as uuidv4 } from "uuid";

/**
 * Mint, or refuse to mint, an XPI token for whoever just signed in at Wrike.
 *
 * `req` is optional and used for one thing: attributing the request in the
 * activity log. Wrike's contact response a few lines below is the only place
 * this flow learns a person's email, and without this the log row for a
 * sign-in that created a token — or for one refused before it could — said
 * "Unresolved" about somebody we had just looked up.
 *
 * @param {{code: string, environmentId: string, ip?: string, clientName?: string}} data
 * @param {object} fastify - the app, for jwt.sign
 * @param {object} [req] - the request, so its log row can name the caller
 */
export const WrikeTokenExchange = (
  { code, environmentId, ip, clientName },
  fastify,
  req,
) => {
  return new Promise(async (resolve, reject) => {
    // Transaction is opened later, right before the first write. It must
    // not span the outbound Wrike API calls or the access check below, since
    // holding a pooled connection idle for the length of an external HTTP
    // round-trip is what was starving the (small) connection pool for every
    // other request, including login.
    let transaction;

    try {
      if (!code) return reject({ message: "Access Token must not be empty" });
      if (!environmentId)
        return reject({ message: "Environment must not be empty" });

      const envData = await GetById(environmentId);
      const env = envData?.environment_name;

      console.log("Fetched dynamic environment Data");

      // Get Wrike tokens from OAuth code
      const { access_token, refresh_token } = await getWrikeTokens({
        code,
        env,
      });

      if (!access_token || !refresh_token) {
        console.log(
          "Issue retrieving wrike tokens: Invalid authorization code!",
        );
        return reject({ message: "Invalid authorization code!" });
      }

      console.log("Retrieved wrike tokens");

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
        console.log("Invalid Wrike User!");
        return reject({ message: "Invalid Wrike User!" });
      }

      console.log("Fetched Wrike user data");

      // Set before the access check rather than after it: a refusal is exactly
      // the row an admin wants to be able to attribute ("who tried, and who was
      // turned away?"), and the email is already in hand. It rides on the
      // request because the log is written by the route's onResponse hook.
      if (req) {
        req.callerEmail = primaryEmail
          ? String(primaryEmail).trim().toLowerCase()
          : null;
      }

      // Set here rather than after the access check: a refusal is exactly the
      // row an admin wants to be able to attribute ("who tried, and who was
      // turned away?"), and the email is already known. It rides on the request
      // because the log is written by the route's onResponse hook.
      if (req) {
        req.callerEmail = primaryEmail
          ? String(primaryEmail).trim().toLowerCase()
          : null;
      }

      // Environment-level access scope: same gate ValidateToken applies to
      // every subsequent API call, run here BEFORE any credentials or token
      // record are created. Without this, a caller who is not on the
      // environment's allow list could still complete the OAuth exchange and
      // walk away with valid, persistent XPI credentials for it, leaving the
      // allow list to start blocking them only on their first API call.
      const access = await evaluateAccess({
        envId: environmentId,
        email: primaryEmail,
        ip,
        surface: SURFACE.API,
      });

      if (!access.allowed) {
        // Detailed reasoning stays server-side only (server log here, full
        // decision in the admin console). The caller gets the generic
        // denial message below, never the allow-list mechanics.
        console.log(
          `Environment access denied for ${primaryEmail || "unknown caller"}: ${access.code} (${access.message})`,
        );
        return reject({
          statusCode: 403,
          message: PUBLIC_DENIAL_MESSAGE,
          code: access.code,
        });
      }

      const accountId = profiles?.[0]?.accountId;

      // Start database transaction for data consistency. From here on,
      // only DB writes happen, no more outbound HTTP calls.
      transaction = await models.sequelize.transaction();

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
          { transaction },
        );
        userId = newUserData?.id;
      }

      console.log("Fetched exising user data from DB");

      // One row per token, never one row per user and environment.
      //
      // The DEK that decrypts a token's stored Wrike credential travels inside
      // the token itself (the JWE carries `d` inline). Reusing a row therefore
      // means re-encrypting that credential under a new DEK, and the older
      // token is left pointing at ciphertext it can no longer decrypt: it dies
      // the moment the second one is issued. Separate rows are also what lets
      // two tokens for the same environment carry different permissions.
      const tokenId = uuidv4();

      // Named after its own id, so the username is unique to this token and
      // still says who it belongs to. See src/utils/tokenUsername.js for why
      // the id has to be part of it at all.
      const username = usernameFor({
        accountId,
        environmentId,
        email: primaryEmail,
        tokenId,
      });

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

      // When the token minted below dies. Computed once, here, so the row and
      // the signature cannot disagree about it, and stored on the row because
      // nothing reads the JWE's own payload back: without this, "when does this
      // integration stop working?" has no answer until it does.
      const tokenExpiresAt = tokenExpiryFrom();

      const newUserTokenData = await Tokens.Insert(
        userId,
        {
          id: tokenId,
          account_id: accountId,
          env_id: environmentId,
          encrypted_access_token: encryptedAccessToken,
          encrypted_refresh_token: encryptedRefreshToken,
          username,
          password_hash: passwordHash,
          salt: salt.toString("base64"),
          wrapped_dek: wrappedDEK.toString("base64"),
          is_active: true,
          // Null when the caller did not say what it is. Guessing here would
          // put a label on a row that the console presents as fact. Truncated
          // because the column is a STRING(100) and one of the callers passes a
          // value that came in from outside.
          client_name: clientName ? String(clientName).slice(0, 100) : null,
          token_expires_at: tokenExpiresAt,
        },
        { transaction },
      );
      const userTokenId = newUserTokenData?.id;

      console.log("Inserted a new token record", userTokenId);

      // Sign the XPI token. It carries the token-record id (t) and the DEK
      // (d, base64) inline. The DEK is not secret from whoever holds this
      // token; the signature is what protects the payload from tampering. The
      // lifetime is the same constant the row above was stamped with.
      const jweToken = fastify.jwt.sign(
        {
          t: userTokenId,
          d: dek.toString("base64"),
        },
        { expiresIn: `${TOKEN_TTL_DAYS}d` },
      );

      await transaction.commit();

      console.log("XPI token has been generated successfully!");

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
      // Rollback only if the transaction was actually opened. Errors from
      // the pre-transaction steps (env lookup, Wrike API calls, access
      // check) have no transaction to roll back.
      if (transaction) {
        await transaction.rollback();
        console.log(
          "Database transaction rolled back due to error:",
          err?.message || err,
        );
      } else {
        console.log(err?.message || err);
      }
      reject(err);
    }
  });
};
