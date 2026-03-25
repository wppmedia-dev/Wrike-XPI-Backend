import { Tokens } from "../controllers";
import { getWrikeTokens } from "../utils/wrike";
import * as crypto from "../utils/crypto";
import jwt from "jsonwebtoken";

// Verify Basic Auth credentials and return unwrapped DEK
const verifyBasicAuth = async (credentials) => {
  const [username, password] = Buffer.from(credentials, "base64")
    .toString()
    .split(":");

  if (!username || !password) {
    throw new Error("Invalid credentials format");
  }

  // Get user token details
  const token = await Tokens.GetTokenByUsername(username);
  if (!token?.id || !token?.password_hash) {
    throw new Error("Invalid credentials");
  }

  // Verify password
  const isValid = await crypto.verifyPassword(token.password_hash, password);
  if (!isValid) {
    throw new Error("Invalid password");
  }

  // Derive KEK and unwrap DEK
  const salt = Buffer.from(token.salt, "base64");
  const kek = await crypto.deriveKEK(password, salt);
  const wrappedDEK = Buffer.from(token.wrapped_dek, "base64");
  const dek = crypto.unwrapDEK(wrappedDEK, kek);

  return { token, dek };
};

// Verify JWE token and extract DEK
const verifyJWE = async (jweToken) => {
  const { tid, enc: encryptedDEK } = jwt.verify(
    jweToken,
    process.env.JWT_SECRET,
  );

  if (!encryptedDEK) {
    throw new Error("Invalid token");
  }

  const token = await Tokens.GetById(tid);
  if (!token.id) {
    throw new Error("Invalid token");
  }

  // Decrypt the DEK from the JWE and convert back to Buffer
  const { dek: dekStr } = jwt.verify(encryptedDEK, process.env.JWT_SECRET);
  const dek = Buffer.from(dekStr, "base64");

  return { token, dek };
};

/**
 * Handle token refresh using DEK
 */
const refreshTokens = async (encRefreshToken, dek, createdBy, tid, env) => {
  // Ensure DEK is a Buffer before decryption
  const dekBuffer = Buffer.isBuffer(dek) ? dek : Buffer.from(dek, "base64");
  const refreshToken = crypto
    .decrypt(Buffer.from(encRefreshToken, "base64"), dekBuffer)
    .toString();

  const result = await getWrikeTokens({ env, refresh_token: refreshToken });
  if (!result.access_token || !result.refresh_token) {
    throw new Error("Token refresh failed");
  }

  // Re-encrypt tokens with same DEK
  const newEncAccessToken = crypto
    .encrypt(result.access_token, dek)
    .toString("base64");
  const newEncRefreshToken = crypto
    .encrypt(result.refresh_token, dek)
    .toString("base64");

  // Update tokens in database
  await Tokens.Update(createdBy, tid, {
    encrypted_access_token: newEncAccessToken,
    encrypted_refresh_token: newEncRefreshToken,
  });

  return result.access_token;
};

export const ValidateToken = async (req, reply, fastify) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const [authType, credentials] = authHeader.split(" ");
    let token, dek;

    // Authenticate and get DEK based on auth type
    switch (authType.toLowerCase()) {
      case "basic":
        ({ token, dek } = await verifyBasicAuth(credentials));
        break;
      case "bearer":
        ({ token, dek } = await verifyJWE(credentials));
        break;
      default:
        throw new Error("Unsupported authentication type");
    }

    if (!token.encrypted_access_token) {
      throw new Error("No access token found");
    }

    // Decrypt access token
    const accessTokenBuf = Buffer.from(token.encrypted_access_token, "base64");
    let accessToken = crypto.decrypt(accessTokenBuf, dek).toString();
    if (!accessToken) {
      throw new Error("Failed to decrypt access token");
    }

    // Check token expiry
    const decodedToken = jwt.decode(accessToken);
    if (!decodedToken) {
      throw new Error("Invalid access token format");
    }

    const now = Date.now() / 1000;

    if (decodedToken.exp - now < 1800) {
      // 30 minutes
      const refreshTokenBuf = Buffer.from(
        token.encrypted_refresh_token,
        "base64",
      );
      accessToken = await refreshTokens(
        refreshTokenBuf,
        dek,
        token.created_by,
        token.id,
        token.environment_name,
      );
    }

    // Store token for route handlers
    req.wrikeToken = accessToken;
  } catch (err) {
    console.error(new Date().toISOString(), err);
    reply.code(401).send({
      success: false,
      message: err.message || "Authentication failed",
    });
  }
};

// Individual JWT Token validation
export const ValidateJWT = async (jwtToken) => {
  try {
    if (!jwtToken) throw new Error("No authorization header");

    const { token, dek } = await verifyJWE(jwtToken);

    if (!token.encrypted_access_token) throw new Error("No access token found");

    // Decrypt access token
    const accessTokenBuf = Buffer.from(token.encrypted_access_token, "base64");
    let accessToken = crypto.decrypt(accessTokenBuf, dek).toString();
    if (!accessToken) throw new Error("Failed to decrypt access token");

    // Check token expiry
    const decodedToken = jwt.decode(accessToken);
    if (!decodedToken) throw new Error("Invalid access token format");

    const now = Date.now() / 1000;

    if (decodedToken.exp - now < 1800) {
      // 30 minutes
      const refreshTokenBuf = Buffer.from(
        token.encrypted_refresh_token,
        "base64",
      );
      accessToken = await refreshTokens(
        refreshTokenBuf,
        dek,
        token.created_by,
        token.id,
        token.environment_name,
      );
    }

    // Store token for route handlers
    return accessToken;
  } catch (err) {
    console.error(new Date().toISOString(), err);
    throw { message: err?.message || err };
  }
};
