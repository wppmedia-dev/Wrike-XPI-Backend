import { Tokens, McpTokens } from "../controllers";
import { getWrikeTokens } from "../utils/wrike";
import * as crypto from "../utils/crypto";
import jwt from "jsonwebtoken";
import {
  evaluateAccess,
  clientIp,
  SURFACE,
  PUBLIC_DENIAL_MESSAGE,
} from "../utils/environmentAccess";

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

// Which door a bearer token is presented at. The Xtend API's 180-day token and
// the MCP OAuth access token are signed with the same secret and carry the same
// `t` and `d`, so without this a token for one would open the other.
const MCP_TOKEN_USE = "mcp";

// Verify the XPI token and extract the token-record id + DEK.
//
// `surface` is "rest" (the default) or "mcp". /mcp accepts only MCP access
// tokens, and those are refused everywhere else. An MCP access token is also
// only as good as its refresh token family: revoking the family (sign-out,
// admin revoke, a replayed refresh token) kills it before its own expiry.
const verifyJWE = async (jweToken, surface = "rest") => {
  const payload = jwt.verify(jweToken, process.env.JWT_SECRET);

  const isMcpToken = payload.s === MCP_TOKEN_USE;
  if ((surface === "mcp") !== isMcpToken) {
    throw new Error("Invalid token");
  }
  if (isMcpToken && !(await McpTokens.IsFamilyActive(payload.f))) {
    throw new Error("Invalid token");
  }

  // Current tokens carry the record id as `t` and the DEK inline as `d`.
  // Older tokens used `tid` plus `enc`, a second signed JWT wrapping the
  // DEK. Accept both shapes until the old tokens age out (180d expiry).
  const tid = payload.t ?? payload.tid;
  let dekStr = payload.d;
  if (!dekStr && payload.enc) {
    ({ dek: dekStr } = jwt.verify(payload.enc, process.env.JWT_SECRET));
  }

  if (!tid || !dekStr) {
    throw new Error("Invalid token");
  }

  const token = await Tokens.GetById(tid);
  if (!token.id) {
    throw new Error("Invalid token");
  }

  return { token, dek: Buffer.from(dekStr, "base64") };
};

/**
 * Handle token refresh using DEK
 */
const refreshTokens = async (encRefreshToken, dek, createdBy, tid, env) => {
  try {
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
  } catch (err) {
    throw err;
  }
};

// Wrike rotates the refresh token on every use, so two requests that refresh
// at once (an MCP client fires several in parallel) make the second one present
// an already-spent refresh token and fail. One refresh per token row at a time;
// latecomers share its result, and re-read the row so a refresh that finished
// just before they started is reused instead of repeated.
const inflightRefreshes = new Map();

