import jwt from "jsonwebtoken";
import models from "../../models";

/**
 * Fastify preHandler that validates an admin JWT from the Authorization header.
 * On success, sets req.adminUser = { id, username }.
 */
export const verifyAdminJWT = async (req, reply) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return reply
      .code(401)
      .send({ success: false, message: "Unauthorized: missing token" });
  }

  const token = authHeader.slice(7);

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return reply.code(401).send({
      success: false,
      message: "Unauthorized: invalid or expired token",
    });
  }

  // No session lookup needed; JWT is the source of truth for auth
  req.adminUser = {
    id: payload.sub,
    username: payload.username,
  };
};
