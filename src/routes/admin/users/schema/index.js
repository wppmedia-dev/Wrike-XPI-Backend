/**
 * Validation for the admin console's portal-user management
 * (/api/v1/admin/portal-users).
 *
 * These were the last write routes in either console without a schema: a body
 * arrived, went straight to the handler, and whatever the handler happened not
 * to check was accepted. The handlers do check (a blank username, a role
 * outside admin/user, a page of id shapes), but validation that lives only in
 * the handler is validation somebody has to remember to add to the next
 * handler. Declaring the shape here means the request is refused before any of
 * that code runs.
 *
 * `additionalProperties: false` is the point of several of these: without it a
 * client can send fields nobody asked for and have them ignored, which turns a
 * typo into a silent no-op and a probing request into a valid one.
 *
 * The module vocabulary for a user's permission matrix is deliberately NOT
 * spelled out. It lives in src/utils/portalPermissionCatalog.js, the console
 * fetches it from the catalogue endpoint, and the controller normalises
 * whatever arrives, discarding unknown modules and forcing off actions a
 * module cannot express. Mirroring it here would be a third copy to keep in
 * step.
 */

/** Every route below is addressed by a user's id, so it is a UUID or nothing. */
export const IdParamSchema = {
  schema: {
    params: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string", format: "uuid" } },
    },
  },
};

// PUT /admin/portal-users/:id — partial profile update, no password.
//
// Matches what the handler applies (src/routes/portal/users/handlers/
// updateUser.js): every field optional, but a field that IS present has to be
// the right type, and the role has to be one of the two the portal knows.
export const UpdateUserSchema = {
  schema: {
    params: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string", format: "uuid" } },
    },
    body: {
      type: "object",
      minProperties: 1,
      properties: {
        username: { type: "string", minLength: 1, maxLength: 150 },
        full_name: { type: "string", maxLength: 255, nullable: true },
        email: { type: "string", maxLength: 255, nullable: true },
        role: { type: "string", enum: ["admin", "user"] },
      },
      additionalProperties: false,
    },
  },
};

// PUT /admin/portal-users/:id/permissions — whole-matrix replace.
export const SetPermissionsSchema = {
  schema: {
    params: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string", format: "uuid" } },
    },
    body: {
      type: "object",
      required: ["permissions"],
      properties: {
        permissions: { type: "object", additionalProperties: true },
      },
      additionalProperties: false,
    },
  },
};
