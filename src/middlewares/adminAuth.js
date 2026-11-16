import jwt from "jsonwebtoken";
import { verifyJwt } from "../utils/jwtSecrets";
import { AdminAuth } from "../controllers";

// Validates an admin JWT from the Authorization header.
export const verifyAdminJWT = async (req, reply) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return reply
        .code(401)
        .send({ success: false, message: "Unauthorized: missing token" });
    }

    const token = authHeader.slice(7);

    const payload = verifyJwt(token);

    const tokenData = await AdminAuth.GetById(payload?.sub);
    if (!tokenData.id) {
      throw new Error("Invalid token");
    }

    // No session lookup needed; JWT is the source of truth for auth
    req.adminUser = {
      id: payload.sub,
      username: payload.username,
    };
  } catch {
    return reply.code(401).send({
      success: false,
      message: "Unauthorized: invalid or expired token",
    });
  }
};
