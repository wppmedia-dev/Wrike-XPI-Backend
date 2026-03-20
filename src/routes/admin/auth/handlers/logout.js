import { AdminAuth } from "../../../../controllers";

export const Logout = (adminUser) => {
  return new Promise((resolve) => {
    // No DB session to revoke when using stateless JWT auth
    resolve({ statusCode: 200, message: "Logged out successfully" });
  });
};
