import path from "path";

/**
 * Serve admin login page
 */
export const AdminLoginPage = (req, reply) => {
  try {
    return reply.view("admin/login", {});
  } catch (err) {
    console.error("Error loading login page:", err);
    return reply.code(500).send({ error: "Failed to load login page" });
  }
};

/**
 * Serve admin TOTP verification page
 */
export const AdminTOTPPage = (req, reply) => {
  try {
    return reply.view("admin/totp", {});
  } catch (err) {
    console.error("Error loading TOTP page:", err);
    return reply.code(500).send({ error: "Failed to load TOTP page" });
  }
};

/**
 * Serve admin dashboard page
 */
export const AdminDashboardPage = (req, reply) => {
  try {
    return reply.view("admin/dashboard", {});
  } catch (err) {
    console.error("Error loading dashboard page:", err);
    return reply.code(500).send({ error: "Failed to load dashboard" });
  }
};

/**
 * Redirect /admin to /admin/login
 */
export const AdminIndexPage = (req, reply) => {
  return reply.redirect("/admin/login");
};
