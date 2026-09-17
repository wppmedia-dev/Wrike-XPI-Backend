/**
 * Request validation for /api/v1/portal/api-tokens.
 *
 * There is no create schema: this API has no create route (see the note at the
 * top of ./index.js). The environment picker that used to need one is gone
 * with it.
 *
 * There is no delete schema either: the module has no delete route, because
 * availability is the update grant's business.
 */

import { TOKEN_FILTER_QUERY } from "../../../admin/tokens/schema";

const ID_PARAM = {
  type: "object",
  required: ["id"],
  properties: { id: { type: "string", format: "uuid" } },
};

/**
 * GET /portal/api-tokens: the same filters the admin console sends, from one
 * definition (src/routes/admin/tokens/schema), because a filter that means one
 * thing in the console and another in the portal is a bug nobody reports.
 *
 * The rows are scoped to the caller's environments before any filter is
 * applied (src/utils/portalScope.js), so these parameters narrow what the
 * caller may see and never widen it.
 */
export const ListSchema = {
  schema: {
    querystring: {
      type: "object",
      properties: TOKEN_FILTER_QUERY,
    },
  },
};

// PUT /portal/api-tokens/:id/permissions: whole-matrix replace.
//
// `permissions` is deliberately left open rather than spelled out as
// module-by-action properties: the vocabulary lives in
// src/utils/tokenPermissionCatalog.js, is fetched by both consoles from the
// catalog endpoint, and the controller normalises whatever arrives. Mirroring
// it here would be a third copy to keep in step.
export const SetPermissionsSchema = {
  schema: {
    params: ID_PARAM,
    body: {
      type: "object",
      required: ["permissions"],
      properties: {
        permissions: { type: "object", additionalProperties: true },
      },
    },
  },
};

// PUT /portal/api-tokens/:id/status: the Active switch in the list.
export const SetStatusSchema = {
  schema: {
    params: ID_PARAM,
    body: {
      type: "object",
      required: ["is_active"],
      properties: { is_active: { type: "boolean" } },
      additionalProperties: false,
    },
  },
};

// The routes that address a single token: the permissions read and write, and
// the status write.
export const IdParamSchema = {
  schema: { params: ID_PARAM },
};
