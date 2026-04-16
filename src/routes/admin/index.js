import { adminAuthRoute } from "./auth";
import { adminCredentialsRoute } from "./credentials";
import { adminPortalUsersRoute } from "./users";

// Page handlers
const AdminIndexPage = (req, reply) => reply.redirect("/admin/login");

const AdminLoginPage = (req, reply) => {
  try {
    return reply.view("admin/login", {});
  } catch (err) {
    return reply.code(500).send({ error: "Failed to load login page" });
  }
};

const AdminTOTPPage = (req, reply) => {
  try {
    return reply.view("admin/totp", {});
  } catch (err) {
    return reply.code(500).send({ error: "Failed to load TOTP page" });
  }
};

const AdminDashboardPage = (req, reply) => {
  try {
    return reply.view("admin/dashboard", {
      wrikeRedirectUrl: process.env.WRIKE_REDIRECT_URL || "",
      appUrl: process.env.APP_URL || "",
    });
  } catch (err) {
    return reply.code(500).send({ error: "Failed to load dashboard" });
  }
};

export const adminRoute = (fastify, opts, done) => {
  fastify.get("/", AdminIndexPage);
  fastify.get("/login", AdminLoginPage);
  fastify.get("/totp", AdminTOTPPage);
  fastify.get("/dashboard", AdminDashboardPage);

  done();
};

export const adminApiRoute = (fastify, opts, done) => {
  fastify.register(adminAuthRoute);
  fastify.register(adminCredentialsRoute, { prefix: "/credentials" });
  fastify.register(adminPortalUsersRoute, { prefix: "/portal-users" });

  done();
};