const refreshOnce = (token, dek) => {
  if (inflightRefreshes.has(token.id)) return inflightRefreshes.get(token.id);

  const dekBuffer = Buffer.isBuffer(dek) ? dek : Buffer.from(dek, "base64");
  const run = (async () => {
    const fresh = (await Tokens.GetById(token.id)) || token;
    const current = crypto
      .decrypt(Buffer.from(fresh.encrypted_access_token, "base64"), dekBuffer)
      .toString();
    const decoded = jwt.decode(current);
    if (decoded?.exp && decoded.exp - Date.now() / 1000 >= 1800) {
      return current;
    }
    return refreshTokens(
      Buffer.from(fresh.encrypted_refresh_token, "base64"),
      dekBuffer,
      fresh.created_by,
      fresh.id,
      fresh.environment_name,
    );
  })().finally(() => inflightRefreshes.delete(token.id));

  inflightRefreshes.set(token.id, run);
  return run;
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
      accessToken = await refreshOnce(token, dek);
    }

    // Environment-level access scope — evaluated immediately after the token
    // itself is proven valid. Who is calling (email, from the same token)
    // and where from (request IP) must match an entry on this environment's
    // allow list, or the request goes no further. See
    // src/utils/environmentAccess.js for the match rules.
    const access = await evaluateAccess({
      envId: token.env_id,
      environmentName: token.environment_name,
      wrikeToken: accessToken,
      ip: clientIp(req),
      // This is the REST path, so entries scoped to MCP only do not apply.
      surface: SURFACE.API,
    });

    // Set before the possible return below, so the activity-log onResponse
    // hook (src/routes/index.js) sees these on every outcome, allowed or
    // denied alike.
    req.access = access;
    req.environmentName = token.environment_name;
    req.envId = token.env_id;
    req.callerEmail = access.email || null;

    if (!access.allowed) {
      return reply.code(403).send({
        success: false,
        message: PUBLIC_DENIAL_MESSAGE,
        error: { code: access.code },
      });
    }

    // Store the decrypted token for route handlers, and the row id of the
    // token it came from. The id is what the per-token module gate keys its
    // lookup on (src/middlewares/tokenPermissions.js), and it is set here, on
    // the far side of the environment gate, so a request that was refused
    // above never looks like an authenticated one to that gate.
    req.wrikeToken = accessToken;
    req.tokenId = token.id;
  } catch (err) {
    console.error(new Date().toISOString(), err);
    reply.code(401).send({
      success: false,
      message: err.message || "Authentication failed",
    });
  }
};

/**
 * Resolve a JWE token to { wrikeToken, environmentName }.
 * Reuses the existing verifyJWE + decrypt + refresh logic.
 * This is used by the MCP auth_login tool for session-based authentication.
 */
const resolveAuth = async (token, dek) => {
  if (!token?.encrypted_access_token) throw new Error("No access token found");

  const dekBuffer = Buffer.isBuffer(dek) ? dek : Buffer.from(dek, "base64");
  const accessTokenBuf = Buffer.from(token.encrypted_access_token, "base64");
  let accessToken = crypto.decrypt(accessTokenBuf, dekBuffer).toString();
  if (!accessToken) throw new Error("Failed to decrypt access token");

  const decodedToken = jwt.decode(accessToken);
  if (decodedToken && decodedToken.exp) {
    const now = Date.now() / 1000;
    if (decodedToken.exp - now < 1800) {
      accessToken = await refreshOnce(token, dekBuffer);
    }
  }

  return {
    wrikeToken: accessToken,
    environmentName: token.environment_name,
    // Carried so the MCP layer can scope the environment access check to the
    // same environment the token belongs to (src/plugins/mcp.js), and so the
    // per-tool permission gate knows which token's matrix to read
    // (src/mcp/index.js installPermissionGate).
    envId: token.env_id,
    tokenId: token.id,
  };
};

export const ResolveAuthFromJWT = async (jweToken, { surface = "rest" } = {}) => {
  try {
    if (!jweToken) throw new Error("No token provided");

    const { token, dek } = await verifyJWE(jweToken, surface);
    return resolveAuth(token, dek);
  } catch (err) {
    console.error(new Date().toISOString(), err);
    throw { message: err?.message || err, statusCode: 401 };
  }
};

export const ResolveAuthFromCredentials = async (username, password) => {
  try {
    if (!username || !password) {
      throw new Error("Username and password are required");
    }

    const credentials = Buffer.from(`${username}:${password}`).toString(
      "base64",
    );
    const { token, dek } = await verifyBasicAuth(credentials);
    return resolveAuth(token, dek);
  } catch (err) {
    console.error(new Date().toISOString(), err);
    throw { message: err?.message || err, statusCode: 401 };
  }
};

// Individual JWT Token validation
export const ValidateJWT = async (jwtToken) => {
  try {
    if (!jwtToken) throw new Error("No authorization header");

    const { token, dek } = await verifyJWE(jwtToken);
    const auth = await resolveAuth(token, dek);
    return auth.wrikeToken;
  } catch (err) {
    console.error(new Date().toISOString(), err);
    throw { message: err?.message || err };
  }
};
