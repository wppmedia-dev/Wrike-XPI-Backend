import { portalAuthRoute } from "./auth";
import { portalUsersRoute } from "./users";
import { portalEnvironmentsRoute } from "./environments";

// Page handlers
const PortalIndexPage = (req, reply) => reply.redirect("/portal/login");

const PortalLoginPage = (req, reply) => {
  try {
    return reply.view("portal/login", {});
  } catch (err) {
    return reply.code(500).send({ error: "Failed to load login page" });
  }
};

const PortalChangePasswordPage = (req, reply) => {
  try {
    return reply.view("portal/change-password", {});
  } catch (err) {
    return reply
      .code(500)
      .send({ error: "Failed to load change password page" });
  }
};

const PortalDashboardPage = (req, reply) => {
  try {
    return reply.view("portal/dashboard", {
      appUrl: process.env.APP_URL || "",
    });
  } catch (err) {
    return reply.code(500).send({ error: "Failed to load dashboard" });
  }
};

const PortalUserPage = (req, reply) => {
  try {
    return reply.view("portal/user", {
      appUrl: process.env.APP_URL || "",
      wrikeRedirectUrl: process.env.WRIKE_REDIRECT_URL || "",
    });
  } catch (err) {
    return reply.code(500).send({ error: "Failed to load user page" });
  }
};

// Page routes (rendered views)
export const portalRoute = (fastify, opts, done) => {
  fastify.get("/", PortalIndexPage);
  fastify.get("/login", PortalLoginPage);
  fastify.get("/change-password", PortalChangePasswordPage);
  fastify.get("/dashboard", PortalDashboardPage);
  fastify.get("/home", PortalUserPage);

  done();
};

// API routes
export const portalApiRoute = (fastify, opts, done) => {
  fastify.register(portalAuthRoute, { prefix: "/auth" });
  fastify.register(portalUsersRoute, { prefix: "/users" });
  fastify.register(portalEnvironmentsRoute, { prefix: "/environments" });

  done();
};
