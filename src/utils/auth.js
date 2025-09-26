import bcrypt from "bcrypt";
import { Users, Tokens } from "../controllers";
import models from "../../models";

/**
 * Verify user credentials using Basic Authentication
 * Username format: email+app_id
 */
export const verifyBasicAuth = async (credentials) => {
  try {
    const [username, password] = Buffer.from(credentials, "base64")
      .toString()
      .split(":");

    if (!username || !password) {
      throw new Error("Invalid credentials format");
    }

    // Find token by username
    const userToken = await Tokens.GetTokenByUsername(username);

    if (!userToken) {
      throw new Error("Invalid credentials");
    }

    // Verify password hash
    const isValid = await bcrypt.compare(password, userToken.password_hash);
    if (!isValid) {
      throw new Error("Invalid password");
    }

    return userToken;
  } catch (error) {
    throw error;
  }
};

/**
 * Verify JWT token and return user
 */
export const verifyJWT = async (fastify, token) => {
  try {
    const decoded = await fastify.jwt.verify(token);

    // Get the user tokens first
    const userToken = await Tokens.GetById(decoded.tid);
    if (!userToken) {
      throw new Error("Invalid token");
    }

    return userToken;
  } catch (error) {
    throw error;
  }
};

/**
 * Authenticate user using either Basic Auth or JWT
 */
export const getAuthenticatedUser = async (req, reply, fastify) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    throw new Error("No authorization header");
  }

  const [authType, credentials] = authHeader.split(" ");

  switch (authType.toLowerCase()) {
    case "basic":
      return await verifyBasicAuth(credentials);

    case "bearer":
      return await verifyJWT(fastify, credentials);

    default:
      throw new Error(
        "Unsupported authentication type. Use Basic or Bearer authentication."
      );
  }
};
