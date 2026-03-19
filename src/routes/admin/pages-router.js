import {
  AdminLoginPage,
  AdminTOTPPage,
  AdminDashboardPage,
  AdminIndexPage,
} from "./pages";

export const adminPagesRoute = (fastify, opts, done) => {
  /**
   * GET /admin
   * Redirect to login
   */
  fastify.get("/", AdminIndexPage);

  /**
   * GET /admin/login
   * Login page
   */
  fastify.get("/login", AdminLoginPage);

  /**
   * GET /admin/totp
   * TOTP verification page
   */
  fastify.get("/totp", AdminTOTPPage);

  /**
   * GET /admin/dashboard
   * Credentials management dashboard
   */
  fastify.get("/dashboard", AdminDashboardPage);

  done();
};
