import { Op } from "sequelize";
import models from "../../models";
import { invalidateRedirectRules } from "../utils/environmentAccessCache";
import { normaliseRedirectRule } from "../utils/redirectMatch";

/**
 * Storage for the per-environment redirect-URI allow list. What counts as a
 * match lives in src/utils/redirectMatch.js; the check on the request path in
 * src/utils/redirectAllowlist.js.
 *
 * Every write drops the environment's cached list before returning, from here
 * rather than from the routes, so a route added later cannot forget it (the
 * same arrangement as src/controllers/environmentAccess.js).
 */

const ATTRS = [
  "id",
  "env_id",
  "value",
  "label",
  "is_enabled",
  "created_at",
  "updated_at",
];

const requireEnv = (envId) => {
  if (!envId)
    throw { statusCode: 400, message: "Environment must not be empty!" };
};

export const GetRulesByEnv = async (envId) => {
  requireEnv(envId);

  const rules = await models.EnvironmentRedirectRules.findAll({
    attributes: ATTRS,
    where: { env_id: envId },
    order: [["value", "ASC"]],
  });

  return rules.map((r) => r.get({ plain: true }));
};

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 10;
export const STATUS_FILTERS = ["all", "enabled", "disabled"];

/** "%", "_" and "\" are wildcards to LIKE. Typed into a search box they are
    just characters: searching "100%" must not match everything. */
const escapeLike = (text) => String(text).replace(/[\\%_]/g, "\\$&");

const clampInt = (raw, fallback, min, max) => {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
};

/**
 * One page of an environment's redirect entries, for the consoles.
 *
 * Search, the enabled filter, counting and paging all happen in the database,
 * so a list of any length costs one page of rows on the wire rather than the
 * whole table. This is only the CONSOLE's read. The sign-in check
 * (src/utils/redirectAllowlist.js) needs every enabled entry to decide, so it
 * keeps using GetRulesByEnv and is not paginated.
 *
 * `search` is a case-insensitive substring of the URL or the label. `status`
 * is all | enabled | disabled. A page past the end is moved back to the last
 * one, so deleting the final row of a page does not leave the console on an
 * empty page that looks like an empty list.
 *
 * `counts` describe the environment's whole list regardless of search or
 * filter, so a header can say "3 of 140 enabled" while a search is active.
 */
export const ListRulesPage = async (
  envId,
  { search, status, page, pageSize } = {},
) => {
  requireEnv(envId);

  const size = clampInt(pageSize, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
  const state = STATUS_FILTERS.includes(status) ? status : "all";

  const where = { env_id: envId };
  if (state === "enabled") where.is_enabled = true;
  if (state === "disabled") where.is_enabled = false;

  const term = String(search ?? "").trim().slice(0, 200);
  if (term) {
    const like = { [Op.iLike]: `%${escapeLike(term)}%` };
    where[Op.or] = [{ value: like }, { label: like }];
  }

  const total = await models.EnvironmentRedirectRules.count({ where });
  const totalPages = Math.max(Math.ceil(total / size), 1);
  const current = Math.min(
    clampInt(page, 1, 1, Number.MAX_SAFE_INTEGER),
    totalPages,
  );

  const rows = await models.EnvironmentRedirectRules.findAll({
    attributes: ATTRS,
    where,
    order: [
      ["value", "ASC"],
      ["id", "ASC"],
    ],
    limit: size,
    offset: (current - 1) * size,
  });

  const [all, enabled] = await Promise.all([
    models.EnvironmentRedirectRules.count({ where: { env_id: envId } }),
    models.EnvironmentRedirectRules.count({
      where: { env_id: envId, is_enabled: true },
    }),
  ]);

  return {
    rows: rows.map((r) => r.get({ plain: true })),
    total,
    page: current,
    page_size: size,
    total_pages: totalPages,
    counts: { total: all, enabled },
  };
};

export const GetRuleById = async (id) => {
  if (!id) throw { statusCode: 400, message: "Rule id must not be empty!" };

  const rule = await models.EnvironmentRedirectRules.findOne({
    attributes: ATTRS,
    where: { id },
  });

  return rule ? rule.get({ plain: true }) : null;
};

export const CreateRule = async (profileId, data) => {
  requireEnv(data?.env_id);
  const value = normaliseRedirectRule(data?.value);

  const existing = await models.EnvironmentRedirectRules.findOne({
    where: { env_id: data.env_id, value },
  });
  if (existing) {
    throw {
      statusCode: 409,
      message: `"${value}" is already on the redirect list for this environment.`,
    };
  }

  const rule = await models.EnvironmentRedirectRules.create(
    {
      env_id: data.env_id,
      value,
      label: data.label || null,
      is_enabled: data.is_enabled !== false,
    },
    { profile_id: profileId },
  );

  await invalidateRedirectRules(rule.env_id);

  return rule.get({ plain: true });
};

export const UpdateRule = async (profileId, id, data) => {
  if (!id) throw { statusCode: 400, message: "Rule id must not be empty!" };

  const rule = await models.EnvironmentRedirectRules.findOne({ where: { id } });
  if (!rule) throw { statusCode: 404, message: "Redirect entry not found." };

  // Only these three may change. env_id is deliberately not among them: moving
  // an entry to another environment would hand that environment a redirect
  // target nobody granted it.
  const changes = {};
  if (data?.value !== undefined) {
    changes.value = normaliseRedirectRule(data.value);

    const clash = await models.EnvironmentRedirectRules.findOne({
      where: { env_id: rule.env_id, value: changes.value },
    });
    if (clash && clash.id !== rule.id) {
      throw {
        statusCode: 409,
        message: `"${changes.value}" is already on the redirect list for this environment.`,
      };
    }
  }
  if (data?.label !== undefined) changes.label = data.label || null;
  if (data?.is_enabled !== undefined) changes.is_enabled = !!data.is_enabled;

  await rule.update(changes, { profile_id: profileId });
  await invalidateRedirectRules(rule.env_id);

  return rule.get({ plain: true });
};

export const DeleteRule = async (profileId, id) => {
  if (!id) throw { statusCode: 400, message: "Rule id must not be empty!" };

  const rule = await models.EnvironmentRedirectRules.findOne({ where: { id } });
  if (!rule) throw { statusCode: 404, message: "Redirect entry not found." };

  const envId = rule.env_id;
  await rule.destroy({ profile_id: profileId });
  await invalidateRedirectRules(envId);

  return { env_id: envId };
};
