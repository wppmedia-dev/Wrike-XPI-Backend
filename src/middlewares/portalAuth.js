import jwt from "jsonwebtoken";
import { PortalAuth } from "../controllers";

// Verifies portal user JWT from Authorization header.
// Attaches portalUser to req: { id, username, role, must_change_password }
export const verifyPortalJWT = async (req, reply) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return reply
        .code(401)
        .send({ success: false, message: "Unauthorized: missing token" });
    }

    const token = authHeader.slice(7);
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    const user = await PortalAuth.GetById(payload?.sub);
    if (!user?.id || !user?.is_active) {
      return reply
        .code(401)
        .send({ success: false, message: "Unauthorized: user not found" });
    }

    req.portalUser = {
      id: user.id,
      username: user.username,
      role: user.role,
      must_change_password: user.must_change_password,
    };
  } catch {
    return reply.code(401).send({
      success: false,
      message: "Unauthorized: invalid or expired token",
    });
  }
};

// Restricts access to admin-role portal users only.
export const requireAdminRole = async (req, reply) => {
  if (!req.portalUser || req.portalUser.role !== "admin") {
    return reply
      .code(403)
      .send({ success: false, message: "Forbidden: admin access required" });
  }
};

// Blocks access if the user must change their password first.
export const requirePasswordChanged = async (req, reply) => {
  if (req.portalUser?.must_change_password) {
    return reply.code(403).send({
      success: false,
      must_change_password: true,
      message: "Password change required before proceeding",
    });
  }
};
