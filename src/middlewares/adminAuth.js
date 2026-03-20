import jwt from "jsonwebtoken";
import models from "../../models";

/**
 * Fastify preHandler that validates an admin JWT from the Authorization header.
 * On success, sets req.adminUser = { id, username, session_id }.
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
    return reply
      .code(401)
      .send({
        success: false,
        message: "Unauthorized: invalid or expired token",
      });
  }

  // Verify the session still exists in the DB (enables logout/revocation)
  const session = await models.AdminSessions.findByPk(payload.session_id);
  if (!session || new Date(session.expires_at) < new Date()) {
    return reply
      .code(401)
      .send({
        success: false,
        message: "Unauthorized: session expired or revoked",
      });
  }

  req.adminUser = {
    id: payload.sub,
    username: payload.username,
    session_id: payload.session_id,
  };
};
